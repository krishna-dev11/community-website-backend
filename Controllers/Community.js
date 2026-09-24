const mongoose = require("mongoose");
const crypto = require("node:crypto");
const cloudinary = require("cloudinary").v2;
const Issue = require("../Models/issue");
const IssueResponse = require("../Models/issueResponse");
const Dharamshala = require("../Models/dharamshala");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DharamshalaBlockedDate = require("../Models/dharamshalaBlockedDate");
const DharamshalaReservationHold = require("../Models/dharamshalaReservationHold");
const Poll = require("../Models/poll");
const Vote = require("../Models/vote");
const VoteParticipation = require("../Models/voteParticipation");
const CommunityPost = require("../Models/communityPost");
const CommunityComment = require("../Models/communityComment");
const CommunityReport = require("../Models/communityReport");
const Achievement = require("../Models/achievement");
const Shradhanjali = require("../Models/shradhanjali");
const User = require("../Models/user");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const { mailSender } = require("../Utilities/mailSender");
const { getDharamshalaPrice, serializeDharamshala } = require("../Utilities/dharamshalaPricing");
const {
  uploadImageToCloudinary,
  uploadDocumentToCloudinary,
  assetMetadata,
} = require("../Utilities/uploadImageToCloudinary");

function isPdfAsset(asset = {}) {
  const mime = String(asset.mimeType || "").toLowerCase();
  const name = String(asset.name || asset.url || "").toLowerCase();
  return mime.includes("pdf") || name.endsWith(".pdf") || name.includes(".pdf?");
}

function safeDocumentName(name, fallback = "supporting-document") {
  return String(name || fallback).replace(/[\r\n\t"]/g, "_").replace(/[\\/]/g, "_").trim() || fallback;
}

function signedCloudinaryDocumentUrl(asset, { download = false } = {}) {
  if (!asset?.publicId) return asset?.url;

  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const fileName = safeDocumentName(asset.name);
  const options = {
    type: "authenticated",
    sign_url: true,
    expires_at: expiresAt,
    resource_type: isPdfAsset(asset) ? "image" : "image",
    secure: true,
  };

  if (download) {
    options.flags = "attachment";
    options.attachment = fileName;
  }

  return cloudinary.url(asset.publicId, options);
}

function pageOptions(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

async function paged(Model, filter, query, sort = { createdAt: -1 }, populate = null) {
  const { page, limit, skip } = pageOptions(query);
  let cursor = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) cursor = cursor.populate(populate);

  const [items, total] = await Promise.all([cursor, Model.countDocuments(filter)]);
  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function textFilter(q) {
  return q ? { $text: { $search: String(q).trim() } } : {};
}

function assertDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new ApiError(400, "INVALID_DATE_RANGE", "Start date must be before end date");
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) throw new ApiError(400, "PAST_CHECKIN_DATE", "Check-in date cannot be in the past");
  return { start, end };
}

function bookingReference() {
  const year = new Date().getFullYear();
  return `DH-${year}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function addBookingHistory(booking, status, paymentStatus, changedBy, note) {
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({ status, paymentStatus, changedBy, note });
}

function reservationDates(start, end) {
  const dates = [];
  for (const cursor = new Date(start); cursor < end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

async function reserveDharamshalaSlots(booking, roomConfig) {
  const claimed = [];
  try {
    for (const date of reservationDates(booking.startDate, booking.endDate)) {
      let claimedForDate = 0;
      for (let slot = 0; slot < roomConfig.totalRooms && claimedForDate < booking.roomsRequested; slot += 1) {
        try {
          const hold = await DharamshalaReservationHold.create({
            booking: booking._id,
            dharamshala: booking.dharamshala,
            roomType: booking.roomType,
            date,
            slot,
          });
          claimed.push(hold._id);
          claimedForDate += 1;
        } catch (error) {
          if (error.code !== 11000) throw error;
        }
      }
      if (claimedForDate < booking.roomsRequested) throw new ApiError(409, "DHARAMSHALA_ROOMS_UNAVAILABLE", "The selected room is no longer available for all requested dates");
    }
  } catch (error) {
    await DharamshalaReservationHold.deleteMany({ _id: { $in: claimed } });
    throw error;
  }
}

async function releaseDharamshalaSlots(bookingId) {
  await DharamshalaReservationHold.deleteMany({ booking: bookingId });
}

function assetFromBody(asset) {
  if (!asset?.url) return undefined;
  return {
    url: asset.url,
    publicId: asset.publicId,
    size: asset.size,
    mimeType: asset.mimeType,
    name: asset.name,
  };
}

function canEditOwned(resourceUserId, req) {
  return String(resourceUserId) === String(req.user.id) || (req.user.roles || []).some((role) => ["SUPER_ADMIN", "Admin"].includes(role));
}

async function getDharamshalaConflicts(startDate, endDate, excludeBookingId = null, dharamshalaId = null, roomType = null) {
  const bookingFilter = {
    status: { $in: ["PENDING", "APPROVED", "PAYMENT_PENDING", "CONFIRMED", "CHECKED_IN"] },
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeBookingId) bookingFilter._id = { $ne: excludeBookingId };
  if (dharamshalaId) bookingFilter.dharamshala = dharamshalaId;
  if (roomType) bookingFilter.roomType = roomType;

  const blockedFilter = {
    status: "ACTIVE",
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };

  const [bookings, blockedDates] = await Promise.all([
    DharamshalaBooking.find(bookingFilter).select("startDate endDate purpose roomsRequested roomType dharamshala status"),
    DharamshalaBlockedDate.find(blockedFilter).select("startDate endDate reason"),
  ]);

  return { bookings, blockedDates };
}

const DEFAULT_DHARAMSHALAS = [
  {
    name: "Halba Samaj Dharamshala",
    slug: "halba-samaj-dharamshala-ujjain",
    tagline: "Shri Vitthal Mandir, Narsingh Ghat Road, Ujjain",
    description: "Official guest facility of Halba Samaj, Ujjain. Providing clean and peaceful accommodation with 5 Rooms (2 AC with Attached Toilet, 3 Non-AC with Non-Attached Toilet) and 1 Big Hall.",
    location: {
      address: "Shri Vitthal Mandir, Narsingh Ghat Road, Kalika Mata Mandir ke pichhe",
      city: "Ujjain",
      state: "Madhya Pradesh",
      pincode: "456006",
      landmark: "Kalika Mata Mandir ke pichhe, Narsingh Ghat",
    },
    mainImage: "",
    images: [],
    roomTypes: [
      {
        name: "AC Room (Attached Toilet)",
        description: "Double room with attached toilet. Maximum 4 persons per room.",
        capacity: 4,
        totalRooms: 2,
        pricePerNight: 1200,
        amenities: ["Air Conditioning", "Attached Toilet", "Double Bed"],
      },
      {
        name: "Non-AC Room (Non-Attached Toilet)",
        description: "Double room with non-attached toilet. Maximum 4 persons per room.",
        capacity: 4,
        totalRooms: 3,
        pricePerNight: 800,
        amenities: ["Ceiling Fan", "Non-Attached Toilet", "Double Bed"],
      },
      {
        name: "Big Hall",
        description: "1 Big Hall for community gatherings and large pilgrim groups.",
        capacity: 25,
        totalRooms: 1,
        pricePerNight: 3000,
        amenities: ["Spacious Hall", "Clean Facilities"],
      },
    ],
    facilities: [
      "5 Rooms (All Double, Max 4 persons per room)",
      "1 Big Hall",
      "2 AC Rooms with Attached Toilet",
      "3 Non-AC Rooms with Non-Attached Toilet",
      "Shri Vitthal Mandir Campus",
      "Narsingh Ghat Road, Behind Kalika Mata Mandir, Ujjain",
    ],
    rules: [
      "Original ID is mandatory",
      "Smoking prohibited",
      "Drinking prohibited",
      "Non-veg prohibited",
      "Guest is responsible for their valuables",
      "Check-in: 12:00 AM (Timing to be confirmed), Check-out: 10:00 AM",
      "Cancellation before 24 hours: 50% refund, After 24 hours: No refund",
    ],
    checkInTime: "12:00 AM",
    checkOutTime: "10:00 AM",
    cancellationPolicy: "Before 24 hours: 50% refund. After 24 hours: No refund.",
    contactPhone: "+91 88271 96257",
    contactEmail: "admin@halbasamaj.org",
    status: "ACTIVE",
    totalCapacity: 45,
  },
];


exports.createIssue = asyncHandler(async (req, res) => {
  const { title, description, category, location, priority } = req.body;
  if (!title || !description) {
    throw new ApiError(400, "ISSUE_FIELDS_REQUIRED", "Title and description are required");
  }

  const issue = await Issue.create({
    title,
    description,
    category,
    location,
    priority,
    submittedBy: req.user.id,
  });

  await logAudit({ actor: req.user.id, action: "issue.created", targetType: "issue", target: issue._id, req });
  return res.status(201).json(new ApiResponse("Issue submitted successfully", { issue }));
});

exports.listIssues = asyncHandler(async (req, res) => {
  const filter = { isArchived: false, ...textFilter(req.query.q) };
  if (req.query.mine === "true") filter.submittedBy = req.user.id;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = String(req.query.category).trim();

  const { items, meta } = await paged(Issue, filter, req.query, { createdAt: -1 }, [
    { path: "submittedBy", select: "firstName lastName imageUrl" },
    { path: "assignedTo", select: "firstName lastName imageUrl" },
  ]);
  return res.status(200).json(new ApiResponse("Issues fetched successfully", { issues: items }, meta));
});

exports.updateIssueStatus = asyncHandler(async (req, res) => {
  const allowedStatuses = [
    "UNDER_REVIEW",
    "APPROVED",
    "PUBLISHED",
    "IN_PROGRESS",
    "SOLUTION_PROPOSED",
    "AWAITING_MEMBER_CONFIRMATION",
    "RESOLVED",
    "REJECTED",
    "ARCHIVED",
  ];
  const { status, note, assignedTo, reason } = req.body;
  if (!allowedStatuses.includes(status)) {
    throw new ApiError(400, "INVALID_ISSUE_STATUS", "Invalid issue status");
  }

  const issue = await Issue.findById(req.params.issueId);
  if (!issue || issue.isArchived) throw new ApiError(404, "ISSUE_NOT_FOUND", "Issue was not found");

  const previousStatus = issue.status;
  issue.status = status;
  if (assignedTo !== undefined) issue.assignedTo = assignedTo || undefined;
  if (note || reason) {
    issue.adminStatusNote = note || reason;
  }
  if (status === "REJECTED") {
    issue.moderationReason = reason || note;
  }
  if (status === "RESOLVED") {
    issue.resolvedAt = new Date();
  }
  if (status === "ARCHIVED") {
    issue.isArchived = true;
    issue.archivedAt = new Date();
    issue.archivedBy = req.user.id;
    issue.archiveReason = reason || note;
  }
  await issue.save();

  if (note || previousStatus !== status) {
    await IssueResponse.create({
      issue: issue._id,
      author: req.user.id,
      type: status === "SOLUTION_PROPOSED" ? "PROPOSED_SOLUTION" : "STATUS_NOTE",
      message: note || reason || `Status changed to ${status}`,
      previousStatus,
      nextStatus: status,
    });
  }

  await logAudit({
    actor: req.user.id,
    action: "issue.status.updated",
    targetType: "issue",
    target: issue._id,
    oldValue: { status: previousStatus },
    newValue: { status },
    reason: note || reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Issue updated successfully", { issue }));
});

exports.publishAsCommunitySolution = asyncHandler(async (req, res) => {
  const title = req.body.title || req.body.solutionTitle;
  const summary = req.body.summary || req.body.solutionSummary;
  const solution = req.body.solution || req.body.solutionDetails;
  const category = req.body.category || req.body.solutionCategory;

  if (!title || !solution) {
    throw new ApiError(400, "SOLUTION_FIELDS_REQUIRED", "Solution title and details are required");
  }

  const issue = await Issue.findById(req.params.issueId);
  if (!issue || issue.isArchived) throw new ApiError(404, "ISSUE_NOT_FOUND", "Issue was not found");

  issue.isPublicSolution = true;
  issue.solutionTitle = title;
  issue.solutionSummary = summary || issue.description.slice(0, 160);
  issue.solutionDetails = solution;
  issue.solutionCategory = category || issue.category || "General";
  issue.publishedAsSolutionAt = new Date();
  issue.publishedAsSolutionBy = req.user.id;
  await issue.save();

  await logAudit({
    actor: req.user.id,
    action: "issue.published_as_solution",
    targetType: "issue",
    target: issue._id,
    newValue: { solutionTitle: title },
    req,
  });

  return res.status(200).json(new ApiResponse("Published as public community solution", { issue }));
});

exports.listPublicSolutions = asyncHandler(async (req, res) => {
  const filter = { isPublicSolution: true, isArchived: false };
  if (req.query.category) filter.solutionCategory = String(req.query.category).trim();

  const { items, meta } = await paged(Issue, filter, req.query, { publishedAsSolutionAt: -1, resolvedAt: -1, createdAt: -1 });

  const sanitizedSolutions = items.map((item) => ({
    _id: item._id,
    title: item.solutionTitle || item.title,
    summary: item.solutionSummary || item.description,
    solution: item.solutionDetails,
    category: item.solutionCategory || item.category || "General",
    location: item.location,
    status: item.status,
    publishedAt: item.publishedAsSolutionAt || item.resolvedAt || item.updatedAt,
  }));

  return res.status(200).json(new ApiResponse("Community solutions fetched successfully", { solutions: sanitizedSolutions }, meta));
});

exports.addIssueResponse = asyncHandler(async (req, res) => {
  const issue = await Issue.findById(req.params.issueId);
  if (!issue || issue.isArchived) throw new ApiError(404, "ISSUE_NOT_FOUND", "Issue was not found");
  if (!canEditOwned(issue.submittedBy, req) && !(req.user.roles || []).some((role) => ["MODERATOR", "SUPER_ADMIN", "Admin"].includes(role))) {
    throw new ApiError(403, "ISSUE_RESPONSE_FORBIDDEN", "You cannot respond to this issue");
  }
  if (!req.body.message) throw new ApiError(400, "MESSAGE_REQUIRED", "Response message is required");

  const response = await IssueResponse.create({
    issue: issue._id,
    author: req.user.id,
    type: req.body.type || "MEMBER_FEEDBACK",
    message: req.body.message,
  });
  return res.status(201).json(new ApiResponse("Issue response added successfully", { response }));
});

exports.listIssueResponses = asyncHandler(async (req, res) => {
  const responses = await IssueResponse.find({ issue: req.params.issueId })
    .populate("author", "firstName lastName imageUrl roles")
    .sort({ createdAt: 1 });
  return res.status(200).json(new ApiResponse("Issue responses fetched successfully", { responses }));
});

exports.confirmIssueResolution = asyncHandler(async (req, res) => {
  const issue = await Issue.findOne({ _id: req.params.issueId, submittedBy: req.user.id, isArchived: false });
  if (!issue) throw new ApiError(404, "ISSUE_NOT_FOUND", "Issue was not found");
  if (!["SOLUTION_PROPOSED", "AWAITING_MEMBER_CONFIRMATION"].includes(issue.status)) {
    throw new ApiError(409, "ISSUE_NOT_AWAITING_CONFIRMATION", "Issue is not awaiting member confirmation");
  }

  const satisfied = req.body.satisfied !== false;
  const previousStatus = issue.status;
  issue.status = satisfied ? "RESOLVED" : "REOPENED";
  if (!satisfied) issue.reopenCount += 1;
  await issue.save();

  await IssueResponse.create({
    issue: issue._id,
    author: req.user.id,
    type: "MEMBER_FEEDBACK",
    message: req.body.message || (satisfied ? "Member confirmed resolution" : "Member reopened the issue"),
    previousStatus,
    nextStatus: issue.status,
  });

  return res.status(200).json(new ApiResponse("Issue confirmation saved", { issue }));
});

exports.getDharamshalas = asyncHandler(async (req, res) => {
  let list = await Dharamshala.find({ status: "ACTIVE" }).sort({ createdAt: -1 });

  // Auto-seed initial Dharamshalas if none exist yet
  if (list.length === 0) {
    try {
      await Dharamshala.insertMany(DEFAULT_DHARAMSHALAS);
      list = await Dharamshala.find({ status: "ACTIVE" }).sort({ createdAt: -1 });
    } catch (e) {
      console.error("Auto-seeding dharamshalas:", e);
    }
  }

  return res.status(200).json(new ApiResponse("Dharamshalas fetched successfully", {
    dharamshalas: list.map(serializeDharamshala),
  }));
});

exports.getDharamshalaById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const dharamshala = (mongoose.Types.ObjectId.isValid(id))
    ? await Dharamshala.findById(id)
    : await Dharamshala.findOne({ slug: id });

  if (!dharamshala) {
    throw new ApiError(404, "DHARAMSHALA_NOT_FOUND", "Dharamshala not found");
  }

  return res.status(200).json(new ApiResponse("Dharamshala details fetched", {
    dharamshala: serializeDharamshala(dharamshala),
  }));
});

exports.createDharamshala = asyncHandler(async (req, res) => {
  const { name, description, location, roomTypes, facilities, rules, checkInTime, checkOutTime, contactPhone, contactEmail } = req.body;
  if (!name || !description || !location?.city) {
    throw new ApiError(400, "FIELDS_REQUIRED", "Name, description and location are required");
  }

  const slug = req.body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const created = await Dharamshala.create({
    name,
    slug,
    tagline: req.body.tagline,
    description,
    location,
    roomTypes: roomTypes || [],
    facilities: facilities || [],
    rules: rules || [],
    checkInTime: checkInTime || "12:00 PM",
    checkOutTime: checkOutTime || "10:00 AM",
    contactPhone,
    contactEmail,
    createdBy: req.user?.id,
  });

  return res.status(201).json(new ApiResponse("Dharamshala created successfully", { dharamshala: created }));
});

exports.updateDharamshala = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updated = await Dharamshala.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
  if (!updated) throw new ApiError(404, "DHARAMSHALA_NOT_FOUND", "Dharamshala not found");
  return res.status(200).json(new ApiResponse("Dharamshala updated successfully", { dharamshala: updated }));
});

exports.createDharamshalaBooking = asyncHandler(async (req, res) => {
  const { start, end } = assertDateRange(req.body.startDate, req.body.endDate);
  if (!req.body.purpose) throw new ApiError(400, "BOOKING_PURPOSE_REQUIRED", "Purpose of visit is required");
  if (!req.body.roomType) throw new ApiError(400, "ROOM_TYPE_REQUIRED", "Room type is required");

  const roomsRequested = Number(req.body.roomsRequested);
  const numberOfGuests = Number(req.body.numberOfGuests);
  if (!Number.isInteger(roomsRequested) || roomsRequested < 1) {
    throw new ApiError(400, "INVALID_ROOM_COUNT", "Number of rooms must be at least 1");
  }
  if (!Number.isInteger(numberOfGuests) || numberOfGuests < 1) {
    throw new ApiError(400, "INVALID_GUEST_COUNT", "Number of guests must be at least 1");
  }

  // 1. Verify Dharamshala exists
  let dharamshala = null;
  if (req.body.dharamshalaId) {
    dharamshala = await Dharamshala.findById(req.body.dharamshalaId);
  }
  if (!dharamshala) {
    dharamshala = await Dharamshala.findOne({ status: "ACTIVE" });
  }

  // 2. Check room capacity & availability (Double-booking protection)
  const roomConfig = dharamshala?.roomTypes?.find((r) => r.name === req.body.roomType);
  if (!dharamshala || !roomConfig) {
    throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "Selected room type is not available");
  }
  if (numberOfGuests > roomConfig.capacity * roomsRequested) {
    throw new ApiError(400, "GUEST_CAPACITY_EXCEEDED", `This room type supports up to ${roomConfig.capacity * roomsRequested} guests`);
  }
  const totalCapacity = roomConfig.totalRooms;

  const conflicts = await getDharamshalaConflicts(start, end, null, dharamshala?._id, req.body.roomType);
  if (conflicts.blockedDates.length > 0) {
    throw new ApiError(409, "DHARAMSHALA_DATES_BLOCKED", "These dates are blocked for Samaj maintenance or private functions", conflicts);
  }

  const bookedRoomsCount = conflicts.bookings.reduce((sum, b) => sum + (b.roomsRequested || 1), 0);
  if (bookedRoomsCount + roomsRequested > totalCapacity) {
    throw new ApiError(409, "DHARAMSHALA_ROOMS_UNAVAILABLE", `Only ${Math.max(0, totalCapacity - bookedRoomsCount)} rooms available for selected dates`, {
      availableRooms: Math.max(0, totalCapacity - bookedRoomsCount),
      requested: roomsRequested,
    });
  }

  // 3. Security Rule: Backend strictly determines if requester is an active Samaj member
  let isMember = false;
  let requesterUser = null;
  if (req.user?.id) {
    requesterUser = await User.findById(req.user.id);
    if (requesterUser && requesterUser.active && (requesterUser.accountStatus === "ACTIVE" || requesterUser.approved)) {
      isMember = true;
    }
  }

  // 4. Calculate pricing server-side
  const appliedRate = getDharamshalaPrice(roomConfig);
  if (!appliedRate) {
    throw new ApiError(422, "DHARAMSHALA_PRICE_UNAVAILABLE", "Pricing is unavailable for this room type. Please contact the Dharamshala team.");
  }

  const oneDayMs = 1000 * 60 * 60 * 24;
  const numberOfNights = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / oneDayMs));
  const totalAmount = appliedRate * roomsRequested * numberOfNights;

  // Guest details (for members, auto-populate from profile; for guests, take from request)
  const guestName = isMember ? `${requesterUser.firstName} ${requesterUser.lastName}` : (req.body.guestName || "Guest");
  const guestEmail = isMember ? requesterUser.email : (req.body.guestEmail || "");
  const guestPhone = req.body.guestPhone || (isMember ? requesterUser.contactNumber : "");
  const idempotencyKey = req.get("Idempotency-Key");

  if (idempotencyKey) {
    const existingBooking = await DharamshalaBooking.findOne({ idempotencyKey });
    if (existingBooking) {
      return res.status(200).json(new ApiResponse("Existing Dharamshala booking request", { booking: existingBooking }));
    }
  }

  const duplicateFilter = {
    dharamshala: dharamshala?._id,
    roomType: req.body.roomType,
    startDate: start,
    endDate: end,
    status: "PENDING",
  };
  if (req.user?.id) duplicateFilter.requester = req.user.id;
  else if (guestPhone) duplicateFilter.guestPhone = guestPhone;

  if (req.user?.id || guestPhone) {
    const duplicateBooking = await DharamshalaBooking.findOne(duplicateFilter).select("_id status");
    if (duplicateBooking) {
      throw new ApiError(409, "DHARAMSHALA_BOOKING_ALREADY_PENDING", "A pending booking request already exists for these dates and room type");
    }
  }

  const booking = await DharamshalaBooking.create({
    bookingReference: bookingReference(),
    idempotencyKey,
    dharamshala: dharamshala?._id,
    dharamshalaName: dharamshala?.name || "Samaj Dharamshala",
    roomType: req.body.roomType,
    requester: req.user?.id || null,
    isMember: false,
    guestName,
    guestEmail,
    guestPhone,
    guestAddress: req.body.guestAddress || "",
    numberOfGuests,
    purpose: req.body.purpose,
    startDate: start,
    endDate: end,
    roomsRequested,
    pricePerNight: appliedRate,
    numberOfNights,
    totalAmount,
    specialRequests: req.body.specialRequests || "",
    paymentStatus: "NOT_REQUIRED",
    status: "PENDING",
    statusHistory: [{ status: "PENDING", paymentStatus: "NOT_REQUIRED", changedBy: req.user?.id }],
  });
  try {
    await reserveDharamshalaSlots(booking, roomConfig);
  } catch (error) {
    await DharamshalaBooking.deleteOne({ _id: booking._id });
    throw error;
  }

  const adminEmail = process.env.DHARAMSHALA_ADMIN_EMAIL || dharamshala.contactEmail;
  if (adminEmail) {
    Promise.resolve(mailSender(
      adminEmail,
      `New Dharamshala Booking Request - ${booking.bookingReference}`,
      `<p>New booking request <strong>${booking.bookingReference}</strong>.</p><p>${guestName} requested ${req.body.roomType} from ${start.toLocaleDateString("en-IN")} to ${end.toLocaleDateString("en-IN")} for ${numberOfGuests} guest(s).</p>`
    )).catch((error) => console.error("Dharamshala admin email failed:", error.message));
  }
  if (req.user?.id) {
    await notifyUser({
      recipient: req.user.id,
      title: "Dharamshala booking request submitted",
      message: `Your booking request ${booking.bookingReference} is waiting for admin approval.`,
      metadata: { booking: booking._id, bookingReference: booking.bookingReference },
    });
  }
  return res.status(201).json(new ApiResponse("Dharamshala booking requested successfully", {
    booking,
    pricingBreakdown: {
      ratePerNight: appliedRate,
      numberOfNights,
      roomsRequested,
      totalAmount,
    }
  }));
});

exports.listDharamshalaBookings = asyncHandler(async (req, res) => {
  const filter = {};
  const isDharamshalaAdmin = (req.user?.roles || []).some((role) =>
    ["DHARAMSHALA_ADMIN", "SUPER_ADMIN", "Admin"].includes(role)
  );

  // Non-admins or "mine=true" queries are strictly restricted to their own bookings
  if (req.query.mine === "true" || !isDharamshalaAdmin) {
    if (!req.user?.id) {
      throw new ApiError(401, "AUTH_REQUIRED", "Authentication required to view bookings");
    }
    filter.requester = req.user.id;
  }

  if (req.query.status) filter.status = req.query.status;
  if (req.query.dharamshalaId) filter.dharamshala = req.query.dharamshalaId;

  const { items, meta } = await paged(DharamshalaBooking, filter, req.query, { createdAt: -1 }, [
    { path: "requester", select: "firstName lastName email imageUrl" },
    { path: "dharamshala", select: "name location" },
  ]);
  return res.status(200).json(new ApiResponse("Dharamshala bookings fetched successfully", { bookings: items }, meta));
});

exports.reviewDharamshalaBooking = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const note = (req.body.reviewNote || req.body.reviewMessage || req.body.reason || "").trim();

  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new ApiError(400, "INVALID_BOOKING_REVIEW_ACTION", "Action must be APPROVE or REJECT");
  }
  if (action === "REJECT" && !note) {
    throw new ApiError(400, "REJECTION_REASON_REQUIRED", "A rejection reason is required");
  }

  const booking = await DharamshalaBooking.findOne({ _id: req.params.bookingId, status: "PENDING" });
  if (!booking) throw new ApiError(404, "BOOKING_NOT_REVIEWABLE", "Booking was not found or already reviewed");

  if (action === "APPROVE") {
    const conflicts = await getDharamshalaConflicts(booking.startDate, booking.endDate, booking._id);
    const sameRoomConflicts = conflicts.bookings.filter((item) => (
      String(item.dharamshala) === String(booking.dharamshala) && item.roomType === booking.roomType
    ));
    const dharamshala = await Dharamshala.findById(booking.dharamshala);
    const roomConfig = dharamshala?.roomTypes?.find((room) => room.name === booking.roomType);
    const bookedRooms = sameRoomConflicts.reduce((sum, item) => sum + (item.roomsRequested || 1), 0);
    if (conflicts.blockedDates.length || !roomConfig || bookedRooms + booking.roomsRequested > roomConfig.totalRooms) {
      throw new ApiError(409, "DHARAMSHALA_DATES_UNAVAILABLE", "These dates are no longer available");
    }
  }

  if (action === "REJECT") await releaseDharamshalaSlots(booking._id);

  const previousStatus = booking.status;
  booking.status = action === "APPROVE" ? "PAYMENT_PENDING" : "REJECTED";
  booking.paymentStatus = action === "APPROVE" ? "PENDING" : "NOT_APPLICABLE";
  booking.reviewedBy = req.user.id;
  booking.reviewedAt = new Date();
  booking.approvedAt = action === "APPROVE" ? new Date() : undefined;
  booking.paymentDeadline = action === "APPROVE"
    ? new Date(Date.now() + (Number(process.env.DHARAMSHALA_PAYMENT_HOLD_HOURS) || 24) * 60 * 60 * 1000)
    : undefined;
  booking.reviewMessage = note || (action === "APPROVE" ? "Booking approved by administrator" : "");
  booking.reviewNote = note || (action === "APPROVE" ? "Booking approved by administrator" : "");
  booking.rejectionReason = action === "REJECT" ? note : undefined;
  addBookingHistory(booking, booking.status, booking.paymentStatus, req.user.id, note);
  await booking.save();

  if (booking.requester) {
    await notifyUser({
      recipient: booking.requester,
      title: action === "APPROVE" ? "Dharamshala booking approved" : "Dharamshala booking rejected",
      message: action === "APPROVE"
        ? `Booking ${booking.bookingReference} is approved. Complete payment before ${booking.paymentDeadline.toLocaleString("en-IN")} to confirm it.`
        : `Booking ${booking.bookingReference} was rejected. Reason: ${note}`,
      email: true,
      metadata: { booking: booking._id, bookingReference: booking.bookingReference, status: booking.status },
    });
  }

  await logAudit({
    actor: req.user.id,
    action: `dharamshala.booking.${booking.status.toLowerCase()}`,
    targetType: "dharamshalaBooking",
    target: booking._id,
    oldValue: { status: previousStatus },
    newValue: { status: booking.status },
    reason: note || undefined,
    req,
  });

  return res.status(200).json(new ApiResponse("Booking reviewed successfully", { booking }));
});

exports.cancelDharamshalaBooking = asyncHandler(async (req, res) => {
  const booking = await DharamshalaBooking.findById(req.params.bookingId);
  if (!booking || ["CANCELLED", "ARCHIVED", "COMPLETED"].includes(booking.status)) {
    throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  }
  if (!canEditOwned(booking.requester, req) && !(req.user.roles || []).some((role) => ["DHARAMSHALA_ADMIN", "SUPER_ADMIN", "Admin"].includes(role))) {
    throw new ApiError(403, "BOOKING_CANCEL_FORBIDDEN", "You cannot cancel this booking");
  }

  const reason = (req.body.reason || req.body.cancellationReason || req.body.reviewMessage || "Cancelled by user").trim();
  booking.status = "CANCELLED";
  booking.paymentStatus = booking.paymentStatus === "SUCCESS" ? "REFUND_PENDING" : "NOT_APPLICABLE";
  booking.cancelledBy = req.user.id;
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason;
  addBookingHistory(booking, booking.status, booking.paymentStatus, req.user.id, reason);
  await booking.save();
  await releaseDharamshalaSlots(booking._id);
  return res.status(200).json(new ApiResponse("Booking cancelled successfully", { booking }));
});

exports.updateDharamshalaBookingLifecycle = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const booking = await DharamshalaBooking.findById(req.params.bookingId);
  if (!booking) throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  const allowed = { CHECK_IN: ["CONFIRMED"], COMPLETE: ["CHECKED_IN"] };
  if (!allowed[action]?.includes(booking.status)) {
    throw new ApiError(409, "INVALID_BOOKING_TRANSITION", `Cannot ${action} a booking in ${booking.status} status`);
  }
  booking.status = action === "CHECK_IN" ? "CHECKED_IN" : "COMPLETED";
  if (action === "CHECK_IN") booking.checkedInAt = new Date();
  if (action === "COMPLETE") booking.completedAt = new Date();
  addBookingHistory(booking, booking.status, booking.paymentStatus, req.user.id, `Admin action: ${action}`);
  await booking.save();
  if (booking.requester) {
    await notifyUser({
      recipient: booking.requester,
      title: `Dharamshala booking ${booking.status.toLowerCase()}`,
      message: `Booking ${booking.bookingReference || booking._id} is now ${booking.status}.`,
      metadata: { booking: booking._id },
    });
  }
  return res.status(200).json(new ApiResponse("Dharamshala booking lifecycle updated", { booking }));
});

exports.checkDharamshalaAvailability = asyncHandler(async (req, res) => {
  const { start, end } = assertDateRange(req.query.startDate, req.query.endDate);
  const dharamshala = req.query.dharamshalaId
    ? await Dharamshala.findById(req.query.dharamshalaId)
    : await Dharamshala.findOne({ status: "ACTIVE" });
  const roomConfig = dharamshala?.roomTypes?.find((room) => room.name === req.query.roomType);
  if (!dharamshala || !roomConfig) {
    throw new ApiError(404, "ROOM_TYPE_NOT_FOUND", "Selected room type is not available");
  }
  const requestedRooms = Math.max(Number(req.query.roomsRequested) || 1, 1);
  const conflicts = await getDharamshalaConflicts(
    start,
    end,
    null,
    req.query.dharamshalaId,
    req.query.roomType
  );
  const bookedRooms = conflicts.bookings.reduce((sum, booking) => sum + (booking.roomsRequested || 1), 0);
  const availableRooms = Math.max(0, roomConfig.totalRooms - bookedRooms);
  return res.status(200).json(new ApiResponse("Dharamshala availability checked", {
    available: conflicts.blockedDates.length === 0 && availableRooms >= requestedRooms,
    totalRooms: roomConfig.totalRooms,
    bookedRooms,
    availableRooms,
    requestedRooms,
    conflicts,
  }));
});

exports.createDharamshalaBlockedDate = asyncHandler(async (req, res) => {
  const { start, end } = assertDateRange(req.body.startDate, req.body.endDate);
  if (!req.body.reason) throw new ApiError(400, "BLOCK_REASON_REQUIRED", "Block reason is required");

  const conflicts = await getDharamshalaConflicts(start, end);
  if (conflicts.bookings.length > 0) {
    throw new ApiError(409, "APPROVED_BOOKING_CONFLICT", "Cancel or reschedule approved bookings before blocking these dates", conflicts);
  }

  const blockedDate = await DharamshalaBlockedDate.create({
    startDate: start,
    endDate: end,
    reason: req.body.reason,
    createdBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "dharamshala.blocked_date.created",
    targetType: "dharamshalaBlockedDate",
    target: blockedDate._id,
    newValue: { startDate: blockedDate.startDate, endDate: blockedDate.endDate, reason: blockedDate.reason },
    req,
  });

  return res.status(201).json(new ApiResponse("Dharamshala dates blocked successfully", { blockedDate }));
});

exports.listDharamshalaBlockedDates = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  else filter.status = "ACTIVE";
  if (req.query.from) filter.endDate = { $gte: new Date(req.query.from) };
  if (req.query.to) filter.startDate = { $lte: new Date(req.query.to) };

  const { items, meta } = await paged(DharamshalaBlockedDate, filter, req.query, { startDate: 1 }, {
    path: "createdBy",
    select: "firstName lastName email",
  });
  return res.status(200).json(new ApiResponse("Dharamshala blocked dates fetched", { blockedDates: items }, meta));
});

exports.archiveDharamshalaBlockedDate = asyncHandler(async (req, res) => {
  const blockedDate = await DharamshalaBlockedDate.findOneAndUpdate(
    { _id: req.params.blockId, status: "ACTIVE" },
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );

  if (!blockedDate) throw new ApiError(404, "BLOCKED_DATE_NOT_FOUND", "Blocked date was not found or already archived");

  await logAudit({
    actor: req.user.id,
    action: "dharamshala.blocked_date.archived",
    targetType: "dharamshalaBlockedDate",
    target: blockedDate._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Dharamshala blocked date archived", { blockedDate }));
});

exports.createPoll = asyncHandler(async (req, res) => {
  const options = Array.isArray(req.body.options) ? req.body.options : [];
  if (!req.body.title || options.length < 2 || !req.body.endsAt) {
    throw new ApiError(400, "POLL_FIELDS_REQUIRED", "Title, at least two options, and end date are required");
  }
  if (new Date(req.body.endsAt) <= new Date()) {
    throw new ApiError(400, "POLL_END_DATE_INVALID", "Poll end date must be in the future");
  }

  const isMultipleChoice = Boolean(req.body.isMultipleChoice);
  const maxSelections = isMultipleChoice ? Math.max(Number(req.body.maxSelections) || 2, 2) : 1;

  const poll = await Poll.create({
    title: req.body.title,
    description: req.body.description,
    options: options.map((opt) => typeof opt === "object" ? { label: opt.label } : { label: String(opt).trim() }),
    isMultipleChoice,
    maxSelections,
    allowChangeVote: Boolean(req.body.allowChangeVote),
    isAnonymous: req.body.isAnonymous !== false,
    targetAudience: req.body.targetAudience || "ALL",
    startsAt: req.body.startsAt || new Date(),
    endsAt: req.body.endsAt,
    status: req.body.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    createdBy: req.user.id,
  });
  return res.status(201).json(new ApiResponse("Poll created successfully", { poll }));
});

exports.listPolls = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.admin === "true" && (req.user?.roles || []).some((role) => ["SUPER_ADMIN", "Admin", "COMMUNITY_ADMIN"].includes(role))) {
    filter.status = { $ne: "ARCHIVED" };
  } else if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $in: ["ACTIVE", "CLOSED"] };
  }

  const { items, meta } = await paged(Poll, filter, req.query, { createdAt: -1 });

  // Attach user vote status if authenticated
  let userVotesMap = {};
  if (req.user?.id && items.length > 0) {
    const pollIds = items.map((p) => p._id);
    const participations = await VoteParticipation.find({ poll: { $in: pollIds }, member: req.user.id });
    participations.forEach((p) => {
      userVotesMap[String(p.poll)] = p.selectedOptions || [];
    });
  }

  const enrichedPolls = items.map((poll) => {
    const pollObj = poll.toObject ? poll.toObject() : { ...poll };
    const userSelected = userVotesMap[String(poll._id)] || null;
    pollObj.hasVoted = Boolean(userSelected && userSelected.length > 0);
    pollObj.userSelectedOptions = userSelected || [];
    return pollObj;
  });

  return res.status(200).json(new ApiResponse("Polls fetched successfully", { polls: enrichedPolls }, meta));
});

exports.updatePollStatus = asyncHandler(async (req, res) => {
  if (!["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_POLL_STATUS", "Poll status must be DRAFT, ACTIVE, CLOSED, or ARCHIVED");
  }
  const poll = await Poll.findByIdAndUpdate(req.params.pollId, { status: req.body.status }, { new: true, runValidators: true });
  if (!poll) throw new ApiError(404, "POLL_NOT_FOUND", "Poll was not found");
  return res.status(200).json(new ApiResponse("Poll status updated successfully", { poll }));
});

exports.getPollResults = asyncHandler(async (req, res) => {
  const poll = await Poll.findOne({
    _id: req.params.pollId,
    status: { $ne: "ARCHIVED" },
  });
  if (!poll) throw new ApiError(404, "POLL_NOT_FOUND", "Poll was not found");

  const optionLabelById = new Map(poll.options.map((option) => [String(option._id), option.label]));
  const voters = await VoteParticipation.find({ poll: poll._id })
    .populate("member", "firstName lastName imageUrl")
    .sort({ updatedAt: -1, createdAt: -1 });

  return res.status(200).json(new ApiResponse("Poll results fetched successfully", {
    poll: {
      _id: poll._id,
      title: poll.title,
      description: poll.description,
      status: poll.status,
      endsAt: poll.endsAt,
      totalVotes: poll.totalVotes,
      voterCount: voters.length,
      uniqueVoters: voters.length,
      isMultipleChoice: poll.isMultipleChoice,
      maxSelections: poll.maxSelections,
      allowChangeVote: poll.allowChangeVote,
      options: poll.options.map((option) => ({
        _id: option._id,
        label: option.label,
        voteCount: option.voteCount,
        percentage: poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 10000) / 100 : 0,
      })),
      voters: voters.map((participation) => ({
        memberId: participation.member?._id,
        name: [participation.member?.firstName, participation.member?.lastName].filter(Boolean).join(" ") || "Member",
        photo: participation.member?.imageUrl,
        selectedOptions: (participation.selectedOptions || []).map((optionId) => ({
          optionId,
          label: optionLabelById.get(String(optionId)) || "Unknown option",
        })),
        votedAt: participation.createdAt,
        updatedAt: participation.updatedAt,
        voteChanged: participation.updatedAt && participation.createdAt
          ? participation.updatedAt.getTime() !== participation.createdAt.getTime()
          : false,
      })),
    },
  }));
});

exports.castVote = asyncHandler(async (req, res) => {
  const { optionId, optionIds } = req.body;
  const targetOptionIds = optionIds || (optionId ? [optionId] : []);

  if (!targetOptionIds.length) {
    throw new ApiError(400, "OPTION_REQUIRED", "Please select an option to vote");
  }

  const poll = await Poll.findOne({ _id: req.params.pollId, status: "ACTIVE" });
  if (!poll || new Date(poll.endsAt) <= new Date()) {
    throw new ApiError(409, "POLL_NOT_ACTIVE", "Poll is not active or has ended");
  }

  if (!poll.isMultipleChoice && targetOptionIds.length > 1) {
    throw new ApiError(400, "SINGLE_SELECTION_ONLY", "This poll only allows selecting one option");
  }

  if (poll.isMultipleChoice && targetOptionIds.length > (poll.maxSelections || 2)) {
    throw new ApiError(400, "MAX_SELECTIONS_EXCEEDED", `You can select at most ${poll.maxSelections} options`);
  }

  // Check valid option IDs
  const validOptionIds = targetOptionIds.filter((id) => poll.options.id(id));
  if (validOptionIds.length !== targetOptionIds.length) {
    throw new ApiError(404, "POLL_OPTION_NOT_FOUND", "One or more selected poll options are invalid");
  }

  const existingParticipation = await VoteParticipation.findOne({ poll: poll._id, member: req.user.id });
  if (existingParticipation && !poll.allowChangeVote) {
    throw new ApiError(409, "ALREADY_VOTED", "You have already cast your vote in this poll");
  }

  if (existingParticipation && poll.allowChangeVote) {
    // Decrement previous votes
    const prevIds = existingParticipation.selectedOptions || [];
    for (const prevId of prevIds) {
      await Poll.updateOne({ _id: poll._id, "options._id": prevId }, { $inc: { totalVotes: -1, "options.$.voteCount": -1 } });
    }
    existingParticipation.selectedOptions = validOptionIds;
    await existingParticipation.save();

    // Increment new votes
    for (const newId of validOptionIds) {
      await Poll.updateOne({ _id: poll._id, "options._id": newId }, { $inc: { totalVotes: 1, "options.$.voteCount": 1 } });
    }
  } else {
    try {
      await VoteParticipation.create({
        poll: poll._id,
        member: req.user.id,
        selectedOptions: validOptionIds,
      });

      for (const optId of validOptionIds) {
        await Vote.create({ poll: poll._id, option: optId });
        await Poll.updateOne(
          { _id: poll._id, "options._id": optId },
          { $inc: { totalVotes: 1, voterCount: 1, "options.$.voteCount": 1 } }
        );
      }
    } catch (error) {
      if (error?.code === 11000) {
        throw new ApiError(409, "ALREADY_VOTED", "You have already voted in this poll");
      }
      throw error;
    }
  }

  return res.status(201).json(new ApiResponse("Vote recorded successfully", {
    selectedOptions: validOptionIds,
  }));
});

exports.createCommunityPost = asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.body) throw new ApiError(400, "POST_FIELDS_REQUIRED", "Title and body are required");
  const post = await CommunityPost.create({
    title: req.body.title,
    body: req.body.body,
    category: req.body.category,
    author: req.user.id,
  });
  return res.status(201).json(new ApiResponse("Post created successfully", { post }));
});

exports.listCommunityPosts = asyncHandler(async (req, res) => {
  const filter = { status: req.query.admin === "true" ? { $ne: "ARCHIVED" } : "PUBLISHED", ...textFilter(req.query.q) };
  if (req.query.category) filter.category = String(req.query.category).trim();
  const { items, meta } = await paged(CommunityPost, filter, req.query, { createdAt: -1 }, {
    path: "author",
    select: "firstName lastName imageUrl",
  });
  return res.status(200).json(new ApiResponse("Community posts fetched successfully", { posts: items }, meta));
});

exports.moderateCommunityPost = asyncHandler(async (req, res) => {
  if (!["PUBLISHED", "UNDER_REVIEW", "HIDDEN", "ARCHIVED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_POST_STATUS", "Invalid post status");
  }
  const post = await CommunityPost.findByIdAndUpdate(
    req.params.postId,
    { status: req.body.status, moderatedBy: req.user.id, moderationReason: req.body.reason },
    { new: true, runValidators: true }
  );
  if (!post) throw new ApiError(404, "POST_NOT_FOUND", "Post was not found");
  return res.status(200).json(new ApiResponse("Post moderated successfully", { post }));
});

exports.addCommunityComment = asyncHandler(async (req, res) => {
  if (!req.body.body) throw new ApiError(400, "COMMENT_BODY_REQUIRED", "Comment body is required");
  const post = await CommunityPost.findOne({ _id: req.params.postId, status: "PUBLISHED" });
  if (!post) throw new ApiError(404, "POST_NOT_FOUND", "Post was not found");
  const comment = await CommunityComment.create({ post: post._id, author: req.user.id, body: req.body.body });
  await CommunityPost.findByIdAndUpdate(post._id, { $inc: { commentCount: 1 } });
  return res.status(201).json(new ApiResponse("Comment added successfully", { comment }));
});

exports.listCommunityComments = asyncHandler(async (req, res) => {
  const { items, meta } = await paged(
    CommunityComment,
    { post: req.params.postId, status: "PUBLISHED" },
    req.query,
    { createdAt: 1 },
    { path: "author", select: "firstName lastName imageUrl" }
  );
  return res.status(200).json(new ApiResponse("Comments fetched successfully", { comments: items }, meta));
});

exports.moderateCommunityComment = asyncHandler(async (req, res) => {
  if (!["PUBLISHED", "HIDDEN", "ARCHIVED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_COMMENT_STATUS", "Invalid comment status");
  }
  const comment = await CommunityComment.findByIdAndUpdate(
    req.params.commentId,
    { status: req.body.status, moderatedBy: req.user.id, moderationReason: req.body.reason },
    { new: true, runValidators: true }
  );
  if (!comment) throw new ApiError(404, "COMMENT_NOT_FOUND", "Comment was not found");
  return res.status(200).json(new ApiResponse("Comment moderated successfully", { comment }));
});

exports.reportCommunityPost = asyncHandler(async (req, res) => {
  if (!req.body.reason) throw new ApiError(400, "REPORT_REASON_REQUIRED", "Report reason is required");
  const post = await CommunityPost.findOne({ _id: req.params.postId, status: { $ne: "ARCHIVED" } });
  if (!post) throw new ApiError(404, "POST_NOT_FOUND", "Post was not found");

  let report;
  try {
    report = await CommunityReport.create({
      targetType: "POST",
      post: post._id,
      reportedBy: req.user.id,
      reason: req.body.reason,
      details: req.body.details,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "COMMUNITY_REPORT_ALREADY_OPEN", "You already have an open report for this post");
    }
    throw error;
  }

  post.reportCount += 1;
  if (post.status === "PUBLISHED") post.status = "UNDER_REVIEW";
  await post.save();

  return res.status(201).json(new ApiResponse("Post reported successfully", { report }));
});

exports.reportCommunityComment = asyncHandler(async (req, res) => {
  if (!req.body.reason) throw new ApiError(400, "REPORT_REASON_REQUIRED", "Report reason is required");
  const comment = await CommunityComment.findOne({ _id: req.params.commentId, status: { $ne: "ARCHIVED" } });
  if (!comment) throw new ApiError(404, "COMMENT_NOT_FOUND", "Comment was not found");

  let report;
  try {
    report = await CommunityReport.create({
      targetType: "COMMENT",
      post: comment.post,
      comment: comment._id,
      reportedBy: req.user.id,
      reason: req.body.reason,
      details: req.body.details,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "COMMUNITY_REPORT_ALREADY_OPEN", "You already have an open report for this comment");
    }
    throw error;
  }

  await CommunityPost.findByIdAndUpdate(comment.post, { $inc: { reportCount: 1 } });
  return res.status(201).json(new ApiResponse("Comment reported successfully", { report }));
});

exports.listCommunityReports = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.targetType) filter.targetType = req.query.targetType;
  if (req.query.post) filter.post = req.query.post;

  const { items, meta } = await paged(CommunityReport, filter, req.query, { createdAt: -1 }, [
    { path: "reportedBy", select: "firstName lastName email" },
    { path: "post", select: "title status reportCount" },
    { path: "comment", select: "body status" },
  ]);
  return res.status(200).json(new ApiResponse("Community reports fetched", { reports: items }, meta));
});

exports.reviewCommunityReport = asyncHandler(async (req, res) => {
  if (!["UNDER_REVIEW", "RESOLVED", "DISMISSED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_REPORT_STATUS", "Status must be UNDER_REVIEW, RESOLVED, or DISMISSED");
  }

  const report = await CommunityReport.findById(req.params.reportId);
  if (!report) throw new ApiError(404, "COMMUNITY_REPORT_NOT_FOUND", "Report was not found");

  report.status = req.body.status;
  report.reviewedBy = req.user.id;
  report.reviewedAt = new Date();
  report.resolution = req.body.resolution;
  await report.save();

  if (req.body.targetStatus) {
    if (report.targetType === "POST") {
      if (!["PUBLISHED", "UNDER_REVIEW", "HIDDEN", "ARCHIVED"].includes(req.body.targetStatus)) {
        throw new ApiError(400, "INVALID_POST_STATUS", "Invalid post status");
      }
      await CommunityPost.findByIdAndUpdate(report.post, {
        status: req.body.targetStatus,
        moderatedBy: req.user.id,
        moderationReason: req.body.resolution,
      }, { runValidators: true });
    } else if (report.comment) {
      if (!["PUBLISHED", "HIDDEN", "ARCHIVED"].includes(req.body.targetStatus)) {
        throw new ApiError(400, "INVALID_COMMENT_STATUS", "Invalid comment status");
      }
      await CommunityComment.findByIdAndUpdate(report.comment, {
        status: req.body.targetStatus,
        moderatedBy: req.user.id,
        moderationReason: req.body.resolution,
      }, { runValidators: true });
    }
  }

  return res.status(200).json(new ApiResponse("Community report reviewed", { report }));
});

exports.getShradhanjaliSupportingDocument = asyncHandler(async (req, res) => {
  const item = await Shradhanjali.findById(req.params.shradhanjaliId).select("personName status supportingDocument");
  if (!item || item.status === "ARCHIVED") {
    throw new ApiError(404, "SHRADHANJALI_NOT_FOUND", "Tribute submission was not found");
  }

  const document = item.supportingDocument;
  if (!document?.publicId && !document?.url) {
    throw new ApiError(404, "DOCUMENT_NOT_FOUND", "Supporting document not available");
  }

  const action = req.query.download === "true" ? "DOCUMENT_DOWNLOADED" : "DOCUMENT_VIEWED";
  await logAudit({
    actor: req.user.id,
    action,
    targetType: "shradhanjali",
    target: item._id,
    metadata: {
      documentName: document.name,
      documentMimeType: document.mimeType,
      documentSize: document.size,
    },
    req,
  });

  return res.status(200).json(new ApiResponse("Supporting document URL generated", {
    signedUrl: signedCloudinaryDocumentUrl(document, { download: req.query.download === "true" }),
    expiresIn: document.publicId ? 300 : null,
    documentMeta: {
      name: document.name || "Supporting Document",
      mimeType: document.mimeType,
      size: document.size,
      uploadedAt: document.uploadedAt,
    },
  }));
});

function createReviewableHandlers(Model, publicName, fields) {
  return {
    create: asyncHandler(async (req, res) => {
      const payload = {};
      fields.forEach((field) => {
        if (req.body[field] !== undefined) payload[field] = req.body[field];
      });

      if (publicName === "achievement") {
        const photoFile = req.files?.recipientPhoto || req.files?.photo || req.files?.image || req.files?.achievementImage;
        if (photoFile) {
          const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/achievements/photos");
          payload.recipientPhoto = assetMetadata(uploadResult, photoFile.name);
          payload.image = payload.recipientPhoto;
        } else if (req.body.recipientPhoto) {
          payload.recipientPhoto = assetFromBody(req.body.recipientPhoto);
          payload.image = payload.recipientPhoto;
        } else if (req.body.image) {
          payload.image = assetFromBody(req.body.image);
          payload.recipientPhoto = payload.image;
        }

        const docFile = req.files?.supportingDocument || req.files?.document || req.files?.certificate;
        if (docFile) {
          const uploadResult = await uploadDocumentToCloudinary(docFile, "samaj/achievements/docs");
          payload.supportingDocument = assetMetadata(uploadResult, docFile.name);
        } else if (req.body.supportingDocument) {
          payload.supportingDocument = assetFromBody(req.body.supportingDocument);
        }
      }

      if (publicName === "shradhanjali") {
        const photoFile = req.files?.photo || req.files?.tributePhoto || req.files?.image;
        if (photoFile) {
          const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/shradhanjali/photos");
          payload.photo = assetMetadata(uploadResult, photoFile.name);
        } else if (req.body.photo) {
          payload.photo = assetFromBody(req.body.photo);
        }

        const docFile = req.files?.supportingDocument || req.files?.document;
        if (docFile) {
          const uploadResult = await uploadDocumentToCloudinary(docFile, "samaj/shradhanjali/docs");
          payload.supportingDocument = assetMetadata(uploadResult, docFile.name);
        } else if (req.body.supportingDocument) {
          payload.supportingDocument = assetFromBody(req.body.supportingDocument);
        }
      }

      const duplicateFilter = { submittedBy: req.user.id, status: "PENDING" };
      if (publicName === "achievement") {
        duplicateFilter.title = new RegExp(`^${String(payload.title || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        const duplicate = await Model.findOne(duplicateFilter);
        if (duplicate) {
          throw new ApiError(409, "ACHIEVEMENT_ALREADY_PENDING", "You already have an achievement submission pending committee review.");
        }
      }
      if (publicName === "shradhanjali") {
        duplicateFilter.personName = new RegExp(`^${String(payload.personName || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
        if (payload.dateOfPassing) duplicateFilter.dateOfPassing = new Date(payload.dateOfPassing);
        const duplicate = await Model.findOne(duplicateFilter);
        if (duplicate) {
          throw new ApiError(409, "SHRADHANJALI_ALREADY_PENDING", "A tribute for this person is already under verification.");
        }
      }

      const item = await Model.create({ ...payload, submittedBy: req.user.id });
      return res.status(201).json(new ApiResponse(`${publicName} submitted successfully`, { [publicName]: item }));
    }),
    list: asyncHandler(async (req, res) => {
      const adminView = req.query.admin === "true";
      const mineView = req.query.mine === "true";
      if (adminView && !req.user?.id) {
        throw new ApiError(401, "AUTH_REQUIRED", "Admin review listings require authentication");
      }
      if (mineView && !req.user?.id) {
        throw new ApiError(401, "AUTH_REQUIRED", "Own submissions require authentication");
      }
      const filter = mineView
        ? { submittedBy: req.user.id, status: { $ne: "ARCHIVED" }, ...textFilter(req.query.q) }
        : { status: adminView ? { $ne: "ARCHIVED" } : "PUBLISHED", ...textFilter(req.query.q) };
      const { items, meta } = await paged(Model, filter, req.query, { createdAt: -1 }, {
        path: "submittedBy",
        select: adminView ? "firstName lastName email" : "firstName lastName imageUrl",
      });
      return res.status(200).json(new ApiResponse(`${publicName}s fetched successfully`, { [`${publicName}s`]: items }, meta));
    }),
    review: asyncHandler(async (req, res) => {
      if (!["PUBLISHED", "REJECTED", "ARCHIVED"].includes(req.body.status)) {
        throw new ApiError(400, "INVALID_REVIEW_STATUS", "Status must be PUBLISHED, REJECTED, or ARCHIVED");
      }
      const item = await Model.findByIdAndUpdate(
        req.params[`${publicName}Id`],
        { status: req.body.status, reviewedBy: req.user.id, reviewedAt: new Date(), reviewReason: req.body.reason },
        { new: true, runValidators: true }
      );
      if (!item) throw new ApiError(404, `${publicName.toUpperCase()}_NOT_FOUND`, `${publicName} was not found`);
      return res.status(200).json(new ApiResponse(`${publicName} reviewed successfully`, { [publicName]: item }));
    }),
  };
}

const achievementHandlers = createReviewableHandlers(Achievement, "achievement", [
  "title",
  "description",
  "achieverName",
  "achiever",
  "category",
  "organization",
  "year",
]);
const shradhanjaliHandlers = createReviewableHandlers(Shradhanjali, "shradhanjali", [
  "personName",
  "message",
  "dateOfBirth",
  "dateOfPassing",
  "family",
  "familyInfo",
  "biography",
]);

exports.createAchievement = achievementHandlers.create;
exports.listAchievements = achievementHandlers.list;
exports.reviewAchievement = achievementHandlers.review;
exports.createShradhanjali = shradhanjaliHandlers.create;
exports.listShradhanjalis = shradhanjaliHandlers.list;
exports.reviewShradhanjali = shradhanjaliHandlers.review;

exports.getMyMembershipCard = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .select("firstName lastName email imageUrl accountStatus roles family additionalDetails createdAt")
    .populate("family", "familyName familyCode")
    .populate("additionalDetails");
  if (!user || user.accountStatus !== "ACTIVE") {
    throw new ApiError(403, "MEMBERSHIP_CARD_UNAVAILABLE", "Membership card is available only for active members");
  }
  return res.status(200).json(new ApiResponse("Membership card fetched successfully", {
    card: {
      memberId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      photo: user.imageUrl,
      status: user.accountStatus,
      family: user.family,
      issuedAt: user.createdAt,
      verifyUrl: `/api/v1/community/membership-cards/${user._id}/verify`,
    },
  }));
});

exports.verifyMembershipCard = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.memberId).select("firstName lastName imageUrl accountStatus active");
  if (!user) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member was not found");
  return res.status(200).json(new ApiResponse("Membership card verification fetched", {
    member: {
      memberId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      photo: user.imageUrl,
      valid: user.active && user.accountStatus === "ACTIVE",
      status: user.active ? user.accountStatus : "DEACTIVATED",
    },
  }));
});

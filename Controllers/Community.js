const mongoose = require("mongoose");
const Issue = require("../Models/issue");
const IssueResponse = require("../Models/issueResponse");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DharamshalaBlockedDate = require("../Models/dharamshalaBlockedDate");
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
  return { start, end };
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

async function getDharamshalaConflicts(startDate, endDate, excludeBookingId = null) {
  const bookingFilter = {
    status: "APPROVED",
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };
  if (excludeBookingId) bookingFilter._id = { $ne: excludeBookingId };

  const [bookings, blockedDates] = await Promise.all([
    DharamshalaBooking.find(bookingFilter).select("startDate endDate purpose roomsRequested"),
    DharamshalaBlockedDate.find({
      status: "ACTIVE",
      startDate: { $lt: endDate },
      endDate: { $gt: startDate },
    }).select("startDate endDate reason"),
  ]);

  return { bookings, blockedDates };
}

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
  if (status === "REJECTED") issue.moderationReason = reason;
  if (status === "ARCHIVED") {
    issue.isArchived = true;
    issue.archivedAt = new Date();
    issue.archivedBy = req.user.id;
    issue.archiveReason = reason;
  }
  await issue.save();

  if (note || previousStatus !== status) {
    await IssueResponse.create({
      issue: issue._id,
      author: req.user.id,
      type: status === "SOLUTION_PROPOSED" ? "PROPOSED_SOLUTION" : "STATUS_NOTE",
      message: note || `Status changed to ${status}`,
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
    reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Issue updated successfully", { issue }));
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

exports.createDharamshalaBooking = asyncHandler(async (req, res) => {
  const { start, end } = assertDateRange(req.body.startDate, req.body.endDate);
  if (!req.body.purpose) throw new ApiError(400, "BOOKING_PURPOSE_REQUIRED", "Purpose is required");

  const conflicts = await getDharamshalaConflicts(start, end);
  if (conflicts.blockedDates.length > 0) {
    throw new ApiError(409, "DHARAMSHALA_DATES_BLOCKED", "These dates are blocked by the admin", conflicts);
  }

  const booking = await DharamshalaBooking.create({
    requester: req.user?.id,
    guestName: req.body.guestName,
    guestPhone: req.body.guestPhone,
    purpose: req.body.purpose,
    startDate: start,
    endDate: end,
    roomsRequested: req.body.roomsRequested,
  });

  return res.status(201).json(new ApiResponse("Dharamshala booking requested", { booking }));
});

exports.listDharamshalaBookings = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.mine === "true") filter.requester = req.user.id;
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(DharamshalaBooking, filter, req.query, { startDate: -1 }, {
    path: "requester",
    select: "firstName lastName email imageUrl",
  });
  return res.status(200).json(new ApiResponse("Dharamshala bookings fetched successfully", { bookings: items }, meta));
});

exports.reviewDharamshalaBooking = asyncHandler(async (req, res) => {
  const { action, reviewMessage } = req.body;
  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new ApiError(400, "INVALID_BOOKING_REVIEW_ACTION", "Action must be APPROVE or REJECT");
  }

  const booking = await DharamshalaBooking.findOne({ _id: req.params.bookingId, status: "PENDING" });
  if (!booking) throw new ApiError(404, "BOOKING_NOT_REVIEWABLE", "Booking was not found or already reviewed");

  if (action === "APPROVE") {
    const conflicts = await getDharamshalaConflicts(booking.startDate, booking.endDate, booking._id);
    if (conflicts.bookings.length || conflicts.blockedDates.length) {
      throw new ApiError(409, "DHARAMSHALA_DATES_UNAVAILABLE", "These dates are no longer available");
    }
  }

  const previousStatus = booking.status;
  booking.status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  booking.reviewedBy = req.user.id;
  booking.reviewedAt = new Date();
  booking.reviewMessage = reviewMessage;
  await booking.save();

  await logAudit({
    actor: req.user.id,
    action: `dharamshala.booking.${booking.status.toLowerCase()}`,
    targetType: "dharamshalaBooking",
    target: booking._id,
    oldValue: { status: previousStatus },
    newValue: { status: booking.status },
    reason: reviewMessage,
    req,
  });

  return res.status(200).json(new ApiResponse("Booking reviewed successfully", { booking }));
});

exports.cancelDharamshalaBooking = asyncHandler(async (req, res) => {
  const booking = await DharamshalaBooking.findById(req.params.bookingId);
  if (!booking || ["CANCELLED", "ARCHIVED"].includes(booking.status)) {
    throw new ApiError(404, "BOOKING_NOT_FOUND", "Booking was not found");
  }
  if (!canEditOwned(booking.requester, req) && !(req.user.roles || []).some((role) => ["DHARAMSHALA_ADMIN", "SUPER_ADMIN", "Admin"].includes(role))) {
    throw new ApiError(403, "BOOKING_CANCEL_FORBIDDEN", "You cannot cancel this booking");
  }

  booking.status = "CANCELLED";
  booking.cancelledBy = req.user.id;
  booking.cancelledAt = new Date();
  booking.cancellationReason = req.body.reason;
  await booking.save();
  return res.status(200).json(new ApiResponse("Booking cancelled successfully", { booking }));
});

exports.checkDharamshalaAvailability = asyncHandler(async (req, res) => {
  const { start, end } = assertDateRange(req.query.startDate, req.query.endDate);
  const conflicts = await getDharamshalaConflicts(start, end);
  return res.status(200).json(new ApiResponse("Dharamshala availability checked", {
    available: conflicts.bookings.length === 0 && conflicts.blockedDates.length === 0,
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

  const poll = await Poll.create({
    title: req.body.title,
    description: req.body.description,
    options: options.map((label) => ({ label })),
    startsAt: req.body.startsAt,
    endsAt: req.body.endsAt,
    status: req.body.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
    createdBy: req.user.id,
  });
  return res.status(201).json(new ApiResponse("Poll created successfully", { poll }));
});

exports.listPolls = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.admin === "true" && (req.user.roles || []).some((role) => ["SUPER_ADMIN", "Admin"].includes(role))) {
    filter.status = { $ne: "ARCHIVED" };
  } else if (req.query.status) filter.status = req.query.status;
  else filter.status = { $in: ["ACTIVE", "CLOSED"] };
  const { items, meta } = await paged(Poll, filter, req.query, { createdAt: -1 });
  return res.status(200).json(new ApiResponse("Polls fetched successfully", { polls: items }, meta));
});

exports.updatePollStatus = asyncHandler(async (req, res) => {
  if (!["ACTIVE", "CLOSED", "ARCHIVED"].includes(req.body.status)) {
    throw new ApiError(400, "INVALID_POLL_STATUS", "Poll status must be ACTIVE, CLOSED, or ARCHIVED");
  }
  const poll = await Poll.findByIdAndUpdate(req.params.pollId, { status: req.body.status }, { new: true, runValidators: true });
  if (!poll) throw new ApiError(404, "POLL_NOT_FOUND", "Poll was not found");
  return res.status(200).json(new ApiResponse("Poll status updated successfully", { poll }));
});

exports.getPollResults = asyncHandler(async (req, res) => {
  const poll = await Poll.findOne({
    _id: req.params.pollId,
    status: { $in: ["ACTIVE", "CLOSED"] },
  });
  if (!poll) throw new ApiError(404, "POLL_NOT_FOUND", "Poll was not found");

  return res.status(200).json(new ApiResponse("Poll results fetched successfully", {
    poll: {
      _id: poll._id,
      title: poll.title,
      description: poll.description,
      status: poll.status,
      endsAt: poll.endsAt,
      totalVotes: poll.totalVotes,
      options: poll.options.map((option) => ({
        _id: option._id,
        label: option.label,
        voteCount: option.voteCount,
        percentage: poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 10000) / 100 : 0,
      })),
    },
  }));
});

exports.castVote = asyncHandler(async (req, res) => {
  const { optionId } = req.body;
  const poll = await Poll.findOne({ _id: req.params.pollId, status: "ACTIVE" });
  if (!poll || new Date(poll.endsAt) <= new Date()) {
    throw new ApiError(409, "POLL_NOT_ACTIVE", "Poll is not active");
  }
  const option = poll.options.id(optionId);
  if (!option) throw new ApiError(404, "POLL_OPTION_NOT_FOUND", "Poll option was not found");

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await VoteParticipation.create([{ poll: poll._id, member: req.user.id }], { session });
      await Vote.create([{ poll: poll._id, option: option._id }], { session });
      await Poll.updateOne(
        { _id: poll._id, "options._id": option._id },
        { $inc: { totalVotes: 1, "options.$.voteCount": 1 } },
        { session }
      );
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(409, "ALREADY_VOTED", "You have already voted in this poll");
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return res.status(201).json(new ApiResponse("Vote recorded successfully"));
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

function createReviewableHandlers(Model, publicName, fields) {
  return {
    create: asyncHandler(async (req, res) => {
      const payload = {};
      fields.forEach((field) => {
        if (req.body[field] !== undefined) payload[field] = req.body[field];
      });
      if (publicName === "achievement") payload.image = assetFromBody(req.body.image);
      if (publicName === "shradhanjali") payload.photo = assetFromBody(req.body.photo);
      const item = await Model.create({ ...payload, submittedBy: req.user.id });
      return res.status(201).json(new ApiResponse(`${publicName} submitted successfully`, { [publicName]: item }));
    }),
    list: asyncHandler(async (req, res) => {
      const adminView = req.query.admin === "true";
      if (adminView && !req.user?.id) {
        throw new ApiError(401, "AUTH_REQUIRED", "Admin review listings require authentication");
      }
      const filter = { status: adminView ? { $ne: "ARCHIVED" } : "PUBLISHED", ...textFilter(req.query.q) };
      const { items, meta } = await paged(Model, filter, req.query, { createdAt: -1 });
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
]);
const shradhanjaliHandlers = createReviewableHandlers(Shradhanjali, "shradhanjali", [
  "personName",
  "message",
  "dateOfBirth",
  "dateOfPassing",
  "family",
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

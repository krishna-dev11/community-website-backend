const crypto = require("node:crypto");
const DonationCampaign = require("../Models/donationCampaign");
const Donation = require("../Models/donation");
const MonthlyContribution = require("../Models/monthlyContribution");
const WebhookEvent = require("../Models/webhookEvent");
const User = require("../Models/user");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const { instance: razorpay } = require("../config/RazorpayInstance");

function pageOptions(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
}

function textFilter(q) {
  return q ? { $text: { $search: String(q).trim() } } : {};
}

async function paged(Model, filter, query, sort = { createdAt: -1 }, populate = null) {
  const { page, limit, skip } = pageOptions(query);
  let queryBuilder = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) queryBuilder = queryBuilder.populate(populate);
  const [items, total] = await Promise.all([queryBuilder, Model.countDocuments(filter)]);
  return {
    items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

function campaignPayload(body) {
  const payload = {};
  ["title", "description", "goalAmount", "startDate", "endDate", "status", "coverImage"].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
}

function ensureFutureDate(date, code, message) {
  if (date && new Date(date) <= new Date()) {
    throw new ApiError(400, code, message);
  }
}

function rupeesToPaise(amount) {
  return Math.round(Number(amount) * 100);
}

function receipt(prefix) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function verifyRazorpaySignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new ApiError(500, "RAZORPAY_WEBHOOK_SECRET_MISSING", "Webhook secret is not configured");
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature || "", "utf8");
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function createRazorpayOrder({ amount, currency = "INR", receiptId, notes }) {
  return razorpay.orders.create({
    amount: rupeesToPaise(amount),
    currency,
    receipt: receiptId,
    notes,
  });
}

async function markContributionPaid(contribution, amount, payment) {
  if (!["PENDING", "PARTIAL", "OVERDUE"].includes(contribution.status)) {
    throw new ApiError(409, "CONTRIBUTION_NOT_PAYABLE", "Contribution is not payable");
  }

  const payableAmount = contribution.expectedAmount - contribution.paidAmount;
  if (amount < 1) {
    throw new ApiError(400, "CONTRIBUTION_AMOUNT_REQUIRED", "Contribution amount must be at least 1");
  }
  if (amount > payableAmount) {
    throw new ApiError(400, "CONTRIBUTION_OVERPAYMENT", `Payment cannot exceed the remaining amount of ${payableAmount}`);
  }

  contribution.paidAmount += Number(amount);
  contribution.paymentHistory.push(payment);
  if (contribution.paidAmount <= 0) contribution.status = "PENDING";
  else if (contribution.paidAmount < contribution.expectedAmount) contribution.status = "PARTIAL";
  else contribution.status = "PAID";
  await contribution.save();
  return contribution;
}

exports.listDonationCampaigns = asyncHandler(async (req, res) => {
  const filter = {
    status: "ACTIVE",
    ...textFilter(req.query.q),
    $or: [
      { endDate: { $exists: false } },
      { endDate: null },
      { endDate: { $gt: new Date() } },
    ],
  };
  const { items, meta } = await paged(DonationCampaign, filter, req.query, { createdAt: -1 });
  return res.status(200).json(new ApiResponse("Donation campaigns fetched successfully", { campaigns: items }, meta));
});

exports.listDonationCampaignsAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(DonationCampaign, filter, req.query, { createdAt: -1 }, {
    path: "createdBy",
    select: "firstName lastName email",
  });
  return res.status(200).json(new ApiResponse("Admin donation campaigns fetched successfully", { campaigns: items }, meta));
});

const { uploadImageToCloudinary, assetMetadata } = require("../Utilities/uploadImageToCloudinary");

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

exports.createDonationCampaign = asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.description) {
    throw new ApiError(400, "CAMPAIGN_FIELDS_REQUIRED", "Title and description are required");
  }
  ensureFutureDate(req.body.endDate, "INVALID_CAMPAIGN_END_DATE", "Campaign end date must be in the future");

  const payload = campaignPayload(req.body);

  const coverFile = req.files?.coverImage || req.files?.image;
  if (coverFile) {
    const uploadResult = await uploadImageToCloudinary(coverFile, "samaj/donations", 1000, 1000);
    payload.coverImage = assetMetadata(uploadResult, coverFile.name);
  } else if (req.body.coverImage) {
    payload.coverImage = assetFromBody(req.body.coverImage);
  }

  const campaign = await DonationCampaign.create({
    ...payload,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "donation.campaign.created",
    targetType: "donationCampaign",
    target: campaign._id,
    newValue: { title: campaign.title, status: campaign.status },
    req,
  });

  return res.status(201).json(new ApiResponse("Donation campaign created successfully", { campaign }));
});

exports.updateDonationCampaign = asyncHandler(async (req, res) => {
  ensureFutureDate(req.body.endDate, "INVALID_CAMPAIGN_END_DATE", "Campaign end date must be in the future");
  const campaign = await DonationCampaign.findById(req.params.campaignId);
  if (!campaign || campaign.status === "ARCHIVED") {
    throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Donation campaign was not found");
  }

  Object.assign(campaign, campaignPayload(req.body), { updatedBy: req.user.id });
  await campaign.save();

  await logAudit({
    actor: req.user.id,
    action: "donation.campaign.updated",
    targetType: "donationCampaign",
    target: campaign._id,
    newValue: { title: campaign.title, status: campaign.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Donation campaign updated successfully", { campaign }));
});

exports.archiveDonationCampaign = asyncHandler(async (req, res) => {
  const campaign = await DonationCampaign.findByIdAndUpdate(
    req.params.campaignId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_FOUND", "Donation campaign was not found");

  await logAudit({
    actor: req.user.id,
    action: "donation.campaign.archived",
    targetType: "donationCampaign",
    target: campaign._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Donation campaign archived successfully", { campaign }));
});

exports.createDonationOrder = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount < 1) {
    throw new ApiError(400, "DONATION_AMOUNT_REQUIRED", "Donation amount must be at least 1");
  }

  let campaign = null;
  if (req.body.campaign) {
    campaign = await DonationCampaign.findOne({
      _id: req.body.campaign,
      status: "ACTIVE",
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gt: new Date() } },
      ],
    });
    if (!campaign) throw new ApiError(404, "CAMPAIGN_NOT_ACTIVE", "Campaign is not accepting donations");
  }

  const receiptId = receipt("DON");
  const order = await createRazorpayOrder({
    amount,
    receiptId,
    notes: {
      type: "donation",
      campaign: campaign?._id ? String(campaign._id) : "",
      donor: req.user?.id || "",
    },
  });

  const donation = await Donation.create({
    campaign: campaign?._id,
    donor: req.user?.id,
    donorName: req.body.donorName,
    donorEmail: req.body.donorEmail,
    donorPhone: req.body.donorPhone,
    amount,
    currency: order.currency || "INR",
    anonymous: Boolean(req.body.anonymous),
    note: req.body.note,
    razorpayOrderId: order.id,
  });

  return res.status(201).json(new ApiResponse("Donation order created successfully", {
    order,
    donation,
    key: process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
  }));
});

exports.listDonations = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.campaign) filter.campaign = req.query.campaign;
  if (req.query.mine === "true") filter.donor = req.user.id;
  const { items, meta } = await paged(Donation, filter, req.query, { createdAt: -1 }, [
    { path: "campaign", select: "title status" },
    { path: "donor", select: "firstName lastName email" },
  ]);
  return res.status(200).json(new ApiResponse("Donations fetched successfully", { donations: items }, meta));
});

exports.createContributionOrder = asyncHandler(async (req, res) => {
  const contribution = await MonthlyContribution.findOne({
    _id: req.params.contributionId,
    member: req.user.id,
    status: { $in: ["PENDING", "PARTIAL", "OVERDUE"] },
  });
  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_PAYABLE", "Contribution is not payable");

  const remainingAmount = contribution.expectedAmount - contribution.paidAmount;
  const amount = Number(req.body.amount || remainingAmount);
  if (!amount || amount < 1) {
    throw new ApiError(400, "CONTRIBUTION_AMOUNT_REQUIRED", "Contribution amount must be at least 1");
  }
  if (amount > remainingAmount) {
    throw new ApiError(400, "CONTRIBUTION_OVERPAYMENT", `Payment cannot exceed the remaining amount of ${remainingAmount}`);
  }

  const receiptId = receipt("CON");
  const order = await createRazorpayOrder({
    amount,
    receiptId,
    notes: {
      type: "contribution",
      contribution: String(contribution._id),
      member: String(req.user.id),
    },
  });

  contribution.paymentHistory.push({
    amount,
    mode: "ONLINE",
    razorpayOrderId: order.id,
    note: "Razorpay order created",
  });
  await contribution.save();

  return res.status(201).json(new ApiResponse("Contribution order created successfully", {
    order,
    contribution,
    key: process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
  }));
});

exports.razorpayWebhook = asyncHandler(async (req, res) => {
  const signature = req.header("x-razorpay-signature");
  const rawBody = req.rawBody || JSON.stringify(req.body);
  if (!verifyRazorpaySignature(rawBody, signature)) {
    throw new ApiError(400, "RAZORPAY_SIGNATURE_INVALID", "Webhook signature is invalid");
  }

  const payload = req.body;
  const eventId = payload.id || `${payload.event}-${payload.created_at}-${crypto.createHash("sha1").update(rawBody).digest("hex")}`;

  try {
    await WebhookEvent.create({
      eventId,
      eventType: payload.event,
      payload,
      processedAt: new Date(),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ success: true, message: "Webhook already processed" });
    }
    throw error;
  }

  const payment = payload.payload?.payment?.entity;
  if (!payment) {
    await WebhookEvent.findOneAndUpdate({ eventId }, { status: "IGNORED" });
    return res.status(200).json({ success: true, message: "Webhook ignored" });
  }

  if (payload.event === "payment.captured" || payload.event === "order.paid") {
    const orderId = payment.order_id;
    const notes = payment.notes || {};

    const donation = await Donation.findOne({ razorpayOrderId: orderId, status: "PENDING" });
    if (donation) {
      donation.status = "SUCCESS";
      donation.razorpayPaymentId = payment.id;
      donation.razorpaySignature = signature;
      donation.receiptNumber = donation.receiptNumber || receipt("DR");
      donation.paidAt = new Date((payment.created_at || Date.now() / 1000) * 1000);
      await donation.save();

      if (donation.campaign) {
        await DonationCampaign.findByIdAndUpdate(donation.campaign, { $inc: { raisedAmount: donation.amount } });
      }
      if (donation.donor) {
        await notifyUser({
          recipient: donation.donor,
          title: "Donation received",
          message: `Thank you. Your donation receipt number is ${donation.receiptNumber}.`,
          metadata: { donation: donation._id, receiptNumber: donation.receiptNumber },
        });
      }
    }

    const contributionId = notes.contribution;
    if (contributionId) {
      const contribution = await MonthlyContribution.findById(contributionId);
      if (
        contribution &&
        ["PENDING", "PARTIAL", "OVERDUE"].includes(contribution.status) &&
        !contribution.paymentHistory.some((entry) => entry.razorpayPaymentId === payment.id)
      ) {
        await markContributionPaid(contribution, Number(payment.amount) / 100, {
          amount: Number(payment.amount) / 100,
          mode: "ONLINE",
          razorpayOrderId: orderId,
          razorpayPaymentId: payment.id,
          paidAt: new Date((payment.created_at || Date.now() / 1000) * 1000),
          note: "Razorpay payment captured",
        });
        await notifyUser({
          recipient: contribution.member,
          title: "Contribution payment received",
          message: `Your contribution payment of Rs. ${Number(payment.amount) / 100} was received.`,
          metadata: { contribution: contribution._id, paymentId: payment.id },
        });
      }
    }
  }

  if (payload.event === "payment.failed") {
    const donation = await Donation.findOneAndUpdate(
      { razorpayOrderId: payment.order_id, status: "PENDING" },
      {
        status: "FAILED",
        razorpayPaymentId: payment.id,
        failedAt: new Date(),
      },
      { new: true }
    );
    if (donation?.donor) {
      await notifyUser({
        recipient: donation.donor,
        title: "Donation payment failed",
        message: "Your donation payment failed. You can try again from the donation page.",
        metadata: { donation: donation._id },
      });
    }
  }

  return res.status(200).json({ success: true });
});

exports.generateMonthlyContributions = asyncHandler(async (req, res) => {
  const month = Number(req.body.month);
  const year = Number(req.body.year);
  const expectedAmount = Number(req.body.expectedAmount);
  const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  if (!month || !year || !expectedAmount || !dueDate) {
    throw new ApiError(400, "CONTRIBUTION_GENERATION_FIELDS_REQUIRED", "Month, year, expectedAmount, and dueDate are required");
  }

  const members = await User.find({ active: true, accountStatus: "ACTIVE", roles: "MEMBER" }).select("_id family");
  const results = await Promise.allSettled(members.map((member) => MonthlyContribution.create({
    member: member._id,
    family: member.family,
    month,
    year,
    expectedAmount,
    dueDate,
    generatedBy: req.user.id,
  })));

  const created = results.filter((result) => result.status === "fulfilled").length;
  const skipped = results.length - created;
  await logAudit({
    actor: req.user.id,
    action: "contribution.generated",
    targetType: "monthlyContribution",
    newValue: { month, year, expectedAmount, created, skipped },
    req,
  });

  return res.status(201).json(new ApiResponse("Monthly contributions generated", { created, skipped, totalMembers: members.length }));
});

exports.listContributions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.mine === "true") filter.member = req.user.id;
  if (req.query.member) filter.member = req.query.member;
  if (req.query.family) filter.family = req.query.family;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  const { items, meta } = await paged(MonthlyContribution, filter, req.query, { dueDate: -1 }, [
    { path: "member", select: "firstName lastName email" },
    { path: "family", select: "familyName familyCode" },
  ]);
  return res.status(200).json(new ApiResponse("Contributions fetched successfully", { contributions: items }, meta));
});

exports.recordOfflineContributionPayment = asyncHandler(async (req, res) => {
  const contribution = await MonthlyContribution.findById(req.params.contributionId);
  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution was not found");
  if (!["PENDING", "PARTIAL", "OVERDUE"].includes(contribution.status)) {
    throw new ApiError(409, "CONTRIBUTION_NOT_PAYABLE", "Contribution is not payable");
  }

  const amount = Number(req.body.amount);
  if (!amount || amount < 1) {
    throw new ApiError(400, "CONTRIBUTION_AMOUNT_REQUIRED", "Contribution amount must be at least 1");
  }

  await markContributionPaid(contribution, amount, {
    amount,
    mode: req.body.mode || "CASH",
    collectedBy: req.user.id,
    paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
    note: req.body.note,
  });

  await logAudit({
    actor: req.user.id,
    action: "contribution.payment.recorded",
    targetType: "monthlyContribution",
    target: contribution._id,
    newValue: { amount, status: contribution.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Contribution payment recorded", { contribution }));
});

exports.waiveContribution = asyncHandler(async (req, res) => {
  const contribution = await MonthlyContribution.findByIdAndUpdate(
    req.params.contributionId,
    {
      status: "WAIVED",
      waiverReason: req.body.reason,
      $push: {
        paymentHistory: {
          amount: 0,
          mode: "WAIVER",
          collectedBy: req.user.id,
          note: req.body.reason,
        },
      },
    },
    { new: true }
  );
  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution was not found");

  await logAudit({
    actor: req.user.id,
    action: "contribution.waived",
    targetType: "monthlyContribution",
    target: contribution._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Contribution waived", { contribution }));
});

exports.markOverdueContributions = asyncHandler(async (req, res) => {
  const result = await MonthlyContribution.updateMany(
    {
      status: { $in: ["PENDING", "PARTIAL"] },
      dueDate: { $lt: new Date() },
    },
    { status: "OVERDUE" }
  );

  return res.status(200).json(new ApiResponse("Overdue contributions marked", { modifiedCount: result.modifiedCount }));
});

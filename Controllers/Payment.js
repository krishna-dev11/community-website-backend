const crypto = require("node:crypto");
const mongoose = require("mongoose");
const DonationCampaign = require("../Models/donationCampaign");
const Donation = require("../Models/donation");
const MonthlyContribution = require("../Models/monthlyContribution");
const MonthlyContributionCycle = require("../Models/monthlyContributionCycle");
const WebhookEvent = require("../Models/webhookEvent");
const DharamshalaPayment = require("../Models/dharamshalaPayment");
const User = require("../Models/user");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const { instance: razorpay } = require("../config/RazorpayInstance");
const { confirmDharamshalaWebhookPayment } = require("../Utilities/dharamshalaPaymentService");

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

  const totalPayable = (contribution.expectedAmount || 0) + (contribution.lateFee || 0);
  contribution.totalPayable = totalPayable;
  const payableAmount = Math.max(0, totalPayable - (contribution.paidAmount || 0));
  if (amount < 1) {
    throw new ApiError(400, "CONTRIBUTION_AMOUNT_REQUIRED", "Contribution amount must be at least 1");
  }
  if (amount > payableAmount) {
    throw new ApiError(400, "CONTRIBUTION_OVERPAYMENT", `Payment cannot exceed the remaining amount of ${payableAmount}`);
  }

  contribution.paidAmount += Number(amount);
  contribution.receiptNumber = contribution.receiptNumber || payment.receiptNumber || receipt("MC");
  contribution.receiptDate = payment.paidAt || new Date();
  contribution.paidAt = payment.paidAt || new Date();
  contribution.paymentMethod = payment.mode || "ONLINE";
  contribution.source = payment.source || (payment.mode === "CASH" ? "ADMIN_MANUAL" : "ONLINE_GATEWAY");

  contribution.paymentHistory.push({
    ...payment,
    receiptNumber: contribution.receiptNumber,
    status: "SUCCESS",
  });

  if (contribution.paidAmount <= 0) contribution.status = "PENDING";
  else if (contribution.paidAmount < totalPayable) contribution.status = "PARTIAL";
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

exports.listPublicSupporters = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pageOptions(req.query);
  const filter = { status: "SUCCESS" };
  if (req.query.campaign) filter.campaign = req.query.campaign;

  const [donations, total, activeCampaign] = await Promise.all([
    Donation.find(filter)
      .populate("campaign", "title status raisedAmount goalAmount")
      .populate("donor", "firstName lastName imageUrl")
      .sort({ paidAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Donation.countDocuments(filter),
    DonationCampaign.findOne({
      status: "ACTIVE",
      $or: [
        { endDate: { $exists: false } },
        { endDate: null },
        { endDate: { $gt: new Date() } },
      ],
    }).sort({ createdAt: -1 }),
  ]);

  const supporters = donations.map((donation) => {
    const publicName = donation.anonymous
      ? "Anonymous Supporter"
      : donation.donorName || [donation.donor?.firstName, donation.donor?.lastName].filter(Boolean).join(" ") || "Community Supporter";

    return {
      _id: donation._id,
      donorName: publicName,
      donorPhoto: donation.anonymous ? null : donation.donor?.imageUrl || null,
      amount: donation.anonymous ? null : donation.amount,
      campaignTitle: donation.campaign?.title || "General Donation",
      note: donation.anonymous ? "" : donation.note,
      donatedAt: donation.paidAt || donation.createdAt,
      anonymous: donation.anonymous,
    };
  });

  return res.status(200).json(new ApiResponse("Public supporters fetched successfully", {
    supporters,
    campaign: activeCampaign,
  }, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  }));
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

exports.verifyDonationPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id) {
    throw new ApiError(400, "PAYMENT_DETAILS_REQUIRED", "Order ID and Payment ID are required");
  }

  const secret = process.env.RAZORPAY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (secret && razorpay_signature) {
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new ApiError(400, "INVALID_SIGNATURE", "Payment verification signature mismatch");
    }
  }

  const donation = await Donation.findOne({ razorpayOrderId: razorpay_order_id });
  if (!donation) {
    throw new ApiError(404, "DONATION_NOT_FOUND", "Donation record not found for this order");
  }

  let updatedCampaign = null;

  if (donation.status !== "SUCCESS") {
    donation.status = "SUCCESS";
    donation.razorpayPaymentId = razorpay_payment_id;
    donation.razorpaySignature = razorpay_signature || "";
    donation.receiptNumber = donation.receiptNumber || receipt("DR");
    donation.paidAt = new Date();
    await donation.save();

    if (donation.campaign) {
      updatedCampaign = await DonationCampaign.findByIdAndUpdate(
        donation.campaign,
        { $inc: { raisedAmount: donation.amount } },
        { new: true }
      );
    }

    if (donation.donor) {
      await notifyUser({
        recipient: donation.donor,
        title: "Donation Successful",
        message: `Thank you for your generous contribution of Rs. ${donation.amount}. Your receipt number is ${donation.receiptNumber}.`,
        metadata: { donation: donation._id, receiptNumber: donation.receiptNumber },
      });
    }
  } else if (donation.campaign) {
    updatedCampaign = await DonationCampaign.findById(donation.campaign);
  }

  return res.status(200).json(
    new ApiResponse("Donation payment verified successfully", {
      donation,
      campaign: updatedCampaign,
    })
  );
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
  });

  if (!contribution) {
    throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution was not found");
  }

  // Duplicate payment prevention
  if (contribution.status === "PAID") {
    throw new ApiError(409, "ALREADY_PAID", "This monthly contribution has already been paid.");
  }

  if (!["PENDING", "PARTIAL", "OVERDUE"].includes(contribution.status)) {
    throw new ApiError(409, "CONTRIBUTION_NOT_PAYABLE", "Contribution is not payable in its current state.");
  }

  const totalPayable = (contribution.expectedAmount || 0) + (contribution.lateFee || 0);
  contribution.totalPayable = totalPayable;
  const remainingAmount = Math.max(0, totalPayable - (contribution.paidAmount || 0));

  const amount = Number(req.body.amount || remainingAmount);
  if (!amount || amount < 1) {
    throw new ApiError(400, "CONTRIBUTION_AMOUNT_REQUIRED", "Contribution amount must be at least ₹1");
  }
  if (amount > remainingAmount) {
    throw new ApiError(400, "CONTRIBUTION_OVERPAYMENT", `Payment cannot exceed the remaining amount of ₹${remainingAmount}`);
  }

  const receiptId = receipt("CON");
  const order = await createRazorpayOrder({
    amount,
    receiptId,
    notes: {
      type: "contribution",
      contribution: String(contribution._id),
      member: String(req.user.id),
      month: String(contribution.month),
      year: String(contribution.year),
    },
  });

  contribution.razorpayOrderId = order.id;
  await contribution.save();

  return res.status(201).json(new ApiResponse("Contribution order created successfully", {
    order,
    contribution,
    key: process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
  }));
});

exports.verifyContributionPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const contributionId = req.params.contributionId;

  if (!razorpay_order_id || !razorpay_payment_id) {
    throw new ApiError(400, "PAYMENT_DETAILS_REQUIRED", "Order ID and Payment ID are required");
  }

  const secret = process.env.RAZORPAY_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (secret && razorpay_signature) {
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new ApiError(400, "INVALID_SIGNATURE", "Payment verification signature mismatch");
    }
  }

  const contribution = await MonthlyContribution.findOne({
    _id: contributionId,
    member: req.user.id,
  });

  if (!contribution) {
    throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution record not found for this user");
  }

  // Idempotency: if already verified for this exact razorpayPaymentId, return success immediately
  if (
    contribution.status === "PAID" &&
    (contribution.razorpayPaymentId === razorpay_payment_id ||
      contribution.paymentHistory.some((p) => p.razorpayPaymentId === razorpay_payment_id))
  ) {
    return res.status(200).json(new ApiResponse("Contribution payment verified successfully", {
      contribution,
      receiptNumber: contribution.receiptNumber,
    }));
  }

  if (contribution.status === "PAID") {
    throw new ApiError(409, "ALREADY_PAID", "This monthly contribution has already been paid.");
  }

  const totalPayable = (contribution.expectedAmount || 0) + (contribution.lateFee || 0);
  contribution.totalPayable = totalPayable;
  const remaining = Math.max(0, totalPayable - (contribution.paidAmount || 0));
  const paidAmount = Number(req.body.amount || remaining);

  const receiptNumber = contribution.receiptNumber || receipt("MC");
  const paidDate = new Date();

  contribution.paidAmount += paidAmount;
  contribution.status = contribution.paidAmount >= totalPayable ? "PAID" : "PARTIAL";
  contribution.paymentMethod = "ONLINE";
  contribution.razorpayOrderId = razorpay_order_id;
  contribution.razorpayPaymentId = razorpay_payment_id;
  contribution.razorpaySignature = razorpay_signature || "";
  contribution.receiptNumber = receiptNumber;
  contribution.receiptDate = paidDate;
  contribution.paidAt = paidDate;
  contribution.source = "ONLINE_GATEWAY";

  contribution.paymentHistory.push({
    amount: paidAmount,
    mode: "ONLINE",
    receiptNumber,
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    paidAt: paidDate,
    note: "Online Razorpay payment verified",
    status: "SUCCESS",
  });

  await contribution.save();

  await logAudit({
    actor: req.user.id,
    action: "contribution.payment.online_verified",
    targetType: "monthlyContribution",
    target: contribution._id,
    newValue: {
      amount: paidAmount,
      status: contribution.status,
      receiptNumber,
      razorpayPaymentId: razorpay_payment_id,
      month: contribution.month,
      year: contribution.year,
    },
    req,
  });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[contribution.month - 1] || `Month ${contribution.month}`;

  await notifyUser({
    recipient: contribution.member,
    title: "Contribution Payment Successful",
    message: `Your ${monthName} ${contribution.year} contribution of ₹${paidAmount} has been recorded successfully. Receipt #${receiptNumber}.`,
    link: "/dashboard/my-dues",
    metadata: {
      contribution: contribution._id,
      receiptNumber,
      amount: paidAmount,
    },
    email: true,
  });

  return res.status(200).json(new ApiResponse("Contribution payment verified successfully", {
    contribution,
    receiptNumber,
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

    if (notes.type === "dharamshala") {
      try {
        await confirmDharamshalaWebhookPayment({
          orderId,
          paymentId: payment.id,
          eventId,
          amount: payment.amount,
        });
        await WebhookEvent.findOneAndUpdate({ eventId }, { status: "PROCESSED", processedAt: new Date() });
      } catch (error) {
        await WebhookEvent.findOneAndUpdate({ eventId }, { status: "FAILED", error: error.message });
      }
      return res.status(200).json({ success: true });
    }

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
    const dharamshalaPayment = await DharamshalaPayment.findOneAndUpdate(
      { gatewayOrderId: payment.order_id, status: { $in: ["CREATED", "PENDING"] } },
      { status: "FAILED", gatewayPaymentId: payment.id, failedAt: new Date() },
      { new: true }
    );
    if (dharamshalaPayment) return res.status(200).json({ success: true });

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

// ─── MONTHLY CONTRIBUTIONS & CYCLES ──────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

exports.createContributionCycle = asyncHandler(async (req, res) => {
  const month = Number(req.body.month);
  const year = Number(req.body.year);
  const contributionAmount = Number(req.body.contributionAmount || req.body.expectedAmount || 60);
  const dueStartDate = req.body.dueStartDate ? new Date(req.body.dueStartDate) : new Date(year, month - 1, 1);
  const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : new Date(year, month - 1, 10, 23, 59, 59);
  const lateFeeAmount = req.body.lateFeeAmount !== undefined ? Number(req.body.lateFeeAmount) : 2;
  const lateFeeRule = req.body.lateFeeRule || "PER_MONTH";
  const description = req.body.description || `Monthly contribution cycle for ${month}/${year}`;
  const status = req.body.status || "OPEN";

  if (!month || !year || month < 1 || month > 12) {
    throw new ApiError(400, "INVALID_MONTH_YEAR", "Valid month (1-12) and year are required");
  }
  if (!contributionAmount || contributionAmount < 1) {
    throw new ApiError(400, "INVALID_AMOUNT", "Contribution amount must be at least ₹1");
  }

  const monthName = MONTH_NAMES[month - 1];

  // Prevent duplicate cycle for Month + Year (Backend validation)
  const existingCycle = await MonthlyContributionCycle.findOne({ month, year });
  if (existingCycle) {
    throw new ApiError(409, "CYCLE_ALREADY_EXISTS", `${monthName} ${year} contribution cycle already exists.`);
  }

  // Eligible members: active, ACTIVE accountStatus, role MEMBER, non-deleted, non-suspended
  const eligibleMembers = await User.find({
    active: true,
    accountStatus: "ACTIVE",
    roles: "MEMBER",
  }).select("_id family firstName lastName email");

  const cycle = await MonthlyContributionCycle.create({
    month,
    year,
    title: `${monthName} ${year}`,
    contributionAmount,
    dueStartDate,
    dueDate,
    lateFeeAmount,
    lateFeeRule,
    description,
    status,
    eligibleMembersCount: eligibleMembers.length,
    createdBy: req.user.id,
  });

  // Create individual monthly dues for all eligible active members
  const dueDocs = eligibleMembers.map((member) => ({
    member: member._id,
    family: member.family,
    cycle: cycle._id,
    month,
    year,
    expectedAmount: contributionAmount,
    lateFee: 0,
    totalPayable: contributionAmount,
    paidAmount: 0,
    dueStartDate,
    dueDate,
    status: "PENDING",
    paymentMethod: "NONE",
    source: "NONE",
    generatedBy: req.user.id,
  }));

  const results = await Promise.allSettled(
    dueDocs.map((doc) => MonthlyContribution.create(doc))
  );

  const createdCount = results.filter((r) => r.status === "fulfilled").length;
  const skippedCount = results.length - createdCount;

  await logAudit({
    actor: req.user.id,
    action: "contribution.cycle.created",
    targetType: "monthlyContributionCycle",
    target: cycle._id,
    newValue: {
      month,
      year,
      monthName,
      contributionAmount,
      createdDues: createdCount,
      skipped: skippedCount,
      totalEligible: eligibleMembers.length,
    },
    req,
  });

  const formattedDueDate = new Date(dueDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Notify members asynchronously
  Promise.allSettled(
    eligibleMembers.slice(0, 100).map((member) =>
      notifyUser({
        recipient: member._id,
        title: "Monthly Contribution Due",
        message: `${monthName} ${year} Monthly Contribution is now due. Amount: ₹${contributionAmount}, Due Date: ${formattedDueDate}.`,
        link: "/dashboard/my-dues",
        metadata: { cycleId: cycle._id, month, year, amount: contributionAmount },
        email: false,
      })
    )
  ).catch((err) => console.error("Error sending cycle notifications:", err));

  return res.status(201).json(
    new ApiResponse(`${monthName} ${year} contribution cycle created successfully`, {
      cycle,
      createdCount,
      skippedCount,
      totalEligibleMembers: eligibleMembers.length,
    })
  );
});

// Backward compatible alias
exports.generateMonthlyContributions = exports.createContributionCycle;

exports.listContributionCycles = asyncHandler(async (req, res) => {
  const cycles = await MonthlyContributionCycle.find()
    .sort({ year: -1, month: -1 })
    .populate("createdBy", "firstName lastName");

  const enrichedCycles = await Promise.all(
    cycles.map(async (cycle) => {
      const stats = await MonthlyContribution.aggregate([
        { $match: { month: cycle.month, year: cycle.year } },
        {
          $group: {
            _id: null,
            totalMembers: { $sum: 1 },
            totalExpected: { $sum: "$totalPayable" },
            totalCollected: { $sum: "$paidAmount" },
            paidCount: {
              $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] },
            },
            pendingCount: {
              $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] },
            },
            overdueCount: {
              $sum: { $cond: [{ $eq: ["$status", "OVERDUE"] }, 1, 0] },
            },
            partialCount: {
              $sum: { $cond: [{ $eq: ["$status", "PARTIAL"] }, 1, 0] },
            },
            cashCollected: {
              $sum: {
                $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$paidAmount", 0],
              },
            },
            onlineCollected: {
              $sum: {
                $cond: [{ $eq: ["$paymentMethod", "ONLINE"] }, "$paidAmount", 0],
              },
            },
            otherCollected: {
              $sum: {
                $cond: [
                  { $not: { $in: ["$paymentMethod", ["CASH", "ONLINE", "NONE"]] } },
                  "$paidAmount",
                  0,
                ],
              },
            },
            lateFees: { $sum: "$lateFee" },
          },
        },
      ]);

      const stat = stats[0] || {
        totalMembers: 0,
        totalExpected: 0,
        totalCollected: 0,
        paidCount: 0,
        pendingCount: 0,
        overdueCount: 0,
        partialCount: 0,
        cashCollected: 0,
        onlineCollected: 0,
        otherCollected: 0,
        lateFees: 0,
      };

      const outstanding = Math.max(0, (stat.totalExpected || 0) - (stat.totalCollected || 0));

      return {
        ...cycle.toObject(),
        stats: {
          ...stat,
          totalOutstanding: outstanding,
        },
      };
    })
  );

  return res.status(200).json(
    new ApiResponse("Contribution cycles fetched successfully", {
      cycles: enrichedCycles,
    })
  );
});

exports.updateContributionCycleStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["OPEN", "CLOSED"].includes(status)) {
    throw new ApiError(400, "INVALID_STATUS", "Status must be OPEN or CLOSED");
  }

  const cycle = await MonthlyContributionCycle.findById(req.params.cycleId);
  if (!cycle) throw new ApiError(404, "CYCLE_NOT_FOUND", "Cycle was not found");

  const prevStatus = cycle.status;
  cycle.status = status;
  if (status === "CLOSED") {
    cycle.closedAt = new Date();
    cycle.closedBy = req.user.id;
  }
  await cycle.save();

  await logAudit({
    actor: req.user.id,
    action: "contribution.cycle.status_updated",
    targetType: "monthlyContributionCycle",
    target: cycle._id,
    oldValue: { status: prevStatus },
    newValue: { status },
    req,
  });

  return res.status(200).json(
    new ApiResponse(`Cycle status updated to ${status}`, { cycle })
  );
});

exports.getContributionsDashboardSummary = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  // Auto-sweep overdue status before returning summary
  const now = new Date();
  await MonthlyContribution.updateMany(
    { status: { $in: ["PENDING", "PARTIAL"] }, dueDate: { $lt: now } },
    { status: "OVERDUE", $set: { lateFee: 2 } }
  );

  const [eligibleCount, stats] = await Promise.all([
    User.countDocuments({ active: true, accountStatus: "ACTIVE", roles: "MEMBER" }),
    MonthlyContribution.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalExpected: { $sum: "$totalPayable" },
          totalCollected: { $sum: "$paidAmount" },
          paidMembers: { $sum: { $cond: [{ $eq: ["$status", "PAID"] }, 1, 0] } },
          pendingMembers: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
          overdueMembers: { $sum: { $cond: [{ $eq: ["$status", "OVERDUE"] }, 1, 0] } },
          partialMembers: { $sum: { $cond: [{ $eq: ["$status", "PARTIAL"] }, 1, 0] } },
          cashCollected: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$paidAmount", 0] },
          },
          onlineCollected: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "ONLINE"] }, "$paidAmount", 0] },
          },
          otherCollected: {
            $sum: {
              $cond: [
                { $not: { $in: ["$paymentMethod", ["CASH", "ONLINE", "NONE"]] } },
                "$paidAmount",
                0,
              ],
            },
          },
          totalLateFees: { $sum: "$lateFee" },
        },
      },
    ]),
  ]);

  const summary = stats[0] || {
    totalRecords: 0,
    totalExpected: 0,
    totalCollected: 0,
    paidMembers: 0,
    pendingMembers: 0,
    overdueMembers: 0,
    partialMembers: 0,
    cashCollected: 0,
    onlineCollected: 0,
    otherCollected: 0,
    totalLateFees: 0,
  };

  const totalOutstanding = Math.max(0, (summary.totalExpected || 0) - (summary.totalCollected || 0));

  return res.status(200).json(
    new ApiResponse("Contributions dashboard summary fetched", {
      summary: {
        totalMembers: eligibleCount,
        eligibleMembers: eligibleCount,
        totalExpected: summary.totalExpected,
        totalCollected: summary.totalCollected,
        totalOutstanding,
        paidMembers: summary.paidMembers,
        pendingMembers: summary.pendingMembers,
        overdueMembers: summary.overdueMembers,
        partialMembers: summary.partialMembers,
        cashCollected: summary.cashCollected,
        onlineCollected: summary.onlineCollected,
        otherCollected: summary.otherCollected,
        totalLateFees: summary.totalLateFees,
      },
    })
  );
});

exports.listContributions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.mine === "true") filter.member = req.user.id;
  if (req.query.member) filter.member = req.query.member;
  if (req.query.family) filter.family = req.query.family;
  if (req.query.status && req.query.status !== "ALL") filter.status = req.query.status;
  if (req.query.paymentMethod && req.query.paymentMethod !== "ALL") filter.paymentMethod = req.query.paymentMethod;
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);

  // Search by member name, email or SMJ ID
  if (req.query.search) {
    const s = String(req.query.search).trim();
    const query = {
      $or: [
        { firstName: { $regex: s, $options: "i" } },
        { lastName: { $regex: s, $options: "i" } },
        { email: { $regex: s, $options: "i" } },
      ],
    };
    if (mongoose.Types.ObjectId.isValid(s)) {
      query.$or.push({ _id: new mongoose.Types.ObjectId(s) });
    }
    const matchingUsers = await User.find(query).select("_id");
    const userIds = matchingUsers.map((u) => u._id);
    filter.member = { $in: userIds };
  }

  // Auto mark overdue for records being fetched
  const now = new Date();
  await MonthlyContribution.updateMany(
    { status: { $in: ["PENDING", "PARTIAL"] }, dueDate: { $lt: now } },
    { status: "OVERDUE", $set: { lateFee: 2 } }
  );

  const { items, meta } = await paged(MonthlyContribution, filter, req.query, { year: -1, month: -1, dueDate: -1 }, [
    {
      path: "member",
      select: "firstName lastName email additionalDetails accountStatus",
      populate: { path: "additionalDetails", select: "contactNumber currentCity gotra" },
    },
    { path: "family", select: "familyName familyCode" },
    { path: "recordedBy", select: "firstName lastName" },
  ]);

  return res.status(200).json(new ApiResponse("Contributions fetched successfully", { contributions: items }, meta));
});

exports.getMyContributionsSummary = asyncHandler(async (req, res) => {
  const memberId = new mongoose.Types.ObjectId(req.user.id);

  // Auto mark overdue for member's dues
  const now = new Date();
  await MonthlyContribution.updateMany(
    { member: memberId, status: { $in: ["PENDING", "PARTIAL"] }, dueDate: { $lt: now } },
    { status: "OVERDUE", $set: { lateFee: 2 } }
  );

  const dues = await MonthlyContribution.find({ member: memberId }).sort({ year: -1, month: -1 });

  const totalDue = dues.reduce((acc, d) => acc + (d.totalPayable || d.expectedAmount || 0), 0);
  const totalPaid = dues.reduce((acc, d) => acc + (d.paidAmount || 0), 0);
  const totalOutstanding = Math.max(0, totalDue - totalPaid);

  const monthsPaid = dues.filter((d) => d.status === "PAID").length;
  const monthsPending = dues.filter((d) => ["PENDING", "PARTIAL", "OVERDUE"].includes(d.status)).length;

  const currentPendingDue = dues.find((d) => ["PENDING", "PARTIAL", "OVERDUE"].includes(d.status));
  const latestPaid = dues.find((d) => d.status === "PAID");

  return res.status(200).json(
    new ApiResponse("My contribution summary fetched", {
      summary: {
        totalDue,
        totalPaid,
        totalOutstanding,
        monthsPaid,
        monthsPending,
        currentDue: currentPendingDue
          ? {
              id: currentPendingDue._id,
              month: currentPendingDue.month,
              year: currentPendingDue.year,
              monthName: MONTH_NAMES[currentPendingDue.month - 1] || `Month ${currentPendingDue.month}`,
              expectedAmount: currentPendingDue.expectedAmount,
              lateFee: currentPendingDue.lateFee || 0,
              totalPayable: currentPendingDue.totalPayable || (currentPendingDue.expectedAmount + (currentPendingDue.lateFee || 0)),
              paidAmount: currentPendingDue.paidAmount || 0,
              remainingAmount: Math.max(
                0,
                (currentPendingDue.totalPayable || (currentPendingDue.expectedAmount + (currentPendingDue.lateFee || 0))) -
                  (currentPendingDue.paidAmount || 0)
              ),
              dueDate: currentPendingDue.dueDate,
              status: currentPendingDue.status,
            }
          : null,
        latestPaid: latestPaid
          ? {
              month: latestPaid.month,
              year: latestPaid.year,
              monthName: MONTH_NAMES[latestPaid.month - 1] || `Month ${latestPaid.month}`,
              amount: latestPaid.paidAmount,
              paidAt: latestPaid.paidAt,
              receiptNumber: latestPaid.receiptNumber,
              paymentMethod: latestPaid.paymentMethod,
            }
          : null,
      },
    })
  );
});

exports.recordManualContributionPayment = asyncHandler(async (req, res) => {
  const contributionId = req.params.contributionId;
  const contribution = await MonthlyContribution.findById(contributionId).populate("member", "firstName lastName email");
  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution was not found");

  if (contribution.status === "PAID") {
    throw new ApiError(409, "ALREADY_PAID", "This monthly contribution has already been paid.");
  }

  const totalPayable = (contribution.expectedAmount || 0) + (contribution.lateFee || 0);
  contribution.totalPayable = totalPayable;
  const remaining = Math.max(0, totalPayable - (contribution.paidAmount || 0));
  const amount = Number(req.body.amount || remaining);
  if (!amount || amount < 1) {
    throw new ApiError(400, "INVALID_AMOUNT", "Contribution amount must be at least ₹1");
  }

  const mode = req.body.paymentMethod || req.body.mode || "CASH";
  const paymentDate = req.body.paymentDate ? new Date(req.body.paymentDate) : new Date();
  const notes = req.body.notes || req.body.note || "";
  const paymentReference = req.body.paymentReference || "";

  const receiptNumber = req.body.receiptNumber && req.body.receiptNumber.trim()
    ? req.body.receiptNumber.trim()
    : `CASH-${contribution.year}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

  contribution.paidAmount += amount;
  contribution.status = contribution.paidAmount >= totalPayable ? "PAID" : "PARTIAL";
  contribution.paymentMethod = mode;
  contribution.paymentReference = paymentReference;
  contribution.receiptNumber = receiptNumber;
  contribution.receiptDate = paymentDate;
  contribution.paidAt = paymentDate;
  contribution.recordedBy = req.user.id;
  contribution.source = "ADMIN_MANUAL";
  contribution.notes = notes;

  contribution.paymentHistory.push({
    amount,
    mode,
    receiptNumber,
    paymentReference,
    collectedBy: req.user.id,
    paidAt: paymentDate,
    note: notes,
    status: "SUCCESS",
  });

  await contribution.save();

  await logAudit({
    actor: req.user.id,
    action: "contribution.payment.recorded",
    targetType: "monthlyContribution",
    target: contribution._id,
    newValue: {
      amount,
      mode,
      receiptNumber,
      paymentDate,
      status: contribution.status,
      member: contribution.member?._id,
      memberName: `${contribution.member?.firstName || ""} ${contribution.member?.lastName || ""}`.trim(),
      month: contribution.month,
      year: contribution.year,
    },
    reason: notes,
    req,
  });

  const monthName = MONTH_NAMES[contribution.month - 1] || `Month ${contribution.month}`;

  await notifyUser({
    recipient: contribution.member?._id,
    title: "Monthly Contribution Recorded",
    message: `Your ${monthName} ${contribution.year} ${mode.toLowerCase()} contribution of ₹${amount} has been recorded by the Samaj. Receipt #${receiptNumber}.`,
    link: "/dashboard/my-dues",
    metadata: { contribution: contribution._id, receiptNumber, amount, mode },
    email: true,
  });

  return res.status(200).json(
    new ApiResponse("Contribution payment recorded successfully", {
      contribution,
      receiptNumber,
    })
  );
});

// Backward compatible offline payment alias
exports.recordOfflineContributionPayment = exports.recordManualContributionPayment;

exports.reverseContributionPayment = asyncHandler(async (req, res) => {
  const contribution = await MonthlyContribution.findById(req.params.contributionId).populate("member", "firstName lastName email");
  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution was not found");

  if (!contribution.paidAmount || contribution.paidAmount <= 0) {
    throw new ApiError(400, "NO_PAYMENT_TO_REVERSE", "No recorded payment exists to reverse for this due.");
  }

  const reason = req.body.reason;
  if (!reason || !reason.trim()) {
    throw new ApiError(400, "REVERSAL_REASON_REQUIRED", "Reversal reason is mandatory for accounting audit trail.");
  }

  const prevStatus = contribution.status;
  const prevPaidAmount = contribution.paidAmount;

  // Mark latest successful payment in history as reversed
  let reversedPaymentAmount = prevPaidAmount;
  const lastPayment = [...contribution.paymentHistory].reverse().find((p) => p.status === "SUCCESS");
  if (lastPayment) {
    lastPayment.status = "REVERSED";
    lastPayment.reversalReason = reason;
    lastPayment.reversedBy = req.user.id;
    lastPayment.reversedAt = new Date();
    reversedPaymentAmount = lastPayment.amount;
  }

  contribution.paidAmount = Math.max(0, contribution.paidAmount - reversedPaymentAmount);
  const now = new Date();
  const isOverdue = contribution.dueDate && new Date(contribution.dueDate) < now;

  if (contribution.paidAmount <= 0) {
    contribution.status = isOverdue ? "OVERDUE" : "PENDING";
    contribution.paymentMethod = "NONE";
  } else if (contribution.paidAmount < contribution.totalPayable) {
    contribution.status = "PARTIAL";
  }

  contribution.isReversed = true;
  contribution.reversalReason = reason;
  contribution.reversedAt = new Date();
  contribution.reversedBy = req.user.id;

  await contribution.save();

  await logAudit({
    actor: req.user.id,
    action: "contribution.payment.reversed",
    targetType: "monthlyContribution",
    target: contribution._id,
    oldValue: { status: prevStatus, paidAmount: prevPaidAmount },
    newValue: { status: contribution.status, paidAmount: contribution.paidAmount },
    reason,
    metadata: {
      reversedPaymentAmount,
      member: contribution.member?._id,
      month: contribution.month,
      year: contribution.year,
    },
    req,
  });

  return res.status(200).json(
    new ApiResponse("Payment reversed successfully and recorded in audit log", { contribution })
  );
});

exports.getContributionReceipt = asyncHandler(async (req, res) => {
  const contribution = await MonthlyContribution.findById(req.params.contributionId)
    .populate("member", "firstName lastName email additionalDetails")
    .populate("recordedBy", "firstName lastName");

  if (!contribution) throw new ApiError(404, "CONTRIBUTION_NOT_FOUND", "Contribution not found");

  const isOwner = String(contribution.member?._id) === String(req.user.id);
  const isAdmin = ["SUPER_ADMIN", "Admin", "TREASURER"].some((role) => req.user.roles?.includes(role));

  if (!isOwner && !isAdmin) {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to view this receipt");
  }

  const monthName = MONTH_NAMES[contribution.month - 1] || `Month ${contribution.month}`;

  const receiptData = {
    samajName: "श्री हल्बा / हल्बी समाज",
    samajSubTitle: "Halba / Halbi Samaj Vikas Parishad",
    receiptNumber: contribution.receiptNumber || `MC-${contribution.year}-${contribution._id.toString().slice(-6).toUpperCase()}`,
    receiptDate: contribution.receiptDate || contribution.paidAt || contribution.updatedAt,
    member: {
      name: `${contribution.member?.firstName || ""} ${contribution.member?.lastName || ""}`.trim(),
      memberId: contribution.member?._id ? `SMJ-${String(contribution.member._id).slice(-6).toUpperCase()}` : "SMJ-MEMBER",
      email: contribution.member?.email,
      contact: contribution.member?.additionalDetails?.contactNumber || "N/A",
    },
    contributionPeriod: `${monthName} ${contribution.year}`,
    month: contribution.month,
    year: contribution.year,
    baseContribution: contribution.expectedAmount || 60,
    lateFee: contribution.lateFee || 0,
    totalPayable: contribution.totalPayable || (contribution.expectedAmount + (contribution.lateFee || 0)),
    totalPaid: contribution.paidAmount || 0,
    paymentMethod: contribution.paymentMethod || "Online",
    paymentDate: contribution.paidAt || contribution.updatedAt,
    transactionId: contribution.razorpayPaymentId || contribution.paymentReference || "N/A",
    razorpayOrderId: contribution.razorpayOrderId,
    recordedBy: contribution.recordedBy
      ? `${contribution.recordedBy.firstName || ""} ${contribution.recordedBy.lastName || ""}`.trim()
      : contribution.source === "ONLINE_GATEWAY"
      ? "Online Gateway"
      : "Samaj Administration",
    source: contribution.source,
    status: contribution.status,
    notes: contribution.notes,
  };

  return res.status(200).json(
    new ApiResponse("Receipt fetched successfully", { receipt: receiptData })
  );
});

exports.getMemberLedgerAdmin = asyncHandler(async (req, res) => {
  const memberId = req.params.memberId;
  const user = await User.findById(memberId)
    .select("firstName lastName email accountStatus additionalDetails family")
    .populate("family", "familyName");
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "Member not found");

  const contributions = await MonthlyContribution.find({ member: memberId })
    .sort({ year: -1, month: -1 })
    .populate("cycle", "title contributionAmount dueDate lateFeeAmount");

  const summary = {
    totalDue: contributions.reduce((acc, c) => acc + (c.totalPayable || c.expectedAmount || 0), 0),
    totalPaid: contributions.reduce((acc, c) => acc + (c.paidAmount || 0), 0),
    monthsPaid: contributions.filter((c) => c.status === "PAID").length,
    monthsPending: contributions.filter((c) => ["PENDING", "PARTIAL", "OVERDUE"].includes(c.status)).length,
  };
  summary.totalOutstanding = Math.max(0, summary.totalDue - summary.totalPaid);

  return res.status(200).json(
    new ApiResponse("Member ledger fetched successfully", {
      member: user,
      summary,
      contributions,
    })
  );
});

exports.exportContributions = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.month) filter.month = Number(req.query.month);
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.status && req.query.status !== "ALL") filter.status = req.query.status;
  if (req.query.paymentMethod && req.query.paymentMethod !== "ALL") filter.paymentMethod = req.query.paymentMethod;

  const contributions = await MonthlyContribution.find(filter)
    .sort({ year: -1, month: -1, "member.firstName": 1 })
    .populate("member", "firstName lastName email additionalDetails")
    .populate("recordedBy", "firstName lastName");

  const rows = [
    [
      "Member Name",
      "Member ID",
      "Email",
      "Month",
      "Year",
      "Due Amount",
      "Late Fee",
      "Total Payable",
      "Amount Paid",
      "Outstanding",
      "Payment Method",
      "Payment Date",
      "Receipt Number",
      "Status",
      "Recorded By",
    ].join(","),
  ];

  contributions.forEach((c) => {
    const memberName = `"${c.member?.firstName || ""} ${c.member?.lastName || ""}"`.trim();
    const memberId = c.member?._id ? `SMJ-${String(c.member._id).slice(-6).toUpperCase()}` : "";
    const email = `"${c.member?.email || ""}"`;
    const month = MONTH_NAMES[c.month - 1] || c.month;
    const year = c.year;
    const dueAmount = c.expectedAmount || 0;
    const lateFee = c.lateFee || 0;
    const totalPayable = c.totalPayable || (dueAmount + lateFee);
    const paidAmount = c.paidAmount || 0;
    const outstanding = Math.max(0, totalPayable - paidAmount);
    const method = c.paymentMethod || "NONE";
    const paymentDate = c.paidAt ? new Date(c.paidAt).toLocaleDateString("en-IN") : "";
    const receiptNo = c.receiptNumber || "";
    const status = c.status;
    const recordedBy = c.recordedBy ? `"${c.recordedBy.firstName || ""} ${c.recordedBy.lastName || ""}"`.trim() : "";

    rows.push([
      memberName,
      memberId,
      email,
      month,
      year,
      dueAmount,
      lateFee,
      totalPayable,
      paidAmount,
      outstanding,
      method,
      paymentDate,
      receiptNo,
      status,
      recordedBy,
    ].join(","));
  });

  const csv = rows.join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=samaj_contributions_${Date.now()}.csv`);
  return res.status(200).send(csv);
});

exports.sendContributionReminders = asyncHandler(async (req, res) => {
  const { month, year } = req.body;
  const filter = {
    status: { $in: ["PENDING", "PARTIAL", "OVERDUE"] },
  };
  if (month) filter.month = Number(month);
  if (year) filter.year = Number(year);

  const dues = await MonthlyContribution.find(filter).populate("member", "firstName lastName email");

  let sent = 0;
  for (const due of dues) {
    if (due.member?._id) {
      const monthName = MONTH_NAMES[due.month - 1] || `Month ${due.month}`;
      const payable = (due.totalPayable || due.expectedAmount) - (due.paidAmount || 0);
      const isOverdue = due.status === "OVERDUE";
      const message = isOverdue
        ? `Your ${monthName} ${due.year} Samaj contribution of ₹${payable} is overdue. Please settle your dues.`
        : `Reminder: Your ${monthName} ${due.year} Samaj contribution of ₹${payable} is due.`;

      await notifyUser({
        recipient: due.member._id,
        title: "Samaj Contribution Reminder",
        message,
        link: "/dashboard/my-dues",
        metadata: { contribution: due._id, month: due.month, year: due.year },
        email: false,
      });
      sent++;
    }
  }

  await logAudit({
    actor: req.user.id,
    action: "contribution.reminders_sent",
    targetType: "monthlyContribution",
    newValue: { month, year, sentCount: sent },
    req,
  });

  return res.status(200).json(
    new ApiResponse(`Sent contribution reminders to ${sent} members`, { sent })
  );
});

exports.listMyFinancialHistory = asyncHandler(async (req, res) => {
  const memberId = new mongoose.Types.ObjectId(req.user.id);
  const [donations, contributions, donationSummary, contributionSummary] = await Promise.all([
    Donation.find({ donor: memberId }).populate("campaign", "title").sort({ paidAt: -1, createdAt: -1 }).limit(100),
    MonthlyContribution.find({ member: memberId }).sort({ year: -1, month: -1 }).limit(100),
    Donation.aggregate([
      { $match: { donor: memberId, status: "SUCCESS" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 }, lastDate: { $max: "$paidAt" } } },
    ]),
    MonthlyContribution.aggregate([
      { $match: { member: memberId } },
      { $group: { _id: null, total: { $sum: "$paidAmount" }, count: { $sum: 1 }, lastDate: { $max: "$updatedAt" } } },
    ]),
  ]);
  const donationTotals = donationSummary[0] || { total: 0, count: 0, lastDate: null };
  const contributionTotals = contributionSummary[0] || { total: 0, count: 0, lastDate: null };
  const records = [
    ...donations.map((item) => ({
      _id: item._id,
      type: "Donation",
      purpose: item.campaign?.title || "General Donation",
      amount: item.amount,
      status: item.status,
      date: item.paidAt || item.createdAt,
      paymentMethod: item.razorpayPaymentId ? "Online" : "Not recorded",
      receiptNumber: item.receiptNumber,
      note: item.note,
    })),
    ...contributions.map((item) => ({
      _id: item._id,
      type: "Monthly Contribution",
      purpose: `Samaj Monthly Contribution - ${MONTH_NAMES[item.month - 1] || item.month} ${item.year}`,
      amount: item.paidAmount,
      status: item.status,
      date: item.paidAt || item.updatedAt || item.createdAt,
      paymentMethod: item.paymentMethod || item.paymentHistory?.at(-1)?.mode || "Not recorded",
      receiptNumber: item.receiptNumber || item.paymentHistory?.at(-1)?.receiptNumber || item.paymentHistory?.at(-1)?.razorpayPaymentId,
      note: item.notes || item.paymentHistory?.at(-1)?.note,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  return res.status(200).json(new ApiResponse("Financial history fetched successfully", {
    records,
    summary: {
      totalContributed: Number(donationTotals.total || 0) + Number(contributionTotals.total || 0),
      contributionCount: Number(donationTotals.count || 0) + Number(contributionTotals.count || 0),
      lastContribution: [donationTotals.lastDate, contributionTotals.lastDate].filter(Boolean).sort().at(-1) || null,
    },
  }));
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
    { status: "OVERDUE", $set: { lateFee: 2 } }
  );

  return res.status(200).json(new ApiResponse("Overdue contributions marked", { modifiedCount: result.modifiedCount }));
});

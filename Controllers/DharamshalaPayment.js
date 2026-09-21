const crypto = require("node:crypto");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DharamshalaPayment = require("../Models/dharamshalaPayment");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { instance: razorpay } = require("../config/RazorpayInstance");
const { confirmDharamshalaPayment } = require("../Utilities/dharamshalaPaymentService");

function receipt() {
  return `DH-${new Date().getFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

exports.createDharamshalaPaymentOrder = asyncHandler(async (req, res) => {
  const booking = await DharamshalaBooking.findOne({
    _id: req.params.bookingId,
    requester: req.user.id,
    status: { $in: ["APPROVED", "PAYMENT_PENDING"] },
    paymentStatus: "PENDING",
  });
  if (!booking) throw new ApiError(404, "BOOKING_NOT_PAYABLE", "This booking is not awaiting payment");
  if (booking.paymentDeadline && booking.paymentDeadline < new Date()) {
    throw new ApiError(410, "PAYMENT_EXPIRED", "The payment window for this booking has expired");
  }
  if (!booking.totalAmount || booking.totalAmount < 1) {
    throw new ApiError(422, "INVALID_BOOKING_AMOUNT", "Booking amount is unavailable");
  }

  // Keep bookings created before the payment workflow compatible with the new state machine.
  if (booking.status === "APPROVED") {
    booking.status = "PAYMENT_PENDING";
    booking.paymentDeadline = booking.paymentDeadline || new Date(Date.now() + (Number(process.env.DHARAMSHALA_PAYMENT_HOLD_HOURS) || 24) * 60 * 60 * 1000);
    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({ status: "PAYMENT_PENDING", paymentStatus: "PENDING", changedAt: new Date(), note: "Legacy approved booking migrated on payment attempt" });
    await booking.save();
  }

  const existingPayment = await DharamshalaPayment.findOne({ booking: booking._id, status: { $in: ["CREATED", "PENDING"] } });
  if (existingPayment) {
    return res.status(200).json(new ApiResponse("Existing Dharamshala payment order", {
      booking,
      payment: existingPayment,
      order: { id: existingPayment.gatewayOrderId, amount: Math.round(existingPayment.amount * 100), currency: existingPayment.currency },
      key: process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
    }));
  }

  const order = await razorpay.orders.create({
    amount: Math.round(booking.totalAmount * 100),
    currency: "INR",
    receipt: receipt(),
    notes: { type: "dharamshala", booking: String(booking._id), bookingReference: booking.bookingReference },
  });
  const payment = await DharamshalaPayment.create({
    booking: booking._id,
    user: req.user.id,
    amount: booking.totalAmount,
    currency: order.currency || "INR",
    gatewayOrderId: order.id,
    status: "CREATED",
  });
  booking.gatewayOrderId = order.id;
  booking.paymentId = payment._id;
  await booking.save();

  return res.status(201).json(new ApiResponse("Dharamshala payment order created", {
    booking,
    payment,
    order,
    key: process.env.RAZORPAY_KEY_ID || process.env.REACT_APP_RAZORPAY_KEY,
  }));
});

exports.verifyDharamshalaPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!orderId || !paymentId || !signature) throw new ApiError(400, "PAYMENT_DETAILS_REQUIRED", "Payment verification details are required");
  const payment = await DharamshalaPayment.findOne({ gatewayOrderId: orderId, user: req.user.id });
  if (!payment) throw new ApiError(404, "PAYMENT_NOT_FOUND", "Payment order not found");

  try {
    const result = await confirmDharamshalaPayment({ orderId, paymentId, signature });
    return res.status(200).json(new ApiResponse("Dharamshala payment verified", result));
  } catch (error) {
    if (error.code === "INVALID_SIGNATURE") throw new ApiError(400, "INVALID_SIGNATURE", error.message);
    if (error.code === "PAYMENT_EXPIRED") throw new ApiError(410, error.code, error.message);
    throw new ApiError(409, error.code || "PAYMENT_VERIFICATION_FAILED", error.message);
  }
});

exports.listMyDharamshalaPayments = asyncHandler(async (req, res) => {
  const payments = await DharamshalaPayment.find({ user: req.user.id }).populate({ path: "booking", select: "bookingReference dharamshalaName roomType startDate endDate status" }).sort({ createdAt: -1 });
  return res.status(200).json(new ApiResponse("Dharamshala payments fetched", { payments }));
});

exports.refundDharamshalaPayment = asyncHandler(async (req, res) => {
  const payment = await DharamshalaPayment.findById(req.params.paymentId);
  if (!payment || payment.status !== "SUCCESS") throw new ApiError(404, "PAYMENT_NOT_REFUNDABLE", "Successful Dharamshala payment was not found");
  const booking = await DharamshalaBooking.findById(payment.booking);
  if (!booking || booking.status !== "CANCELLED") throw new ApiError(409, "BOOKING_NOT_CANCELLED", "Cancel the booking before processing a refund");

  const refund = await razorpay.payments.refund(payment.gatewayPaymentId, {
    amount: Math.round((Number(req.body.amount) || payment.amount) * 100),
    notes: { bookingReference: booking.bookingReference || String(booking._id) },
  });
  payment.status = Number(refund.amount) < Math.round(payment.amount * 100) ? "PARTIALLY_REFUNDED" : "REFUNDED";
  payment.refundId = refund.id;
  payment.refundAmount = Number(refund.amount) / 100;
  payment.refundedAt = new Date();
  await payment.save();
  booking.paymentStatus = payment.status === "REFUNDED" ? "REFUNDED" : "REFUND_PENDING";
  await booking.save();
  return res.status(200).json(new ApiResponse("Dharamshala refund processed", { payment, booking }));
});

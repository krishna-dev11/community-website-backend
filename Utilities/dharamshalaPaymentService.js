const crypto = require("node:crypto");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DharamshalaPayment = require("../Models/dharamshalaPayment");
const { notifyUser } = require("./notificationService");

function verifyPaymentSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function confirmDharamshalaPayment({ orderId, paymentId, signature, eventId, trustedWebhook = false }) {
  if (!trustedWebhook && !verifyPaymentSignature(orderId, paymentId, signature)) {
    const error = new Error("Payment verification failed");
    error.code = "INVALID_SIGNATURE";
    throw error;
  }

  const payment = await DharamshalaPayment.findOne({ gatewayOrderId: orderId });
  if (!payment) {
    const error = new Error("Dharamshala payment order not found");
    error.code = "PAYMENT_NOT_FOUND";
    throw error;
  }

  if (payment.status === "SUCCESS" && payment.gatewayPaymentId === paymentId) {
    return { payment, booking: await DharamshalaBooking.findById(payment.booking) };
  }

  const booking = await DharamshalaBooking.findOne({ _id: payment.booking, requester: payment.user });
  if (!booking || !["PAYMENT_PENDING", "APPROVED"].includes(booking.status)) {
    const error = new Error("Booking is no longer payable");
    error.code = "BOOKING_NOT_PAYABLE";
    throw error;
  }
  if (booking.paymentDeadline && booking.paymentDeadline < new Date()) {
    const error = new Error("Payment window has expired");
    error.code = "PAYMENT_EXPIRED";
    throw error;
  }

  payment.gatewayPaymentId = paymentId;
  payment.gatewaySignature = signature;
  payment.gatewayEventId = eventId;
  payment.status = "SUCCESS";
  payment.paidAt = new Date();
  await payment.save();

  booking.paymentId = payment._id;
  booking.gatewayOrderId = orderId;
  booking.gatewayPaymentId = paymentId;
  booking.amountPaid = payment.amount;
  booking.paymentStatus = "SUCCESS";
  booking.status = "CONFIRMED";
  booking.confirmedAt = new Date();
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({ status: "CONFIRMED", paymentStatus: "SUCCESS", changedAt: new Date(), note: "Razorpay payment verified" });
  await booking.save();

  if (booking.requester) {
    await notifyUser({
      recipient: booking.requester,
      title: "Dharamshala booking confirmed",
      message: `Payment received for booking ${booking.bookingReference}. Your Dharamshala booking is confirmed.`,
      email: true,
      metadata: { booking: booking._id, payment: payment._id, paymentId },
    });
  }

  return { payment, booking };
}

async function confirmDharamshalaWebhookPayment({ orderId, paymentId, eventId, amount }) {
  const payment = await DharamshalaPayment.findOne({ gatewayOrderId: orderId });
  if (!payment) return null;
  if (payment.status === "SUCCESS" && payment.gatewayPaymentId === paymentId) return payment;
  if (Math.round(Number(amount) / 100) !== Math.round(payment.amount)) {
    throw new Error("Gateway amount does not match booking amount");
  }
  return confirmDharamshalaPayment({
    orderId,
    paymentId,
    eventId,
    trustedWebhook: true,
  });
}

module.exports = { verifyPaymentSignature, confirmDharamshalaPayment, confirmDharamshalaWebhookPayment };

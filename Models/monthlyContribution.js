const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  mode: {
    type: String,
    enum: ["ONLINE", "CASH", "BANK_TRANSFER", "CHEQUE", "WAIVER", "OTHER"],
    default: "ONLINE",
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  paidAt: {
    type: Date,
    default: Date.now,
  },
  note: String,
}, { _id: false });

const monthlyContributionSchema = new mongoose.Schema({
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  family: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Family",
    index: true,
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12,
  },
  year: {
    type: Number,
    required: true,
  },
  expectedAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  dueDate: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "WAIVED"],
    default: "PENDING",
    index: true,
  },
  paymentHistory: [paymentSchema],
  waiverReason: String,
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
}, { timestamps: true });

monthlyContributionSchema.index({ member: 1, month: 1, year: 1 }, { unique: true });
monthlyContributionSchema.index({ family: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model("MonthlyContribution", monthlyContributionSchema);

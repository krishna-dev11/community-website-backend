const mongoose = require("mongoose");

const paymentHistorySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    mode: {
      type: String,
      enum: ["ONLINE", "CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "WAIVER", "OTHER"],
      default: "ONLINE",
    },
    receiptNumber: String,
    razorpayOrderId: String,
    razorpayPaymentId: String,
    paymentReference: String,
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    note: String,
    status: {
      type: String,
      enum: ["SUCCESS", "REVERSED"],
      default: "SUCCESS",
    },
    reversalReason: String,
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    reversedAt: Date,
  },
  { _id: true, timestamps: true }
);

const monthlyContributionSchema = new mongoose.Schema(
  {
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
    cycle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MonthlyContributionCycle",
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
      default: 60,
    },
    lateFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPayable: {
      type: Number,
      default: 60,
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
    dueStartDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["PENDING", "PARTIAL", "PAID", "OVERDUE", "WAIVED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ["ONLINE", "CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "WAIVER", "OTHER", "NONE"],
      default: "NONE",
    },
    paymentReference: String,
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    receiptNumber: {
      type: String,
      index: true,
    },
    receiptDate: Date,
    paidAt: Date,
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    source: {
      type: String,
      enum: ["ONLINE_GATEWAY", "ADMIN_MANUAL", "SYSTEM", "NONE"],
      default: "NONE",
    },
    notes: String,
    waiverReason: String,
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversalReason: String,
    reversedAt: Date,
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    paymentHistory: [paymentHistorySchema],
  },
  { timestamps: true }
);

// Virtual for remaining amount
monthlyContributionSchema.virtual("remainingAmount").get(function () {
  const total = (this.expectedAmount || 0) + (this.lateFee || 0);
  return Math.max(0, total - (this.paidAmount || 0));
});

monthlyContributionSchema.pre("save", function (next) {
  if (this.totalPayable === undefined || this.totalPayable === null) {
    this.totalPayable = (this.expectedAmount || 0) + (this.lateFee || 0);
  }
  next();
});

monthlyContributionSchema.set("toJSON", { virtuals: true });
monthlyContributionSchema.set("toObject", { virtuals: true });

monthlyContributionSchema.index({ member: 1, month: 1, year: 1 }, { unique: true });
monthlyContributionSchema.index({ family: 1, status: 1, dueDate: 1 });
monthlyContributionSchema.index({ cycle: 1, status: 1 });
monthlyContributionSchema.index({ year: 1, month: 1, status: 1 });

module.exports = mongoose.model("MonthlyContribution", monthlyContributionSchema);

const mongoose = require("mongoose");

const monthlyContributionCycleSchema = new mongoose.Schema(
  {
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
    title: {
      type: String,
      trim: true,
    },
    contributionAmount: {
      type: Number,
      required: true,
      default: 60,
      min: 1,
    },
    dueStartDate: {
      type: Date,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    lateFeeAmount: {
      type: Number,
      default: 2,
      min: 0,
    },
    lateFeeRule: {
      type: String,
      enum: ["FIXED", "PER_MONTH", "NONE"],
      default: "PER_MONTH",
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
      index: true,
    },
    eligibleMembersCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    closedAt: {
      type: Date,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
  },
  { timestamps: true }
);

// Enforce single cycle per month + year at database level
monthlyContributionCycleSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyContributionCycle", monthlyContributionCycleSchema);

const mongoose = require("mongoose");

const photoSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
}, { _id: false });

const matrimonialProfileSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    unique: true,
    index: true,
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
  },
  gender: {
    type: String,
    enum: ["MALE", "FEMALE", "OTHER"],
    required: true,
    index: true,
  },
  dateOfBirth: {
    type: Date,
    required: true,
  },
  height: String,
  maritalStatus: {
    type: String,
    enum: ["NEVER_MARRIED", "DIVORCED", "WIDOWED", "SEPARATED"],
    default: "NEVER_MARRIED",
  },
  education: String,
  profession: String,
  annualIncome: String,
  currentCity: {
    type: String,
    trim: true,
    index: true,
  },
  nativePlace: String,
  gotra: String,
  about: String,
  expectations: String,
  familyDetails: String,
  photos: [photoSchema],
  protectedContact: {
    phone: String,
    email: String,
    address: String,
    socials: [String],
  },
  guardian: {
    name: String,
    relation: String,
    phone: String,
    email: String,
  },
  status: {
    type: String,
    enum: ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED", "UNDER_INVESTIGATION", "ARCHIVED"],
    default: "PENDING_REVIEW",
    index: true,
  },
  visibility: {
    type: String,
    enum: ["MEMBERS_ONLY", "HIDDEN"],
    default: "MEMBERS_ONLY",
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  reviewedAt: Date,
  reviewReason: String,
  pausedAt: Date,
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

matrimonialProfileSchema.index({
  displayName: "text",
  education: "text",
  profession: "text",
  currentCity: "text",
  nativePlace: "text",
  gotra: "text",
  about: "text",
});
matrimonialProfileSchema.index({ status: 1, gender: 1, currentCity: 1, createdAt: -1 });

module.exports = mongoose.model("MatrimonialProfile", matrimonialProfileSchema);

const mongoose = require("mongoose");

const familySchema = new mongoose.Schema({
  familyName: {
    type: String,
    required: true,
    trim: true,
  },
  familyCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  sssmId: {
    type: String,
    required: true,
    trim: true,
  },
  state: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },
  currentCity: {
    type: String,
    trim: true,
    index: true,
  },
  nativePlace: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  currentFamilyAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  status: {
    type: String,
    enum: ["ACTIVE", "NEEDS_ADMIN", "ARCHIVED"],
    default: "ACTIVE",
    index: true,
  },
  visibility: {
    type: String,
    enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
    default: "PUBLIC",
  },
  isArchived: {
    type: Boolean,
    default: false,
    index: true,
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

familySchema.index({ sssmId: 1, state: 1 }, { unique: true });
familySchema.index({ familyName: "text", familyCode: "text", sssmId: "text" });

module.exports = mongoose.model("Family", familySchema);

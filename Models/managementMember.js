const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
}, { _id: false });

const managementMemberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  roleTitle: {
    type: String,
    required: true,
    trim: true,
  },
  bio: String,
  phone: String,
  email: String,
  image: imageSchema,
  displayOrder: {
    type: Number,
    default: 0,
    index: true,
  },
  termStart: Date,
  termEnd: Date,
  status: {
    type: String,
    enum: ["ACTIVE", "PAST", "ARCHIVED"],
    default: "ACTIVE",
    index: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  archiveReason: String,
}, { timestamps: true });

managementMemberSchema.index({ name: "text", roleTitle: "text", bio: "text" });

module.exports = mongoose.model("ManagementMember", managementMemberSchema);

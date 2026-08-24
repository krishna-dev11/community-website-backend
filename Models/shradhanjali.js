const mongoose = require("mongoose");

const shradhanjaliSchema = new mongoose.Schema({
  personName: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  dateOfBirth: Date,
  dateOfPassing: { type: Date, required: true },
  familyInfo: { type: String, trim: true },
  biography: { type: String, trim: true },
  family: { type: mongoose.Schema.Types.ObjectId, ref: "Family" },
  photo: {
    url: String,
    publicId: String,
    size: Number,
    mimeType: String,
    name: String,
  },
  supportingDocument: {
    url: String,
    publicId: String,
    size: Number,
    mimeType: String,
    name: String,
  },
  status: { type: String, enum: ["PENDING", "PUBLISHED", "REJECTED", "ARCHIVED"], default: "PENDING", index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  reviewedAt: Date,
  reviewReason: String,
}, { timestamps: true });

shradhanjaliSchema.index({ personName: "text", message: "text" });

module.exports = mongoose.model("Shradhanjali", shradhanjaliSchema);

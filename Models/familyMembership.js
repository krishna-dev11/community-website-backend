const mongoose = require("mongoose");

const familyMembershipSchema = new mongoose.Schema({
  family: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Family",
    required: true,
    index: true,
  },
  member: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ["FAMILY_ADMIN", "FAMILY_MEMBER"],
    default: "FAMILY_MEMBER",
  },
  status: {
    type: String,
    enum: ["ACTIVE", "REMOVED"],
    default: "ACTIVE",
    index: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
  removedAt: Date,
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  removalReason: String,
}, { timestamps: true });

familyMembershipSchema.index({ family: 1, member: 1 }, { unique: true });
familyMembershipSchema.index(
  { member: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
  }
);

module.exports = mongoose.model("FamilyMembership", familyMembershipSchema);

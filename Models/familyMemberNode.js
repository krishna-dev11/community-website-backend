const mongoose = require("mongoose");

const familyMemberNodeSchema = new mongoose.Schema(
  {
    family: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Family",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["MALE", "FEMALE", "OTHER"],
      default: "MALE",
    },
    relation: {
      type: String,
      enum: [
        "SELF",
        "FATHER",
        "MOTHER",
        "SPOUSE",
        "SON",
        "DAUGHTER",
        "BROTHER",
        "SISTER",
        "GRANDFATHER",
        "GRANDMOTHER",
        "UNCLE",
        "AUNT",
        "ANCESTOR",
        "OTHER",
      ],
      default: "SELF",
    },
    generation: {
      type: Number,
      default: 0, // -2: grandparents, -1: parents, 0: self/spouse/siblings, 1: children, 2: grandchildren
    },
    linkedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    photo: {
      url: String,
      publicId: String,
      name: String,
    },
    birthYear: {
      type: Number,
    },
    passedAwayYear: {
      type: Number,
    },
    isDeceased: {
      type: Boolean,
      default: false,
    },
    profession: {
      type: String,
      trim: true,
    },
    currentCity: {
      type: String,
      trim: true,
    },
    nativePlace: {
      type: String,
      trim: true,
    },
    about: {
      type: String,
      trim: true,
    },
    parents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FamilyMemberNode",
      },
    ],
    spouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FamilyMemberNode",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  },
  { timestamps: true }
);

familyMemberNodeSchema.index({ family: 1, generation: 1 });

module.exports = mongoose.model("FamilyMemberNode", familyMemberNodeSchema);

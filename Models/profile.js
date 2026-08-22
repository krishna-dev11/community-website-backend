const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema({

    gender:{   
        type:String,   
       
    },
    dateOfBirth:{
        type:String,
    },
    about:{
        type:String,
    },
    contactNumber:{
        type:String,
        trim:true,
        index:true
    },

    address: {
  type: String
},

preferredTiming: {
  type: String  // "Morning", "Evening", etc.
},

middleName: String,
nativePlace: String,
currentCity: {
  type: String,
  index: true
},
education: String,
profession: {
  type: String,
  index: true
},
gotra: String,
identityDocument: {
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  uploadedAt: Date
},
photo: {
  url: String,
  publicId: String,
  size: Number,
  mimeType: String,
  uploadedAt: Date
},
privacySettings: {
  phone: {
    type: String,
    enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
    default: "MEMBERS_ONLY"
  },
  email: {
    type: String,
    enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
    default: "PRIVATE"
  },
  address: {
    type: String,
    enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
    default: "MEMBERS_ONLY"
  },
  profession: {
    type: String,
    enum: ["PUBLIC", "MEMBERS_ONLY", "PRIVATE"],
    default: "PUBLIC"
  }
}


},
{timestamps : true});

profileSchema.index({
  currentCity: 1,
  profession: 1
});

module.exports = mongoose.model("profile" , profileSchema);

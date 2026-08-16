const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({

    firstName:{
        type:String,
        required:true,
        trim:true
    },
    lastName:{
        type:String,
        required:true,
        trim:true
    },
    email:{
        type:String,
        required:true,
        trim:true
    },
    password:{    
        type:String,
        required:true
    },
    accountType:{
        type:String,
        required:true,
        enum:["Admin" , "Instructor" , "Student"]
    },
    active:{
        type:Boolean,
        default:true    
    },
    approved:{
        type:Boolean,
        default:true
    },
    // courses:[{
    //     type:mongoose.Schema.Types.ObjectId,
    //     ref:"courses"
    // }],
   additionalDetails:{
        type:mongoose.Schema.Types.ObjectId,
        required:true,
        ref:"profile"
    },
    // cart:[
    //     {
    //         type:mongoose.Schema.Types.ObjectId,
    //         ref:"courses"
    //     }
    // ],
    // coursesProgress:[{
    //     type:mongoose.Schema.Types.ObjectId,
    //     ref:"courseprogress"
    // }],
    imageUrl:{
        type:String,
        required:true
    },
    
    // addition in reset password code
    token:{
        type:String
    },
    resetPasswordExpires:{
        type:Date
    },

    // -------- NEW FIELDS (only ADD, nothing modified) --------
phoneVerified: {
  type: Boolean,
  default: false
},

userRole: {   // coaching specific role
  type: String,
  enum: ["RegularStudent", "WalkInStudent", "Lead", "Enrolled"],
  default: "RegularStudent"
},

// assignedBatch: [{
//   type: mongoose.Schema.Types.ObjectId,
//   ref: "courses"
// }],

totalPaid: {   // total amount student has paid so far
  type: Number,
  default: 0
},

paymentStatus: {
  type: String,
  enum: ["NotPaid", "Partial", "Paid"],
  default: "NotPaid"
}


},
{timestamps : true}
);

module.exports = mongoose.model("user" , userSchema);
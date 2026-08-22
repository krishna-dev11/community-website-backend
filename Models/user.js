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
        trim:true,
        lowercase:true,
        unique:true,
        index:true
    },
    password:{    
        type:String,
        required:true
    },
    accountType:{
        type:String,
        required:true,
        enum:["Admin" , "Instructor" , "Student", "Member"]
    },
    roles: [{
        type:String,
        enum:["SUPER_ADMIN", "MEMBER", "MODERATOR", "TREASURER", "MATRIMONIAL_ADMIN", "SCHOLARSHIP_ADMIN", "JOB_ADMIN", "DHARAMSHALA_ADMIN", "CONTENT_ADMIN", "Admin", "Instructor", "Student"]
    }],
    accountStatus:{
        type:String,
        enum:["PENDING", "ACTIVE", "REJECTED", "CORRECTION_REQUESTED", "SUSPENDED", "DEACTIVATED"],
        default:function() {
            return this.approved ? "ACTIVE" : "PENDING";
        },
        index:true
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
    family:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Family",
        index:true
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
    tokenVersion:{
        type:Number,
        default:0
    },
    failedLoginAttempts:{
        type:Number,
        default:0
    },
    lockedUntil:{
        type:Date
    },
    sessions:[{
        tokenHash:String,
        device:String,
        ip:String,
        createdAt:{
            type:Date,
            default:Date.now
        },
        expiresAt:Date
    }],
    reviewHistory:[{
        action:{
            type:String,
            enum:["SUBMITTED", "APPROVED", "REJECTED", "CORRECTION_REQUESTED", "RESUBMITTED"]
        },
        reason:String,
        reviewedBy:{
            type:mongoose.Schema.Types.ObjectId,
            ref:"user"
        },
        reviewedAt:{
            type:Date,
            default:Date.now
        }
    }],

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

userSchema.pre("validate", function(next) {
    if (!this.roles || this.roles.length === 0) {
        if (this.accountType === "Admin") this.roles = ["Admin"];
        else if (this.accountType === "Instructor") this.roles = ["Instructor"];
        else if (this.accountType === "Student") this.roles = ["Student"];
        else this.roles = ["MEMBER"];
    }

    if (!this.accountStatus) {
        this.accountStatus = this.approved ? "ACTIVE" : "PENDING";
    }

    next();
});

module.exports = mongoose.model("user" , userSchema);

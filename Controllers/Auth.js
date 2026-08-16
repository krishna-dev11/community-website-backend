const user = require("../Models/user");
const OTP = require("../Models/otpSchema");
const bcrypt = require("bcryptjs");
const profile = require("../Models/profile");
const jwt = require("jsonwebtoken");
const cookie = require("cookie-parser");
const otpGenerator = require("otp-generator");
const passwordUpdate = require("../mail/templates/passwordUpdate");
const { mailSender } = require("../Utilities/mailSender");
require("dotenv").config();


// send OTP check
exports.sendOTP = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();

    console.log({ email } , "sendOTP") ;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "enter the email",
      });
    }

    const result = await user.findOne({ email: email });

    if (result) {
      return res.status(409).json({
        success: false,
        message:
          "you are already exist in our database so go to login page and make login",
      });
    }

    

    var otp = otpGenerator.generate(6, {
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });
  

    let sameOtpPresent = await OTP.findOne({ otp: otp });

    while (sameOtpPresent) {
      otp = otpGenerator.generate(6, {
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
      });

      sameOtpPresent = await OTP.findOne({ otp: otp });
    }

    await OTP.create({ email, otp });

    res.status(200).json({
      success: true,
      message: "entery of otp successfully created in database",
      otp
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "there should be some error in sending the otp to the user's email",
    });
  }
};

// signUP  check
exports.signUP = async (req, res) => {

  
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
      accountType,
      otp,
    } = req.body;

    

    if (
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !confirmPassword ||
      !accountType ||
      !otp
    ) {
      return res.status(401).json({
        success: false,
        message: "enter all details in signUp form carefully",
      });
    }

    
    

    if (password !== confirmPassword) {
      return res.status(401).json({
        success: false,
        message: "password and confirmedPassword can't matched",
      });
    }
   
    const checkUser = await user.findOne({ email: email });

   

    if (checkUser) {
      return res.status(401).json({
        success: false,
        message:
          "you are already register with these email on our plateform go through the login page or start signUp with another email address",
      });
    }
    
  
// find recent otp from otp schema
    const recentOtp = await OTP.find({ email: email })
      .sort({ createdAt: -1 })
      .limit(1);

      // console.log(recentOtp)
      
    if (recentOtp.length === 0 || !recentOtp[0]) {
      return res.status(400).json({
        success: false,
        message: "OTP is not Found",
      });
    } else if ( otp !== recentOtp[0].otp ) {
      return res.status(400).json({
        success: false,
        message: "OTP is Invalid",
      });
    }
   
   
    const hashedPassword = await bcrypt.hash(password , 10);
    // console.log(hashedPassword)

    // Create the user
		let approved = "";
    accountType === "Instructor" ? (approved = false) : (approved = true)
		// approved === "Instructor" ? (approved = false) : (approved = true);    yeh line sahi hai


    

    const profileDetails = await profile.create({
      gender: null,
      dateOfBirth: null,
      about: null,
      contactNumber: null,
    });
    
    const createUser = await user.create({
      firstName,
      lastName,
      email,
      accountType,
      approved:approved,
      password:hashedPassword,
      imageUrl:`https://api.dicebear.com/5.x/initials/svg?seed=${firstName}-${lastName}`,
      additionalDetails: profileDetails._id,
    });
    // console.log("hi")
    

    return res.status(200).json({
      success: true,
      createUser,
      message: "user signUp successfully",
    })
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "user signUp request fails",
    });
  }
};

// login  check
exports.login = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    console.log(email, "login request")

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "fill all required details in login form",
      });
    }

  

    const User = await user.findOne({ email: email }).populate("additionalDetails")
    console.log(User)

    if (!User) {
      return res.status(404).json({
        success: false,
        message:
          "user can't be registerd in our database with these email Address so go though with signUp",
      });
    }

    if (User.password === 'GOOGLE_AUTH_USER') {
      return res.status(400).json({
        success: false,
        googleAuth:true,
        message:
          "you are SignUp using GoogleAuth so now also login with that",
      });
    }

    
    if (await bcrypt.compare(password , User.password )) {
      
      const payload = {
        email: User.email,
        id: User._id,
        accountType: User.accountType,
      };
      // console.log(payload)
      const token = jwt.sign(payload, process.env.SECRET_KEY, {
        expiresIn: "24h",
      });
      // console.log("token" ,token)


      User.token = token;
      User.password = undefined;
      // console.log(User)

      const options = {
        maxAge: 3 * 24 * 60 * 60 * 1000,
        httpOnly:true
      };
     
     return  res.cookie("token", token , options).status(200).json({
        success: true,
        token,
        User,
        message: "User Logged in Successfully",
      });

       
     
    } else {
      return res.status(401).json({
        success: false,
        message: "Password is Incorrect",
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `user login request fail  due to some error : ${error}`,
    });
  }
};

// Controller for Changing Password
exports.changePassword = async (req, res) => {
	try {
		// Get user data from req.user
    // console.log(req.body)
		const userDetails = await user.findById(req.user.id);

		// Get old password, new password, and confirm new password from req.body
		const { oldPassword, newPassword, confirmNewPassword } = req.body;

		// Validate old password
		const isPasswordMatch = await bcrypt.compare(
			oldPassword,
			userDetails.password
		);
		if (!isPasswordMatch) {
			// If old password does not match, return a 401 (Unauthorized) error
			return res
				.status(401)
				.json({ success: false, message: "The password is incorrect" });
		}

		// Match new password and confirm new password
		if (newPassword !== confirmNewPassword) {
			// If new password and confirm new password do not match, return a 400 (Bad Request) error
			return res.status(400).json({
				success: false,
				message: "The password and confirm password does not match",
			});
		}

		// Update password
		const encryptedPassword = await bcrypt.hash(newPassword, 10);
		const updatedUserDetails = await user.findByIdAndUpdate(
			req.user.id,
			{ password: encryptedPassword },
			{ new: true }
		);

		// Send notification email
		try {
			const emailResponse = await mailSender(
				updatedUserDetails.email,
        "Password Changed Succssful",
				passwordUpdate(updatedUserDetails.email, updatedUserDetails.firstName)
			);
			// console.log("Email sent successfully:", emailResponse.response);
		} catch (error) {
			// If there's an error sending the email, log the error and return a 500 (Internal Server Error) error
			// console.error("Error occurred while sending email:", error);
			return res.status(500).json({
				success: false,
				message: "Error occurred while sending email",
				error: error.message,
			});
		}

		// Return success response
		return res
			.status(200)
			.json({ success: true, message: "Password updated successfully" });
	} catch (error) {
		// If there's an error updating the password, log the error and return a 500 (Internal Server Error) error
		console.error("Error occurred while updating password:", error);
		return res.status(500).json({
			success: false,
			message: "Error occurred while updating password",
			error: error.message,
		});
	}
};


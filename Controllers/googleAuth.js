const { OAuth2Client } = require("google-auth-library");
const User = require("../Models/user");
const jwt = require("jsonwebtoken");
const profile = require("../Models/profile");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  try {
    const { token, accountType } = req.body;

    if (!token || !accountType) {
      return res.status(400).json({
        success: false,
        message: "Token and accountType required",
      });
    }

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email = payload.email;
    const firstName = payload.given_name || "User";
    const lastName = payload.family_name || "";


        const profileDetails = await profile.create({
          gender: null,
          dateOfBirth: null,
          about: null,
          contactNumber: null,
        });

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        firstName,
        lastName,
        email,
        password: "GOOGLE_AUTH_USER",
        accountType: accountType,
        approved: accountType === "Instructor" ? false : true,
        additionalDetails: profileDetails._id,
        imageUrl: `https://api.dicebear.com/5.x/initials/svg?seed=${firstName}-${lastName}`,
      });
    }

    const payloadJwt = {
      email: user.email,
      id: user._id,
      accountType: user.accountType,
    };

    const jwtToken = jwt.sign(payloadJwt, process.env.SECRET_KEY, {
      expiresIn: "24h",
    });

    res.cookie("token", jwtToken, {
      httpOnly: true,
      sameSite: "None",
      secure: true,
    });

    return res.status(200).json({
      success: true,
      token: jwtToken,
      user,
      message: "Google login successful",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Google login failed",
    });
  }
};

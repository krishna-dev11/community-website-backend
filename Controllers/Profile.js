const user = require("../Models/user");
const Profile = require("../Models/profile");
const {
  uploadImageToCloudinary,
} = require("../Utilities/uploadImageToCloudinary");
const profile = require("../Models/profile");


require("dotenv").config();

// check
exports.updateProfile = async (req, res) => {
  try {
    // console.log(req.body ,"hiiiiiii")
    const {
      gender,
      dateOfBirth = "",
      about = "",
      contactNumber,
      FirstName,
      LastName,
    } = req.body;

    const userId = req.user.id;

    if (
      !gender ||
      !dateOfBirth ||
      !about ||
      !contactNumber ||
      !FirstName ||
      !LastName
    ) {
      return res.status(400).json({
        success: false,
        message: "please fills all details carefully",
      });
    }

    const existingUser = await user.findById({ _id: userId });
    const profile = await Profile.findById(existingUser.additionalDetails);

    existingUser.firstName = FirstName;
    existingUser.lastName = LastName;
    await existingUser.save();

    profile.dateOfBirth = dateOfBirth;
    profile.about = about;
    profile.contactNumber = contactNumber;
    profile.gender = gender;
    await profile.save();

    const updatedUser = await user.findById(userId).populate([
      {
        path: "additionalDetails",
      },
      {
        path: "cart",
        populate: {
          path: "instructor",
        },
      },
      {
        path: "coursesProgress",
      },
    ]);

    return res.status(200).json({
      success: true,
      message: "additional details submitted successfully",
      profile,
      data: updatedUser,
    });
  } catch (error) {
    // console.log(error);
    return res.status(500).json({
      success: false,
      message: "some errors occurs in updating the additional details",
      error: error.message,
    });
  }
};

// check
exports.getAllUserDetails = async (req, res) => {
  try {
    const userId = req.user.id;

    const getalldetails = await user
      .findById({ _id: userId })
      .populate("additionalDetails cart coursesProgress")
      .exec();
    // console.log(getalldetails);

    if (!getalldetails) {
      return res.status(400).json({
        success: false,
        message: "user with these ID is not exist in our databases",
      });
    }

    return res.status(200).json({
      success: true,
      message: "All Details of user fetched successfully from the databse",
      data: getalldetails,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        "some errors occurs on fetching the All Details of user from the Databases",
    });
  }
};

// check
exports.updateDisplayPicture = async (req, res) => {
  try {
    const profilePicture = req.files.displayPicture;

    const userId = req.user.id;

    // console.log(profilePicture , userId , "alakh")
    const image = await uploadImageToCloudinary(
      profilePicture,
      process.env.CLOUDINARY_FOLDER,
      1000,
      1000
    );

    const updateprofilePicture = await user
      .findByIdAndUpdate(
        { _id: userId },
        { imageUrl: image.secure_url },
        { new: true }
      )
      .populate([
        {
          path: "additionalDetails",
        },
        {
          path: "cart",
          populate: {
            path: "instructor",
          },
        },
        {
          path: "coursesProgress",
        },
      ]);

    return res.status(200).json({
      success: true,
      message: "Image updated successfully",
      data: updateprofilePicture,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "some error occurs in Uploding the new profile Picture",
    });
  }
};

// check but body me id pass karke
exports.deleteAccount = async (req, res) => {
  try {
    // console.log(req.user)
    const userId = req.user.id;
    // const userId = req.body.id

    const checkUser = await user.findById({ _id: userId });
    if (!checkUser) {
      return res.status(400).json({
        success: false,
        message: "user Not Found",
      });
    }

    const deleteAdditionalDetails = await profile.findByIdAndDelete({
      _id: checkUser.additionalDetails,
    });

    const deleteAccount = await user.findByIdAndDelete({ _id: userId });

    return res.status(200).json({
      success: true,
      message: "user Deleted Successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "some Error Occurs in deleting the User",
    });
  }
};




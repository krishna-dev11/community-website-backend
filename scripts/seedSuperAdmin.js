const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const { dbconnect } = require("../config/Database");
const User = require("../Models/user");
const Profile = require("../Models/profile");

function normalizeEmail(email) {
  return email?.trim().toLowerCase();
}

async function seedSuperAdmin() {
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required.");
  }

  await dbconnect();

  const existingUser = await User.findOne({ email }).select("_id email roles accountStatus active approved");

  if (existingUser) {
    const roles = new Set(existingUser.roles || []);
    roles.add("SUPER_ADMIN");

    await User.updateOne(
      { _id: existingUser._id },
      {
        $set: {
          roles: Array.from(roles),
          accountStatus: "ACTIVE",
          active: true,
          approved: true,
        },
      }
    );

    console.log(`Super Admin already exists: ${email}`);
    console.log("Ensured SUPER_ADMIN role and ACTIVE account status. Existing password was not changed.");
    return;
  }

  let profile;
  try {
    profile = await Profile.create({
      about: "Initial Super Admin account",
      privacySettings: {
        phone: "PRIVATE",
        email: "PRIVATE",
        address: "PRIVATE",
        profession: "PRIVATE",
      },
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    await User.create({
      firstName: "Krishna",
      lastName: "Gothwal",
      email,
      password: hashedPassword,
      accountType: "Admin",
      roles: ["SUPER_ADMIN"],
      accountStatus: "ACTIVE",
      active: true,
      approved: true,
      additionalDetails: profile._id,
      imageUrl: "https://api.dicebear.com/5.x/initials/svg?seed=Super-Admin",
      reviewHistory: [{
        action: "APPROVED",
        reason: "Initial Super Admin seeded",
      }],
    });

    console.log(`Created initial Super Admin: ${email}`);
    console.log("Password was stored as a bcrypt hash.");
  } catch (error) {
    if (profile?._id) {
      await Profile.deleteOne({ _id: profile._id });
    }
    throw error;
  }
}

seedSuperAdmin()
  .catch((error) => {
    console.error("Super Admin seed failed:");
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
  });

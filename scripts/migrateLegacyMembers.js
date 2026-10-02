/**
 * Migration Script: Migrate Legacy Members to Family-Centric Model
 * - Assigns permanent Member IDs (SMJ-XXXXXX) to legacy members missing one.
 * - Sets default familyRole ("FAMILY_HEAD" if family admin, else "MEMBER").
 * - Syncs Family.currentHeadMemberId with Family.currentFamilyAdmin.
 * - DOES NOT invent fake family relationships.
 */
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const User = require("../Models/user");
const Family = require("../Models/family");
const FamilyMembership = require("../Models/familyMembership");
const { dbconnect } = require("../config/Database");

async function migrate() {
  console.log("🚀 Starting legacy member migration...");
  await dbconnect();

  // 1. Assign permanent Member ID to all users missing memberId
  const usersMissingMemberId = await User.find({
    $or: [{ memberId: { $exists: false } }, { memberId: null }, { memberId: "" }],
  });

  console.log(`Found ${usersMissingMemberId.length} users needing permanent Member ID`);

  for (const user of usersMissingMemberId) {
    let memberId = `SMJ-${String(user._id).slice(-6).toUpperCase()}`;
    const exists = await User.findOne({ memberId, _id: { $ne: user._id } });
    if (exists) {
      memberId = `SMJ-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    }
    user.memberId = memberId;
    if (!user.familyRole) {
      user.familyRole = "MEMBER";
    }
    await user.save();
    console.log(`✅ Assigned ${memberId} to ${user.firstName} ${user.lastName}`);
  }

  // 2. Synchronize Family head references
  const families = await Family.find({
    $or: [{ currentHeadMemberId: { $exists: false } }, { currentHeadMemberId: null }],
  });

  console.log(`Found ${families.length} families needing currentHeadMemberId synchronization`);

  for (const fam of families) {
    if (fam.currentFamilyAdmin) {
      fam.currentHeadMemberId = fam.currentFamilyAdmin;
      if (!fam.verificationStatus) {
        fam.verificationStatus = fam.status === "ACTIVE" ? "VERIFIED" : "UNDER_REVIEW";
      }
      await fam.save();
      await User.findByIdAndUpdate(fam.currentFamilyAdmin, { familyRole: "FAMILY_HEAD" });
      console.log(`✅ Synced head for family ${fam.familyName} (${fam.familyCode})`);
    }
  }

  console.log("🎉 Legacy migration complete!");
  process.exit(0);
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error("❌ Migration error:", err);
    process.exit(1);
  });
}

module.exports = { migrate };

const Family = require("../Models/family");
const FamilyMembership = require("../Models/familyMembership");

async function reconcileFamilyAdmin(familyId, actorId = null, reason = "Family admin reconciliation") {
  const family = await Family.findById(familyId);
  if (!family || family.status === "ARCHIVED") return null;

  const currentAdminMembership = await FamilyMembership.findOne({
    family: family._id,
    member: family.currentFamilyAdmin,
    role: "FAMILY_ADMIN",
    status: "ACTIVE",
  });

  if (currentAdminMembership) return family;

  const nextAdmin = await FamilyMembership.findOne({
    family: family._id,
    status: "ACTIVE",
  }).sort({ joinedAt: 1, createdAt: 1 });

  if (nextAdmin) {
    await FamilyMembership.updateMany(
      { family: family._id, role: "FAMILY_ADMIN", status: "ACTIVE" },
      { role: "FAMILY_MEMBER" }
    );
    nextAdmin.role = "FAMILY_ADMIN";
    await nextAdmin.save();

    family.currentFamilyAdmin = nextAdmin.member;
    family.status = "ACTIVE";
    await family.save();
    return family;
  }

  family.status = "NEEDS_ADMIN";
  family.archiveReason = reason;
  if (actorId) family.archivedBy = actorId;
  await family.save();
  return family;
}

async function removeUserFromActiveFamilyMemberships(userId, actorId = null, reason = "User removed from active family memberships") {
  const memberships = await FamilyMembership.find({ member: userId, status: "ACTIVE" }).select("family role");
  const familyIds = [...new Set(memberships.map((membership) => String(membership.family)))];

  await FamilyMembership.updateMany(
    { member: userId, status: "ACTIVE" },
    {
      status: "REMOVED",
      removedAt: new Date(),
      removedBy: actorId || userId,
      removalReason: reason,
    }
  );

  await Promise.all(familyIds.map((familyId) => reconcileFamilyAdmin(familyId, actorId || userId, reason)));
  return familyIds;
}

module.exports = {
  reconcileFamilyAdmin,
  removeUserFromActiveFamilyMemberships,
};

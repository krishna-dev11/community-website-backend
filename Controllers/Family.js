const crypto = require("node:crypto");
const Family = require("../Models/family");
const FamilyMembership = require("../Models/familyMembership");
const FamilyJoinRequest = require("../Models/familyJoinRequest");
const FamilyMemberNode = require("../Models/familyMemberNode");
const User = require("../Models/user");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const { uploadImageToCloudinary, assetMetadata } = require("../Utilities/uploadImageToCloudinary");

function generateFamilyCode() {
  return `FAM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createUniqueFamilyCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const familyCode = generateFamilyCode();
    const existing = await Family.exists({ familyCode });
    if (!existing) return familyCode;
  }

  throw new ApiError(500, "FAMILY_CODE_GENERATION_FAILED", "Could not generate a unique family code");
}

async function requireFamilyAdmin(userId, familyId) {
  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: userId,
    role: "FAMILY_ADMIN",
    status: "ACTIVE",
  });

  if (!membership) {
    throw new ApiError(403, "FAMILY_ADMIN_REQUIRED", "Only the family admin can perform this action");
  }

  return membership;
}

exports.createFamily = asyncHandler(async (req, res) => {
  const { familyName, sssmId, state, currentCity, nativePlace, visibility } = req.body;
  const userId = req.user.id;

  if (!familyName || !sssmId || !state) {
    throw new ApiError(400, "FAMILY_FIELDS_REQUIRED", "Family name, SSSM ID, and state are required");
  }

  const existingMembership = await FamilyMembership.findOne({
    member: userId,
    status: "ACTIVE",
  });

  if (existingMembership) {
    throw new ApiError(409, "ALREADY_IN_FAMILY", "You already belong to an active family");
  }

  const family = await Family.create({
    familyName,
    familyCode: await createUniqueFamilyCode(),
    sssmId,
    state,
    currentCity,
    nativePlace,
    visibility,
    createdBy: userId,
    currentFamilyAdmin: userId,
  });

  await FamilyMembership.create({
    family: family._id,
    member: userId,
    role: "FAMILY_ADMIN",
  });

  await User.findByIdAndUpdate(userId, { family: family._id });

  await logAudit({
    actor: userId,
    action: "family.created",
    targetType: "family",
    target: family._id,
    newValue: {
      familyName: family.familyName,
      familyCode: family.familyCode,
      sssmId: family.sssmId,
      state: family.state,
    },
    req,
  });

  return res.status(201).json(new ApiResponse("Family created successfully", { family }));
});

exports.getMyFamily = asyncHandler(async (req, res) => {
  const membership = await FamilyMembership.findOne({
    member: req.user.id,
    status: "ACTIVE",
  }).populate("family");

  if (!membership) {
    return res.status(200).json(new ApiResponse("No active family found", { family: null, membership: null, members: [] }));
  }

  const members = await FamilyMembership.find({
    family: membership.family._id,
    status: "ACTIVE",
  })
    .populate({
      path: "member",
      select: "firstName lastName email imageUrl accountStatus additionalDetails",
      populate: { path: "additionalDetails" },
    })
    .sort({ role: 1, joinedAt: 1 });

  return res.status(200).json(new ApiResponse("Family fetched successfully", {
    family: membership.family,
    membership,
    members,
  }));
});

exports.searchFamilies = asyncHandler(async (req, res) => {
  const { familyCode, sssmId, state, q } = req.query;
  const filter = {
    isArchived: false,
    status: { $ne: "ARCHIVED" },
  };

  if (familyCode) filter.familyCode = String(familyCode).trim().toUpperCase();
  if (sssmId) filter.sssmId = String(sssmId).trim();
  if (state) filter.state = String(state).trim().toUpperCase();
  if (q) filter.$text = { $search: String(q).trim() };

  if (!familyCode && !sssmId && !q) {
    throw new ApiError(400, "SEARCH_TERM_REQUIRED", "Search by family code, SSSM ID, or text query");
  }

  const families = await Family.find(filter)
    .select("familyName familyCode sssmId state currentCity nativePlace currentFamilyAdmin visibility")
    .populate("currentFamilyAdmin", "firstName lastName imageUrl")
    .limit(20)
    .sort({ createdAt: -1 });

  return res.status(200).json(new ApiResponse("Families fetched successfully", { families }));
});

exports.requestToJoinFamily = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { message } = req.body;
  const userId = req.user.id;

  const family = await Family.findOne({
    _id: familyId,
    isArchived: false,
    status: { $ne: "ARCHIVED" },
  });

  if (!family) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found or is no longer active");
  }

  const activeMembership = await FamilyMembership.findOne({
    member: userId,
    status: "ACTIVE",
  });

  if (activeMembership) {
    throw new ApiError(409, "ALREADY_IN_FAMILY", "You already belong to an active family");
  }

  const joinRequest = await FamilyJoinRequest.create({
    family: familyId,
    requestedBy: userId,
    message,
  });

  await notifyUser({
    recipient: family.currentFamilyAdmin,
    title: "New family join request",
    message: "A member has requested to join your family.",
    metadata: { family: familyId, joinRequest: joinRequest._id },
  });

  await logAudit({
    actor: userId,
    action: "family.join_request.created",
    targetType: "familyJoinRequest",
    target: joinRequest._id,
    newValue: { family: familyId, requestedBy: userId },
    req,
  });

  return res.status(201).json(new ApiResponse("Family join request submitted", { joinRequest }));
});

exports.listFamilyJoinRequests = asyncHandler(async (req, res) => {
  const { familyId } = req.params;

  await requireFamilyAdmin(req.user.id, familyId);

  const joinRequests = await FamilyJoinRequest.find({
    family: familyId,
    status: "PENDING",
  })
    .populate({
      path: "requestedBy",
      select: "firstName lastName email imageUrl additionalDetails",
      populate: { path: "additionalDetails" },
    })
    .sort({ createdAt: 1 });

  return res.status(200).json(new ApiResponse("Join requests fetched successfully", { joinRequests }));
});

exports.reviewFamilyJoinRequest = asyncHandler(async (req, res) => {
  const { familyId, requestId } = req.params;
  const { action, reviewMessage } = req.body;

  await requireFamilyAdmin(req.user.id, familyId);

  if (!["APPROVE", "REJECT"].includes(action)) {
    throw new ApiError(400, "INVALID_JOIN_REVIEW_ACTION", "Action must be APPROVE or REJECT");
  }

  const joinRequest = await FamilyJoinRequest.findOneAndUpdate(
    {
      _id: requestId,
      family: familyId,
      status: "PENDING",
    },
    {
      status: action === "APPROVE" ? "APPROVED" : "REJECTED",
      reviewedBy: req.user.id,
      reviewedAt: new Date(),
      reviewMessage,
    },
    { new: true }
  );

  if (!joinRequest) {
    throw new ApiError(404, "JOIN_REQUEST_NOT_REVIEWABLE", "Join request was not found or was already reviewed");
  }

  if (action === "APPROVE") {
    const activeMembership = await FamilyMembership.findOne({
      member: joinRequest.requestedBy,
      status: "ACTIVE",
    });

    if (activeMembership) {
      joinRequest.status = "REJECTED";
      joinRequest.reviewMessage = "Member already belongs to another active family";
      await joinRequest.save();
      throw new ApiError(409, "REQUESTER_ALREADY_IN_FAMILY", "Member already belongs to another active family");
    }

    await FamilyMembership.create({
      family: familyId,
      member: joinRequest.requestedBy,
      role: "FAMILY_MEMBER",
    });

    await User.findByIdAndUpdate(joinRequest.requestedBy, { family: familyId });
  }

  await notifyUser({
    recipient: joinRequest.requestedBy,
    title: "Family join request reviewed",
    message: `Your family join request was ${joinRequest.status.toLowerCase()}.`,
    metadata: { family: familyId, joinRequest: joinRequest._id, status: joinRequest.status },
  });

  await logAudit({
    actor: req.user.id,
    action: `family.join_request.${joinRequest.status.toLowerCase()}`,
    targetType: "familyJoinRequest",
    target: joinRequest._id,
    newValue: { status: joinRequest.status, family: familyId },
    reason: reviewMessage,
    req,
  });

  return res.status(200).json(new ApiResponse("Join request reviewed successfully", { joinRequest }));
});

exports.transferFamilyAdmin = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const { memberId } = req.body;

  if (!memberId) {
    throw new ApiError(400, "MEMBER_REQUIRED", "Member id is required");
  }

  await requireFamilyAdmin(req.user.id, familyId);

  const targetMembership = await FamilyMembership.findOne({
    family: familyId,
    member: memberId,
    status: "ACTIVE",
  });

  if (!targetMembership) {
    throw new ApiError(404, "FAMILY_MEMBER_NOT_FOUND", "Target member is not active in this family");
  }

  await FamilyMembership.updateOne(
    { family: familyId, member: req.user.id, status: "ACTIVE" },
    { role: "FAMILY_MEMBER" }
  );
  targetMembership.role = "FAMILY_ADMIN";
  await targetMembership.save();
  await Family.findByIdAndUpdate(familyId, { currentFamilyAdmin: memberId, status: "ACTIVE" });

  await notifyUser({
    recipient: memberId,
    title: "Family admin role assigned",
    message: "You are now the family admin.",
    metadata: { family: familyId },
  });

  await logAudit({
    actor: req.user.id,
    action: "family.admin.transferred",
    targetType: "family",
    target: familyId,
    oldValue: { currentFamilyAdmin: req.user.id },
    newValue: { currentFamilyAdmin: memberId },
    req,
  });

  return res.status(200).json(new ApiResponse("Family admin transferred successfully"));
});

exports.getFamilyTree = asyncHandler(async (req, res) => {
  const { familyId } = req.params;

  const family = await Family.findById(familyId)
    .populate("currentFamilyAdmin", "firstName lastName email imageUrl");

  if (!family || family.isArchived) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found or has been archived");
  }

  // Fetch all tree nodes for this family
  let nodes = await FamilyMemberNode.find({ family: familyId })
    .populate("linkedUser", "firstName lastName email imageUrl additionalDetails")
    .populate("parents", "name relation gender photo")
    .populate("spouse", "name relation gender photo")
    .sort({ generation: 1, createdAt: 1 });

  // If no nodes exist yet, auto-bootstrap tree nodes from active family members
  if (nodes.length === 0) {
    const activeMemberships = await FamilyMembership.find({
      family: familyId,
      status: "ACTIVE",
    }).populate({
      path: "member",
      select: "firstName lastName email imageUrl additionalDetails",
      populate: { path: "additionalDetails" },
    });

    const bootstrapNodes = [];
    for (const membership of activeMemberships) {
      const u = membership.member;
      if (!u) continue;
      const isAdmin = String(family.currentFamilyAdmin?._id || family.currentFamilyAdmin) === String(u._id);
      bootstrapNodes.push({
        family: familyId,
        name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Family Member",
        gender: u.additionalDetails?.gender || "MALE",
        relation: isAdmin ? "SELF" : "OTHER",
        generation: 0,
        linkedUser: u._id,
        photo: u.imageUrl ? { url: u.imageUrl, name: `${u.firstName} photo` } : undefined,
        currentCity: u.additionalDetails?.currentCity,
        nativePlace: u.additionalDetails?.nativePlace,
        profession: u.additionalDetails?.profession,
        createdBy: req.user.id,
      });
    }

    if (bootstrapNodes.length > 0) {
      await FamilyMemberNode.insertMany(bootstrapNodes);
      nodes = await FamilyMemberNode.find({ family: familyId })
        .populate("linkedUser", "firstName lastName email imageUrl additionalDetails")
        .sort({ generation: 1, createdAt: 1 });
    }
  }

  // Structure nodes by generation
  const generationMap = {
    "-2": { title: "Grandparents Generation", nodes: [] },
    "-1": { title: "Parents Generation", nodes: [] },
    "0": { title: "Self & Siblings Generation", nodes: [] },
    "1": { title: "Children Generation", nodes: [] },
    "2": { title: "Grandchildren Generation", nodes: [] },
  };

  nodes.forEach((node) => {
    const genKey = String(node.generation ?? 0);
    if (!generationMap[genKey]) {
      generationMap[genKey] = { title: `Generation ${genKey}`, nodes: [] };
    }
    generationMap[genKey].nodes.push(node);
  });

  return res.status(200).json(
    new ApiResponse("Family tree fetched successfully", {
      family,
      nodes,
      generationMap,
      totalMembersInTree: nodes.length,
    })
  );
});

exports.addFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId } = req.params;
  const {
    name,
    gender,
    relation,
    generation,
    linkedUser,
    birthYear,
    passedAwayYear,
    isDeceased,
    profession,
    currentCity,
    nativePlace,
    about,
    parents,
    spouse,
  } = req.body;

  if (!name) {
    throw new ApiError(400, "NAME_REQUIRED", "Relative name is required");
  }

  const family = await Family.findById(familyId);
  if (!family || family.isArchived) {
    throw new ApiError(404, "FAMILY_NOT_FOUND", "Family was not found");
  }

  // Check user belongs to family
  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });

  if (!membership) {
    throw new ApiError(403, "FAMILY_MEMBER_REQUIRED", "You must belong to this family to modify the tree");
  }

  const nodeData = {
    family: familyId,
    name: name.trim(),
    gender: gender || "MALE",
    relation: relation || "OTHER",
    generation: Number(generation !== undefined ? generation : 0),
    linkedUser: linkedUser || undefined,
    birthYear: birthYear ? Number(birthYear) : undefined,
    passedAwayYear: passedAwayYear ? Number(passedAwayYear) : undefined,
    isDeceased: Boolean(isDeceased === "true" || isDeceased === true),
    profession: profession?.trim() || undefined,
    currentCity: currentCity?.trim() || undefined,
    nativePlace: nativePlace?.trim() || undefined,
    about: about?.trim() || undefined,
    spouse: spouse || undefined,
    createdBy: req.user.id,
  };

  if (parents) {
    nodeData.parents = Array.isArray(parents) ? parents : [parents];
  }

  // Handle uploaded relative photo
  const photoFile = req.files?.photo || req.files?.image;
  if (photoFile) {
    const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/family_tree", 800, 80);
    nodeData.photo = assetMetadata(uploadResult, photoFile.name);
  }

  const node = await FamilyMemberNode.create(nodeData);

  // If spouse node is specified, link back reciprocally
  if (spouse) {
    await FamilyMemberNode.findByIdAndUpdate(spouse, { spouse: node._id });
  }

  await logAudit({
    actor: req.user.id,
    action: "family.tree.node_created",
    targetType: "familyMemberNode",
    target: node._id,
    newValue: { name: node.name, relation: node.relation, family: familyId },
    req,
  });

  return res.status(201).json(new ApiResponse("Family member added to tree", { node }));
});

exports.updateFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId, nodeId } = req.params;

  const node = await FamilyMemberNode.findOne({ _id: nodeId, family: familyId });
  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Tree member node was not found");
  }

  // Check membership
  const membership = await FamilyMembership.findOne({
    family: familyId,
    member: req.user.id,
    status: "ACTIVE",
  });
  if (!membership) {
    throw new ApiError(403, "FAMILY_MEMBER_REQUIRED", "Access denied");
  }

  const updateFields = [
    "name",
    "gender",
    "relation",
    "generation",
    "birthYear",
    "passedAwayYear",
    "isDeceased",
    "profession",
    "currentCity",
    "nativePlace",
    "about",
    "spouse",
  ];

  updateFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      if (field === "generation" || field === "birthYear" || field === "passedAwayYear") {
        node[field] = req.body[field] ? Number(req.body[field]) : undefined;
      } else if (field === "isDeceased") {
        node.isDeceased = Boolean(req.body.isDeceased === "true" || req.body.isDeceased === true);
      } else {
        node[field] = req.body[field];
      }
    }
  });

  if (req.body.parents) {
    node.parents = Array.isArray(req.body.parents) ? req.body.parents : [req.body.parents];
  }

  // Handle updated photo
  const photoFile = req.files?.photo || req.files?.image;
  if (photoFile) {
    const uploadResult = await uploadImageToCloudinary(photoFile, "samaj/family_tree", 800, 80);
    node.photo = assetMetadata(uploadResult, photoFile.name);
  }

  await node.save();

  return res.status(200).json(new ApiResponse("Family tree member updated", { node }));
});

exports.deleteFamilyTreeNode = asyncHandler(async (req, res) => {
  const { familyId, nodeId } = req.params;

  await requireFamilyAdmin(req.user.id, familyId);

  const node = await FamilyMemberNode.findOneAndDelete({ _id: nodeId, family: familyId });
  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Tree member node was not found");
  }

  // Remove references
  await FamilyMemberNode.updateMany({ family: familyId, spouse: nodeId }, { $unset: { spouse: 1 } });
  await FamilyMemberNode.updateMany({ family: familyId, parents: nodeId }, { $pull: { parents: nodeId } });

  await logAudit({
    actor: req.user.id,
    action: "family.tree.node_deleted",
    targetType: "familyMemberNode",
    target: nodeId,
    oldValue: { name: node.name, family: familyId },
    req,
  });

  return res.status(200).json(new ApiResponse("Family tree member removed"));
});

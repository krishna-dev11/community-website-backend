const express = require("express");
const {
  createFamily,
  getMyFamily,
  searchFamilies,
  requestToJoinFamily,
  listFamilyJoinRequests,
  reviewFamilyJoinRequest,
  transferFamilyAdmin,
  getFamilyTree,
  addFamilyTreeNode,
  updateFamilyTreeNode,
  deleteFamilyTreeNode,
} = require("../Controllers/Family");
const { auth } = require("../Middlewares/auth");

const router = express.Router();

router.post("/", auth, createFamily);
router.get("/me", auth, getMyFamily);
router.get("/search", auth, searchFamilies);
router.post("/:familyId/join-requests", auth, requestToJoinFamily);
router.get("/:familyId/join-requests", auth, listFamilyJoinRequests);
router.patch("/:familyId/join-requests/:requestId", auth, reviewFamilyJoinRequest);
router.patch("/:familyId/admin", auth, transferFamilyAdmin);

// Family Tree Genealogy Graph routes
router.get("/:familyId/tree", auth, getFamilyTree);
router.post("/:familyId/tree/nodes", auth, addFamilyTreeNode);
router.patch("/:familyId/tree/nodes/:nodeId", auth, updateFamilyTreeNode);
router.delete("/:familyId/tree/nodes/:nodeId", auth, deleteFamilyTreeNode);

module.exports = router;

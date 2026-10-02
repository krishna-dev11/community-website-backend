const express = require("express");
const {
  createFamily,
  getMyFamily,
  searchFamilies,
  requestToJoinFamily,
  listFamilyJoinRequests,
  reviewFamilyJoinRequest,
  transferFamilyAdmin,
  addFamilyMemberToExistingFamily,
  resubmitFamilyMemberDocument,
  fixAndResubmitFamilyMember,
  submitLifecycleRequest,
  getFamilyLifecycleRequests,
  listAllLifecycleRequests,
  reviewLifecycleRequest,
  mergeFamilies,
  reportFamilyHeadDeath,
  reviewFamilyHeadSuccession,
  updateNomineeSuccessor,
  getFamilyTree,
  addFamilyTreeNode,
  updateFamilyTreeNode,
  deleteFamilyTreeNode,
} = require("../Controllers/Family");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.post("/", auth, createFamily);
router.get("/me", auth, getMyFamily);
router.get("/search", auth, searchFamilies);
router.post("/:familyId/join-requests", auth, requestToJoinFamily);
router.get("/:familyId/join-requests", auth, listFamilyJoinRequests);
router.patch("/:familyId/join-requests/:requestId", auth, reviewFamilyJoinRequest);
router.patch("/:familyId/admin", auth, transferFamilyAdmin);

// Admin Lifecycle & Management Routes (MUST BE BEFORE /:familyId to prevent collision)
router.get("/admin/lifecycle-requests", auth, listAllLifecycleRequests);
router.patch("/admin/lifecycle-requests/:requestId/review", auth, reviewLifecycleRequest);
router.post("/admin/merge", auth, mergeFamilies);

// Family-Centric Member Management
router.post("/:familyId/members", auth, addFamilyMemberToExistingFamily);
router.put("/:familyId/members/:memberId/resubmit-document", auth, resubmitFamilyMemberDocument);
router.put("/:familyId/members/:memberId/fix-and-resubmit", auth, fixAndResubmitFamilyMember);
router.patch("/:familyId/nominee", auth, updateNomineeSuccessor);

// Lifecycle Events & Requests
router.post("/:familyId/lifecycle-requests", auth, submitLifecycleRequest);
router.get("/:familyId/lifecycle-requests", auth, getFamilyLifecycleRequests);

// Succession & Demise Management
router.post("/:familyId/succession/report-death", auth, reportFamilyHeadDeath);
router.patch(
  "/:familyId/succession/:requestId/review",
  auth,
  authorize("admin:users"),
  reviewFamilyHeadSuccession
);

// Family Tree Genealogy Graph routes
router.get("/:familyId/tree", auth, getFamilyTree);
router.post("/:familyId/tree/nodes", auth, addFamilyTreeNode);
router.patch("/:familyId/tree/nodes/:nodeId", auth, updateFamilyTreeNode);
router.delete("/:familyId/tree/nodes/:nodeId", auth, deleteFamilyTreeNode);

module.exports = router;

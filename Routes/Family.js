const express = require("express");
const {
  createFamily,
  getMyFamily,
  searchFamilies,
  requestToJoinFamily,
  listFamilyJoinRequests,
  reviewFamilyJoinRequest,
  transferFamilyAdmin,
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

module.exports = router;

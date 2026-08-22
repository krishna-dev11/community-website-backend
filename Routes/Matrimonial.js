const express = require("express");
const {
  createOrUpdateMyMatrimonialProfile,
  getMyMatrimonialProfile,
  listMatrimonialProfiles,
  getMatrimonialProfile,
  listMatrimonialProfilesAdmin,
  reviewMatrimonialProfile,
  pauseOrResumeMyMatrimonialProfile,
  removeMyMatrimonialProfile,
  expressInterest,
  listMyMatrimonialInterests,
  respondToInterest,
  requestContactAccess,
  listMyContactRequests,
  reviewContactRequest,
  reportMatrimonialProfile,
  listMatrimonialReports,
  reviewMatrimonialReport,
  blockMatrimonialProfile,
  unblockMatrimonialProfile,
} = require("../Controllers/Matrimonial");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.post("/profiles/me", auth, authorize("matrimonial:create"), createOrUpdateMyMatrimonialProfile);
router.put("/profiles/me", auth, authorize("matrimonial:create"), createOrUpdateMyMatrimonialProfile);
router.get("/profiles/me", auth, authorize("matrimonial:read"), getMyMatrimonialProfile);
router.patch("/profiles/me/visibility", auth, authorize("matrimonial:create"), pauseOrResumeMyMatrimonialProfile);
router.delete("/profiles/me", auth, authorize("matrimonial:create"), removeMyMatrimonialProfile);

router.get("/profiles", auth, authorize("matrimonial:read"), listMatrimonialProfiles);
router.get("/profiles/:profileId", auth, authorize("matrimonial:read"), getMatrimonialProfile);
router.get("/admin/profiles", auth, authorize("matrimonial:review"), listMatrimonialProfilesAdmin);
router.patch("/admin/profiles/:profileId/review", auth, authorize("matrimonial:review"), reviewMatrimonialProfile);

router.post("/profiles/:profileId/interests", auth, authorize("matrimonial:interest"), expressInterest);
router.get("/interests/me", auth, authorize("matrimonial:read"), listMyMatrimonialInterests);
router.patch("/interests/:interestId", auth, authorize("matrimonial:interest"), respondToInterest);

router.post("/interests/:interestId/contact-requests", auth, authorize("matrimonial:contact"), requestContactAccess);
router.get("/contact-requests/me", auth, authorize("matrimonial:read"), listMyContactRequests);
router.patch("/contact-requests/:requestId", auth, authorize("matrimonial:contact"), reviewContactRequest);

router.post("/profiles/:profileId/reports", auth, authorize("matrimonial:report"), reportMatrimonialProfile);
router.get("/admin/reports", auth, authorize("matrimonial:moderate"), listMatrimonialReports);
router.patch("/admin/reports/:reportId", auth, authorize("matrimonial:moderate"), reviewMatrimonialReport);

router.post("/profiles/:profileId/block", auth, authorize("matrimonial:block"), blockMatrimonialProfile);
router.delete("/profiles/:profileId/block", auth, authorize("matrimonial:block"), unblockMatrimonialProfile);

module.exports = router;

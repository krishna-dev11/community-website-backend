const express = require("express");
const {
  createIssue,
  listIssues,
  updateIssueStatus,
  publishAsCommunitySolution,
  listPublicSolutions,
  addIssueResponse,
  listIssueResponses,
  confirmIssueResolution,
  getDharamshalas,
  getDharamshalaById,
  createDharamshala,
  updateDharamshala,
  createDharamshalaBooking,
  listDharamshalaBookings,
  reviewDharamshalaBooking,
  cancelDharamshalaBooking,
  checkDharamshalaAvailability,
  createDharamshalaBlockedDate,
  listDharamshalaBlockedDates,
  archiveDharamshalaBlockedDate,
  createPoll,
  listPolls,
  updatePollStatus,
  getPollResults,
  castVote,
  createCommunityPost,
  listCommunityPosts,
  moderateCommunityPost,
  addCommunityComment,
  listCommunityComments,
  moderateCommunityComment,
  reportCommunityPost,
  reportCommunityComment,
  listCommunityReports,
  reviewCommunityReport,
  createAchievement,
  listAchievements,
  reviewAchievement,
  createShradhanjali,
  listShradhanjalis,
  reviewShradhanjali,
  getMyMembershipCard,
  verifyMembershipCard,
} = require("../Controllers/Community");
const { auth, optionalAuth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.post("/issues", auth, authorize("issue:create"), createIssue);
router.get("/issues", auth, authorize("issue:read"), listIssues);
router.get("/issues/:issueId/responses", auth, authorize("issue:read"), listIssueResponses);
router.post("/issues/:issueId/responses", auth, authorize("issue:respond"), addIssueResponse);
router.patch("/issues/:issueId/status", auth, authorize("issue:moderate"), updateIssueStatus);
router.post("/issues/:issueId/publish-solution", auth, authorize("issue:moderate"), publishAsCommunitySolution);
router.patch("/issues/:issueId/publish-solution", auth, authorize("issue:moderate"), publishAsCommunitySolution);
router.patch("/issues/:issueId/confirm-resolution", auth, authorize("issue:respond"), confirmIssueResolution);
router.get("/solutions", listPublicSolutions);

// Dharamshala Public & Management Routes
router.get("/dharamshalas", getDharamshalas);
router.get("/dharamshalas/:id", getDharamshalaById);
router.post("/dharamshalas", auth, authorize("dharamshala:block"), createDharamshala);
router.patch("/dharamshalas/:id", auth, authorize("dharamshala:block"), updateDharamshala);

// Booking & Availability (supports both authenticated members and guest non-members)
router.post("/dharamshala/bookings", optionalAuth, createDharamshalaBooking);
router.get("/dharamshala/availability", checkDharamshalaAvailability);
router.get("/dharamshala/bookings", auth, authorize("dharamshala:read"), listDharamshalaBookings);
router.get("/me/dharamshala/bookings", auth, (req, res, next) => {
  req.query.mine = "true";
  next();
}, listDharamshalaBookings);
router.patch("/dharamshala/bookings/:bookingId/review", auth, authorize("dharamshala:review"), reviewDharamshalaBooking);
router.patch("/dharamshala/bookings/:bookingId/cancel", auth, cancelDharamshalaBooking);
router.post("/dharamshala/blocked-dates", auth, authorize("dharamshala:block"), createDharamshalaBlockedDate);
router.get("/dharamshala/blocked-dates", auth, authorize("dharamshala:read"), listDharamshalaBlockedDates);
router.patch("/dharamshala/blocked-dates/:blockId/archive", auth, authorize("dharamshala:block"), archiveDharamshalaBlockedDate);

router.post("/polls", auth, authorize("poll:create"), createPoll);
router.get("/polls", auth, authorize("poll:read"), listPolls);
router.patch("/polls/:pollId/status", auth, authorize("poll:update"), updatePollStatus);
router.get("/polls/:pollId/results", auth, authorize("poll:update"), getPollResults);
router.post("/polls/:pollId/votes", auth, authorize("poll:vote"), castVote);

router.post("/posts", auth, authorize("community:create"), createCommunityPost);
router.get("/posts", auth, authorize("community:read"), listCommunityPosts);
router.patch("/posts/:postId/moderate", auth, authorize("community:moderate"), moderateCommunityPost);
router.post("/posts/:postId/reports", auth, authorize("community:report"), reportCommunityPost);
router.post("/posts/:postId/comments", auth, authorize("community:comment"), addCommunityComment);
router.get("/posts/:postId/comments", auth, authorize("community:read"), listCommunityComments);
router.patch("/comments/:commentId/moderate", auth, authorize("community:moderate"), moderateCommunityComment);
router.post("/comments/:commentId/reports", auth, authorize("community:report"), reportCommunityComment);
router.get("/reports", auth, authorize("community:moderate"), listCommunityReports);
router.patch("/reports/:reportId", auth, authorize("community:moderate"), reviewCommunityReport);

router.post("/achievements", auth, authorize("achievement:create"), createAchievement);
router.get("/admin/achievements", auth, authorize("achievement:review"), (req, res, next) => {
  req.query.admin = "true";
  next();
}, listAchievements);
router.get("/me/achievements", auth, authorize("achievement:create"), (req, res, next) => {
  req.query.mine = "true";
  next();
}, listAchievements);
router.get("/achievements", listAchievements);
router.patch("/achievements/:achievementId/review", auth, authorize("achievement:review"), reviewAchievement);

router.post("/shradhanjalis", auth, authorize("shradhanjali:create"), createShradhanjali);
router.get("/admin/shradhanjalis", auth, authorize("shradhanjali:review"), (req, res, next) => {
  req.query.admin = "true";
  next();
}, listShradhanjalis);
router.get("/me/shradhanjalis", auth, authorize("shradhanjali:create"), (req, res, next) => {
  req.query.mine = "true";
  next();
}, listShradhanjalis);
router.get("/shradhanjalis", listShradhanjalis);
router.patch("/shradhanjalis/:shradhanjaliId/review", auth, authorize("shradhanjali:review"), reviewShradhanjali);

router.get("/membership-cards/me", auth, getMyMembershipCard);
router.get("/membership-cards/:memberId/verify", verifyMembershipCard);

module.exports = router;

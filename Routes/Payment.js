const express = require("express");
const {
  listDonationCampaigns,
  listDonationCampaignsAdmin,
  createDonationCampaign,
  updateDonationCampaign,
  archiveDonationCampaign,
  createDonationOrder,
  verifyDonationPayment,
  listDonations,
  createContributionOrder,
  razorpayWebhook,
  generateMonthlyContributions,
  listContributions,
  recordOfflineContributionPayment,
  waiveContribution,
  markOverdueContributions,
} = require("../Controllers/Payment");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.post("/webhooks/razorpay", razorpayWebhook);

router.get("/donation-campaigns", listDonationCampaigns);
router.get("/admin/donation-campaigns", auth, authorize("donation:read"), listDonationCampaignsAdmin);
router.post("/donation-campaigns", auth, authorize("donation:create"), createDonationCampaign);
router.patch("/donation-campaigns/:campaignId", auth, authorize("donation:update"), updateDonationCampaign);
router.patch("/donation-campaigns/:campaignId/archive", auth, authorize("donation:archive"), archiveDonationCampaign);

router.post("/donations/orders", auth, createDonationOrder);
router.post("/donations/verify", auth, verifyDonationPayment);
router.get("/donations", auth, authorize("donation:read"), listDonations);
router.get("/me/donations", auth, (req, res, next) => {
  req.query.mine = "true";
  next();
}, listDonations);

router.post("/contributions/:contributionId/orders", auth, createContributionOrder);
router.post("/contributions/generate", auth, authorize("contribution:create"), generateMonthlyContributions);
router.get("/contributions", auth, authorize("contribution:read"), listContributions);
router.get("/me/contributions", auth, (req, res, next) => {
  req.query.mine = "true";
  next();
}, listContributions);
router.patch("/contributions/:contributionId/payments/offline", auth, authorize("contribution:update"), recordOfflineContributionPayment);
router.patch("/contributions/:contributionId/waive", auth, authorize("contribution:update"), waiveContribution);
router.post("/contributions/mark-overdue", auth, authorize("contribution:update"), markOverdueContributions);

module.exports = router;

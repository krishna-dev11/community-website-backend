const express = require("express");
const {
  listDonationCampaigns,
  listDonationCampaignsAdmin,
  listPublicSupporters,
  createDonationCampaign,
  updateDonationCampaign,
  archiveDonationCampaign,
  createDonationOrder,
  verifyDonationPayment,
  listDonations,
  createContributionOrder,
  verifyContributionPayment,
  razorpayWebhook,
  createContributionCycle,
  generateMonthlyContributions,
  listContributionCycles,
  updateContributionCycleStatus,
  getContributionsDashboardSummary,
  listContributions,
  getMyContributionsSummary,
  listMyFinancialHistory,
  recordManualContributionPayment,
  recordOfflineContributionPayment,
  reverseContributionPayment,
  getContributionReceipt,
  getMemberLedgerAdmin,
  exportContributions,
  sendContributionReminders,
  waiveContribution,
  markOverdueContributions,
} = require("../Controllers/Payment");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.post("/webhooks/razorpay", razorpayWebhook);

// ─── DONATIONS ───────────────────────────────────────────────────────────────
router.get("/donation-campaigns", listDonationCampaigns);
router.get("/donations/supporters", listPublicSupporters);
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

// ─── MONTHLY CONTRIBUTIONS & CYCLES ──────────────────────────────────────────
// Cycles (Admin)
router.post("/contributions/cycles", auth, authorize("contribution:create"), createContributionCycle);
router.get("/contributions/cycles", auth, authorize("contribution:read"), listContributionCycles);
router.patch("/contributions/cycles/:cycleId/status", auth, authorize("contribution:update"), updateContributionCycleStatus);

// Dashboard Summary & Export (Admin)
router.get("/contributions/dashboard-summary", auth, authorize("contribution:read"), getContributionsDashboardSummary);
router.get("/contributions/export", auth, authorize("contribution:read"), exportContributions);
router.post("/contributions/reminders", auth, authorize("contribution:create"), sendContributionReminders);
router.get("/contributions/members/:memberId/ledger", auth, authorize("contribution:read"), getMemberLedgerAdmin);

// Legacy generate route (also creates cycle & dues)
router.post("/contributions/generate", auth, authorize("contribution:create"), generateMonthlyContributions);

// List Contributions (Admin & Member)
router.get("/contributions", auth, authorize("contribution:read"), listContributions);
router.get("/me/contributions", auth, (req, res, next) => {
  req.query.mine = "true";
  next();
}, listContributions);
router.get("/me/contributions/summary", auth, getMyContributionsSummary);
router.get("/me/financial-history", auth, listMyFinancialHistory);

// Member Payment Flow
router.post("/contributions/:contributionId/orders", auth, createContributionOrder);
router.post("/contributions/:contributionId/verify", auth, verifyContributionPayment);
router.get("/contributions/:contributionId/receipt", auth, getContributionReceipt);

// Admin Manual Payments, Reversals, Waivers
router.post("/contributions/:contributionId/payments/manual", auth, authorize("contribution:update"), recordManualContributionPayment);
router.patch("/contributions/:contributionId/payments/offline", auth, authorize("contribution:update"), recordOfflineContributionPayment);
router.post("/contributions/:contributionId/reverse", auth, authorize("contribution:update"), reverseContributionPayment);
router.patch("/contributions/:contributionId/waive", auth, authorize("contribution:update"), waiveContribution);
router.post("/contributions/mark-overdue", auth, authorize("contribution:update"), markOverdueContributions);

module.exports = router;

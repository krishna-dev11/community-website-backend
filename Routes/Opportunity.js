const express = require("express");
const {
  listJobs,
  listJobsAdmin,
  createJob,
  updateJob,
  moderateJob,
  listMyJobs,
  reportJob,
  applyToJob,
  listJobApplications,
  listMyJobApplications,
  updateJobApplicationStatus,
  listScholarships,
  listScholarshipsAdmin,
  createScholarship,
  updateScholarship,
  archiveScholarship,
  applyForScholarship,
  listScholarshipApplications,
  listMyScholarshipApplications,
  reviewScholarshipApplication,
} = require("../Controllers/Opportunity");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

// ── Jobs (Public) ──────────────────────────────────────────────────────────
router.get("/jobs", listJobs);

// ── Jobs (Member Auth) ─────────────────────────────────────────────────────
router.post("/jobs", auth, createJob);
router.patch("/jobs/:jobId", auth, updateJob);
router.get("/me/jobs", auth, listMyJobs);
router.post("/jobs/:jobId/report", auth, reportJob);

// ── Jobs (Admin) ───────────────────────────────────────────────────────────
router.get("/admin/jobs", auth, authorize("job:moderate"), listJobsAdmin);
router.patch("/admin/jobs/:jobId/moderate", auth, authorize("job:moderate"), moderateJob);

// ── Job Applications (kept for backward compat, no new UI for jobs) ────────
router.post("/jobs/:jobId/applications", auth, applyToJob);
router.get("/jobs/:jobId/applications", auth, listJobApplications);
router.get("/me/job-applications", auth, listMyJobApplications);
router.patch("/job-applications/:applicationId/status", auth, updateJobApplicationStatus);

// ── Scholarships ───────────────────────────────────────────────────────────
router.get("/scholarships", listScholarships);
router.get("/admin/scholarships", auth, authorize("scholarship:read"), listScholarshipsAdmin);
router.post("/scholarships", auth, authorize("scholarship:create"), createScholarship);
router.patch("/scholarships/:scholarshipId", auth, authorize("scholarship:update"), updateScholarship);
router.patch("/scholarships/:scholarshipId/archive", auth, authorize("scholarship:archive"), archiveScholarship);
router.post("/scholarships/:scholarshipId/applications", auth, applyForScholarship);
router.get("/scholarships/:scholarshipId/applications", auth, authorize("scholarship:read"), listScholarshipApplications);
router.get("/admin/scholarship-applications", auth, authorize("scholarship:read"), listScholarshipApplications);
router.get("/me/scholarship-applications", auth, listMyScholarshipApplications);
router.patch("/scholarship-applications/:applicationId/review", auth, authorize("scholarship:review"), reviewScholarshipApplication);

module.exports = router;

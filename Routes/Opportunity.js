const express = require("express");
const {
  listJobs,
  listJobsAdmin,
  createJob,
  updateJob,
  moderateJob,
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

router.get("/jobs", listJobs);
router.get("/admin/jobs", auth, authorize("job:moderate"), listJobsAdmin);
router.post("/jobs", auth, createJob);
router.patch("/jobs/:jobId", auth, updateJob);
router.patch("/admin/jobs/:jobId/moderate", auth, authorize("job:moderate"), moderateJob);
router.post("/jobs/:jobId/applications", auth, applyToJob);
router.get("/jobs/:jobId/applications", auth, listJobApplications);
router.get("/me/job-applications", auth, listMyJobApplications);
router.patch("/job-applications/:applicationId/status", auth, updateJobApplicationStatus);

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

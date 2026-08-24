const Job = require("../Models/job");
const JobApplication = require("../Models/jobApplication");
const Scholarship = require("../Models/scholarship");
const ScholarshipApplication = require("../Models/scholarshipApplication");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { notifyUser } = require("../Utilities/notificationService");
const { uploadImageToCloudinary } = require("../Utilities/uploadImageToCloudinary");
const { hasPermission } = require("../constants/permissions");

function pageOptions(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

function textFilter(q) {
  return q ? { $text: { $search: String(q).trim() } } : {};
}

async function paged(Model, filter, query, sort = { createdAt: -1 }, populate = null) {
  const { page, limit, skip } = pageOptions(query);
  let queryBuilder = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) queryBuilder = queryBuilder.populate(populate);
  const [items, total] = await Promise.all([
    queryBuilder,
    Model.countDocuments(filter),
  ]);
  return {
    items,
    meta: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

function canModerate(req, permission) {
  return hasPermission(req.user?.roles || [], permission);
}

function isOwner(idA, idB) {
  return String(idA) === String(idB);
}

function assetFromCloudinary(upload, fallbackName) {
  if (!upload) return undefined;
  return {
    url: upload.secure_url,
    publicId: upload.public_id,
    size: upload.bytes,
    mimeType: upload.resource_type,
    name: fallbackName,
  };
}

function assetFromBody(asset) {
  if (!asset?.url) return undefined;
  return {
    url: asset.url,
    publicId: asset.publicId,
    size: asset.size,
    mimeType: asset.mimeType,
    name: asset.name,
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function uploadFiles(files, folder) {
  const uploaded = [];
  for (const file of asArray(files)) {
    const result = await uploadImageToCloudinary(file, folder);
    if (!result?.secure_url) {
      throw new ApiError(500, "FILE_UPLOAD_FAILED", "Could not upload file");
    }
    uploaded.push(assetFromCloudinary(result, file.name));
  }
  return uploaded;
}

function jobPayload(body) {
  const payload = {};
  [
    "title",
    "companyName",
    "description",
    "location",
    "employmentType",
    "salaryRange",
    "experienceRequired",
    "contactEmail",
    "contactPhone",
    "expiresAt",
  ].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  if (body.skills !== undefined) payload.skills = Array.isArray(body.skills) ? body.skills : String(body.skills).split(",").map((skill) => skill.trim()).filter(Boolean);
  return payload;
}

exports.listJobs = asyncHandler(async (req, res) => {
  const filter = {
    status: "PUBLISHED",
    ...textFilter(req.query.q),
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  };
  if (req.query.location) filter.location = new RegExp(String(req.query.location).trim(), "i");
  if (req.query.employmentType) filter.employmentType = req.query.employmentType;

  const { items, meta } = await paged(Job, filter, req.query, { publishedAt: -1, createdAt: -1 }, {
    path: "postedBy",
    select: "firstName lastName imageUrl",
  });
  return res.status(200).json(new ApiResponse("Jobs fetched successfully", { jobs: items }, meta));
});

exports.listJobsAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.postedBy) filter.postedBy = req.query.postedBy;

  const { items, meta } = await paged(Job, filter, req.query, { createdAt: -1 }, {
    path: "postedBy",
    select: "firstName lastName email",
  });
  return res.status(200).json(new ApiResponse("Admin jobs fetched successfully", { jobs: items }, meta));
});

exports.createJob = asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.companyName || !req.body.description) {
    throw new ApiError(400, "JOB_FIELDS_REQUIRED", "Title, company name, and description are required");
  }

  const job = await Job.create({
    ...jobPayload(req.body),
    status: canModerate(req, "job:moderate") && req.body.status === "PUBLISHED" ? "PUBLISHED" : "PENDING_MODERATION",
    publishedAt: canModerate(req, "job:moderate") && req.body.status === "PUBLISHED" ? new Date() : undefined,
    postedBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "job.created",
    targetType: "job",
    target: job._id,
    newValue: { status: job.status, title: job.title },
    req,
  });

  return res.status(201).json(new ApiResponse("Job submitted successfully", { job }));
});

exports.updateJob = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job || job.status === "ARCHIVED") {
    throw new ApiError(404, "JOB_NOT_FOUND", "Job was not found");
  }
  if (!isOwner(job.postedBy, req.user.id) && !canModerate(req, "job:moderate")) {
    throw new ApiError(403, "JOB_UPDATE_FORBIDDEN", "You cannot update this job");
  }
  if (job.status === "PUBLISHED" && !canModerate(req, "job:moderate")) {
    throw new ApiError(409, "PUBLISHED_JOB_LOCKED", "Published jobs can be edited by admins only");
  }

  Object.assign(job, jobPayload(req.body));
  if (!canModerate(req, "job:moderate")) {
    job.status = "PENDING_MODERATION";
  }
  await job.save();

  await logAudit({
    actor: req.user.id,
    action: "job.updated",
    targetType: "job",
    target: job._id,
    newValue: { status: job.status, title: job.title },
    req,
  });

  return res.status(200).json(new ApiResponse("Job updated successfully", { job }));
});

exports.moderateJob = asyncHandler(async (req, res) => {
  const { action, reason } = req.body;
  const nextStatus = {
    PUBLISH: "PUBLISHED",
    REJECT: "REJECTED",
    EXPIRE: "EXPIRED",
    ARCHIVE: "ARCHIVED",
  }[action];
  if (!nextStatus) {
    throw new ApiError(400, "INVALID_JOB_ACTION", "Action must be PUBLISH, REJECT, EXPIRE, or ARCHIVE");
  }

  const job = await Job.findById(req.params.jobId);
  if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "Job was not found");

  const oldStatus = job.status;
  job.status = nextStatus;
  job.moderatedBy = req.user.id;
  job.moderatedAt = new Date();
  job.moderationReason = reason;
  if (nextStatus === "PUBLISHED") job.publishedAt = job.publishedAt || new Date();
  if (nextStatus === "ARCHIVED") {
    job.archivedAt = new Date();
    job.archivedBy = req.user.id;
    job.archiveReason = reason;
  }
  await job.save();

  await notifyUser({
    recipient: job.postedBy,
    title: "Job post reviewed",
    message: `Your job post "${job.title}" is now ${job.status}.`,
    metadata: { job: job._id, status: job.status, reason },
  });

  await logAudit({
    actor: req.user.id,
    action: `job.${nextStatus.toLowerCase()}`,
    targetType: "job",
    target: job._id,
    oldValue: { status: oldStatus },
    newValue: { status: job.status },
    reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Job moderated successfully", { job }));
});

exports.applyToJob = asyncHandler(async (req, res) => {
  const job = await Job.findOne({
    _id: req.params.jobId,
    status: "PUBLISHED",
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
  if (!job) throw new ApiError(404, "JOB_NOT_OPEN", "Job is not open for applications");

  const resumeUpload = (await uploadFiles(req.files?.resume, process.env.CLOUDINARY_JOB_FOLDER || "samaj/jobs/resumes"))[0];
  const resume = resumeUpload || assetFromBody(req.body.resume);

  const User = require("../Models/user");
  const applicantUser = await User.findById(req.user.id).populate("additionalDetails");
  const profileDetails = applicantUser?.additionalDetails || {};

  const applicantSnapshot = {
    fullName: `${applicantUser?.firstName || ""} ${applicantUser?.lastName || ""}`.trim() || req.body.fullName || "Applicant",
    email: applicantUser?.email || req.body.email,
    phone: req.body.phone || profileDetails?.contactNumber,
    currentCity: req.body.currentCity || profileDetails?.currentCity,
    education: req.body.education || profileDetails?.education,
    profession: req.body.profession || profileDetails?.profession,
    skills: req.body.skills ? (Array.isArray(req.body.skills) ? req.body.skills : String(req.body.skills).split(",").map((s) => s.trim())) : [],
    experience: req.body.experience || "",
    expectedSalary: req.body.expectedSalary || "",
    portfolioUrl: req.body.portfolioUrl || "",
    linkedInUrl: req.body.linkedInUrl || "",
    githubUrl: req.body.githubUrl || "",
  };

  const application = await JobApplication.create({
    job: job._id,
    applicant: req.user.id,
    coverLetter: req.body.coverLetter,
    resume,
    applicantSnapshot,
  });

  await notifyUser({
    recipient: job.postedBy,
    title: "New job application",
    message: `A member applied for "${job.title}".`,
    metadata: { job: job._id, application: application._id },
  });

  return res.status(201).json(new ApiResponse("Job application submitted successfully", { application }));
});

exports.listJobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId);
  if (!job) throw new ApiError(404, "JOB_NOT_FOUND", "Job was not found");
  if (!isOwner(job.postedBy, req.user.id) && !canModerate(req, "job:moderate")) {
    throw new ApiError(403, "JOB_APPLICATIONS_FORBIDDEN", "You cannot view these applications");
  }

  const filter = { job: job._id };
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(JobApplication, filter, req.query, { createdAt: -1 }, {
    path: "applicant",
    select: "firstName lastName email imageUrl additionalDetails",
    populate: { path: "additionalDetails" },
  });

  return res.status(200).json(new ApiResponse("Job applications fetched successfully", { applications: items }, meta));
});

exports.listMyJobApplications = asyncHandler(async (req, res) => {
  const filter = { applicant: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(JobApplication, filter, req.query, { createdAt: -1 }, {
    path: "job",
    select: "title companyName location employmentType status",
  });
  return res.status(200).json(new ApiResponse("My job applications fetched successfully", { applications: items }, meta));
});

exports.updateJobApplicationStatus = asyncHandler(async (req, res) => {
  const { status, reviewMessage } = req.body;
  if (!["SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"].includes(status)) {
    throw new ApiError(400, "INVALID_JOB_APPLICATION_STATUS", "Invalid application status");
  }

  const application = await JobApplication.findById(req.params.applicationId).populate("job");
  if (!application) throw new ApiError(404, "JOB_APPLICATION_NOT_FOUND", "Job application was not found");
  const job = application.job;
  const applicantIsWithdrawing = status === "WITHDRAWN" && isOwner(application.applicant, req.user.id);
  if (!applicantIsWithdrawing && !isOwner(job.postedBy, req.user.id) && !canModerate(req, "job:moderate")) {
    throw new ApiError(403, "JOB_APPLICATION_REVIEW_FORBIDDEN", "You cannot update this application");
  }

  const oldStatus = application.status;
  application.status = status;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  application.reviewMessage = reviewMessage;
  await application.save();

  if (!applicantIsWithdrawing) {
    await notifyUser({
      recipient: application.applicant,
      title: "Job application updated",
      message: `Your application for "${job.title}" is now ${application.status}.`,
      metadata: { job: job._id, application: application._id, status: application.status },
    });
  }

  await logAudit({
    actor: req.user.id,
    action: "job.application.status_updated",
    targetType: "jobApplication",
    target: application._id,
    oldValue: { status: oldStatus },
    newValue: { status: application.status },
    reason: reviewMessage,
    req,
  });

  return res.status(200).json(new ApiResponse("Job application updated successfully", { application }));
});

function scholarshipPayload(body) {
  const payload = {};
  ["title", "description", "eligibility", "amount", "seats", "applicationDeadline", "status"].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
}

exports.listScholarships = asyncHandler(async (req, res) => {
  const filter = {
    status: "OPEN",
    applicationDeadline: { $gt: new Date() },
    ...textFilter(req.query.q),
  };
  const { items, meta } = await paged(Scholarship, filter, req.query, { applicationDeadline: 1, createdAt: -1 });
  return res.status(200).json(new ApiResponse("Scholarships fetched successfully", { scholarships: items }, meta));
});

exports.listScholarshipsAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(Scholarship, filter, req.query, { createdAt: -1 });
  return res.status(200).json(new ApiResponse("Admin scholarships fetched successfully", { scholarships: items }, meta));
});

exports.createScholarship = asyncHandler(async (req, res) => {
  if (!req.body.title || !req.body.description || !req.body.applicationDeadline) {
    throw new ApiError(400, "SCHOLARSHIP_FIELDS_REQUIRED", "Title, description, and deadline are required");
  }
  if (new Date(req.body.applicationDeadline) <= new Date()) {
    throw new ApiError(400, "INVALID_SCHOLARSHIP_DEADLINE", "Deadline must be in the future");
  }

  const scholarship = await Scholarship.create({
    ...scholarshipPayload(req.body),
    createdBy: req.user.id,
    updatedBy: req.user.id,
    publishedAt: req.body.status === "OPEN" ? new Date() : undefined,
  });

  await logAudit({
    actor: req.user.id,
    action: "scholarship.created",
    targetType: "scholarship",
    target: scholarship._id,
    newValue: { status: scholarship.status, title: scholarship.title },
    req,
  });

  return res.status(201).json(new ApiResponse("Scholarship created successfully", { scholarship }));
});

exports.updateScholarship = asyncHandler(async (req, res) => {
  const scholarship = await Scholarship.findById(req.params.scholarshipId);
  if (!scholarship || scholarship.status === "ARCHIVED") {
    throw new ApiError(404, "SCHOLARSHIP_NOT_FOUND", "Scholarship was not found");
  }
  if (req.body.applicationDeadline && new Date(req.body.applicationDeadline) <= new Date()) {
    throw new ApiError(400, "INVALID_SCHOLARSHIP_DEADLINE", "Deadline must be in the future");
  }

  Object.assign(scholarship, scholarshipPayload(req.body), { updatedBy: req.user.id });
  if (req.body.status === "OPEN") scholarship.publishedAt = scholarship.publishedAt || new Date();
  await scholarship.save();

  await logAudit({
    actor: req.user.id,
    action: "scholarship.updated",
    targetType: "scholarship",
    target: scholarship._id,
    newValue: { status: scholarship.status, title: scholarship.title },
    req,
  });

  return res.status(200).json(new ApiResponse("Scholarship updated successfully", { scholarship }));
});

exports.archiveScholarship = asyncHandler(async (req, res) => {
  const scholarship = await Scholarship.findByIdAndUpdate(
    req.params.scholarshipId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!scholarship) throw new ApiError(404, "SCHOLARSHIP_NOT_FOUND", "Scholarship was not found");

  await logAudit({
    actor: req.user.id,
    action: "scholarship.archived",
    targetType: "scholarship",
    target: scholarship._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Scholarship archived successfully", { scholarship }));
});

exports.applyForScholarship = asyncHandler(async (req, res) => {
  const scholarship = await Scholarship.findOne({
    _id: req.params.scholarshipId,
    status: "OPEN",
    applicationDeadline: { $gt: new Date() },
  });
  if (!scholarship) {
    throw new ApiError(404, "SCHOLARSHIP_NOT_OPEN", "Scholarship is not open for applications");
  }

  const uploaded = await uploadFiles(req.files?.documents || req.files?.document, process.env.CLOUDINARY_SCHOLARSHIP_FOLDER || "samaj/scholarships/documents");
  const bodyDocs = asArray(req.body.documents).map(assetFromBody).filter(Boolean);

  const application = await ScholarshipApplication.create({
    scholarship: scholarship._id,
    applicant: req.user.id,
    applicantName: req.body.applicantName,
    educationDetails: req.body.educationDetails,
    incomeDetails: req.body.incomeDetails,
    statement: req.body.statement,
    documents: [...bodyDocs, ...uploaded],
  });

  await logAudit({
    actor: req.user.id,
    action: "scholarship.application.submitted",
    targetType: "scholarshipApplication",
    target: application._id,
    newValue: { scholarship: scholarship._id, status: application.status },
    req,
  });

  return res.status(201).json(new ApiResponse("Scholarship application submitted successfully", { application }));
});

exports.listScholarshipApplications = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.params.scholarshipId) filter.scholarship = req.params.scholarshipId;
  if (req.query.status) filter.status = req.query.status;

  const { items, meta } = await paged(ScholarshipApplication, filter, req.query, { createdAt: -1 }, [
    { path: "applicant", select: "firstName lastName email imageUrl additionalDetails", populate: { path: "additionalDetails" } },
    { path: "scholarship", select: "title status applicationDeadline amount seats approvedCount" },
  ]);
  return res.status(200).json(new ApiResponse("Scholarship applications fetched successfully", { applications: items }, meta));
});

exports.listMyScholarshipApplications = asyncHandler(async (req, res) => {
  const filter = { applicant: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  const { items, meta } = await paged(ScholarshipApplication, filter, req.query, { createdAt: -1 }, {
    path: "scholarship",
    select: "title status applicationDeadline amount",
  });
  return res.status(200).json(new ApiResponse("My scholarship applications fetched successfully", { applications: items }, meta));
});

exports.reviewScholarshipApplication = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!["UNDER_REVIEW", "SHORTLISTED", "APPROVED", "REJECTED", "REOPENED"].includes(status)) {
    throw new ApiError(400, "INVALID_SCHOLARSHIP_APPLICATION_STATUS", "Invalid application status");
  }

  const application = await ScholarshipApplication.findById(req.params.applicationId).populate("scholarship");
  if (!application) throw new ApiError(404, "SCHOLARSHIP_APPLICATION_NOT_FOUND", "Scholarship application was not found");

  const scholarship = application.scholarship;
  if (status === "APPROVED" && application.status !== "APPROVED") {
    if (scholarship.seats && scholarship.approvedCount >= scholarship.seats) {
      throw new ApiError(409, "SCHOLARSHIP_SEATS_FULL", "No scholarship seats are available");
    }
    await Scholarship.findByIdAndUpdate(scholarship._id, { $inc: { approvedCount: 1 } });
  }
  if (application.status === "APPROVED" && status !== "APPROVED") {
    await Scholarship.findByIdAndUpdate(scholarship._id, { $inc: { approvedCount: -1 } });
  }

  const oldStatus = application.status;
  application.status = status;
  application.reviewedBy = req.user.id;
  application.reviewedAt = new Date();
  application.reviewReason = reason;
  await application.save();

  await notifyUser({
    recipient: application.applicant,
    title: "Scholarship application updated",
    message: `Your scholarship application for "${scholarship.title}" is now ${application.status}.`,
    metadata: { scholarship: scholarship._id, application: application._id, status: application.status, reason },
  });

  await logAudit({
    actor: req.user.id,
    action: "scholarship.application.reviewed",
    targetType: "scholarshipApplication",
    target: application._id,
    oldValue: { status: oldStatus },
    newValue: { status: application.status },
    reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Scholarship application reviewed successfully", { application }));
});

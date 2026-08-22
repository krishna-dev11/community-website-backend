# Phase 8 Scholarships And Jobs

Implemented backend APIs for scholarships and jobs/careers.

## Jobs

- `GET /api/v1/opportunities/jobs` lists published, non-expired jobs.
- `GET /api/v1/opportunities/admin/jobs` lists all jobs for job admins.
- `POST /api/v1/opportunities/jobs` lets members submit jobs. Jobs start as `PENDING_MODERATION`.
- `PATCH /api/v1/opportunities/jobs/:jobId` lets the poster edit unpublished jobs; admins can edit moderated jobs.
- `PATCH /api/v1/opportunities/admin/jobs/:jobId/moderate` supports `PUBLISH`, `REJECT`, `EXPIRE`, and `ARCHIVE`.
- `POST /api/v1/opportunities/jobs/:jobId/applications` lets members apply once per job.
- `GET /api/v1/opportunities/jobs/:jobId/applications` lets the poster or job admin review applicants.
- `PATCH /api/v1/opportunities/job-applications/:applicationId/status` supports applicant withdrawal and poster/admin review states.

## Scholarships

- `GET /api/v1/opportunities/scholarships` lists open scholarships before deadline.
- `GET /api/v1/opportunities/admin/scholarships` lists all scholarships for scholarship admins.
- `POST /api/v1/opportunities/scholarships` creates draft/open scholarships.
- `PATCH /api/v1/opportunities/scholarships/:scholarshipId` updates scholarship details.
- `PATCH /api/v1/opportunities/scholarships/:scholarshipId/archive` archives a scholarship.
- `POST /api/v1/opportunities/scholarships/:scholarshipId/applications` lets a member apply once before deadline.
- `GET /api/v1/opportunities/scholarships/:scholarshipId/applications` lists applications for admins.
- `GET /api/v1/opportunities/me/scholarship-applications` lists the caller's applications.
- `PATCH /api/v1/opportunities/scholarship-applications/:applicationId/review` moves applications through review states.

## Guarantees

- One job application per `(job, applicant)`.
- One scholarship application per `(scholarship, applicant)`.
- Scholarship deadlines are checked server-side at submit time.
- Scholarship approvals respect `seats` through an approved counter.
- Review/moderation mutations write audit logs and notify affected members.
- The scheduler checks hourly and expires published jobs plus closes scholarships past their deadline.

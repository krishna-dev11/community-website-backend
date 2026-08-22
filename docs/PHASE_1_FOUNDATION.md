# Phase 1 Foundation

This backend now has the first layer of the Samaj Community Platform foundation:

- Express entrypoint with request ids, CORS allowlist, JSON parsing, cookies, file upload, health check, existing auth/profile routes, 404 handling, and centralized error handling.
- MongoDB connection helper that fails fast when `MONGODB_URL` is missing or invalid.
- Shared API primitives in `Utilities/`: `ApiError`, `ApiResponse`, and `asyncHandler`.
- Permission map in `constants/permissions.js` matching the blueprint's code-level RBAC approach, with temporary compatibility roles for the existing legacy routes.
- Module placeholders under `modules/` for the Phase 2+ domain work.

The existing `Routes/`, `Controllers/`, and `Models/` folders are still active so current screens keep working while the platform is migrated module by module.

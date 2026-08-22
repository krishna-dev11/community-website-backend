# Phase 2 Auth And Registration

Implemented backend foundation for the blueprint's auth and registration flow.

## Current Flow

- `POST /api/v1/auth/sendOTP` sends an email OTP for a new email address.
- `POST /api/v1/auth/register` and legacy `POST /api/v1/auth/signUP` create `User` plus `profile` immediately.
- New non-admin applicants start with `accountStatus: PENDING` and cannot log in until reviewed.
- `POST /api/v1/auth/login` issues a 15-minute access token and a 30-day rotating refresh token cookie.
- `POST /api/v1/auth/refresh-token` rotates the refresh token and returns a new access token.
- `POST /api/v1/auth/logout` removes the current refresh-token session.
- `PUT /api/v1/auth/registration/resubmit` lets rejected/correction-requested applicants confirm email/password, update profile fields, and return to `PENDING`.
- `GET /api/v1/auth/registrations/pending` lists reviewable registrations for admins.
- `PATCH /api/v1/auth/registrations/:userId/review` accepts `{ "action": "APPROVE" | "REJECT" | "REQUEST_CORRECTION", "reason": "..." }`.

## Security Behavior

- Protected routes re-check the database for account status and token version on every request.
- Password login locks for 15 minutes after 5 failed attempts.
- Password change and password reset clear all sessions and increment `tokenVersion`.
- Pending, rejected, correction-requested, suspended, and deactivated accounts cannot receive usable login sessions.

## Compatibility Notes

- Existing route names are retained where possible.
- The existing `profile` collection is enhanced with member-profile fields instead of introducing a breaking collection migration in this phase.
- Legacy `Admin` users continue to work through a temporary wildcard permission mapping.

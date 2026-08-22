# Phase 7 Matrimonial Frontend

Implemented frontend integration for the existing matrimonial backend module.

## Member Flow

- `/matrimonial` is a protected member page.
- Members can create or update their own matrimonial profile.
- Submitted profiles go to `PENDING_REVIEW`.
- Members can pause, resume, or remove their own profile.
- Members can browse approved, members-only profiles.
- Members can express interest in another approved profile.
- Members can accept, reject, or withdraw interests.
- Accepted interests can request protected contact access.
- Profile owners can approve or reject contact requests.

## Admin Flow

- `/dashboard/admin/matrimonial` is available to Super Admin, legacy Admin, and Matrimonial Admin roles.
- Matrimonial admins can list and filter profiles.
- Admins can approve, reject, investigate, or archive profiles.
- Admins can list and review matrimonial reports.

## Security

- The frontend only reads approved profiles through protected member endpoints.
- Protected contact fields are controlled by backend response policy.
- Admin review uses the existing `matrimonial:review` and `matrimonial:moderate` permissions.

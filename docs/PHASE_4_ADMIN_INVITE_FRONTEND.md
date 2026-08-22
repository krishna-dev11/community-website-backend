# Phase 4 Admin Invite Frontend

Implemented frontend support for the existing secure admin invite backend flow.

## Super Admin Flow

- Registration Queue now includes an `Admin Invites` tab.
- Super Admin can create an invite by email and one or more admin roles.
- Super Admin can view recent invites and revoke pending invites.
- Invite creation uses `POST /api/v1/admin/invites`.
- Invite listing uses `GET /api/v1/admin/invites`.
- Invite revocation uses `PATCH /api/v1/admin/invites/:inviteId/revoke`.

## Invitee Flow

- `/admin-invite/:token` opens the invite activation page.
- Invitee enters first name, last name, password, and confirmation.
- Activation uses `POST /api/v1/admin/invites/accept`.
- After activation, the user is sent to login.

## Security

- There is still no public Super Admin signup page.
- Normal member registration is unchanged.
- Admin account creation remains token based and controlled by backend invite validation.
- Password hashing remains backend-owned through the existing bcrypt implementation.

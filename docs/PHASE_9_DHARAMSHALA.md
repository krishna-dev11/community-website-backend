# Phase 9 Dharamshala Booking

Implemented member booking requests and admin operations for Dharamshala availability.

## Member Flow

- `GET /api/v1/community/dharamshala/availability` checks requested dates against approved bookings and active admin blocks.
- `POST /api/v1/community/dharamshala/bookings` creates a `PENDING` booking request.
- `GET /api/v1/community/me/dharamshala/bookings` lists the caller's own bookings.
- `PATCH /api/v1/community/dharamshala/bookings/:bookingId/cancel` lets the requester or Dharamshala admin cancel a booking.

## Admin Flow

- `GET /api/v1/community/dharamshala/bookings` lists booking requests for admins.
- `PATCH /api/v1/community/dharamshala/bookings/:bookingId/review` supports `APPROVE` and `REJECT`.
- `POST /api/v1/community/dharamshala/blocked-dates` blocks date ranges for maintenance, events, or offline reservations.
- `GET /api/v1/community/dharamshala/blocked-dates` lists active blocked date ranges.
- `PATCH /api/v1/community/dharamshala/blocked-dates/:blockId/archive` archives a blocked range.

## Guarantees

- Booking date ranges are validated server-side.
- Blocked dates prevent new booking requests and admin approvals.
- Admin blocks cannot be created over already-approved bookings.
- Approval re-checks conflicts immediately before status change.
- Booking reviews and blocked-date mutations write audit logs.
- Frontend admin dashboard now exposes booking review, cancellation, and blocked-date management.

# Phase 6 Payments

Implemented backend APIs for donation campaigns, donations, monthly contributions, and Razorpay webhooks.

## Donation Campaigns

- `GET /api/v1/payments/donation-campaigns` lists active public campaigns.
- `GET /api/v1/payments/admin/donation-campaigns` lists all campaigns for treasurers/admins.
- `POST /api/v1/payments/donation-campaigns` creates a campaign.
- `PATCH /api/v1/payments/donation-campaigns/:campaignId` updates campaign details/status.
- `PATCH /api/v1/payments/donation-campaigns/:campaignId/archive` archives a campaign.

## Donations

- `POST /api/v1/payments/donations/orders` creates a server-side Razorpay order and stores a `PENDING` donation.
- `GET /api/v1/payments/donations` lists donations for treasurers/admins.
- `GET /api/v1/payments/me/donations` lists the caller's donations.
- `POST /api/v1/payments/webhooks/razorpay` verifies Razorpay signature and marks payments.

Donation status changes to `SUCCESS` only from a verified Razorpay webhook. The frontend never directly marks a donation successful.

## Monthly Contributions

- `POST /api/v1/payments/contributions/generate` generates one monthly record per active member.
- `GET /api/v1/payments/contributions` lists contribution records for treasurers/admins.
- `GET /api/v1/payments/me/contributions` lists the caller's records.
- `POST /api/v1/payments/contributions/:contributionId/orders` creates a Razorpay order for a member contribution.
- `PATCH /api/v1/payments/contributions/:contributionId/payments/offline` records cash/bank/cheque payments.
- `PATCH /api/v1/payments/contributions/:contributionId/waive` waives a contribution.
- `POST /api/v1/payments/contributions/mark-overdue` marks overdue records.

## Guarantees

- `WebhookEvent.eventId` is unique so Razorpay retries are idempotent.
- `Donation.razorpayOrderId` is unique.
- `MonthlyContribution(member, month, year)` is unique, so generation can be safely retried.
- Campaign raised amount increments only when a verified webhook marks donation success.
- Scheduler expires active campaigns and marks overdue contributions hourly.

# Phase 11 Achievements And Shradhanjali

Implemented frontend integration for member-submitted achievements and shradhanjali records.

## Public Flow

- `GET /api/v1/community/achievements` lists published achievements.
- `GET /api/v1/community/shradhanjalis` lists published shradhanjali records.
- `/achievements` and `/condolence` public pages now display those records.

## Member Flow

- Members can submit achievements from the Community Hub.
- Members can submit shradhanjali records from the Community Hub.
- Submitted records start as `PENDING` and wait for moderator review.

## Moderator Flow

- `GET /api/v1/community/admin/achievements` lists non-archived achievement records for reviewers.
- `GET /api/v1/community/admin/shradhanjalis` lists non-archived shradhanjali records for reviewers.
- Moderators can publish, reject, or archive records from Community Admin.

## Security

- Public listing routes only return published records.
- Admin review listings require authentication and `achievement:review` or `shradhanjali:review`.
- Public `?admin=true` access is rejected unless the request has passed auth middleware.

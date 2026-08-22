# Phase 11 Notifications

Implemented notification delivery APIs and frontend notification center.

## Backend

- `GET /api/v1/notifications` lists the logged-in member's in-app notifications.
- `PATCH /api/v1/notifications/:notificationId/read` marks one notification as read.
- `PATCH /api/v1/notifications/read-all` marks all unread in-app notifications as read.
- `NotificationService.notifyUser` is available for modules that need in-app and optional email delivery.

## Frontend

- `/notifications` is now a protected page.
- Members can filter all, unread, and read notifications.
- Members can mark a single notification as read.
- Members can mark all unread notifications as read.
- Notification links open their target when present.
- `/discussion` now opens the protected Community Hub so the navbar discussion link is live.

## Guarantees

- Users only see notifications where they are the recipient.
- Read mutations are scoped to the logged-in user.
- Email failures are logged as failed email-channel notifications without blocking in-app delivery.

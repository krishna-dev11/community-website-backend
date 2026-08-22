# Phase 3 Member Profile And Family System

Implemented the first backend pass for member profiles, directory privacy, family creation, membership, and join requests.

## Member Profile

- `PUT /api/v1/profile/updateProfile` updates the logged-in member's user/profile fields.
- `GET /api/v1/profile/getAllUserDetails` returns the logged-in member with profile and active family membership.
- `GET /api/v1/profile/directory` returns active members with field-level privacy projection.
- `PUT /api/v1/profile/updateDisplayPicture` uploads and stores a profile image URL.
- `DELETE /api/v1/profile/deleteAccount` deactivates/anonymizes the account instead of hard-deleting it.

## Family API

- `POST /api/v1/families` creates a family and makes the creator `FAMILY_ADMIN`.
- `GET /api/v1/families/me` returns the caller's active family, membership, and members.
- `GET /api/v1/families/search?familyCode=&sssmId=&state=&q=` searches active families.
- `POST /api/v1/families/:familyId/join-requests` submits a join request.
- `GET /api/v1/families/:familyId/join-requests` lists pending join requests for the family admin.
- `PATCH /api/v1/families/:familyId/join-requests/:requestId` approves or rejects a join request.
- `PATCH /api/v1/families/:familyId/admin` transfers family admin role to another active family member.

## Data Guarantees

- `Family.familyCode` is unique.
- `Family.sssmId + state` is unique.
- A member can have only one active family membership.
- A member can have only one pending join request per family.
- Join-request approval re-checks whether the requester joined another family before creating membership.

## Notes

- Existing `profile` is enhanced as the member-profile document for now.
- Family password is intentionally not implemented as a direct join gate; members must request and be approved.
- Account deletion now follows the blueprint's non-destructive approach.

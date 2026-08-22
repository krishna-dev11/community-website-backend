# Phase 5 Content Modules

Implemented backend APIs for public/community content that can be managed by `CONTENT_ADMIN` or `SUPER_ADMIN`.

## Notices

- `GET /api/v1/content/notices` lists published, non-expired notices.
- `GET /api/v1/content/admin/notices` lists all notices for content admins.
- `POST /api/v1/content/notices` creates draft/published notices.
- `PATCH /api/v1/content/notices/:noticeId` updates notice details and attachments.
- `PATCH /api/v1/content/notices/:noticeId/publish` publishes a draft notice.
- `PATCH /api/v1/content/notices/:noticeId/archive` archives a notice.

## Publications / Patrika

- `GET /api/v1/content/publications` lists published/updated publications.
- `GET /api/v1/content/admin/publications` lists all publications for content admins.
- `POST /api/v1/content/publications` creates a publication with file/cover metadata or uploads.
- `PATCH /api/v1/content/publications/:publicationId` updates metadata or uploads a new version.
- `PATCH /api/v1/content/publications/:publicationId/publish` publishes a publication.
- `PATCH /api/v1/content/publications/:publicationId/archive` archives it.
- `POST /api/v1/content/publications/:publicationId/download` increments `downloadCount`.

## Management Team, CMS, Gotra

- `GET /api/v1/content/management` lists active management members.
- `POST /api/v1/content/management` and `PATCH /api/v1/content/management/:memberId` save management records.
- `PATCH /api/v1/content/management/:memberId/archive` archives old records.
- `GET /api/v1/content/cms/:key` reads editable pages such as history/about/mission.
- `PUT /api/v1/content/cms/:key` upserts CMS content.
- `GET /api/v1/content/gotras` lists active gotra master data.
- `POST/PATCH /api/v1/content/gotras` saves gotras.
- `PATCH /api/v1/content/gotras/:gotraId/archive` archives gotras.

## Gallery

- `GET /api/v1/content/gallery/albums` lists published albums.
- `POST /api/v1/content/gallery/albums` creates an album.
- `PATCH /api/v1/content/gallery/albums/:albumId` updates album metadata/status.
- `PATCH /api/v1/content/gallery/albums/:albumId/archive` archives album and photos.
- `GET /api/v1/content/gallery/albums/:albumId/photos` lists album photos.
- `POST /api/v1/content/gallery/albums/:albumId/photos` adds up to 50 photos.
- `PATCH /api/v1/content/gallery/albums/:albumId/photos/:photoId/archive` archives a photo.

All admin mutations write audit logs and archive records instead of hard-deleting them.

The scheduler checks hourly and moves expired published notices to `EXPIRED`.

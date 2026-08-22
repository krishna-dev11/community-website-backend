const express = require("express");
const {
  listNotices,
  listNoticesAdmin,
  createNotice,
  updateNotice,
  publishNotice,
  archiveNotice,
  listPublications,
  listPublicationsAdmin,
  createPublication,
  updatePublication,
  publishPublication,
  archivePublication,
  trackPublicationDownload,
  listManagementMembers,
  upsertManagementMember,
  archiveManagementMember,
  getCmsContent,
  upsertCmsContent,
  listGotras,
  upsertGotra,
  archiveGotra,
  listGalleryAlbums,
  createGalleryAlbum,
  updateGalleryAlbum,
  archiveGalleryAlbum,
  listGalleryPhotos,
  addGalleryPhotos,
  archiveGalleryPhoto,
} = require("../Controllers/Content");
const { auth, authorize } = require("../Middlewares/auth");

const router = express.Router();

router.get("/notices", listNotices);
router.get("/admin/notices", auth, authorize("notice:read"), listNoticesAdmin);
router.post("/notices", auth, authorize("notice:create"), createNotice);
router.patch("/notices/:noticeId", auth, authorize("notice:update"), updateNotice);
router.patch("/notices/:noticeId/publish", auth, authorize("notice:publish"), publishNotice);
router.patch("/notices/:noticeId/archive", auth, authorize("notice:archive"), archiveNotice);

router.get("/publications", listPublications);
router.get("/admin/publications", auth, authorize("publication:read"), listPublicationsAdmin);
router.post("/publications", auth, authorize("publication:create"), createPublication);
router.patch("/publications/:publicationId", auth, authorize("publication:update"), updatePublication);
router.patch("/publications/:publicationId/publish", auth, authorize("publication:publish"), publishPublication);
router.patch("/publications/:publicationId/archive", auth, authorize("publication:archive"), archivePublication);
router.post("/publications/:publicationId/download", trackPublicationDownload);

router.get("/management", listManagementMembers);
router.post("/management", auth, authorize("management:create"), upsertManagementMember);
router.patch("/management/:memberId", auth, authorize("management:update"), upsertManagementMember);
router.patch("/management/:memberId/archive", auth, authorize("management:archive"), archiveManagementMember);

router.get("/cms/:key", getCmsContent);
router.put("/cms/:key", auth, authorize("cms:update"), upsertCmsContent);

router.get("/gotras", listGotras);
router.post("/gotras", auth, authorize("cms:update"), upsertGotra);
router.patch("/gotras/:gotraId", auth, authorize("cms:update"), upsertGotra);
router.patch("/gotras/:gotraId/archive", auth, authorize("cms:update"), archiveGotra);

router.get("/gallery/albums", listGalleryAlbums);
router.post("/gallery/albums", auth, authorize("gallery:create"), createGalleryAlbum);
router.patch("/gallery/albums/:albumId", auth, authorize("gallery:update"), updateGalleryAlbum);
router.patch("/gallery/albums/:albumId/archive", auth, authorize("gallery:archive"), archiveGalleryAlbum);
router.get("/gallery/albums/:albumId/photos", listGalleryPhotos);
router.post("/gallery/albums/:albumId/photos", auth, authorize("gallery:create"), addGalleryPhotos);
router.patch("/gallery/albums/:albumId/photos/:photoId/archive", auth, authorize("gallery:archive"), archiveGalleryPhoto);

module.exports = router;

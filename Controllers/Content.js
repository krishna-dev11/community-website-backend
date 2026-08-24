const Notice = require("../Models/notice");
const Publication = require("../Models/publication");
const ManagementMember = require("../Models/managementMember");
const CMSContent = require("../Models/cmsContent");
const Gotra = require("../Models/gotra");
const GalleryAlbum = require("../Models/galleryAlbum");
const GalleryPhoto = require("../Models/galleryPhoto");
const ApiError = require("../Utilities/ApiError");
const ApiResponse = require("../Utilities/ApiResponse");
const asyncHandler = require("../Utilities/asyncHandler");
const { logAudit } = require("../Utilities/auditService");
const { uploadImageToCloudinary, uploadPublicationPdf } = require("../Utilities/uploadImageToCloudinary");

function pageOptions(query) {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
}

function textFilter(q) {
  return q ? { $text: { $search: String(q).trim() } } : {};
}

async function paged(Model, filter, query, sort = { createdAt: -1 }, populate = null) {
  const { page, limit, skip } = pageOptions(query);
  let findQuery = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) findQuery = findQuery.populate(populate);

  const [items, total] = await Promise.all([
    findQuery,
    Model.countDocuments(filter),
  ]);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

function publicFilter(statusField = "status") {
  return {
    [statusField]: "PUBLISHED",
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  };
}

function assetFromCloudinary(upload, fallbackName) {
  if (!upload) return undefined;
  return {
    url: upload.secure_url,
    publicId: upload.public_id,
    size: upload.bytes,
    mimeType: upload.resource_type,
    name: fallbackName,
  };
}

function assetFromBody(asset) {
  if (!asset?.url) return undefined;
  return {
    url: asset.url,
    publicId: asset.publicId,
    size: asset.size,
    mimeType: asset.mimeType,
    name: asset.name,
  };
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function uploadFiles(files, folder) {
  const uploaded = [];
  for (const file of asArray(files)) {
    const result = await uploadImageToCloudinary(file, folder);
    if (!result?.secure_url) {
      throw new ApiError(500, "FILE_UPLOAD_FAILED", "Could not upload file");
    }
    uploaded.push(assetFromCloudinary(result, file.name));
  }
  return uploaded;
}

async function uploadPublicationFiles(files, folder) {
  const uploaded = [];
  for (const file of asArray(files)) {
    const result = await uploadPublicationPdf(file, folder);
    if (!result?.secure_url) {
      throw new ApiError(500, "FILE_UPLOAD_FAILED", "Could not upload publication file");
    }
    uploaded.push(assetFromCloudinary(result, file.originalname || file.name));
  }
  return uploaded;
}

function assertPublishWindow(expiresAt) {
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    throw new ApiError(400, "INVALID_EXPIRY", "Expiry date must be in the future");
  }
}

function noticePayload(body) {
  const payload = {};
  ["title", "description", "category", "expiresAt"].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
}

exports.listNotices = asyncHandler(async (req, res) => {
  const filter = {
    ...publicFilter(),
    ...textFilter(req.query.q),
  };
  if (req.query.category) filter.category = String(req.query.category).trim();

  const { items, meta } = await paged(Notice, filter, req.query, { publishedAt: -1, createdAt: -1 });
  return res.status(200).json(new ApiResponse("Notices fetched successfully", { notices: items }, meta));
});

exports.listNoticesAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = String(req.query.category).trim();

  const { items, meta } = await paged(Notice, filter, req.query, { createdAt: -1 }, [
    { path: "createdBy", select: "firstName lastName email" },
    { path: "updatedBy", select: "firstName lastName email" },
  ]);
  return res.status(200).json(new ApiResponse("Admin notices fetched successfully", { notices: items }, meta));
});

exports.createNotice = asyncHandler(async (req, res) => {
  assertPublishWindow(req.body.expiresAt);
  const attachments = [
    ...asArray(req.body.attachments).map(assetFromBody).filter(Boolean),
    ...await uploadFiles(req.files?.attachments, process.env.CLOUDINARY_NOTICE_FOLDER || "samaj/notices"),
  ];

  const notice = await Notice.create({
    ...noticePayload(req.body),
    attachments,
    status: req.body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    publishedAt: req.body.status === "PUBLISHED" ? new Date() : undefined,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "notice.created",
    targetType: "notice",
    target: notice._id,
    newValue: { status: notice.status, title: notice.title },
    req,
  });

  return res.status(201).json(new ApiResponse("Notice created successfully", { notice }));
});

exports.updateNotice = asyncHandler(async (req, res) => {
  assertPublishWindow(req.body.expiresAt);
  const notice = await Notice.findById(req.params.noticeId);
  if (!notice || notice.status === "ARCHIVED") {
    throw new ApiError(404, "NOTICE_NOT_FOUND", "Notice was not found");
  }

  const oldValue = notice.toObject();
  Object.assign(notice, noticePayload(req.body), { updatedBy: req.user.id });

  const uploaded = await uploadFiles(req.files?.attachments, process.env.CLOUDINARY_NOTICE_FOLDER || "samaj/notices");
  const bodyAttachments = asArray(req.body.attachments).map(assetFromBody).filter(Boolean);
  if (uploaded.length || bodyAttachments.length) {
    notice.attachments.push(...bodyAttachments, ...uploaded);
  }

  await notice.save();
  await logAudit({
    actor: req.user.id,
    action: "notice.updated",
    targetType: "notice",
    target: notice._id,
    oldValue: { title: oldValue.title, status: oldValue.status },
    newValue: { title: notice.title, status: notice.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Notice updated successfully", { notice }));
});

exports.publishNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findById(req.params.noticeId);
  if (!notice || notice.status === "ARCHIVED") {
    throw new ApiError(404, "NOTICE_NOT_FOUND", "Notice was not found");
  }
  assertPublishWindow(notice.expiresAt);

  const oldStatus = notice.status;
  notice.status = "PUBLISHED";
  notice.publishedAt = notice.publishedAt || new Date();
  notice.updatedBy = req.user.id;
  await notice.save();

  await logAudit({
    actor: req.user.id,
    action: "notice.published",
    targetType: "notice",
    target: notice._id,
    oldValue: { status: oldStatus },
    newValue: { status: notice.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Notice published successfully", { notice }));
});

exports.archiveNotice = asyncHandler(async (req, res) => {
  const notice = await Notice.findByIdAndUpdate(
    req.params.noticeId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );

  if (!notice) throw new ApiError(404, "NOTICE_NOT_FOUND", "Notice was not found");

  await logAudit({
    actor: req.user.id,
    action: "notice.archived",
    targetType: "notice",
    target: notice._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Notice archived successfully", { notice }));
});

function publicationPayload(body) {
  const payload = {};
  ["title", "description", "month", "year", "edition"].forEach((field) => {
    if (body[field] !== undefined) payload[field] = body[field];
  });
  return payload;
}

exports.listPublications = asyncHandler(async (req, res) => {
  const filter = {
    status: { $in: ["PUBLISHED", "UPDATED"] },
    ...textFilter(req.query.q),
  };
  if (req.query.year) filter.year = Number(req.query.year);
  if (req.query.month) filter.month = Number(req.query.month);

  const { items, meta } = await paged(Publication, filter, req.query, { year: -1, month: -1, publishedAt: -1 });
  return res.status(200).json(new ApiResponse("Publications fetched successfully", { publications: items }, meta));
});

exports.listPublicationsAdmin = asyncHandler(async (req, res) => {
  const filter = { ...textFilter(req.query.q) };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.year) filter.year = Number(req.query.year);

  const { items, meta } = await paged(Publication, filter, req.query, { createdAt: -1 });
  return res.status(200).json(new ApiResponse("Admin publications fetched successfully", { publications: items }, meta));
});

exports.createPublication = asyncHandler(async (req, res) => {
  // PDF goes through uploadPublicationPdf (supports application/pdf)
  // Cover image goes through uploadImageToCloudinary (images only)
  const fileUpload = (await uploadPublicationFiles(req.files?.file, process.env.CLOUDINARY_PUBLICATION_FOLDER || "samaj/publications"))[0];
  const coverUpload = (await uploadFiles(req.files?.coverImage, process.env.CLOUDINARY_PUBLICATION_FOLDER || "samaj/publications/covers"))[0];
  const file = fileUpload || assetFromBody(req.body.file);
  const coverImage = coverUpload || assetFromBody(req.body.coverImage);

  const publication = await Publication.create({
    ...publicationPayload(req.body),
    file,
    coverImage,
    status: req.body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    publishedAt: req.body.status === "PUBLISHED" ? new Date() : undefined,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "publication.created",
    targetType: "publication",
    target: publication._id,
    newValue: { title: publication.title, status: publication.status },
    req,
  });

  return res.status(201).json(new ApiResponse("Publication created successfully", { publication }));
});

exports.updatePublication = asyncHandler(async (req, res) => {
  const publication = await Publication.findById(req.params.publicationId);
  if (!publication || publication.status === "ARCHIVED") {
    throw new ApiError(404, "PUBLICATION_NOT_FOUND", "Publication was not found");
  }

  const oldStatus = publication.status;
  const nextFile = (await uploadPublicationFiles(req.files?.file, process.env.CLOUDINARY_PUBLICATION_FOLDER || "samaj/publications"))[0] || assetFromBody(req.body.file);
  const nextCover = (await uploadFiles(req.files?.coverImage, process.env.CLOUDINARY_PUBLICATION_FOLDER || "samaj/publications/covers"))[0] || assetFromBody(req.body.coverImage);

  Object.assign(publication, publicationPayload(req.body), { updatedBy: req.user.id });

  if (nextFile || nextCover) {
    publication.versionHistory.push({
      file: publication.file,
      coverImage: publication.coverImage,
      version: publication.version,
      uploadedBy: req.user.id,
    });
    if (nextFile) publication.file = nextFile;
    if (nextCover) publication.coverImage = nextCover;
    publication.version += 1;
    if (publication.status === "PUBLISHED") publication.status = "UPDATED";
  }

  await publication.save();
  await logAudit({
    actor: req.user.id,
    action: "publication.updated",
    targetType: "publication",
    target: publication._id,
    oldValue: { status: oldStatus },
    newValue: { status: publication.status, version: publication.version },
    req,
  });

  return res.status(200).json(new ApiResponse("Publication updated successfully", { publication }));
});

exports.publishPublication = asyncHandler(async (req, res) => {
  const publication = await Publication.findById(req.params.publicationId);
  if (!publication || publication.status === "ARCHIVED") {
    throw new ApiError(404, "PUBLICATION_NOT_FOUND", "Publication was not found");
  }

  const oldStatus = publication.status;
  publication.status = publication.status === "UPDATED" ? "UPDATED" : "PUBLISHED";
  publication.publishedAt = publication.publishedAt || new Date();
  publication.updatedBy = req.user.id;
  await publication.save();

  await logAudit({
    actor: req.user.id,
    action: "publication.published",
    targetType: "publication",
    target: publication._id,
    oldValue: { status: oldStatus },
    newValue: { status: publication.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Publication published successfully", { publication }));
});

exports.archivePublication = asyncHandler(async (req, res) => {
  const publication = await Publication.findByIdAndUpdate(
    req.params.publicationId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );

  if (!publication) throw new ApiError(404, "PUBLICATION_NOT_FOUND", "Publication was not found");

  await logAudit({
    actor: req.user.id,
    action: "publication.archived",
    targetType: "publication",
    target: publication._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Publication archived successfully", { publication }));
});

exports.trackPublicationDownload = asyncHandler(async (req, res) => {
  const publication = await Publication.findOneAndUpdate(
    {
      _id: req.params.publicationId,
      status: { $in: ["PUBLISHED", "UPDATED"] },
    },
    { $inc: { downloadCount: 1 } },
    { new: true }
  );

  if (!publication) throw new ApiError(404, "PUBLICATION_NOT_FOUND", "Publication was not found");
  return res.status(200).json(new ApiResponse("Download tracked successfully", { publication }));
});

exports.listManagementMembers = asyncHandler(async (req, res) => {
  const filter = {
    status: req.query.includePast === "true" ? { $in: ["ACTIVE", "PAST"] } : "ACTIVE",
    ...textFilter(req.query.q),
  };

  const { items, meta } = await paged(ManagementMember, filter, req.query, { displayOrder: 1, termStart: -1 });
  return res.status(200).json(new ApiResponse("Management members fetched successfully", { members: items }, meta));
});

exports.upsertManagementMember = asyncHandler(async (req, res) => {
  const imageUpload = (await uploadFiles(req.files?.image, process.env.CLOUDINARY_MANAGEMENT_FOLDER || "samaj/management"))[0];
  const image = imageUpload || assetFromBody(req.body.image);
  const payload = {};
  ["name", "roleTitle", "bio", "phone", "email", "displayOrder", "termStart", "termEnd", "status"].forEach((field) => {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  });
  if (image) payload.image = image;

  let member;
  if (req.params.memberId) {
    member = await ManagementMember.findByIdAndUpdate(
      req.params.memberId,
      { ...payload, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );
    if (!member) throw new ApiError(404, "MANAGEMENT_MEMBER_NOT_FOUND", "Management member was not found");
  } else {
    member = await ManagementMember.create({ ...payload, createdBy: req.user.id, updatedBy: req.user.id });
  }

  await logAudit({
    actor: req.user.id,
    action: req.params.memberId ? "management.updated" : "management.created",
    targetType: "managementMember",
    target: member._id,
    newValue: { name: member.name, status: member.status },
    req,
  });

  return res.status(req.params.memberId ? 200 : 201).json(new ApiResponse("Management member saved successfully", { member }));
});

exports.archiveManagementMember = asyncHandler(async (req, res) => {
  const member = await ManagementMember.findByIdAndUpdate(
    req.params.memberId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!member) throw new ApiError(404, "MANAGEMENT_MEMBER_NOT_FOUND", "Management member was not found");

  await logAudit({
    actor: req.user.id,
    action: "management.archived",
    targetType: "managementMember",
    target: member._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Management member archived successfully", { member }));
});

exports.getCmsContent = asyncHandler(async (req, res) => {
  const content = await CMSContent.findOne({
    key: String(req.params.key).trim().toLowerCase(),
    status: { $ne: "ARCHIVED" },
  });
  if (!content) throw new ApiError(404, "CMS_CONTENT_NOT_FOUND", "Content was not found");
  return res.status(200).json(new ApiResponse("Content fetched successfully", { content }));
});

exports.upsertCmsContent = asyncHandler(async (req, res) => {
  const key = String(req.params.key || req.body.key || "").trim().toLowerCase();
  if (!key || !req.body.title || !req.body.body) {
    throw new ApiError(400, "CMS_FIELDS_REQUIRED", "Key, title, and body are required");
  }

  const content = await CMSContent.findOneAndUpdate(
    { key },
    {
      key,
      title: req.body.title,
      body: req.body.body,
      summary: req.body.summary,
      status: req.body.status || "PUBLISHED",
      updatedBy: req.user.id,
    },
    { new: true, upsert: true, runValidators: true }
  );

  await logAudit({
    actor: req.user.id,
    action: "cms.upserted",
    targetType: "cmsContent",
    target: content._id,
    newValue: { key: content.key, status: content.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Content saved successfully", { content }));
});

exports.listGotras = asyncHandler(async (req, res) => {
  const filter = {
    status: "ACTIVE",
    ...textFilter(req.query.q),
  };
  if (req.query.region) filter.region = String(req.query.region).trim();

  const { items, meta } = await paged(Gotra, filter, req.query, { name: 1 });
  return res.status(200).json(new ApiResponse("Gotras fetched successfully", { gotras: items }, meta));
});

exports.upsertGotra = asyncHandler(async (req, res) => {
  const payload = {};
  ["name", "region", "description", "status"].forEach((field) => {
    if (req.body[field] !== undefined) payload[field] = req.body[field];
  });

  let gotra;
  if (req.params.gotraId) {
    gotra = await Gotra.findByIdAndUpdate(
      req.params.gotraId,
      { ...payload, updatedBy: req.user.id },
      { new: true, runValidators: true }
    );
    if (!gotra) throw new ApiError(404, "GOTRA_NOT_FOUND", "Gotra was not found");
  } else {
    gotra = await Gotra.create({ ...payload, createdBy: req.user.id, updatedBy: req.user.id });
  }

  await logAudit({
    actor: req.user.id,
    action: req.params.gotraId ? "gotra.updated" : "gotra.created",
    targetType: "gotra",
    target: gotra._id,
    newValue: { name: gotra.name, status: gotra.status },
    req,
  });

  return res.status(req.params.gotraId ? 200 : 201).json(new ApiResponse("Gotra saved successfully", { gotra }));
});

exports.archiveGotra = asyncHandler(async (req, res) => {
  const gotra = await Gotra.findByIdAndUpdate(
    req.params.gotraId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!gotra) throw new ApiError(404, "GOTRA_NOT_FOUND", "Gotra was not found");

  await logAudit({
    actor: req.user.id,
    action: "gotra.archived",
    targetType: "gotra",
    target: gotra._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Gotra archived successfully", { gotra }));
});

exports.listGalleryAlbums = asyncHandler(async (req, res) => {
  const filter = {
    status: req.query.admin === "true" ? { $ne: "ARCHIVED" } : "PUBLISHED",
    ...textFilter(req.query.q),
  };

  const { items, meta } = await paged(GalleryAlbum, filter, req.query, { displayOrder: 1, eventDate: -1, createdAt: -1 });
  return res.status(200).json(new ApiResponse("Gallery albums fetched successfully", { albums: items }, meta));
});

exports.createGalleryAlbum = asyncHandler(async (req, res) => {
  const coverUpload = (await uploadFiles(req.files?.coverImage, process.env.CLOUDINARY_GALLERY_FOLDER || "samaj/gallery"))[0];
  const coverImage = coverUpload || assetFromBody(req.body.coverImage);
  const album = await GalleryAlbum.create({
    title: req.body.title,
    description: req.body.description,
    eventDate: req.body.eventDate,
    coverImage,
    displayOrder: req.body.displayOrder,
    status: req.body.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });

  await logAudit({
    actor: req.user.id,
    action: "gallery.album.created",
    targetType: "galleryAlbum",
    target: album._id,
    newValue: { title: album.title, status: album.status },
    req,
  });

  return res.status(201).json(new ApiResponse("Gallery album created successfully", { album }));
});

exports.updateGalleryAlbum = asyncHandler(async (req, res) => {
  const album = await GalleryAlbum.findById(req.params.albumId);
  if (!album || album.status === "ARCHIVED") {
    throw new ApiError(404, "GALLERY_ALBUM_NOT_FOUND", "Gallery album was not found");
  }

  ["title", "description", "eventDate", "displayOrder", "status"].forEach((field) => {
    if (req.body[field] !== undefined) album[field] = req.body[field];
  });
  const coverUpload = (await uploadFiles(req.files?.coverImage, process.env.CLOUDINARY_GALLERY_FOLDER || "samaj/gallery"))[0];
  const coverImage = coverUpload || assetFromBody(req.body.coverImage);
  if (coverImage) album.coverImage = coverImage;
  album.updatedBy = req.user.id;
  await album.save();

  await logAudit({
    actor: req.user.id,
    action: "gallery.album.updated",
    targetType: "galleryAlbum",
    target: album._id,
    newValue: { title: album.title, status: album.status },
    req,
  });

  return res.status(200).json(new ApiResponse("Gallery album updated successfully", { album }));
});

exports.archiveGalleryAlbum = asyncHandler(async (req, res) => {
  const album = await GalleryAlbum.findByIdAndUpdate(
    req.params.albumId,
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!album) throw new ApiError(404, "GALLERY_ALBUM_NOT_FOUND", "Gallery album was not found");

  await GalleryPhoto.updateMany(
    { album: album._id, status: "PUBLISHED" },
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason || "Album archived",
    }
  );

  await logAudit({
    actor: req.user.id,
    action: "gallery.album.archived",
    targetType: "galleryAlbum",
    target: album._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Gallery album archived successfully", { album }));
});

exports.listGalleryPhotos = asyncHandler(async (req, res) => {
  const album = await GalleryAlbum.findOne({
    _id: req.params.albumId,
    status: req.query.admin === "true" ? { $ne: "ARCHIVED" } : "PUBLISHED",
  });
  if (!album) throw new ApiError(404, "GALLERY_ALBUM_NOT_FOUND", "Gallery album was not found");

  const filter = {
    album: album._id,
    status: req.query.admin === "true" ? { $ne: "ARCHIVED" } : "PUBLISHED",
  };
  const { items, meta } = await paged(GalleryPhoto, filter, req.query, { displayOrder: 1, createdAt: -1 });
  return res.status(200).json(new ApiResponse("Gallery photos fetched successfully", { album, photos: items }, meta));
});

exports.addGalleryPhotos = asyncHandler(async (req, res) => {
  const album = await GalleryAlbum.findById(req.params.albumId);
  if (!album || album.status === "ARCHIVED") {
    throw new ApiError(404, "GALLERY_ALBUM_NOT_FOUND", "Gallery album was not found");
  }

  const uploaded = await uploadFiles(req.files?.photos || req.files?.photo, process.env.CLOUDINARY_GALLERY_FOLDER || "samaj/gallery");
  const bodyPhotos = asArray(req.body.photos).map(assetFromBody).filter(Boolean);
  const assets = [...bodyPhotos, ...uploaded];
  if (assets.length === 0) {
    throw new ApiError(400, "PHOTOS_REQUIRED", "At least one photo is required");
  }

  const currentCount = await GalleryPhoto.countDocuments({ album: album._id, status: { $ne: "ARCHIVED" } });
  if (currentCount + assets.length > 10) {
    throw new ApiError(400, "ALBUM_MAX_PHOTOS_EXCEEDED", `An album can hold a maximum of 10 photos. This album currently has ${currentCount} photo(s). You can upload at most ${Math.max(0, 10 - currentCount)} more.`);
  }

  const photos = await GalleryPhoto.insertMany(assets.map((asset, index) => ({
    album: album._id,
    title: req.body.title,
    caption: req.body.caption,
    image: asset,
    displayOrder: Number(req.body.displayOrder || 0) + index,
    uploadedBy: req.user.id,
  })));

  album.photoCount = await GalleryPhoto.countDocuments({ album: album._id, status: { $ne: "ARCHIVED" } });
  if (!album.coverImage?.url) album.coverImage = photos[0].image;
  await album.save();

  await logAudit({
    actor: req.user.id,
    action: "gallery.photos.added",
    targetType: "galleryAlbum",
    target: album._id,
    newValue: { count: photos.length },
    req,
  });

  return res.status(201).json(new ApiResponse("Gallery photos added successfully", { photos }));
});

exports.archiveGalleryPhoto = asyncHandler(async (req, res) => {
  const photo = await GalleryPhoto.findOneAndUpdate(
    {
      _id: req.params.photoId,
      album: req.params.albumId,
    },
    {
      status: "ARCHIVED",
      archivedAt: new Date(),
      archivedBy: req.user.id,
      archiveReason: req.body.reason,
    },
    { new: true }
  );
  if (!photo) throw new ApiError(404, "GALLERY_PHOTO_NOT_FOUND", "Gallery photo was not found");

  await GalleryAlbum.findByIdAndUpdate(req.params.albumId, { $inc: { photoCount: -1 } });
  await logAudit({
    actor: req.user.id,
    action: "gallery.photo.archived",
    targetType: "galleryPhoto",
    target: photo._id,
    reason: req.body.reason,
    req,
  });

  return res.status(200).json(new ApiResponse("Gallery photo archived successfully", { photo }));
});

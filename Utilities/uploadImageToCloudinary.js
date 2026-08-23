const cloudinary = require("cloudinary").v2;
const ApiError = require("./ApiError");

const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

const ALLOWED_DOC_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function validateUploadFile(file, { maxSizeMB = 10, allowedMimes = ALLOWED_IMAGE_MIMES } = {}) {
  if (!file) {
    throw new ApiError(400, "FILE_REQUIRED", "Please select a file to upload");
  }

  const mime = (file.mimetype || file.type || "").toLowerCase();
  const fileName = (file.name || file.originalname || "").toLowerCase();
  const fileExt = fileName.split(".").pop();

  const isMimeAllowed = allowedMimes.includes(mime);
  const isPdfExtension = (fileExt === "pdf") && allowedMimes.includes("application/pdf");
  const isImageExtension = ["jpg", "jpeg", "png", "webp"].includes(fileExt) && allowedMimes.some(m => m.startsWith("image/"));

  if (!isMimeAllowed && !isPdfExtension && !isImageExtension) {
    throw new ApiError(
      400,
      "INVALID_FILE_TYPE",
      `Invalid file format: ${mime || fileExt}. Allowed formats: ${allowedMimes.map((m) => m.split("/")[1] || m).join(", ")}`
    );
  }

  const maxBytes = maxSizeMB * 1024 * 1024;
  if (file.size && file.size > maxBytes) {
    throw new ApiError(
      400,
      "FILE_TOO_LARGE",
      `File size exceeds maximum allowed limit of ${maxSizeMB}MB`
    );
  }

  return true;
}

async function uploadImageToCloudinary(file, folder = "samaj/general", height, quality, isPrivate = false) {
  try {
    validateUploadFile(file, { maxSizeMB: 10, allowedMimes: ALLOWED_IMAGE_MIMES });

    const options = {
      folder,
      resource_type: "auto",
    };

    if (quality) options.quality = quality;
    if (height) options.height = height;
    if (isPrivate) {
      options.type = "authenticated";
    }

    const filePath = file.tempFilePath || file.path;
    if (!filePath) {
      throw new ApiError(400, "FILE_READ_ERROR", "Uploaded file temporary path not found");
    }

    const result = await cloudinary.uploader.upload(filePath, options);
    return result;
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "UPLOAD_FAILED", error.message || "Failed to upload image to Cloudinary");
  }
}

async function uploadDocumentToCloudinary(file, folder = "samaj/documents", isPrivate = true) {
  try {
    validateUploadFile(file, { maxSizeMB: 15, allowedMimes: ALLOWED_DOC_MIMES });

    const options = {
      folder,
      resource_type: "auto",
    };

    if (isPrivate) {
      options.type = "authenticated";
    }

    const filePath = file.tempFilePath || file.path;
    if (!filePath) {
      throw new ApiError(400, "FILE_READ_ERROR", "Uploaded document temporary path not found");
    }

    const result = await cloudinary.uploader.upload(filePath, options);
    return result;
  } catch (error) {
    console.error("Cloudinary document upload error:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "UPLOAD_FAILED", error.message || "Failed to upload document to Cloudinary");
  }
}

function assetMetadata(uploadResult, originalName) {
  if (!uploadResult) return undefined;
  return {
    url: uploadResult.secure_url || uploadResult.url,
    publicId: uploadResult.public_id,
    size: uploadResult.bytes || uploadResult.size,
    mimeType: uploadResult.format ? `image/${uploadResult.format}` : uploadResult.resource_type,
    name: originalName || uploadResult.original_filename || "Uploaded File",
    uploadedAt: new Date(),
  };
}

const ALLOWED_PUBLICATION_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

async function uploadPublicationPdf(file, folder = "samaj/publications") {
  try {
    validateUploadFile(file, { maxSizeMB: 20, allowedMimes: ALLOWED_PUBLICATION_MIMES });

    const isPdf = (file.mimetype === "application/pdf") || (file.name || "").toLowerCase().endsWith(".pdf");

    const options = {
      folder,
      resource_type: isPdf ? "raw" : "auto",
      type: "upload",
      use_filename: true,
      unique_filename: true,
    };

    const filePath = file.tempFilePath || file.path;
    if (!filePath) {
      throw new ApiError(400, "FILE_READ_ERROR", "Uploaded file temporary path not found");
    }

    const result = await cloudinary.uploader.upload(filePath, options);
    return result;
  } catch (error) {
    console.error("Cloudinary publication upload error:", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, "UPLOAD_FAILED", error.message || "Failed to upload publication file to Cloudinary");
  }
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOC_MIMES,
  ALLOWED_PUBLICATION_MIMES,
  validateUploadFile,
  uploadImageToCloudinary,
  uploadDocumentToCloudinary,
  uploadPublicationPdf,
  assetMetadata,
};
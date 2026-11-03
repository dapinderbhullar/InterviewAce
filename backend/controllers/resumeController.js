const { randomUUID, createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const Resume = require("../models/Resume");
const { uploadDirectory, resolveUpload } = require("../config/storage");
const httpError = require("../utils/httpError");
const { MAX_PDF_BYTES, PDF_SIZE_MESSAGE } = require("../config/uploadPolicy");
const { validatePdf } = require("../services/pdfValidation");
function logCleanupFailure(operation, error, uploadId) {
  const code = ["EACCES", "EPERM", "ENOSPC", "EIO", "EBUSY", "EMFILE"].includes(error.code) ? error.code : "UNKNOWN";
  console.error("Resume upload cleanup failed", { operation, code, uploadId });
}
async function uploadResume(req, res) {
  if (!req.file || req.file.buffer.subarray(0, 5).toString() !== "%PDF-") {
    throw httpError(400, "A valid PDF file is required");
  }
  if (req.file.buffer.length > MAX_PDF_BYTES) throw httpError(413, PDF_SIZE_MESSAGE);
  await validatePdf(req.file.buffer);
  const fileName = `${randomUUID()}.pdf`;
  const filePath = `uploads/${fileName}`;
  let resume, handle;
  let created = false;
  try {
    await fs.mkdir(uploadDirectory, { recursive: true });
    handle = await fs.open(resolveUpload(filePath), "wx");
    created = true;
    await handle.writeFile(req.file.buffer);
    await handle.close();
    handle = null;
    resume = await Resume.create({ userId: req.userId, fileName, filePath,
      originalName: req.file.originalname, size: req.file.buffer.length,
      contentHash: createHash("sha256").update(req.file.buffer).digest("hex") });
  } catch (error) {
    if (handle) await handle.close().catch(closeError => logCleanupFailure("close", closeError, fileName));
    if (created) await fs.unlink(resolveUpload(filePath)).catch(unlinkError => {
      if (unlinkError.code !== "ENOENT") logCleanupFailure("unlink", unlinkError, fileName);
    });
    throw error;
  }
  res.status(201).json({ message: "Resume Uploaded", file: fileName, path: filePath, resumeId: resume.id });
}
async function ownedResume(userId, input = {}) {
  input = input || {};
  const query = { userId };
  if (typeof input.resumeId === "string" && /^[a-f\d]{24}$/i.test(input.resumeId)) {
    query._id = input.resumeId;
  } else if (typeof input.path === "string" && !input.resumeId) {
    resolveUpload(input.path);
    query.filePath = input.path;
  } else {
    throw httpError(400, "Select or upload a resume first");
  }
  const resume = await Resume.findOne(query);
  if (!resume) throw httpError(404, "Resume not found. Legacy uploads must be uploaded again to establish ownership.");
  return resume;
}
async function downloadResume(req, res, next) {
  const resume = await ownedResume(req.userId, { path: `uploads/${req.params.file}` });
  res.set("Cache-Control", "private, no-store");
  res.download(resolveUpload(resume.filePath), resume.fileName, error => { if (error) next(error); });
}
module.exports = { uploadResume, ownedResume, downloadResume };

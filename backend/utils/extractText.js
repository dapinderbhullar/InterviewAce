const fs = require("node:fs/promises");
const pdf = require("pdf-parse");
const httpError = require("./httpError");
const { MAX_PDF_BYTES, PDF_SIZE_MESSAGE } = require("../config/uploadPolicy");
async function extractText(filePath) {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_PDF_BYTES) throw httpError(413, PDF_SIZE_MESSAGE);
  let data;
  // The legacy parser mishandles some asynchronous Buffer views; pass an owned typed array.
  try { data = await pdf(Uint8Array.from(await fs.readFile(filePath)), { max: 50 }); }
  catch { throw httpError(422, "Unable to read this PDF. Upload a text-based, unencrypted PDF."); }
  if (data.numpages > 50 || data.text.length > 100000) throw httpError(422, "Resume exceeds 50 pages or 100000 characters");
  if (!data.text.trim()) throw httpError(422, "No text found. Scanned PDFs require OCR, which is not available yet.");
  return data.text;
}
module.exports = extractText;

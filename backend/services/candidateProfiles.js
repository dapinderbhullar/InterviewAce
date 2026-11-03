const { createHash, randomUUID } = require("node:crypto");
const CandidateProfile = require("../models/CandidateProfile");
const Resume = require("../models/Resume");
const gemini = require("./geminiService");
const { extractResumeText } = require("./resumeText");
const { resolveUpload } = require("../config/storage");
const { parseCandidateResponse, editCandidate } = require("../schemas/candidateProfile");
const { scoreProfile } = require("./resumeScore");
const httpError = require("../utils/httpError");
const SCHEMA_VERSION = 1;
const LEASE_MS = 120000;
function publicProfile(profile) {
  if (!profile) return null;
  const plain = profile.toObject ? profile.toObject() : { ...profile };
  delete plain.sourceData; delete plain.leaseToken; delete plain.__v;
  return plain;
}
function createProfileService({ profiles = CandidateProfile, resumes = Resume, readText = extractResumeText,
  generate = text => gemini.extractCandidate(text), clock = () => new Date(), deadlineMs = 65000 } = {}) {
  const inFlight = new Map();
  async function owned(userId, resumeId, includeText = false) {
    if (typeof resumeId !== "string" || !/^[a-f\d]{24}$/i.test(resumeId)) throw httpError(400, "Invalid resume ID");
    const resume = await resumes.findOne({ _id: resumeId, userId }).select(includeText ? "+extractedText" : "_id userId filePath");
    if (!resume) throw httpError(404, "Resume not found");
    return resume;
  }
  const where = (userId, resumeId) => ({ userId, resumeId });
  async function get(userId, resumeId) {
    await owned(userId, resumeId);
    return publicProfile(await profiles.findOne(where(userId, resumeId)));
  }
  async function generateOnce(key, text) {
    if (!inFlight.has(key)) {
      if (inFlight.size >= 64) throw httpError(503, "Resume analysis busy. Retry shortly.");
      let timer;
      const task = Promise.race([
        Promise.resolve().then(() => generate(text)),
        new Promise((resolve, reject) => { timer = setTimeout(() => reject(httpError(504, "Resume analysis timed out")), deadlineMs); }),
      ]).then(raw => parseCandidateResponse(raw, text)).then(data => {
        // Keep a short bounded cache through the MongoDB commit window as well as the API call.
        setTimeout(() => inFlight.delete(key), 30000).unref();
        return data;
      }).catch(error => {
        inFlight.delete(key);
        if (error.name === "AbortError" || error instanceof require("@google/generative-ai").GoogleGenerativeAIAbortError) throw httpError(504, "Resume analysis timed out");
        throw error;
      }).finally(() => { clearTimeout(timer); });
      inFlight.set(key, task);
    }
    return inFlight.get(key);
  }
  async function extract(userId, resumeId, input = {}) {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => key !== "retry") || (input.retry !== undefined && typeof input.retry !== "boolean")) throw httpError(400, "Invalid extraction request");
    const resume = await owned(userId, resumeId, true);
    const query = where(userId, resumeId);
    const now = clock();
    let existing = await profiles.findOne(query);
    if (existing?.status === "ready") return { status: 200, profile: publicProfile(existing) };
    if (existing?.status === "processing" && existing.leaseUntil > now) return { status: 202, profile: publicProfile(existing) };
    if (existing?.status === "failed" && !input.retry) return { status: 200, profile: publicProfile(existing) };
    if (existing?.retryAfter > now) throw httpError(429, "Wait one minute before retrying failed extraction");
    const leaseToken = randomUUID();
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    let claimed;
    if (!existing) {
      try { claimed = await profiles.create({ ...query, status: "processing", revision: 0, schemaVersion: SCHEMA_VERSION, leaseToken, leaseUntil }); }
      catch (error) {
        if (error.code !== 11000) throw error;
        existing = await profiles.findOne(query);
        return { status: existing?.status === "ready" ? 200 : 202, profile: publicProfile(existing) };
      }
    } else {
      claimed = await profiles.findOneAndUpdate({ ...query, _id: existing._id, status: existing.status,
        ...(existing.status === "processing" ? { leaseUntil: { $lte: now } } : { retryAfter: { $lte: now } }),
      }, { $set: { status: "processing", leaseToken, leaseUntil, failure: null } }, { new: true });
      if (!claimed) return { status: 202, profile: publicProfile(await profiles.findOne(query)) };
    }
    const locked = { ...query, _id: claimed._id, status: "processing", leaseToken };
    try {
      let text = resume.extractedText;
      if (!text && /^[a-f\d]{64}$/i.test(resume.contentHash || "")) {
        const previous = await resumes.findOne({ userId, contentHash: resume.contentHash,
          extractedText: { $exists: true, $ne: "" } }).select("+extractedText");
        text = previous?.extractedText;
      }
      if (!text) text = await readText(resolveUpload(resume.filePath));
      if (typeof text !== "string" || !text.trim() || text.length > 100000) throw httpError(422, "No usable resume text found");
      if (!resume.extractedText) await resumes.updateOne({ _id: resumeId, userId }, { $set: { extractedText: text } });
      const sourceHash = createHash("sha256").update(text).digest("hex");
      const cached = await profiles.findOne({ userId, sourceHash, schemaVersion: SCHEMA_VERSION, status: "ready" }).select("+sourceData");
      const data = cached?.sourceData ? structuredClone(cached.sourceData.toObject ? cached.sourceData.toObject() : cached.sourceData) :
        await generateOnce(`${userId}:${sourceHash}:${SCHEMA_VERSION}`, text);
      const profile = await profiles.findOneAndUpdate(locked, { $set: {
        status: "ready", data, sourceData: data, sourceHash, score: scoreProfile(data),
        generatedAt: clock(), model: cached?.model || process.env.GEMINI_MODEL || "gemini-2.5-flash", failure: null,
      }, $unset: { leaseToken: 1, leaseUntil: 1, retryAfter: 1 }, $inc: { revision: 1 } }, { new: true, runValidators: true });
      if (!profile) throw httpError(409, "Extraction lease expired. Reload the profile.");
      return { status: 200, profile: publicProfile(profile) };
    } catch (error) {
      const failure = error.status === 422 ? { code: "PDF_EXTRACTION", message: "Could not read resume text. Upload a text-based, unencrypted PDF." } :
        error.status === 504 ? { code: "TIMEOUT", message: "AI extraction timed out. You can retry after one minute." } :
        { code: "AI_EXTRACTION", message: "Extraction failed or the AI response could not be verified. Retry after one minute." };
      const failed = await profiles.findOneAndUpdate(locked, { $set: { status: "failed", failure, retryAfter: new Date(clock().getTime() + 60000) },
        $unset: { leaseToken: 1, leaseUntil: 1 } }, { new: true });
      if (!failed) throw httpError(409, "Profile changed during extraction. Reload it.");
      return { status: error.status === 422 ? 422 : error.status === 504 ? 504 : 502, profile: publicProfile(failed), message: failure.message };
    }
  }
  async function edit(userId, resumeId, input) {
    await owned(userId, resumeId);
    if (!input || !Number.isInteger(input.revision) || input.revision < 0) throw httpError(400, "Profile revision is required");
    const query = where(userId, resumeId);
    const profile = await profiles.findOne(query);
    if (!profile) throw httpError(404, "Profile not found");
    if (profile.status !== "ready" || profile.revision !== input.revision) throw httpError(409, "Profile changed. Reload before editing.");
    const plain = publicProfile(profile);
    const data = editCandidate(plain.data, input);
    const updated = await profiles.findOneAndUpdate({ ...query, revision: input.revision, status: "ready" },
      { $set: { data, score: scoreProfile(data) }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (!updated) throw httpError(409, "Profile changed. Reload before editing.");
    return publicProfile(updated);
  }
  return { get, extract, edit };
}
module.exports = { createProfileService, publicProfile };

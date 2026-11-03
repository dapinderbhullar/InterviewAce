const mongoose = require("mongoose");
const { definitions } = require("../schemas/candidateProfile");
const evidenceSchema = new mongoose.Schema({ quote: String, start: Number, end: Number }, { _id: false });
function field(node, key) {
  if (key === "evidence") return [evidenceSchema];
  if (node.type === "string") return { type: String, maxlength: node.max, ...(node.enum ? { enum: node.enum } : {}) };
  if (node.type === "array") return [field(node.items)];
  return new mongoose.Schema({ ...Object.fromEntries(Object.entries(node.properties).map(([name, value]) => [name, field(value, name)])),
    origin: { type: String, enum: ["resume", "user"], default: "resume" }, confirmed: { type: Boolean, default: false }, proficiencyNote: String,
  }, { _id: false, strict: "throw" });
}
const dataSchema = new mongoose.Schema(Object.fromEntries(Object.entries(definitions).map(([key, node]) => [key, field(node)])), { _id: false, strict: "throw" });
const schema = new mongoose.Schema({
  userId: { type: String, required: true }, resumeId: { type: mongoose.Schema.Types.ObjectId, ref: "Resume", required: true },
  schemaVersion: { type: Number, default: 1 }, status: { type: String, enum: ["processing", "ready", "failed"], required: true },
  revision: { type: Number, default: 0 }, sourceHash: String, sourceData: { type: dataSchema, select: false }, data: dataSchema,
  score: mongoose.Schema.Types.Mixed, model: String, generatedAt: Date, failure: { code: String, message: String },
  leaseToken: { type: String, select: false }, leaseUntil: Date, retryAfter: Date,
}, { timestamps: true, strict: "throw" });
schema.index({ userId: 1, resumeId: 1 }, { unique: true });
schema.index({ userId: 1, sourceHash: 1, schemaVersion: 1, status: 1 });
module.exports = mongoose.model("CandidateProfile", schema);

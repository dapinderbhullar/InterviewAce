const router = require("express").Router();
const services = require("../services/geminiService");
const extractText = require("../utils/extractText");
const { ownedResume } = require("../controllers/resumeController");
const { resolveUpload } = require("../config/storage");
const Resume = require("../models/Resume");
const httpError = require("../utils/httpError");
for (const [endpoint, method, key] of [
  ["analyze", "analyzeResume", "analysis"],
  ["ats", "generateATS", "result"],
  ["questions", "generateQuestions", "questions"],
]) {
  router.post(`/${endpoint}`, async (req, res) => {
    const resume = await ownedResume(req.userId, req.body);
    const stored = await Resume.findOne({ _id: resume._id, userId: req.userId }).select("+extractedText");
    if (!stored) throw httpError(404, "Resume not found");
    let text = stored.extractedText;
    if (!text) {
      text = await extractText(resolveUpload(resume.filePath));
      await Resume.updateOne({ _id: resume._id, userId: req.userId }, { $set: { extractedText: text } });
    }
    res.json({ [key]: await services[method](text) });
  });
}
module.exports = router;

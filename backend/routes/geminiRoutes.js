const express = require("express");
const router = express.Router();

const {
  analyzeResume,
  generateATS,
  generateQuestions,
} = require("../services/geminiService");

const extractText = require("../utils/extractText");

router.post("/analyze", async (req, res) => {
  try {
    const text = await extractText(req.body.path);
    const analysis = await analyzeResume(text);

    res.json({ analysis });
  } catch (error) {
    res.status(500).json({
      message: "Analysis Failed",
      error: error.message,
    });
  }
});

router.post("/ats", async (req, res) => {
  try {
    const text = await extractText(req.body.path);
    const result = await generateATS(text);

    res.json({ result });
  } catch (error) {
    res.status(500).json({
      message: "ATS Failed",
      error: error.message,
    });
  }
});

router.post("/questions", async (req, res) => {
  try {
    const text = await extractText(req.body.path);
    const questions = await generateQuestions(text);

    res.json({ questions });
  } catch (error) {
    res.status(500).json({
      message: "Question Generation Failed",
      error: error.message,
    });
  }
});

module.exports = router;
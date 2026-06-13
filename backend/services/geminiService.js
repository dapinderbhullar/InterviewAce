const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

// Resume Analysis
async function analyzeResume(text) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `
Analyze this resume.

Provide:

1. Summary
2. Skills Found
3. Strengths
4. Weaknesses

Resume:
${text}
`;

  const result = await model.generateContent(prompt);

  return result.response.text();
}

// ATS Score Generator
async function generateATS(text) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `
Act as an ATS system.

Analyze resume and provide:

ATS Score out of 100

Missing Keywords

Suggestions

Resume:
${text}
`;

  const result = await model.generateContent(prompt);

  return result.response.text();
}

// Interview Questions Generator
async function generateQuestions(text) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `
Generate interview questions based on this resume.

Create:

1. Technical Questions
2. HR Questions
3. Project Questions

Resume:

${text}
`;

  const result = await model.generateContent(prompt);

  return result.response.text();
}

module.exports = {
  analyzeResume,
  generateATS,
  generateQuestions,
};
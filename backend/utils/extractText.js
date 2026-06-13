const fs = require("fs");
const pdf = require("pdf-parse");

async function extractText(path) {
  const dataBuffer = fs.readFileSync(path);
  const data = await pdf(dataBuffer);

  return data.text;
}

module.exports = extractText;
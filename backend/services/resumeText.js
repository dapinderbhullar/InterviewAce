const { fork } = require("node:child_process");
const path = require("node:path");
const httpError = require("../utils/httpError");
let active = 0;
async function extractResumeText(filePath) {
  if (active >= 2) throw httpError(503, "Resume parsing busy. Try again shortly.");
  active++;
  let child, closed, timer;
  try {
    child = fork(path.join(__dirname, "../workers/extractResumeText.js"), [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true,
      execArgv: ["--max-old-space-size=128", "--stack-size=4096"],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    });
    closed = new Promise(resolve => child.once("close", resolve));
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(httpError(422, "Resume text extraction timed out")), 15000);
      child.once("message", result => {
        if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 100000) reject(httpError(422, "Unable to extract resume text. Use a text-based PDF of at most 50 pages."));
        else resolve(result.text);
      });
      child.once("error", () => reject(httpError(422, "Resume parser could not start")));
      child.once("exit", () => reject(httpError(422, "Resume parser stopped before completion")));
      child.send(filePath, error => { if (error) reject(httpError(422, "Resume parser could not start")); });
    });
  } finally {
    clearTimeout(timer);
    if (child) {
      if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
    }
    active--;
  }
}
module.exports = { extractResumeText };

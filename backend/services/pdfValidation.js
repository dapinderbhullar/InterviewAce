const { fork } = require("node:child_process");
const path = require("node:path");
const httpError = require("../utils/httpError");
function createPdfValidator({ forkProcess = fork, timeoutMs = 10000, maxWorkers = 2 } = {}) {
  let active = 0;
  // The installed legacy PDF parser is not reliable in worker_threads. Use bounded child processes.
  return async function validatePdf(buffer) {
    if (active >= maxWorkers) throw httpError(503, "PDF validation busy. Please try again shortly.");
    active++;
    let child, closed, timer;
    try {
      child = forkProcess(path.join(__dirname, "../workers/validatePdf.js"), [], {
        stdio: ["ignore", "ignore", "ignore", "ipc"], serialization: "advanced", windowsHide: true,
        execArgv: ["--max-old-space-size=128", "--stack-size=4096"],
        // Validation needs no database, JWT, or provider credentials.
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
      });
      closed = new Promise(resolve => child.once("close", resolve));
      await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(httpError(422, "PDF validation timed out")), timeoutMs);
        child.once("message", result => result?.valid ? resolve() : reject(httpError(422, "Invalid, truncated, or unsupported PDF")));
        child.once("error", () => reject(httpError(422, "PDF could not be validated safely")));
        child.once("exit", () => reject(httpError(422, "PDF validation stopped before completion")));
        child.send(buffer, error => { if (error) reject(httpError(422, "PDF validation could not start")); });
      });
    } finally {
      clearTimeout(timer);
      if (child) {
        if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
        // close also fires for spawn failures (which do not emit exit).
        await closed;
      }
      active--;
    }
  };
}
module.exports = { validatePdf: createPdfValidator(), createPdfValidator };

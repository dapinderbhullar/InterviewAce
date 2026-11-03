const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const { validateEnvironment } = require("./config/environment");
async function start() {
  let stage = "environment validation";
  try {
    const { port } = validateEnvironment(process.env);
    stage = "MongoDB connection (check Atlas DNS, network access and credentials)";
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    for (const name of ["User", "Resume", "Note", "CandidateProfile", "JobDescription", "MatchReport",
      "InterviewSession", "LearningRoadmap", "LearningTask", "PracticeAttempt"]) {
      stage = `${name} index initialization`;
      await require(`./models/${name}`).init();
    }
    stage = "HTTP server initialization";
    const app = require("./app");
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, () => resolve(listener));
      listener.once("error", reject);
    });
    console.log(`InterviewAce API started on port ${port}; MongoDB connected and indexes initialized`);
    function shutdown() {
      server.close(() => mongoose.disconnect().then(() => process.exit(0)));
      setTimeout(() => process.exit(1), 10000).unref();
    }
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    return server;
  } catch (error) {
    error.startupStage = stage;
    throw error;
  }
}
if (require.main === module) start().catch(async error => {
  // Never log raw provider errors: they can contain connection strings or credentials.
  console.error("InterviewAce API startup failed:", error.startupStage, error.name,
    String(error.code || error.cause?.code || "no error code").replace(/[^A-Za-z0-9_-]/g, ""));
  await mongoose.disconnect();
  process.exitCode = 1;
});
module.exports = { start };

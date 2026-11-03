const extractText = require("../utils/extractText");
process.once("message", async filePath => {
  try { process.send({ text: await extractText(filePath) }); }
  catch (error) {
    process.send({ error: [413, 422].includes(error.status) ? error.status : 422 });
  }
});

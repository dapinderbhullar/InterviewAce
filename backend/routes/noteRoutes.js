const router = require("express").Router();
const Note = require("../models/Note");
const httpError = require("../utils/httpError");
function fields(body) {
  body = body || {};
  const { title, content } = body;
  if (typeof title !== "string" || !title.trim() || title.length > 200 ||
      typeof content !== "string" || !content.trim() || content.length > 20000) {
    throw httpError(400, "Title (1-200 characters) and content (1-20000 characters) are required");
  }
  return { title: title.trim(), content: content.trim() };
}
router.post("/", async (req, res) => {
  res.status(201).json(await Note.create({ ...fields(req.body), userId: req.userId }));
});
router.get("/", async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  res.json(await Note.find({ userId: req.userId }).sort({ _id: -1 }).skip((page - 1) * 50).limit(50));
});
router.put("/:id", async (req, res) => {
  const note = await Note.findOneAndUpdate({ _id: req.params.id, userId: req.userId },
    { $set: fields(req.body) }, { new: true, runValidators: true });
  if (!note) throw httpError(404, "Note not found");
  res.json(note);
});
router.delete("/:id", async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!note) throw httpError(404, "Note not found");
  res.json({ message: "Deleted" });
});
module.exports = router;

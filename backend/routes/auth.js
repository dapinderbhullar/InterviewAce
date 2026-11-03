const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const auth = require("../middleware/auth");
const httpError = require("../utils/httpError");
function credentials(body) {
  body = body || {};
  if (typeof body.email !== "string" || body.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
      typeof body.password !== "string" || !body.password) {
    throw httpError(400, "Provide a valid email and password");
  }
  return { email: body.email.trim().toLowerCase(), password: body.password };
}
function accountQuery(email) {
  // Retain access to mixed-case legacy accounts without rewriting their data.
  return { email: { $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } };
}
router.post("/register", async (req, res) => {
  const { email, password } = credentials(req.body);
  const name = req.body.name;
  if (Buffer.byteLength(password) > 72) throw httpError(400, "New passwords must be at most 72 bytes");
  if (typeof name !== "string" || !name.trim() || name.length > 100 || password.length < 8) {
    throw httpError(400, "Name is required (at most 100 characters); password must have at least 8 characters");
  }
  if (await User.exists(accountQuery(email))) throw httpError(409, "Account already exists");
  const user = await User.create({ name: name.trim(), email, emailKey: email, password: await bcrypt.hash(password, 12) });
  res.status(201).json({ _id: user.id, name: user.name, email: user.email });
});
router.post("/login", async (req, res) => {
  const { email, password } = credentials(req.body);
  const user = await User.findOne(accountQuery(email)).select("+password");
  if (!user || user.disabled || !(await bcrypt.compare(password, user.password))) throw httpError(401, "Invalid email or password");
  const token = jwt.sign({ id: user.id, sv: user.sessionVersion ?? 0 }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
  res.json({ token, name: user.name });
});
router.get("/me", auth, async (req, res) => {
  res.json({ _id: req.userId, name: req.account.name, email: req.account.email });
});
module.exports = router;

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const httpError = require("../utils/httpError");
module.exports = async function auth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ message: "Authentication required" });
  let payload;
  try {
    payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload.id !== "string" || !/^[a-f\d]{24}$/i.test(payload.id)) throw new Error();
  } catch {
    return res.status(401).json({ message: "Session expired or invalid. Please log in again." });
  }
  let account;
  try {
    account = await User.findById(payload.id).select("name email disabled sessionVersion");
  } catch {
    return next(httpError(503, "Authentication temporarily unavailable"));
  }
  if (!account || account.disabled || (payload.sv ?? 0) !== (account.sessionVersion ?? 0)) {
    return res.status(401).json({ message: "Account or session no longer available. Please log in again." });
  }
  req.userId = payload.id;
  req.account = account;
  next();
};

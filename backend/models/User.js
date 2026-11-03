const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  emailKey: { type: String, unique: true, sparse: true, select: false },
  password: { type: String, required: true, select: false },
  disabled: { type: Boolean, default: false },
  sessionVersion: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
// New registrations get a unique key; legacy records remain unchanged until reconciliation.
module.exports = mongoose.model("User", schema);

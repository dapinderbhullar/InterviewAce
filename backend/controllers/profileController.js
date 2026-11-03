const { createProfileService } = require("../services/candidateProfiles");
const service = createProfileService();
exports.get = async (req, res) => res.json({ profile: await service.get(req.userId, req.params.resumeId) });
exports.extract = async (req, res) => {
  const result = await service.extract(req.userId, req.params.resumeId, req.body);
  if (result.status === 202) res.set("Retry-After", "3");
  res.status(result.status).json({ profile: result.profile, ...(result.message ? { message: result.message } : {}) });
};
exports.edit = async (req, res) => res.json({ profile: await service.edit(req.userId, req.params.resumeId, req.body) });

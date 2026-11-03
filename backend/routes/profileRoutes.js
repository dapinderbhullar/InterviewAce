const router = require("express").Router();
const controller = require("../controllers/profileController");
const rateLimit = require("../middleware/rateLimit");
router.get("/:resumeId", controller.get);
router.post("/:resumeId/extract", rateLimit({ limit: 10 }), controller.extract);
router.patch("/:resumeId", rateLimit({ limit: 60 }), controller.edit);
module.exports = router;

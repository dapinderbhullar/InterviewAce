const router = require('express').Router();
const multer = require('multer');
const { TextDecoder } = require('node:util');
const httpError = require('../utils/httpError');
const rateLimit = require('../middleware/rateLimit');
const { createJobService } = require('../services/jobIntelligence');
const service = createJobService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 120001, files: 1, fields: 0, parts: 2 } }).single('file');
function uploadText(req, res, next) {
  upload(req, res, error => {
    if (!error) return next();
    next(httpError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code === 'LIMIT_FILE_SIZE' ? 'Job description file must be at most 120 KB' : 'Invalid job description upload'));
  });
}
const limit = rateLimit({ limit: 15 });
router.get('/', async (req, res) => res.json(await service.listJobs(req.userId)));
router.post('/', limit, async (req, res) => res.status(201).json(await service.create(req.userId, req.body)));
router.post('/upload', limit, uploadText, async (req, res) => {
  if (!req.file || !/\.txt$/i.test(req.file.originalname) || !['text/plain', 'application/octet-stream'].includes(req.file.mimetype)) throw httpError(400, 'Upload a UTF-8 .txt job description');
  if (req.file.size > 120000) throw httpError(413, 'Job description file is too large');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer); }
  catch { throw httpError(400, 'Job description must be UTF-8 text'); }
  res.status(201).json(await service.create(req.userId, { text }));
});
router.get('/reports', async (req, res) => res.json(await service.listReports(req.userId)));
router.post('/reports', rateLimit({ limit: 60 }), async (req, res) => res.status(201).json(await service.match(req.userId, req.body)));
router.get('/reports/:reportId', async (req, res) => res.json(await service.getReport(req.userId, req.params.reportId)));
router.get('/:jobId', async (req, res) => res.json(await service.getJob(req.userId, req.params.jobId)));
module.exports = router;

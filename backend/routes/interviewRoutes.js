const router = require('express').Router();
const rateLimit = require('../middleware/rateLimit');
const { createInterviewService } = require('../services/interviews');
const service = createInterviewService();
function send(res, result) { if (result.status === 202) res.set('Retry-After', '3'); return res.status(result.status).json({ session: result.session }); }
router.get('/', async (req, res) => res.json(await service.list(req.userId)));
router.post('/', rateLimit({ limit: 10 }), async (req, res) => send(res, await service.create(req.userId, req.body)));
router.get('/:sessionId', async (req, res) => res.json({ session: await service.get(req.userId, req.params.sessionId) }));
router.post('/:sessionId/retry', rateLimit({ limit: 10 }), async (req, res) => send(res, await service.retryGeneration(req.userId, req.params.sessionId, req.body)));
router.post('/:sessionId/answers', rateLimit({ limit: 30 }), async (req, res) => send(res, await service.submit(req.userId, req.params.sessionId, req.body)));
module.exports = router;

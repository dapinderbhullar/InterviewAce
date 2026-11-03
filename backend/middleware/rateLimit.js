// Single-process guard; use a shared store before scaling API instances.
module.exports = function rateLimit({ limit, windowMs = 60000, maxKeys = 10000 }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.userId || req.ip;
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      for (const [id, value] of buckets) if (value.reset <= now) buckets.delete(id);
      if (!buckets.has(key) && buckets.size >= maxKeys) {
        return res.status(429).json({ message: "Server busy. Please try again shortly." });
      }
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      res.set("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({ message: "Too many requests. Please try again shortly." });
    }
    next();
  };
};

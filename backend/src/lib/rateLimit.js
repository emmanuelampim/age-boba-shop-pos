export function createLimiter({ windowMs, limit }) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = `${req.ip ?? 'unknown'}:${req.originalUrl ?? '/'}`;

    if (buckets.size > 10000) {
      for (const [k, b] of buckets) {
        if (b.reset <= now) buckets.delete(k);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > limit) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      });
    }
    return next();
  };
}
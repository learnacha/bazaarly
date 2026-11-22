import { randomUUID } from 'node:crypto';
import { logger } from './logger.js';

// Gives every /api request an id (also returned as X-Request-Id) and logs one line when it ends.
// 5xx is logged as an error, 4xx as a warning, the rest as info. Health checks are skipped.
export function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api') || req.path === '/api/health') return next();
  req.id = randomUUID();
  res.set('X-Request-Id', req.id);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('request', {
      'request.id': req.id,
      'http.request.method': req.method,
      'http.route': req.route ? req.baseUrl + req.route.path : 'unmatched',
      'http.response.status_code': res.statusCode,
      'duration_ms': Math.round(Number(process.hrtime.bigint() - start) / 1e6),
    });
  });
  next();
}

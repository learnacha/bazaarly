// Test-only failure injection, used to prove the alert -> RCA pipeline end to end.
// Off unless CHAOS_5XX_RATE is set to a number between 0 and 1 (e.g. 0.6 fails 60% of product reads).
// Only GET /api/products* is affected; health, auth and orders are never touched.
import { logger, errAttrs } from './logger.js';

const RATE = Number(process.env.CHAOS_5XX_RATE ?? 0);

export function chaos(req, res, next) {
  if (!(RATE > 0) || req.method !== 'GET' || !req.path.startsWith('/products')) return next();
  if (Math.random() < RATE) {
    // Mimics a real incident: the database pool is exhausted, so the query cannot get a connection.
    const err = new Error('CHAOS_INJECTED: timeout acquiring connection from pool (pool exhausted, 0 idle, 10 waiting)');
    logger.error('Unhandled error', { ...errAttrs(err), 'request.id': req.id, 'http.route': '/products' });
    return res.status(500).json({ error: 'Internal server error' });
  }
  next();
}

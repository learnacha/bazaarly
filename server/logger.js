// Structured logs: one JSON line on stdout (shows in the terminal and in Render's log view) and,
// when Grafana Cloud is configured, the same record sent over OTLP (see telemetry.js).
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

const otel = logs.getLogger('bazaarly');
const LEVELS = {
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

function emit(level, message, attrs = {}) {
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify({ time: new Date().toISOString(), level, message, ...attrs }));
  otel.emit({ severityNumber: LEVELS[level], severityText: level.toUpperCase(), body: message, attributes: attrs });
}

export const logger = Object.fromEntries(Object.keys(LEVELS).map((l) => [l, (m, a) => emit(l, m, a)]));

// Error objects don't serialise to JSON usefully, so pull out what matters.
export const errAttrs = (err) => ({ 'error.message': err.message, 'error.stack': err.stack });

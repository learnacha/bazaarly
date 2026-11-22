// OpenTelemetry metrics, pushed to Grafana Cloud over OTLP. Off unless the GRAFANA_* variables
// are set, so the app runs fine without them.
import { metrics } from '@opentelemetry/api';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';

const { GRAFANA_OTLP_ENDPOINT, GRAFANA_INSTANCE_ID, GRAFANA_API_TOKEN } = process.env;
export const enabled = Boolean(GRAFANA_OTLP_ENDPOINT && GRAFANA_INSTANCE_ID && GRAFANA_API_TOKEN);

let provider;
let loggerProvider;
if (enabled) {
  const auth = Buffer.from(`${GRAFANA_INSTANCE_ID}:${GRAFANA_API_TOKEN}`).toString('base64');
  const base = GRAFANA_OTLP_ENDPOINT.replace(/\/$/, '');
  const headers = { Authorization: `Basic ${auth}` };
  const resource = resourceFromAttributes({
    'service.name': 'bazaarly',
    'deployment.environment': process.env.NODE_ENV === 'production' || process.argv.includes('--prod') ? 'production' : 'development',
  });
  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers }), scheduledDelayMillis: 5000 }),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
  provider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${base}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: 15_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(provider);
}

// With no provider registered these instruments are harmless no-ops.
const meter = metrics.getMeter('bazaarly');

const httpDuration = meter.createHistogram('http.server.duration', {
  unit: 's',
  description: 'API request duration',
  advice: { explicitBucketBoundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] },
});
export const ordersCreated = meter.createCounter('bazaarly.orders.created', { description: 'Orders placed' });
export const ordersRevenue = meter.createCounter('bazaarly.orders.revenue', { description: 'Sum of order totals placed' });
export const ordersCancelled = meter.createCounter('bazaarly.orders.cancelled', { description: 'Orders cancelled' });

// Times every /api request. The route label is the pattern (/api/products/:id), not the raw URL.
export function httpMetrics(req, res, next) {
  if (!enabled || !req.path.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    httpDuration.record(Number(process.hrtime.bigint() - start) / 1e9, {
      'http.request.method': req.method,
      'http.route': req.route ? req.baseUrl + req.route.path : 'unmatched',
      'http.response.status_code': res.statusCode,
    });
  });
  next();
}

// Send what is buffered before the process exits.
export async function shutdownTelemetry() {
  await Promise.all([provider?.shutdown(), loggerProvider?.shutdown()].map((p) => p?.catch(() => {})));
}

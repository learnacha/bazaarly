#!/usr/bin/env node
// Creates/updates the bazaarly 5xx alert rule and its webhook contact point in Grafana Cloud.
// Idempotent: re-run with a new URL whenever the tunnel address changes.
//   node --env-file=.env triage/alerting.mjs apply [--url https://<tunnel>/webhook] [--dry-run]
//   node --env-file=.env triage/alerting.mjs status
//   node --env-file=.env triage/alerting.mjs delete
// Env: GRAFANA_URL, GRAFANA_ALERTING_TOKEN, TRIAGE_WEBHOOK_SECRET, TRIAGE_PUBLIC_URL (or --url).
// Only objects with the "bazaarly-" prefix/uid are ever touched; the stack's built-in rules are left alone.
const [cmd = 'status', ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const DRY = rest.includes('--dry-run');
const env = process.env;

const FOLDER = { uid: 'bazaarly-alerts', title: 'Bazaarly alerts' };
const GROUP = 'bazaarly-errors';
const CP = { uid: 'bazaarly-triage-cp', name: 'bazaarly-triage' };
const RULE_UID = 'bazaarly-5xx-ratio';
const THRESHOLD = Number(env.ALERT_5XX_RATIO ?? 0.05);   // 5%
const FOR = env.ALERT_FOR ?? '1m';

const count = 'http_server_duration_seconds_count{service_name="bazaarly"';
const errRate = `sum(rate(${count},http_response_status_code=~"5.."}[1m]))`;
const totRate = `sum(rate(${count}}[1m]))`;
// Ratio only counts when there is real traffic (>0.02 req/s), so one failed request at 3am can't page.
const EXPR = `(${errRate} / ${totRate}) and on() (${totRate} > 0.02)`;

const rule = () => ({
  uid: RULE_UID, title: 'Bazaarly 5xx error ratio high', folderUID: FOLDER.uid, ruleGroup: GROUP, orgID: 1,
  condition: 'C', for: FOR, noDataState: 'OK', execErrState: 'OK',
  labels: { service: 'bazaarly', severity: 'critical' },
  annotations: {
    summary: `More than ${THRESHOLD * 100}% of bazaarly requests returned 5xx for ${FOR}`,
    description: 'Started by the bazaarly-triage webhook, which launches the RCA agent.',
  },
  notification_settings: { receiver: CP.name, group_by: ['alertname'], group_wait: '0s', repeat_interval: '4h' },
  data: [
    { refId: 'A', relativeTimeRange: { from: 300, to: 0 }, datasourceUid: 'grafanacloud-prom',
      model: { refId: 'A', expr: EXPR, instant: true, intervalMs: 1000, maxDataPoints: 43200 } },
    { refId: 'B', datasourceUid: '__expr__', model: { refId: 'B', type: 'reduce', expression: 'A', reducer: 'last', settings: { mode: 'dropNN' } } },
    { refId: 'C', datasourceUid: '__expr__', model: { refId: 'C', type: 'threshold', expression: 'B', conditions: [{ evaluator: { type: 'gt', params: [THRESHOLD] } }] } },
  ],
});

const contactPoint = (url) => ({
  uid: CP.uid, name: CP.name, type: 'webhook',
  settings: { url, httpMethod: 'POST', authorization_scheme: 'Bearer', authorization_credentials: env.TRIAGE_WEBHOOK_SECRET },
});

const redact = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'authorization_credentials' ? '<redacted>' : v)));

async function api(method, path, body) {
  if (DRY && method === 'GET') return { status: 404, json: [] };
  if (DRY) { console.log(`[dry-run] ${method} ${path}\n${JSON.stringify(redact(body), null, 2)}`); return {}; }
  const res = await fetch(`${env.GRAFANA_URL}${path}`, {
    method, headers: { Authorization: `Bearer ${env.GRAFANA_ALERTING_TOKEN}`, 'Content-Type': 'application/json', 'X-Disable-Provenance': 'true' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

function need(...names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) { console.error(`Missing in .env: ${missing.join(', ')}`); process.exit(1); }
}

if (cmd === 'apply') {
  const url = flag('--url') ?? env.TRIAGE_PUBLIC_URL;
  need('GRAFANA_URL', 'GRAFANA_ALERTING_TOKEN', 'TRIAGE_WEBHOOK_SECRET');
  if (!url || !/^https:\/\/.+\/webhook$/.test(url)) { console.error('Pass --url https://<public-host>/webhook (or set TRIAGE_PUBLIC_URL)'); process.exit(1); }
  const f = await api('GET', `/api/folders/${FOLDER.uid}`);
  if (f.status === 404) await api('POST', '/api/folders', FOLDER);
  const c = await api('GET', `/api/v1/provisioning/contact-points`);
  const exists = (c.json ?? []).some?.((x) => x.uid === CP.uid);
  await api(exists ? 'PUT' : 'POST', `/api/v1/provisioning/contact-points${exists ? '/' + CP.uid : ''}`, contactPoint(url));
  await api('PUT', `/api/v1/provisioning/folder/${FOLDER.uid}/rule-groups/${GROUP}`, { title: GROUP, folderUid: FOLDER.uid, interval: 60, rules: [rule()] });
  console.log(DRY ? 'dry run complete' : `applied: folder, contact point -> ${url}, rule "${rule().title}" (> ${THRESHOLD * 100}% for ${FOR})`);
} else if (cmd === 'status') {
  need('GRAFANA_URL', 'GRAFANA_ALERTING_TOKEN');
  const r = await api('GET', `/api/v1/provisioning/alert-rules/${RULE_UID}`);
  const c = await api('GET', '/api/v1/provisioning/contact-points');
  console.log(JSON.stringify({
    rule: r.status === 404 ? 'missing' : { title: r.json.title, for: r.json.for, receiver: r.json.notification_settings?.receiver },
    contactPoint: (c.json ?? []).filter?.((x) => x.uid === CP.uid).map((x) => ({ name: x.name, url: x.settings?.url })),
  }, null, 2));
} else if (cmd === 'delete') {
  need('GRAFANA_URL', 'GRAFANA_ALERTING_TOKEN');
  await api('DELETE', `/api/v1/provisioning/alert-rules/${RULE_UID}`);
  await api('DELETE', `/api/v1/provisioning/contact-points/${CP.uid}`);
  console.log('deleted bazaarly rule and contact point (folder left in place)');
} else {
  console.error('usage: alerting.mjs apply|status|delete'); process.exit(1);
}

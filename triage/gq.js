#!/usr/bin/env node
// Read-only Grafana query helper for the RCA agent.
//   node triage/gq.js prom '<PromQL instant query>'
//   node triage/gq.js promrange '<PromQL>' <minutes> [stepSeconds]
//   node triage/gq.js loki '<LogQL>' <minutes> [limit]
// Every query must contain service_name="bazaarly" so the agent can never read another app's data.
// Credentials come from the environment (PROM_URL/PROM_USER, LOKI_URL/LOKI_USER, GRAFANA_READ_TOKEN).
const [kind, query, a, b] = process.argv.slice(2);
const env = process.env;
const die = (m) => { console.error(m); process.exit(1); };

if (!['prom', 'promrange', 'loki'].includes(kind) || !query) die('usage: gq.js prom|promrange|loki <query> [minutes] [step|limit]');
if (!/service_name\s*=\s*["']bazaarly["']/.test(query)) die('query must include service_name="bazaarly"');
const base = kind === 'loki' ? env.LOKI_URL : env.PROM_URL;
const user = kind === 'loki' ? env.LOKI_USER : env.PROM_USER;
if (!base || !user || !env.GRAFANA_READ_TOKEN) die('missing LOKI_URL/PROM_URL, *_USER or GRAFANA_READ_TOKEN');

const now = Math.floor(Date.now() / 1000);
const minutes = Math.min(Number(a) || 30, 360);
let url;
if (kind === 'prom') {
  url = `${base}/api/v1/query?${new URLSearchParams({ query, time: now })}`;
} else if (kind === 'promrange') {
  url = `${base}/api/v1/query_range?${new URLSearchParams({ query, start: now - minutes * 60, end: now, step: Number(b) || 60 })}`;
} else {
  url = `${base}/loki/api/v1/query_range?${new URLSearchParams({
    query, start: `${(now - minutes * 60)}000000000`, end: `${now}000000000`,
    limit: Math.min(Number(b) || 50, 200), direction: 'backward',
  })}`;
}

const res = await fetch(url, { headers: { Authorization: 'Basic ' + Buffer.from(`${user}:${env.GRAFANA_READ_TOKEN}`).toString('base64') } });
const text = await res.text();
if (!res.ok) die(`HTTP ${res.status}: ${text.slice(0, 500)}`);
// Keep output small so the agent's context isn't flooded.
console.log(text.length > 12000 ? text.slice(0, 12000) + '\n...[truncated]' : text);

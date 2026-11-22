---
name: rca-report
description: Fixed template for a bazaarly incident root cause analysis (summary, impact, timeline, root cause with evidence, fix, confidence). Use when writing the final RCA for a Grafana alert.
---

Write the RCA in markdown with exactly these sections, in this order:

# RCA: <alert name> — <YYYY-MM-DD HH:MM UTC>

## Summary
Two sentences: what broke and the cause.

## Impact
Failing routes, status codes, error ratio (peak and current), approximate number of failed requests, whether it is ongoing.

## Timeline
Bulleted, UTC: first error, alert fired, peak, last error or "ongoing".

## Root cause
The mechanism, with evidence: the PromQL/LogQL used (abbreviated), the key numbers, one short error fragment, and the `file:line` of the code involved.

## Ruled out
At least one alternative explanation and why it does not fit.

## Suggested fix
Concrete next steps: an immediate mitigation and a durable fix. Do not apply them.

## Confidence
low / medium / high, plus what would raise it.

Keep it under 400 words. Facts only; mark anything uncertain as such.

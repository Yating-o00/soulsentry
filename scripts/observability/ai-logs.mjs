#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const providers = new Set(['kimi', 'deepseek']);
const sources = new Set(['ai', 'fallback', 'cached', 'cache', 'local', 'system', 'error', 'unknown']);
const reasons = new Set(['insufficient_balance', 'rate_limited', 'authentication_error', 'upstream_error', 'timeout', 'empty_response', 'invalid_json', 'network_error', 'unknown']);
const safeToken = (v, max = 128) => typeof v === 'string' && v.length <= max && /^[\w.:-]+$/.test(v) && !/^(sk-|bearer|gh[pousr]_)/i.test(v) ? v : null;
const safeRoute = v => typeof v === 'string' && v.length <= 180 && (/^\/[\w/:.{}-]*$/.test(v) || (/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(v) && safeToken(v))) ? v : null;
const date = v => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const duration = v => Number.isFinite(v) && v >= 0 ? v : null;
const numericStatus = v => Number.isInteger(v) && v >= 100 && v <= 599 ? v : null;
const percentile = (numbers, p) => numbers.length ? [...numbers].sort((a, b) => a - b)[Math.ceil(p * numbers.length) - 1] : null;
const metric = (numerator, denominator) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });

// Whitelist at the parser boundary: raw journal messages and request/response text
// never appear in output, including when an upstream accidentally logs a secret.
export function sanitizeRecord(record, tag) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const requestId = safeToken(record.requestId);
  if (!requestId) return null;
  const frontend = record.frontendVersion;
  return {
    tag,
    schemaVersion: Number.isInteger(record.schemaVersion) ? record.schemaVersion : null,
    event: ['started', 'completed', 'request_started', 'request_completed'].includes(record.event) ? record.event : null,
    timestamp: date(record.timestamp), deploymentId: safeToken(record.deploymentId),
    commitSha: /^[a-f0-9]{40}$/.test(record.commitSha || '') ? record.commitSha : null,
    requestId, attemptId: safeToken(record.attemptId), route: safeRoute(record.route),
    kind: ['http', 'background'].includes(record.kind) ? record.kind : null,
    frontendVersion: frontend && typeof frontend === 'object' ? {
      deploymentId: safeToken(frontend.deploymentId),
      commitSha: /^[a-f0-9]{40}$/.test(frontend.commitSha || '') ? frontend.commitSha : null,
      builtAt: date(frontend.builtAt),
    } : null,
    requestedProvider: providers.has(record.requestedProvider) ? record.requestedProvider : null,
    provider: providers.has(record.provider) ? record.provider : null,
    model: safeToken(record.model, 100), source: sources.has(record.source) ? record.source : 'unknown',
    outcome: ['pending', 'success', 'error', 'failure', 'unknown'].includes(record.outcome) ? record.outcome : null,
    businessSuccess: typeof record.businessSuccess === 'boolean' ? record.businessSuccess : null,
    status: numericStatus(record.status ?? record.httpStatus),
    reason: reasons.has(record.reason ?? record.errorCategory) ? (record.reason ?? record.errorCategory) : null,
    errorCode: safeToken(record.errorCode, 80), upstreamRequestId: safeToken(record.upstreamRequestId),
    elapsedMs: duration(record.elapsedMs ?? record.durationMs), late: record.late === true,
    attemptIds: Array.isArray(record.attemptIds) ? [...new Set(record.attemptIds.map(x => safeToken(x)).filter(Boolean))] : [],
  };
}

export async function parseLines(lines) {
  const records = [], diagnostics = { lines: 0, unrelated: 0, malformed: 0, rejected: 0 };
  for await (const input of lines) {
    diagnostics.lines++;
    let line = String(input), outer;
    // Accept journalctl -o json, JSONL events, and ordinary journal text exports.
    try { outer = JSON.parse(line); } catch { /* a journal prefix is expected */ }
    if (outer && typeof outer.MESSAGE === 'string') line = outer.MESSAGE;
    const match = line.match(/\[(chatAi|aiAttempt)\]\s*(\{.*)$/);
    let record, tag;
    if (match) {
      tag = match[1];
      try { record = JSON.parse(match[2]); } catch { diagnostics.malformed++; continue; }
    } else if (outer && typeof outer === 'object' && outer.requestId) {
      record = outer;
      tag = outer.tag === 'aiAttempt' || outer.attemptId ? 'aiAttempt' : 'chatAi';
    } else { diagnostics.unrelated++; continue; }
    const safe = sanitizeRecord(record, tag);
    if (safe) records.push(safe); else diagnostics.rejected++;
  }
  return { records, diagnostics };
}

export function buildChains(records) {
  const map = new Map();
  for (const r of records) {
    const key = JSON.stringify([r.deploymentId, r.requestId]);
    if (!map.has(key)) map.set(key, { deploymentId: r.deploymentId, requestId: r.requestId, events: [] });
    map.get(key).events.push(r);
  }
  return [...map.values()].map(chain => {
    const events = chain.events.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    const start = events.find(r => r.tag === 'chatAi' && r.event === 'request_started');
    const finals = events.filter(r => r.tag === 'chatAi' && r.event === 'request_completed');
    const final = finals.at(-1);
    const identity = start || final || events[0];
    const attempts = new Map();
    for (const r of events.filter(r => r.tag === 'aiAttempt' && r.attemptId)) {
      if (!attempts.has(r.attemptId)) attempts.set(r.attemptId, { attemptId: r.attemptId, start: null, completion: null });
      const a = attempts.get(r.attemptId);
      if (r.event === 'started') a.start = r;
      if (r.event === 'completed') a.completion = r;
    }
    const gaps = [];
    if (!chain.deploymentId || !identity.commitSha || !identity.kind) gaps.push('missing_identity');
    if (!start) gaps.push('missing_request_start');
    if (!final) gaps.push('missing_request_completion');
    if (events.some(r => r.schemaVersion === null || r.schemaVersion < 2 || !r.event)) gaps.push('legacy_records');
    if (events.some(r => !r.timestamp)) gaps.push('missing_timestamp');
    if (finals.length > 1) gaps.push('duplicate_request_completion');
    for (const a of attempts.values()) {
      if (!a.start) gaps.push('missing_attempt_start');
      if (!a.completion) gaps.push('pending_attempt');
    }
    if (final?.attemptIds.some(id => !attempts.has(id))) gaps.push('missing_attempt_records');
    return {
      deploymentId: chain.deploymentId, requestId: chain.requestId, commitSha: identity.commitSha,
      kind: identity.kind || 'unknown', route: identity.route || 'unknown',
      startedAt: start?.timestamp || null, finishedAt: final?.timestamp || null,
      frontendVersion: identity.frontendVersion, requestedProvider: identity.requestedProvider || final?.requestedProvider || null,
      final: final || null, attempts: [...attempts.values()],
      complete: gaps.length === 0, gaps: [...new Set(gaps)], events,
    };
  });
}

export function filterChains(chains, options = {}) {
  return chains.filter(c => {
    const timestamp = c.startedAt || c.finishedAt || c.events.find(r => r.timestamp)?.timestamp;
    return (!options.requestId || c.requestId === options.requestId)
      && (!options.deploymentId || c.deploymentId === options.deploymentId)
      && (!options.route || c.route === options.route)
      && (!options.provider || c.events.some(r => r.provider === options.provider))
      && (!options.error || c.events.some(r => r.reason === options.error))
      && (!options.since || (timestamp ? timestamp >= options.since : !!options.requestId))
      && (!options.until || (timestamp ? timestamp < options.until : !!options.requestId));
  });
}

function summarize(chains) {
  const complete = chains.filter(c => c.complete && c.kind === 'http');
  const finalized = complete.map(c => c.final);
  const knownBusiness = finalized.filter(r => r.businessSuccess !== null);
  const aiRequests = complete.filter(c => c.attempts.length > 0);
  const attempts = complete.flatMap(c => c.attempts.map(a => a.completion));
  const kimi = attempts.filter(a => a.provider === 'kimi');
  const failedKimi = aiRequests.filter(c => c.attempts.some(a => a.completion.provider === 'kimi' && a.completion.outcome === 'error' && !a.completion.late));
  const takeovers = failedKimi.filter(c => {
    const firstFailure = c.attempts.filter(a => a.completion.provider === 'kimi' && a.completion.outcome === 'error' && !a.completion.late)
      .map(a => a.completion.timestamp).sort()[0];
    return c.attempts.some(a => a.start.timestamp >= firstFailure && a.completion.provider === 'deepseek' && a.completion.outcome === 'success' && !a.completion.late);
  });
  const errorCounts = {};
  for (const a of attempts.filter(a => a.outcome === 'error')) {
    const reason = a.reason || 'unknown';
    errorCounts[reason] = (errorCounts[reason] || 0) + 1;
  }
  const requestErrorImpact = new Map();
  for (const c of complete) {
    const categories = new Set(c.attempts.filter(a => a.completion.outcome === 'error').map(a => a.completion.reason || 'unknown'));
    for (const category of categories) {
      if (!requestErrorImpact.has(category)) requestErrorImpact.set(category, { category, affectedRequests: 0, finalBusinessFailures: 0, recoveredBusinessSuccesses: 0, businessOutcomeUnknown: 0 });
      const impact = requestErrorImpact.get(category);
      impact.affectedRequests++;
      if (c.final.businessSuccess === false) impact.finalBusinessFailures++;
      else if (c.final.businessSuccess === true) impact.recoveredBusinessSuccesses++;
      else impact.businessOutcomeUnknown++;
    }
  }
  const sourceCounts = {};
  for (const r of finalized) sourceCounts[r.source] = (sourceCounts[r.source] || 0) + 1;
  const elapsed = finalized.map(r => r.elapsedMs).filter(v => v !== null);
  return {
    observedRequestIds: chains.length,
    completeUserRequests: complete.length,
    incompleteUserRequests: chains.filter(c => c.kind === 'http' && !c.complete).length,
    backgroundRequests: chains.filter(c => c.kind === 'background').length,
    unknownOrLegacyRequests: chains.filter(c => c.kind === 'unknown').length,
    businessSuccess: metric(knownBusiness.filter(r => r.businessSuccess).length, knownBusiness.length),
    businessOutcomeUnknown: finalized.length - knownBusiness.length,
    modelAttempts: attempts.length, kimiAttemptSuccess: metric(kimi.filter(a => a.outcome === 'success').length, kimi.length),
    deepseekTakeover: { ...metric(takeovers.filter(c => c.final.businessSuccess === true && c.final.provider === 'deepseek').length, failedKimi.length), modelSucceeded: takeovers.length },
    templateFallback: metric(finalized.filter(r => r.source === 'fallback').length, finalized.length),
    sourceCounts, errorCounts,
    requestErrorImpact: [...requestErrorImpact.values()].map(r => ({ ...r, shareOfCompleteRequests: complete.length ? r.affectedRequests / complete.length : null }))
      .sort((a, b) => b.finalBusinessFailures - a.finalBusinessFailures || b.affectedRequests - a.affectedRequests || a.category.localeCompare(b.category)),
    latencyMs: { samples: elapsed.length, p50: percentile(elapsed, .5), p95: percentile(elapsed, .95) },
  };
}

export function report(chains, diagnostics = {}, options = {}) {
  const selected = filterChains(chains, options);
  const unplaced = options.since || options.until ? filterChains(chains, { ...options, since: null, until: null })
    .filter(c => !c.events.some(r => r.timestamp)) : [];
  const groups = new Map();
  for (const c of selected) {
    const key = JSON.stringify([c.deploymentId, c.route]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const times = selected.flatMap(c => c.events.map(r => r.timestamp).filter(Boolean)).sort();
  return {
    reportVersion: 1,
    window: { sinceInclusive: options.since || null, untilExclusive: options.until || null, firstObserved: times[0] || null, lastObserved: times.at(-1) || null },
    coverage: {
      ...diagnostics,
      journalCompleteness: 'unknown',
      note: 'Only complete HTTP lifecycles enter rates. Background, legacy, interrupted, missing and pending records are separate. An export cannot prove that journald retained every request.',
      incomplete: selected.filter(c => !c.complete).map(c => ({ deploymentId: c.deploymentId, requestId: c.requestId, gaps: c.gaps })),
      unplacedRequestsWithoutTime: unplaced.map(c => ({ deploymentId: c.deploymentId, requestId: c.requestId, gaps: c.gaps })),
    },
    totals: summarize(selected),
    groups: [...groups.values()].map(g => ({ deploymentId: g[0].deploymentId, route: g[0].route, ...summarize(g) })),
    definitions: {
      requestWindow: 'request start time; completion or first observation only when start is missing',
      businessSuccess: 'explicit businessSuccess=true / explicit known business outcomes among complete HTTP requests',
      kimiAttemptSuccess: 'successful Kimi attempts / completed Kimi attempts in complete HTTP requests',
      deepseekTakeover: 'business-successful requests finalized by DeepSeek whose attempt starts after a completed Kimi error / complete HTTP requests with a Kimi error before business completion; late outcomes do not count as takeover evidence',
      templateFallback: 'source=fallback / complete HTTP requests, including cached/local/system receipts',
      requestErrorImpact: 'distinct requests encountering each error, ranked by final business failures then affected requests; co-occurrence is evidence, not proof of root cause; categories may overlap',
      filters: 'route/provider/error select whole request chains; all attempts in selected chains remain included',
    },
  };
}

const help = `Usage: node scripts/observability/ai-logs.mjs [--file PATH | --journal | stdin]
  --request-id ID     Print the complete safe chain (including late attempts)
  --since ISO        Inclusive request-start boundary, explicit timezone required
  --until ISO        Exclusive request-start boundary, explicit timezone required
  --route /api/PATH   Select a route
  --provider kimi|deepseek   Select chains containing this provider
  --error CATEGORY   Select chains containing the error category
  --deployment-id ID  Select deployment
  --service NAME     Journal service, default soulsentry-backend
JSON output contains whitelisted metadata only. --journal defaults to last 24h;
file/stdin reports include all input unless a window is given. No server writes.
`;

export function parseArgs(args) {
  const options = {};
  const fields = { '--file': 'file', '--request-id': 'requestId', '--deployment-id': 'deploymentId', '--since': 'since', '--until': 'until', '--route': 'route', '--provider': 'provider', '--error': 'error', '--service': 'service' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    if (flag === '--journal') { options.journal = true; continue; }
    if (!fields[flag] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Unknown option or missing value; use --help');
    options[fields[flag]] = args[++i];
  }
  if (options.file && options.journal) throw new Error('Choose file or journal');
  for (const k of ['since', 'until']) if (options[k]) {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(options[k]) || !date(options[k])) throw new Error('Use ISO time with explicit timezone');
    options[k] = date(options[k]);
  }
  if (options.since && options.until && options.since >= options.until) throw new Error('since must precede until');
  if (options.provider && !providers.has(options.provider)) throw new Error('Invalid provider');
  if (options.error && !reasons.has(options.error)) throw new Error('Invalid error category');
  if (options.route && !safeRoute(options.route)) throw new Error('Invalid route');
  for (const k of ['requestId', 'deploymentId', 'service']) if (options[k] && !safeToken(options[k])) throw new Error('Invalid identifier');
  return options;
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) { process.stdout.write(help); return; }
  let child, input;
  if (options.journal) {
    options.since ||= new Date(Date.now() - 86400000).toISOString();
    const command = ['-u', options.service || 'soulsentry-backend', '--no-pager', '-o', 'json', '--since', options.since];
    if (options.until) command.push('--until', options.until);
    child = spawn('journalctl', command, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.resume(); // Do not echo potentially sensitive journal diagnostics.
    input = child.stdout;
  } else input = options.file ? createReadStream(options.file) : process.stdin;
  const completion = child ? new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('journalctl failed; check service access')));
  }) : Promise.resolve();
  const lines = createInterface({ input, crlfDelay: Infinity });
  const [{ records, diagnostics }] = await Promise.all([parseLines(lines), completion]);
  const chains = buildChains(records);
  const output = options.requestId ? {
    reportVersion: 1, diagnostics, journalCompleteness: 'unknown', chains: filterChains(chains, options),
  } : report(chains, diagnostics, options);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write('Unable to query AI logs. Check input, options (--help), and journal permissions.\n'); process.exitCode = 1; });
}

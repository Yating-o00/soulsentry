import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildChains, filterChains, parseArgs, parseLines, report } from './ai-logs.mjs';

const base = { schemaVersion: 2, deploymentId: 'prod-test', commitSha: 'a'.repeat(40), kind: 'http', route: '/api/companion/messages', requestedProvider: 'kimi' };
const at = seconds => `2026-11-25T00:00:${String(seconds).padStart(2, '0')}.000Z`;
const event = (requestId, seconds, values) => ({ ...base, requestId, timestamp: at(seconds), ...values });
const start = (id, seconds = 0, values = {}) => event(id, seconds, { tag: 'chatAi', event: 'request_started', ...values });
const finish = (id, seconds = 4, values = {}) => event(id, seconds, { tag: 'chatAi', event: 'request_completed', source: 'ai', provider: 'kimi', businessSuccess: true, outcome: 'success', elapsedMs: 4000, status: 200, attemptIds: [], ...values });

test('analysis completion and template reply remain distinct in the query and metrics', async () => {
  const input = [start('analysis-template'), finish('analysis-template', 4, {
    source: 'fallback', analysisSource: 'ai', provider: null, businessSuccess: true,
  })].map(row => JSON.stringify(row));
  const { records, diagnostics } = await parseLines(input);
  const chains = buildChains(records);
  assert.equal(chains[0].final.analysisSource, 'ai');
  assert.equal(chains[0].final.source, 'fallback');
  const result = report(chains, diagnostics);
  assert.equal(result.totals.businessSuccess.rate, 1);
  assert.equal(result.totals.templateFallback.rate, 1);
  assert.equal(result.totals.kimiAttemptSuccess.denominator, 0);
});
const attempt = (id, attemptId, provider, seconds, outcome = 'success', reason = null, extra = {}) => [
  event(id, seconds, { tag: 'aiAttempt', attemptId, provider, event: 'started', outcome: 'pending', model: `${provider}-chat` }),
  event(id, seconds + 1, { tag: 'aiAttempt', attemptId, provider, event: 'completed', outcome, reason, elapsedMs: 1000, status: outcome === 'success' ? 200 : 429, model: `${provider}-chat`, ...extra }),
];
const parse = async records => parseLines(records.map(r => JSON.stringify(r)));
const chainsFor = async records => buildChains((await parse(records)).records);

test('request denominator differs from attempts and DeepSeek takeover counts business outcome', async () => {
  const records = [
    start('recover'), ...attempt('recover', 'a1', 'kimi', 0, 'error', 'insufficient_balance'),
    ...attempt('recover', 'a2', 'deepseek', 2), finish('recover', 4, { provider: 'deepseek', attemptIds: ['a1', 'a2'] }),
    start('upstream-success-business-fail', 5), ...attempt('upstream-success-business-fail', 'a3', 'kimi', 5),
    finish('upstream-success-business-fail', 7, { businessSuccess: false, source: 'fallback', outcome: 'failure', attemptIds: ['a3'], elapsedMs: 2000 }),
    start('all-fail', 10), ...attempt('all-fail', 'a4', 'kimi', 10, 'error', 'rate_limited'),
    ...attempt('all-fail', 'a5', 'deepseek', 12, 'error', 'timeout'),
    finish('all-fail', 14, { provider: null, source: 'fallback', businessSuccess: false, outcome: 'failure', attemptIds: ['a4', 'a5'], elapsedMs: 10000 }),
  ];
  const result = report(await chainsFor(records));
  assert.equal(result.totals.completeUserRequests, 3);
  assert.equal(result.totals.modelAttempts, 5);
  assert.deepEqual(result.totals.businessSuccess, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.deepEqual(result.totals.kimiAttemptSuccess, { numerator: 1, denominator: 3, rate: 1 / 3 });
  assert.equal(result.totals.deepseekTakeover.denominator, 2);
  assert.equal(result.totals.deepseekTakeover.numerator, 1);
  assert.equal(result.totals.templateFallback.rate, 2 / 3);
  assert.deepEqual(result.totals.errorCounts, { insufficient_balance: 1, rate_limited: 1, timeout: 1 });
  assert.equal(result.totals.requestErrorImpact.find(x => x.category === 'insufficient_balance').recoveredBusinessSuccesses, 1);
  assert.equal(result.totals.requestErrorImpact[0].finalBusinessFailures, 1);
  assert.deepEqual(result.totals.latencyMs, { samples: 3, p50: 4000, p95: 10000 });
});

test('cache, local and system receipts stay separate; legacy and lost records do not enter rates', async () => {
  const records = [
    ...['cached', 'local', 'system'].flatMap((source, i) => [start(source, i), finish(source, i + 1, { source, businessSuccess: null, provider: null })]),
    { requestId: 'legacy', source: 'ai', provider: 'kimi', elapsedMs: 10 },
    start('missing-end', 5), ...attempt('missing-end', 'a1', 'kimi', 5),
    start('pending', 10), attempt('pending', 'a2', 'kimi', 10)[0], finish('pending', 11, { attemptIds: ['a2'] }),
    finish('missing-attempt', 12, { attemptIds: ['missing'] }),
    start('background', 15, { kind: 'background', route: '/background/patrol' }),
    finish('background', 16, { kind: 'background', route: '/background/patrol' }),
  ];
  const result = report(await chainsFor(records));
  assert.equal(result.totals.completeUserRequests, 3);
  assert.equal(result.totals.incompleteUserRequests, 3);
  assert.equal(result.totals.unknownOrLegacyRequests, 1);
  assert.equal(result.totals.backgroundRequests, 1);
  assert.deepEqual(result.totals.sourceCounts, { cached: 1, local: 1, system: 1 });
  assert.equal(result.totals.businessSuccess.rate, null);
  assert.equal(result.totals.kimiAttemptSuccess.rate, null);
  assert.equal(result.coverage.journalCompleteness, 'unknown');
  assert.ok(result.coverage.incomplete.find(c => c.requestId === 'pending').gaps.includes('pending_attempt'));
  assert.ok(result.coverage.incomplete.find(c => c.requestId === 'missing-attempt').gaps.includes('missing_attempt_records'));
});

test('full request query includes late success without rewriting final business failure', async () => {
  const records = [start('late'), ...attempt('late', 'kimi1', 'kimi', 0, 'error', 'timeout'),
    attempt('late', 'ds1', 'deepseek', 2)[0],
    finish('late', 3, { businessSuccess: false, outcome: 'failure', source: 'fallback', provider: null, attemptIds: ['kimi1', 'ds1'] }),
    attempt('late', 'ds1', 'deepseek', 2, 'success', null, { timestamp: at(8), late: true })[1]];
  const chains = await chainsFor(records);
  assert.equal(chains[0].complete, true);
  assert.equal(chains[0].final.businessSuccess, false);
  assert.equal(chains[0].attempts[1].completion.late, true);
  assert.equal(report(chains).totals.deepseekTakeover.numerator, 0);
  assert.equal(report(chains).totals.deepseekTakeover.modelSucceeded, 0);
  assert.equal(filterChains(chains, { requestId: 'late', until: at(4) })[0].events.at(-1).timestamp, at(8));
});

test('journal text, journal JSON and plain JSONL are accepted and only whitelisted metadata leaves parser', async () => {
  const leaked = { prompt: 'private prompt', response: 'private response', key: 'sk-secret', errorCode: 'sk-do-not-output', upstreamRequestId: 'BearerSecret' };
  const records = [
    'Nov 25 host node[23]: [chatAi] ' + JSON.stringify({ ...start('redact'), ...leaked }),
    JSON.stringify({ MESSAGE: '[aiAttempt] ' + JSON.stringify({ ...attempt('redact', 'a1', 'kimi', 0)[0], ...leaked }), _PID: '23' }),
    '[aiAttempt] ' + JSON.stringify(attempt('redact', 'a1', 'kimi', 0)[1]),
    JSON.stringify(finish('redact', 4, { attemptIds: ['a1'] })),
    '[chatAi] {broken JSON', 'unrelated process message', '[chatAi] ' + JSON.stringify({ requestId: 'email@example.com' }),
  ];
  const parsed = await parseLines(records);
  assert.equal(parsed.records.length, 4);
  assert.equal(parsed.diagnostics.malformed, 1);
  assert.equal(parsed.diagnostics.unrelated, 1);
  assert.equal(parsed.diagnostics.rejected, 1);
  const output = JSON.stringify(buildChains(parsed.records));
  for (const secret of ['private prompt', 'private response', 'sk-secret', 'sk-do-not-output', 'BearerSecret', 'email@example.com']) assert.ok(!output.includes(secret));
});

test('filter population keeps complete chain and groups independently by deployment and route', async () => {
  const records = [
    start('r1'), ...attempt('r1', 'a1', 'kimi', 0, 'error', 'rate_limited'), ...attempt('r1', 'a2', 'deepseek', 2), finish('r1', 4, { provider: 'deepseek', attemptIds: ['a1', 'a2'] }),
    start('r2', 10, { deploymentId: 'other', route: '/api/functions/analyzeHeartSign' }),
    finish('r2', 12, { deploymentId: 'other', route: '/api/functions/analyzeHeartSign' }),
  ];
  const chains = await chainsFor(records);
  const result = report(chains, {}, { provider: 'deepseek', error: 'rate_limited', since: at(0), until: at(10) });
  assert.equal(result.totals.completeUserRequests, 1);
  assert.equal(result.totals.modelAttempts, 2);
  assert.equal(result.groups.length, 1);
  assert.equal(report(chains).groups.length, 2);
  assert.equal(filterChains(chains, { since: at(10), until: at(15) })[0].requestId, 'r2');
});

test('same request ID on different deployments does not merge; duplicates/old schema are incomplete', async () => {
  const records = [start('collision'), finish('collision'),
    start('collision', 1, { deploymentId: 'second' }), finish('collision', 5, { deploymentId: 'second' }),
    start('duplicate'), finish('duplicate'), finish('duplicate'),
    start('old', 1, { schemaVersion: 1 }), finish('old', 4, { schemaVersion: 1 })];
  const chains = await chainsFor(records);
  assert.equal(chains.length, 4);
  assert.equal(report(chains).totals.completeUserRequests, 2);
  assert.ok(chains.find(c => c.requestId === 'duplicate').gaps.includes('duplicate_request_completion'));
  assert.ok(chains.find(c => c.requestId === 'old').gaps.includes('legacy_records'));
});

test('background dot-entry names survive sanitation and provider falls back to final event', async () => {
  const records = [start('job', 0, { kind: 'background', route: 'companion.patrol', requestedProvider: undefined }),
    finish('job', 4, { kind: 'background', route: 'companion.patrol', requestedProvider: 'deepseek' })];
  const chains = await chainsFor(records);
  assert.equal(chains[0].route, 'companion.patrol');
  assert.equal(chains[0].requestedProvider, 'deepseek');
  assert.equal(filterChains(chains, { route: 'companion.patrol' }).length, 1);
  assert.equal(report(chains).totals.completeUserRequests, 0);
  assert.equal(report(chains).totals.backgroundRequests, 1);
});

test('parallel DeepSeek work and late Kimi failures do not masquerade as sequential takeover', async () => {
  const records = [
    start('parallel'), attempt('parallel', 'k1', 'kimi', 0, 'error', 'timeout')[0],
    ...attempt('parallel', 'd1', 'deepseek', 1),
    attempt('parallel', 'k1', 'kimi', 0, 'error', 'timeout', { timestamp: at(3) })[1],
    finish('parallel', 4, { provider: 'deepseek', attemptIds: ['k1', 'd1'] }),
    start('detached', 10), finish('detached', 11, { source: 'system', provider: null, businessSuccess: null }),
    ...attempt('detached', 'k2', 'kimi', 12, 'error', 'timeout', { late: true }),
  ];
  const result = report(await chainsFor(records));
  assert.equal(result.totals.completeUserRequests, 2);
  assert.equal(result.totals.deepseekTakeover.denominator, 1);
  assert.equal(result.totals.deepseekTakeover.numerator, 0);
  assert.equal(result.totals.deepseekTakeover.modelSucceeded, 0);
});

test('CLI reads exported stdin, emits safe JSON, and rejects ambiguous time windows', () => {
  const cli = new URL('./ai-logs.mjs', import.meta.url);
  const input = [start('cli'), ...attempt('cli', 'a1', 'kimi', 0), finish('cli', 4, { attemptIds: ['a1'] })].map(JSON.stringify).join('\n');
  const result = spawnSync(process.execPath, [cli.pathname, '--request-id', 'cli'], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).chains[0].attempts[0].completion.provider, 'kimi');
  for (const args of [['--since', '2026-11-25'], ['--provider', 'secret'], ['--file', 'x', '--journal'], ['--since', at(4), '--until', at(0)]]) {
    assert.throws(() => parseArgs(args));
  }
  const invalid = spawnSync(process.execPath, [cli.pathname, '--provider', 'sk-secret'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.ok(!invalid.stderr.includes('sk-secret'));
});

test('mixed deployment journal fixture preserves version lifetimes and restart gaps in CLI report', () => {
  const cli = new URL('./ai-logs.mjs', import.meta.url);
  const fixture = new URL('./fixtures/mixed-deployments.journal.jsonl', import.meta.url);
  const result = spawnSync(process.execPath, [cli.pathname, '--file', fixture.pathname,
    '--since', '2026-11-25T00:00:00Z', '--until', '2026-11-26T00:00:00Z'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.totals.completeUserRequests, 2);
  assert.equal(output.totals.incompleteUserRequests, 1);
  // The legacy event has no timestamp; the explicit window cannot place it.
  assert.equal(output.totals.unknownOrLegacyRequests, 0);
  assert.equal(output.coverage.unplacedRequestsWithoutTime[0].requestId, 'old-no-lifecycle');
  assert.equal(output.coverage.incomplete[0].requestId, 'interrupted-by-restart');
  assert.ok(output.coverage.incomplete[0].gaps.includes('pending_attempt'));
  const before = output.groups.find(g => g.deploymentId === 'prod-a');
  const after = output.groups.find(g => g.deploymentId === 'prod-b');
  assert.equal(before.completeUserRequests, 1);
  assert.equal(before.incompleteUserRequests, 1);
  assert.equal(before.kimiAttemptSuccess.rate, 1);
  assert.equal(after.completeUserRequests, 1);
  assert.equal(after.kimiAttemptSuccess.rate, null);
  assert.equal(after.deepseekTakeover.denominator, 0);
  assert.equal(output.totals.latencyMs.p50, 2000);
  assert.equal(output.totals.latencyMs.p95, 3000);
  const all = spawnSync(process.execPath, [cli.pathname, '--file', fixture.pathname], { encoding: 'utf8' });
  assert.equal(all.status, 0, all.stderr);
  assert.equal(JSON.parse(all.stdout).totals.unknownOrLegacyRequests, 1);
  const legacy = spawnSync(process.execPath, [cli.pathname, '--file', fixture.pathname,
    '--request-id', 'old-no-lifecycle', '--since', '2026-11-25T00:00:00Z'], { encoding: 'utf8' });
  assert.equal(legacy.status, 0, legacy.stderr);
  assert.equal(JSON.parse(legacy.stdout).chains.length, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import { buildChains, parseLines, report } from './ai-logs.mjs';

test('real provider telemetry feeds report across concurrent HTTP business outcomes', async t => {
  // A real temporary release gives the immutable identity loader its production
  // directory layout. Calls use mocked fetch; no API or service is contacted.
  const root = mkdtempSync(join(tmpdir(), 'soulsentry-telemetry-contract-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'backend/src/lib'), { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  writeFileSync(join(root, 'release-identity.json'), JSON.stringify({ deploymentId: 'prod-contract', commitSha: 'a'.repeat(40), builtAt: '2026-11-25T00:00:00Z' }));
  for (const file of ['aiContext.js', 'releaseIdentity.js', 'kimi.js']) copyFileSync(new URL(`../../backend/src/lib/${file}`, import.meta.url), join(root, 'backend/src/lib', file));
  const { aiHttpContext, aiRequestContext } = await import(pathToFileURL(join(root, 'backend/src/lib/aiContext.js')));
  const { callKimiChat } = await import(pathToFileURL(join(root, 'backend/src/lib/kimi.js')));
  const old = Object.fromEntries(['KIMI_API_KEY', 'MOONSHOT_API_KEY', 'KIMI_FALLBACK_API_KEY', 'MOONSHOT_FALLBACK_API_KEY', 'DEEPSEEK_API_KEY', 'CHAT_AI_PROVIDER', 'CHAT_AI_EXPERIMENT_ENABLED'].map(k => [k, process.env[k]]));
  t.after(() => Object.entries(old).forEach(([k, v]) => v === undefined ? delete process.env[k] : process.env[k] = v));
  Object.keys(old).forEach(k => delete process.env[k]);
  process.env.KIMI_API_KEY = 'sk-contract-private';
  process.env.DEEPSEEK_API_KEY = 'sk-contract-deepseek-private';
  const lines = [];
  t.mock.method(console, 'info', (tag, data) => lines.push(`${tag} ${data}`));
  t.mock.method(console, 'log', () => {});
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.messages[0].content === 'recover' && !url.includes('deepseek')) return new Response('{"error":{"code":"insufficient_balance","message":"private upstream detail"}}', { status: 429 });
    return new Response('{"choices":[{"message":{"content":"private reply"}}]}');
  });
  const request = (prompt, source) => new Promise((resolve, reject) => {
    const req = { get: () => undefined, baseUrl: '/api/companion', route: { path: '/messages' } };
    const res = new EventEmitter();
    Object.assign(res, { statusCode: 200, setHeader() {}, json(body) { this.writableFinished = true; this.emit('finish'); resolve(body); return this; } });
    aiHttpContext(req, res, () => aiRequestContext(req, res, () => callKimiChat({ messages: [{ role: 'user', content: prompt }], models: ['kimi-test'], singleAttempt: true })
      .then(() => res.json({ source })).catch(reject)));
  });
  await Promise.all([request('recover', 'ai'), request('preparatory-only', 'fallback'), request('receipt', 'agent')]);
  const parsed = await parseLines(lines);
  const chains = buildChains(parsed.records);
  const output = report(chains);
  assert.equal(chains.length, 3);
  assert.ok(chains.every(c => c.complete));
  assert.equal(output.totals.completeUserRequests, 3);
  assert.equal(output.totals.modelAttempts, 4);
  assert.deepEqual(output.totals.businessSuccess, { numerator: 1, denominator: 2, rate: .5 });
  assert.deepEqual(output.totals.sourceCounts, { ai: 1, fallback: 1, system: 1 });
  assert.equal(output.totals.businessOutcomeUnknown, 1);
  assert.equal(output.totals.deepseekTakeover.numerator, 1);
  assert.equal(output.totals.deepseekTakeover.denominator, 1);
  assert.equal(output.totals.kimiAttemptSuccess.numerator, 2);
  assert.equal(output.totals.kimiAttemptSuccess.denominator, 3);
  assert.doesNotMatch(JSON.stringify({ lines, output }), /private reply|private upstream detail|sk-contract/);
});

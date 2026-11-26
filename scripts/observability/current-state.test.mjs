import test from 'node:test';
import assert from 'node:assert/strict';
import { configurationPresence, safeIdentity } from './current-state.mjs';

test('current state reports presence only, without executing shell syntax or disclosing credentials', () => {
  const input = 'KIMI_API_KEY="sk-kimi-private"\nDEEPSEEK_API_KEY=sk-deepseek-private\nCHAT_AI_EXPERIMENT_ENABLED=1\nEVIL=$(touch /tmp/this-must-not-run)\n';
  const output = configurationPresence(input);
  assert.deepEqual(output, { kimiKeyPresent: true, deepseekKeyPresent: true, experimentEnabled: true });
  assert.ok(!JSON.stringify(output).includes('private'));
  assert.deepEqual(configurationPresence('KIMI_API_KEY=\0DEEPSEEK_API_KEY=foo\0CHAT_AI_EXPERIMENT_ENABLED=0', '\0'), {
    kimiKeyPresent: false, deepseekKeyPresent: true, experimentEnabled: false,
  });
  assert.equal(configurationPresence('MOONSHOT_API_KEY=alias-private').kimiKeyPresent, true);
});

test('version collection whitelists identity and preserves unknown legacy version', () => {
  assert.deepEqual(safeIdentity({ deploymentId: 'prod-20261125-a', commitSha: 'a'.repeat(40), builtAt: '2026-11-25T00:00:00Z', key: 'private', cwd: '/secret' }), {
    deploymentId: 'prod-20261125-a', commitSha: 'a'.repeat(40), builtAt: '2026-11-25T00:00:00.000Z',
  });
  assert.deepEqual(safeIdentity({ error: 'not found' }), { deploymentId: null, commitSha: null, builtAt: null });
});

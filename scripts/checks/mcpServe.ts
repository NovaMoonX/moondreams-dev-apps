import assert from 'node:assert/strict';

import { clientNameFor } from '../../functions/src/mcp/clientName.ts';
import {
  LAST_USED_WRITE_MS,
  clientKeyFor,
  clientStanding,
  protectedResourceMetadata,
  readBearerToken,
  wwwAuthenticate,
} from '../../functions/src/mcp/shapes.ts';

const RESOURCE = 'https://apps.moondreams.dev/mcp/helm';

const names: [string, string][] = [
  ['https://claude.ai/oauth/mcp-oauth-client-metadata', 'Claude'],
  ['https://mcp.anthropic.com/client.json', 'Claude'],
  ['https://chatgpt.com/oauth/client.json', 'ChatGPT'],
  ['https://auth.openai.com/x', 'ChatGPT'],
  ['https://gemini.google.com/client', 'Gemini'],
  ['https://x.googleusercontent.com/c', 'Gemini'],
  ['https://notclaude.ai/x', 'An assistant'],
  ['https://claude.ai.evil.example/x', 'An assistant'],
  ['client_01HXYZ', 'An assistant'],
  ['', 'An assistant'],
];
names.forEach(([clientId, name]) =>
  assert.equal(clientNameFor(clientId), name, clientId),
);

assert.match(clientKeyFor('https://claude.ai/x'), /^[0-9a-f]{32}$/);
assert.notEqual(clientKeyFor('a'), clientKeyFor('b'));

assert.equal(
  wwwAuthenticate(RESOURCE),
  'Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="https://apps.moondreams.dev/.well-known/oauth-protected-resource/mcp/helm"',
);
assert.deepEqual(
  protectedResourceMetadata(RESOURCE, 'https://bright-sky-12.authkit.app'),
  {
    resource: RESOURCE,
    authorization_servers: ['https://bright-sky-12.authkit.app'],
    bearer_methods_supported: ['header'],
  },
);

assert.equal(readBearerToken('Bearer abc.def'), 'abc.def');
assert.equal(readBearerToken('bearer abc'), 'abc');
assert.equal(readBearerToken('Basic abc'), null);
assert.equal(readBearerToken(undefined), null);

const NOW = 1_000_000_000_000;
const seconds = (ms: number) => Math.floor(ms / 1000);
assert.deepEqual(
  clientStanding({ lastUsedAt: NOW, revokedAt: null }, seconds(NOW), NOW),
  { kind: 'ok', clearRevoked: false, touchLastUsed: false },
);
assert.deepEqual(
  clientStanding(
    { lastUsedAt: NOW - LAST_USED_WRITE_MS, revokedAt: null },
    seconds(NOW),
    NOW,
  ),
  { kind: 'ok', clearRevoked: false, touchLastUsed: true },
  'last used is written at most every ten minutes',
);
assert.deepEqual(
  clientStanding(
    { lastUsedAt: NOW, revokedAt: NOW - 5_000 },
    seconds(NOW - 60_000),
    NOW,
  ),
  { kind: 'revoked' },
  'a token issued before the disconnect stays refused',
);
assert.deepEqual(
  clientStanding(
    { lastUsedAt: NOW, revokedAt: NOW - 60_000 },
    seconds(NOW),
    NOW,
    NOW - 30_000,
  ),
  { kind: 'ok', clearRevoked: true, touchLastUsed: false },
  'a token issued after the disconnect, with a sign-in after it, is a reconnect',
);
assert.deepEqual(
  clientStanding(
    { lastUsedAt: NOW, revokedAt: NOW - 60_000 },
    seconds(NOW),
    NOW,
    NOW - 120_000,
  ),
  { kind: 'revoked' },
  'a refreshed token with no sign-in since the disconnect stays refused',
);
assert.deepEqual(
  clientStanding(
    { lastUsedAt: NOW, revokedAt: NOW - 60_000 },
    seconds(NOW),
    NOW,
  ),
  { kind: 'revoked' },
  'no sign-in on record stays refused',
);

console.log('mcpServe: ok');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isGateOpenFor } from '../../functions/src/gates/gateLogic.ts';
import { FEATURE_GATES } from '../../src/lib/gates/gates.registry.ts';
import { isGateOpen, readGateSetting } from '../../src/lib/gates/gateAccess.ts';

interface GateCase {
  name: string;
  setting: Record<string, unknown> | null;
  defaultRollout: 'off' | 'testing' | 'everyone';
  isAdmin: boolean;
  expected: boolean;
}

const cases = JSON.parse(readFileSync('scripts/checks/gateCases.json', 'utf8')) as GateCase[];

// The shared table is the one definition of "open"; the browser and the Functions helper must agree with it (the rules run it against the emulator in check:gate-rules).
cases.forEach((gateCase) => {
  const viewer = { uid: 'u', isAdmin: gateCase.isAdmin };
  const doc = gateCase.setting && {
    appId: 'x',
    gates: { g: gateCase.setting },
  };
  const entry = { ...FEATURE_GATES[0], appId: 'x', id: 'g', defaultRollout: gateCase.defaultRollout };
  FEATURE_GATES.push(entry as (typeof FEATURE_GATES)[number]);
  try {
    const client = isGateOpen(readGateSetting(doc as never, 'x', 'g'), viewer);
    assert.equal(client, gateCase.expected, `browser: ${gateCase.name}`);
  } finally {
    FEATURE_GATES.pop();
  }
  assert.equal(
    isGateOpenFor(gateCase.setting ?? undefined, gateCase.defaultRollout, viewer),
    gateCase.expected,
    `functions: ${gateCase.name}`,
  );
});

// Every enforced switch is guarded in the rules with the registry's default, and every rules call names an enforced switch.
const rules = readFileSync('firestore.rules', 'utf8');
const calls = [...rules.matchAll(/isGateOpen\('([^']+)', '([^']+)', '([^']+)'\)/g)].map(
  ([, appId, gateId, defaultRollout]) => ({ appId, gateId, defaultRollout }),
);

FEATURE_GATES.filter((gate) => gate.isServerEnforced).forEach((gate) => {
  const matching = calls.filter((call) => call.appId === gate.appId && call.gateId === gate.id);
  assert.ok(matching.length > 0, `${gate.appId}/${gate.id} is isServerEnforced but no rule calls isGateOpen for it`);
  matching.forEach((call) =>
    assert.equal(call.defaultRollout, gate.defaultRollout, `${gate.appId}/${gate.id}: the rules' default differs from the registry's`),
  );
});

calls.forEach((call) => {
  const gate = FEATURE_GATES.find((entry) => entry.appId === call.appId && entry.id === call.gateId);
  assert.ok(gate?.isServerEnforced, `a rule calls isGateOpen('${call.appId}', '${call.gateId}') but the registry doesn't mark it isServerEnforced`);
});

console.log(`gates: ok (${cases.length} cases, ${calls.length} rule calls)`);

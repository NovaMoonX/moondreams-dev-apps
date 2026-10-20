import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { initializeApp } from 'firebase/app';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from 'firebase/functions';

import { toWireNodes } from '../../functions/src/linkMetadata/wireNodes';

let passed = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) throw new Error(`FAILED: ${name}`);
  passed += 1;
};

const recipe = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Adobo',
  author: { '@type': 'Person', name: 'Test Kitchen' },
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Simmer.' },
    { '@type': ['HowToStep', 'Thing'], text: 'Reduce.' },
  ],
  '@id': 'https://example.test/adobo#recipe',
};

const hasAtKey = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasAtKey)
    : typeof value === 'object' && value !== null
      ? Object.entries(value).some(
          ([key, entry]) => key.startsWith('@') || hasAtKey(entry),
        )
      : false;

const wired = toWireNodes([recipe]);
check('no key starts with @ at any depth', !hasAtKey(wired));
check('the type survives as _type', wired[0]._type === 'Recipe');
check(
  'a nested type survives',
  (wired[0].author as Record<string, unknown>)._type === 'Person',
);
check(
  'an array of types survives',
  JSON.stringify(wired[0].recipeInstructions).includes('["HowToStep","Thing"]'),
);
check(
  'plain values are kept',
  wired[0].name === 'Adobo' &&
    wired[0]._id === 'https://example.test/adobo#recipe',
);
check('the input is not changed', recipe['@type'] === 'Recipe');
check('an empty list stays empty', toWireNodes([]).length === 0);

const read = async (nodes: unknown) => {
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          result: {
            url: 'https://example.test/adobo',
            title: 'Adobo',
            structuredData: nodes,
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const app = initializeApp(
      { projectId: 'check', apiKey: 'check' },
      `check-${Math.random()}`,
    );
    const functions = getFunctions(app);
    connectFunctionsEmulator(
      functions,
      '127.0.0.1',
      (server.address() as AddressInfo).port,
    );
    return await httpsCallable<unknown, { structuredData: unknown }>(
      functions,
      'fetchPageContent',
    )({ url: 'https://example.test/adobo' });
  } finally {
    server.close();
  }
};

const raw = await read([recipe]).then(
  () => 'decoded',
  (error: unknown) => (error instanceof Error ? error.message : String(error)),
);
check(
  'the client refuses a response that holds @type (the bug)',
  /cannot be decoded/i.test(raw),
);
const fixed = await read(wired);
check(
  'the client reads the same page once its keys are rewritten',
  JSON.stringify(fixed.data.structuredData) === JSON.stringify(wired),
);

console.log(`pageContentWire: ${passed} checks passed`);
process.exit(0);

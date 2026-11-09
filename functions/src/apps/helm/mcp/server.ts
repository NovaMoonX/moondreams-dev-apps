import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildHelmTools, type HelmToolScope } from './buildTools.js';

const RESULT_CHAR_CAP = 6_000;

const encode = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

/** Keeps a tool result whole JSON under the cap by returning fewer list items and saying so, never by cutting the text. */
const fitResult = (result: unknown): string => {
  const whole = encode(result);
  if (whole.length <= RESULT_CHAR_CAP) return whole;
  const record = (result ?? {}) as Record<string, unknown>;
  const key = Object.keys(record).find((name) => Array.isArray(record[name]));
  if (!key) return encode({ truncated: true });
  const list = record[key] as unknown[];
  const fit = (count: number): string => {
    const text = encode({
      ...record,
      [key]: list.slice(0, count),
      truncated: true,
    });
    return text.length <= RESULT_CHAR_CAP || count === 0
      ? text
      : fit(count - 1);
  };
  return fit(list.length - 1);
};

/** A server and its client, joined in process for one call: Anthropic sees the tool definitions and results, never an endpoint or a credential. */
export async function createHelmMcpServer(scope: HelmToolScope) {
  const server = new McpServer({ name: 'helm', version: '1.0.0' });
  buildHelmTools(scope).forEach((tool) => {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.shape },
      async (input) => {
        const result = await tool.run(input as never);
        return {
          content: [
            {
              type: 'text' as const,
              text: fitResult(result),
            },
          ],
        };
      },
    );
  });
  const client = new Client({ name: 'helm-nomos', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

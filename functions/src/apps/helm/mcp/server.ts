import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildHelmTools, type HelmToolScope } from './buildTools.js';

const RESULT_CHAR_CAP = 6_000;

const encode = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

/** Keeps a tool result whole JSON under the cap by returning fewer list items and saying so, never by cutting the text. */
const fitResult = (result: unknown, cap: number): string => {
  const whole = encode(result);
  if (whole.length <= cap) return whole;
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
    return text.length <= cap || count === 0 ? text : fit(count - 1);
  };
  return fit(list.length - 1);
};

/** The tools an audience is offered, plus any named in extraTools. */
export const offeredHelmTools = (
  tools: ReturnType<typeof buildHelmTools>,
  audience: 'nomos' | 'external',
  extraTools: string[] = [],
) =>
  tools.filter(
    (tool) =>
      tool.audience === 'both' ||
      tool.audience === audience ||
      extraTools.includes(tool.name),
  );

/** Registers the tools an audience is offered; every one only reads and none reaches beyond the person's own records. */
export function registerHelmTools(
  server: McpServer,
  tools: ReturnType<typeof buildHelmTools>,
  audience: 'nomos' | 'external',
  extraTools: string[] = [],
) {
  offeredHelmTools(tools, audience, extraTools).forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        description:
          audience === 'external'
            ? (tool.externalDescription ?? tool.description)
            : tool.description,
        inputSchema: tool.shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (input: Record<string, unknown>) => {
        const result = await tool.run(input as never);
        return {
          content: [
            {
              type: 'text' as const,
              text: fitResult(result, tool.maxChars ?? RESULT_CHAR_CAP),
            },
          ],
        };
      },
    );
  });
}

/** A server and its client, joined in process for one call: Anthropic sees the tool definitions and results, never an endpoint or a credential. */
export async function createHelmMcpServer(scope: HelmToolScope) {
  const server = new McpServer({ name: 'helm', version: '1.0.0' });
  registerHelmTools(server, buildHelmTools(scope), 'nomos');
  const client = new Client({ name: 'helm-nomos', version: '1.0.0' });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

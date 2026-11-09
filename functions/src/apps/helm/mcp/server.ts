import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { buildHelmTools, type HelmToolScope } from './buildTools.js';

const RESULT_CHAR_CAP = 6_000;

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
              text: JSON.stringify(result)
                .replace(/</g, '\\u003c')
                .slice(0, RESULT_CHAR_CAP),
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

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type { ModelRole, ModelUsage } from './models.js';

export interface ToolLoopLimits {
  maxTurns: number;
  maxToolCalls: number;
  maxMillis: number;
}

export interface TerminalTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** One part of a message: words, or a picture as base64. */
export type ToolLoopContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/webp'; data: string };

/** The words of a message, whichever shape it has. */
export const messageText = (content: string | ToolLoopContent[]): string =>
  typeof content === 'string'
    ? content
    : content.map((part) => (part.type === 'text' ? part.text : '')).join('\n');

export interface ToolLoopRequest {
  role: ModelRole;
  system: string;
  messages: {
    role: 'user' | 'assistant';
    content: string | ToolLoopContent[];
  }[];
  mcpClient: Pick<Client, 'listTools' | 'callTool'>;
  terminalTool: TerminalTool;
  /** Other tools that also end the loop; the result names which one did. */
  extraTerminalTools?: TerminalTool[];
  limits: ToolLoopLimits;
  /** Called with each response's usage as it arrives, so spend is recorded even if the call is cut short. */
  onUsage?: (usage: ModelUsage) => void | Promise<void>;
  /** Ends the loop at the next step with `aborted`; usage already reported stays reported. */
  signal?: AbortSignal;
}

export type ToolLoopEnd =
  'terminal' | 'limit' | 'refused' | 'noTerminal' | 'error' | 'aborted';

export interface ToolLoopResult {
  terminalInput: unknown;
  /** The terminal tool that ended the loop; null when it ended any other way. */
  terminalName: string | null;
  endedBy: ToolLoopEnd;
  errorCode: string | null;
  usage: ModelUsage;
  toolCalls: string[];
}

export interface ModelProvider {
  runToolLoop(request: ToolLoopRequest): Promise<ToolLoopResult>;
}

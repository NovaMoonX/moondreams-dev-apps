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

export interface ToolLoopRequest {
  role: ModelRole;
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  mcpClient: Pick<Client, 'listTools' | 'callTool'>;
  terminalTool: TerminalTool;
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
  endedBy: ToolLoopEnd;
  errorCode: string | null;
  usage: ModelUsage;
  toolCalls: string[];
}

export interface ModelProvider {
  runToolLoop(request: ToolLoopRequest): Promise<ToolLoopResult>;
}

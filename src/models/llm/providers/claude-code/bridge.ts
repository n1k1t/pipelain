import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { v4 } from 'uuid';

import type { Tool } from 'ai';
import type {
  ILlmClaudeCodeBridgeToolResult,
  ILlmClaudeCodeJsonRpcMessage,
  TLlmClaudeCodeFunctionTool,
  TLlmClaudeCodeJsonRpcAnswer,
} from './types';

import { BRIDGE_NAME, consumeToolOutput, isJsonRpcMessage, reply } from './utils';
import { parseJsonSafe } from '../../../../utils';

/** MCP protocol version which is used when the client does not provide its own */
const PROTOCOL_VERSION = '2025-06-18';

/**
 * MCP server which exposes executable pipeline tools to Claude Code CLI (Streamable HTTP transport with JSON answers)
 * Listens on `127.0.0.1` with a random port and requires a random bearer token
 */
export class LlmClaudeCodeBridge {
  public readonly token: string = randomBytes(32).toString('hex');
  public url?: string;

  private server: Server = createServer((request, response) => this.handle(request, response));

  constructor(
    public tools: Record<string, Tool>,
    public definitions: TLlmClaudeCodeFunctionTool[],
    public signal?: AbortSignal
  ) {}

  /** Names of the tools which are exposed */
  public get names(): string[] {
    return this.definitions.map((definition) => definition.name);
  }

  /** MCP config for `--mcp-config` */
  public get config(): object {
    return {
      mcpServers: {
        [BRIDGE_NAME]: {
          type: 'http',
          url: this.url,
          headers: { Authorization: `Bearer ${this.token}` },
        },
      },
    };
  }

  public async open(): Promise<this> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => resolve());
    });

    this.url = `http://127.0.0.1:${(<AddressInfo>this.server.address()).port}/mcp`;
    return this;
  }

  public async close(): Promise<void> {
    if (!this.server.listening) {
      return;
    }

    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /** Executes the tool and converts its output into MCP tool result (errors are returned with `isError`) */
  public async call(name: string, input: unknown): Promise<ILlmClaudeCodeBridgeToolResult> {
    const execute = this.names.includes(name) ? this.tools[name]?.execute : undefined;

    if (!execute) {
      return { isError: true, content: [{ type: 'text', text: `Tool [${name}] is not found` }] };
    }

    try {
      const executed = execute(input, {
        toolCallId: `${BRIDGE_NAME}:${v4()}`,
        abortSignal: this.signal,
        messages: [],
        context: {},
      });

      const output = await consumeToolOutput(executed);
      return { content: [{ type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) ?? '' }] };
    } catch (error: unknown) {
      return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }] };
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.headers.authorization !== `Bearer ${this.token}`) {
      return reply(response, 401);
    }
    if (request.method !== 'POST') {
      return reply(response, 405);
    }

    const chunks: Buffer[] = [];

    for await (const chunk of request) {
      chunks.push(<Buffer>chunk);
    }

    const parsed = parseJsonSafe<ILlmClaudeCodeJsonRpcMessage>(Buffer.concat(chunks).toString());

    if (parsed.status === 'ERROR' || !isJsonRpcMessage(parsed.result)) {
      return reply(response, 400, {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Cannot parse JSON-RPC message' },
      });
    }

    const message = parsed.result;

    if (message.id === undefined || message.id === null) {
      return reply(response, 202);
    }

    reply(response, 200, {
      jsonrpc: '2.0',
      id: message.id,

      ...(await this.dispatch(message)),
    });
  }

  private async dispatch(message: ILlmClaudeCodeJsonRpcMessage): Promise<TLlmClaudeCodeJsonRpcAnswer> {
    switch (message.method) {
      case 'initialize': return {
        result: {
          protocolVersion: message.params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: BRIDGE_NAME, version: '1.0.0' },
        },
      };

      case 'ping': return { result: {} };

      case 'tools/list': return {
        result: {
          tools: this.definitions.map((definition) => ({
            name: definition.name,
            description: definition.description,
            inputSchema: definition.inputSchema,
          })),
        },
      };

      case 'tools/call': return {
        result: await this.call(String(message.params?.name), message.params?.arguments ?? {}),
      };

      default: return { error: { code: -32601, message: `Method [${message.method}] is not found` } };
    }
  }

  /** Builds the bridge for executable function tools of the call */
  static build(
    tools: Record<string, Tool>,
    definitions: TLlmClaudeCodeFunctionTool[] = [],
    signal?: AbortSignal
  ): LlmClaudeCodeBridge {
    return new LlmClaudeCodeBridge(
      tools,
      definitions.filter((definition) => tools[definition.name]?.execute),
      signal
    );
  }
}

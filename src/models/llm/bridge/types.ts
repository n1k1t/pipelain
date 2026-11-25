/** JSON-RPC message of MCP client (request or notification without `id`) */
export interface ILlmBridgeJsonRpcMessage {
  jsonrpc: '2.0';
  method: string;

  id?: string | number | null;
  params?: Record<string, unknown>;
}

/** JSON-RPC answer of the bridge without `jsonrpc` and `id` */
export type TLlmBridgeJsonRpcAnswer =
  | { result: object }
  | { error: { code: number; message: string } };

/** MCP tool result of the bridge */
export interface ILlmBridgeToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

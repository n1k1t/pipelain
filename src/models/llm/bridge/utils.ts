import _ from 'lodash';

import type { ILlmBridgeJsonRpcMessage } from './types';
import type { ServerResponse } from 'node:http';

/** Name of the MCP server which bridges pipeline tools into agent CLIs */
export const LLM_BRIDGE_NAME = 'pipelain';

/** Awaits tool output (the last value of a streamed output is used) */
export const consumeToolOutput = async (output: unknown): Promise<unknown> => {
  if (!_.isObject(output) || !(Symbol.asyncIterator in output)) {
    return output;
  }

  let last: unknown;

  for await (const value of <AsyncIterable<unknown>>output) {
    last = value;
  }

  return last;
};

/** Writes HTTP answer of the bridge (body is serialized into JSON) */
export const reply = (response: ServerResponse, code: number, body?: object): void => {
  if (!body) {
    return void response.writeHead(code).end();
  }

  response.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
};

export const isJsonRpcMessage = (value: unknown): value is ILlmBridgeJsonRpcMessage =>
  _.isObject(value) && 'method' in value && typeof value.method === 'string';

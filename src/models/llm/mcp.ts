import minimatch from 'minimatch';
import _ from 'lodash';

import { createMCPClient, MCPClient, MCPClientConfig } from '@ai-sdk/mcp';

export class LlmMcp {
  constructor(public configuration: MCPClientConfig & {
    tools?: {
      /** Enable tools by name/minimatch pattern */
      enabled?: string[];

      /** Disable tools by name/minimatch pattern */
      disabled?: string[];
    };
  }) {}

  public clone(): LlmMcp {
    return LlmMcp.build({
      ...this.configuration,

      tools: {
        ...(this.configuration.tools?.enabled && {
          enabled: [...this.configuration.tools.enabled],
        }),

        ...(this.configuration.tools?.disabled && {
          disabled: [...this.configuration.tools.disabled],
        }),
      }
    })
  }

  /** Clones this instance and assigns new values */
  public assign(payload: Partial<Pick<LlmMcp['configuration'], 'tools'>>): LlmMcp {
    const clone = this.clone();

    if (payload.tools) {
      clone.configuration.tools = payload.tools;
    }

    return clone;
  }

  public async connect(): Promise<LlmMcpClient> {
    const client = await createMCPClient(this.configuration);
    return LlmMcpClient.build(client, this.configuration);
  }

  static build(configuration: LlmMcp['configuration']): LlmMcp {
    return new LlmMcp(configuration);
  }
}

export class LlmMcpClient {
  constructor(public source: MCPClient, public configuration: LlmMcp['configuration']) {}

  public async tools(): ReturnType<MCPClient['tools']> {
    const tools = await this.source.tools();

    const all = Object.keys(tools);
    const filtered = new Set<string>(all);

    if (this.configuration.tools?.enabled?.length) {
      filtered.clear();
      all.forEach(
        (key) =>
          this.configuration.tools!.enabled!.some((pattern) => minimatch(key, pattern))
            ? filtered.add(key)
            : null
      );
    }

    if (this.configuration.tools?.disabled?.length) {
      all.forEach(
        (key) =>
          this.configuration.tools!.enabled!.some((pattern) => minimatch(key, pattern))
            ? filtered.delete(key)
            : null
      );
    }

    return _.pick(tools, Array.from(filtered));
  }

  public close(): Promise<void> {
    return this.source.close();
  }

  static build(source: MCPClient, configuration: LlmMcp['configuration']): LlmMcpClient {
    return new LlmMcpClient(source, configuration);
  }
}

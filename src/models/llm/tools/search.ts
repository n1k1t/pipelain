import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { ArticleContent } from '../../content';

import env from '../../../env';

interface IMcpSearchRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: {
      query: string;
      numResults?: number;
      livecrawl?: 'fallback' | 'preferred';
      type?: 'auto' | 'fast' | 'deep';
      contextMaxCharacters?: number;
    };
  };
}

interface IMcpSearchResponse {
  jsonrpc: string;
  result: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
}

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Search information from the internet',

        content: [
          { p: `**Features:**` },
          {
            ul: [
              'Search the web using Exa AI - performs real-time web searches and can scrape content from specific URLs',
              'Provides up-to-date information for current events and recent data',
              'Supports configurable result counts and returns the content from the most relevant websites',
              'Use this tool for accessing information beyond knowledge cutoff',
              'Searches are performed automatically within a single API call',
            ],
          },

          { p: `**Usage:**` },
          {
            ul: [
              'Supports live crawling modes: `fallback` (backup if cached unavailable) or `preferred` (prioritize live crawling)',
              'Search types: `auto` (balanced), `fast` (quick results), `deep` (comprehensive search)',
              'Configurable context length for optimal LLM integration',
              'Domain filtering and advanced search options available',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      query: z.string().describe('Websearch query'),
      count: z.number().optional().describe('Number of search results to return (default: 8)'),

      livecrawl: z
        .enum(['fallback', 'preferred'])
        .optional()
        .describe(
          'Live crawl mode - `fallback`: use live crawling as backup if cached content unavailable, `preferred`: prioritize live crawling (default: `fallback`)'
        ),

      type: z
        .enum(['auto', 'fast', 'deep'])
        .optional()
        .describe(
          'Search type - `auto`: balanced search (default), `fast`: quick results, `deep`: comprehensive search'
        ),

      contextMaxCharacters: z
        .number()
        .optional()
        .describe('Maximum characters for context string optimized for LLMs (default: 10000)'),
    })
  )
  .output(z.string().describe('Search results'))
  .execute(() => async (parameters) => {
    try {
      const searchRequest: IMcpSearchRequest = {
        id: 1,

        jsonrpc: '2.0',
        method: 'tools/call',

        params: {
          name: 'web_search_exa',

          arguments: {
            query: parameters.query,
            type: parameters.type ?? 'auto',
            numResults: parameters.count ?? 8,
            livecrawl: parameters.livecrawl ?? 'fallback',
            contextMaxCharacters: parameters.contextMaxCharacters,
          },
        },
      };

      const response = await fetch('https://mcp.exa.ai/mcp', {
        method: 'POST',
        body: JSON.stringify(searchRequest),

        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',

          ...(env.exa.key && {
            authorization: `Bearer ${env.exa.key}`,
          }),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw LlmToolExecutionError.build('search', `Search error (${response.status}): ${errorText}`);
      }

      const responseText = await response.text();
      const lines = responseText.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data: IMcpSearchResponse = JSON.parse(line.substring(6));

          if (data.result?.content?.[0]?.text) {
            return data.result.content[0].text;
          }
        }
      }

      return 'No search results found. Please try a different query.';
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('search', error);
    }
  });

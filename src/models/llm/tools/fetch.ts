import TurndownService from 'turndown';
import _ from 'lodash';

import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { ArticleContent } from '../../content';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30 * 1000; // 30 seconds
const MAX_TIMEOUT = 120 * 1000; // 2 minutes

const convertHTMLToMarkdown = (html: string): string => {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  return turndownService
    .remove(['script', 'style', 'meta', 'link'])
    .turndown(html);
};

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Fetch web resource by URL',

        content: [
          { p: `**Features:**` },
          {
            ul: [
              'Fetches content from a specified URL',
              'Takes a URL and optional format as input',
              'Fetches the URL content, converts to requested format (markdown by default)',
              'Returns the content in the specified format',
              'Use this tool when you need to retrieve and analyze web content',
            ],
          },

          { p: `**Usage:**` },
          {
            ul: [
              'IMPORTANT: if another tool is present that offers better web fetching capabilities, is more targeted to the task, or has fewer restrictions, prefer using that tool instead of this one',
              'The URL must be a fully-formed valid URL',
              'HTTP URLs will be automatically upgraded to HTTPS',
              'Format options: `markdown` (default), `text`, or `html`',
              'This tool is read-only and does not modify any files',
              'Results may be summarized if the content is very large',
            ],
          },
        ],
      })
      .render()
  )
  .input(
    z.object({
      url: z.string().url().describe('The URL to fetch content from'),

      format: z
        .enum(['text', 'markdown', 'html'])
        .default('markdown')
        .describe('The format to return the content in (text, markdown, or html). Defaults to markdown.'),

      timeout: z.number().optional().describe('Optional timeout in seconds (max 120)'),
    })
  )
  .output(z.string().describe('Fetched content'))
  .execute(() => async (parameters) => {
    try {
      const timeout = Math.min((parameters.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000, MAX_TIMEOUT);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      let acceptHeader = '*/*';

      switch (parameters.format) {
        case 'markdown':
          acceptHeader = 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
          break;
        case 'text':
          acceptHeader = 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
          break;
        case 'html':
          acceptHeader = 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
          break;
      }

      const response = await fetch(parameters.url, {
        signal: controller.signal,

        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          Accept: acceptHeader,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw LlmToolExecutionError.build('fetch', `Request failed with status code: ${response.status}`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        throw LlmToolExecutionError.build('fetch', 'Response too large (exceeds 5MB limit)');
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
        throw LlmToolExecutionError.build('fetch', 'Response too large (exceeds 5MB limit)');
      }

      const contentType = response.headers.get('content-type') || '';
      const content = new TextDecoder().decode(arrayBuffer);

      let output = content;

      if (parameters.format === 'markdown' && contentType.includes('text/html')) {
        output = convertHTMLToMarkdown(content);
      } else if (parameters.format === 'text' && contentType.includes('text/html')) {
        // Simple text extraction if HTMLRewriter is not available
        output = content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '')
          .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      const tokens = output.split(/\s+/);
      const isTruncated = tokens.length > 12000;
      const truncated = tokens.slice(0, 12000).join(' ');

      return isTruncated ? `${truncated}\n\n[Content truncated to 12000 tokens]` : truncated;
    } catch (error: unknown) {
      const formatted = _.isObject(error) && 'name' in error
        ? error.name === 'AbortError'
          ? new Error('Request timed out')
          : error instanceof Error
            ? error
            : new Error(JSON.stringify(error))
        : new Error(String(error));

      throw LlmToolExecutionError.build('fetch', formatted);
    }
  });

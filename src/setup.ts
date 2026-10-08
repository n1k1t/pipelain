import duration from 'dayjs/plugin/duration';
import dayjs from 'dayjs';
import hbs from 'handlebars';
import _ from 'lodash';

import { LanguageModelUsage } from 'ai';
import { converters } from 'json2md';

import { extractLlmUsageTokens, preview } from './utils';

dayjs.extend(duration);

converters.plain = (input) => input;
converters.file = (input) => {
  const tags: string[] = [];

  if (input.title) {
    tags.push(`<title>${input.title}</title>`);
  }
  if (input.path) {
    tags.push(`<path>${input.path}</path>`);
  }

  return tags.concat(`<content>\n${input.content}\n</content>`).join('\n');
};

converters.ol = (input) => input.map((line, index) => `${index + 1}. ${line}`).join('\n');
converters.ul = (input) => input.map((line) => `- ${line}`).join('\n');
converters.p = (input) => Array.isArray(input) ? input.join('\n\n') : input;

hbs.registerHelper('isObject', (content) => _.isObject(content));
hbs.registerHelper('json', (content) => JSON.stringify(content, null, 2));
hbs.registerHelper('sum', (a, b) => a + b);
hbs.registerHelper('eq', (a, b) => a === b);

hbs.registerHelper('formatOutput', (content) =>
  _.isObject(content)
    ? JSON.stringify(content, null, 2)
    : String(content)
);

hbs.registerHelper('tokens', (usage: LanguageModelUsage, kind: keyof ReturnType<typeof extractLlmUsageTokens>) =>
  usage ? extractLlmUsageTokens(usage)[kind] : 0
);

const previewText = (text: string) => _.truncate(text.replace(/\s+/g, ' ').trim(), { length: 300 });

hbs.registerHelper('previewText', (text?: string) => typeof text === 'string' ? previewText(text) : '');
hbs.registerHelper('previewInput', (input?: { type: 'json'; value: object } | { type: 'text'; value: string }) => {
  if (!input) {
    return '';
  }

  return input.type === 'json'
    ? preview(input.value, 300)
    : previewText(input.value);
});

hbs.registerHelper('formatTime', (timestamp: number) => new Date(timestamp).toLocaleTimeString());
hbs.registerHelper('formatDate', (timestamp: number) => new Date(timestamp).toLocaleDateString());

hbs.registerHelper('formatDuration', (ms: number) => {
  if (typeof ms !== 'number') {
    return '';
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const spent = dayjs.duration(ms);

  if (ms < 60_000) {
    return spent.format('s [sec]');
  }
  if (ms < 3_600_000) {
    return spent.format(spent.seconds() ? 'm [min] s [sec]' : 'm [min]');
  }

  const hours = `${Math.floor(spent.asHours())} h`;
  return spent.minutes() ? `${hours} ${spent.format('m [min]')}` : hours;
});

/** MCP clients close unhandled rejection fix */
process.on('unhandledRejection', (error: unknown) => {
  if (error instanceof TypeError && error.message.includes('terminated')) {
    return null;
  }

  throw error;
});

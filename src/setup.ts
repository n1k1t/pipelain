import hbs from 'handlebars';
import _ from 'lodash';

import { converters } from 'json2md';

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

hbs.registerHelper('formatTime', (timestamp: number) => new Date(timestamp).toLocaleTimeString());
hbs.registerHelper('formatDate', (timestamp: number) => new Date(timestamp).toLocaleDateString());

hbs.registerHelper('formatDuration', (ms: number) =>
  typeof ms !== 'number'
    ? ''
    : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
);

/** MCP clients close unhandled rejection fix */
process.on('unhandledRejection', (error: unknown) => {
  if (error instanceof TypeError && error.message.includes('terminated')) {
    return null;
  }

  throw error;
});

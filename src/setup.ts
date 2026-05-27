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

  return tags.concat([`<content>\n${input.content}\n</content>`]).join('\n');
};

converters.ol = (input) => input.map((line, index) => `${index + 1}. ${line}`).join('\n');
converters.ul = (input) => input.map((line) => `- ${line}`).join('\n');
converters.p = (input) => Array.isArray(input) ? input.join('\n\n') : input;

/** MCP clients close unhandled rejection fix */
process.on('unhandledRejection', (error: unknown) => {
  if (error instanceof TypeError && error.message.includes('terminated')) {
    return null;
  }

  throw error;
});

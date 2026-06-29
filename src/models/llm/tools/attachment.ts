import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { ArticleContent } from '../../content';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Extract attachment content',
        content: [{ p: 'Retrieves the contents of a attachment by its key.' }],
      })
      .render()
  )
  .input(
    z.object({
      key: z.string().describe('The key of the attachment'),
    })
  )
  .output(z.string().describe('Attachment content'))
  .execute(({ vfs }) => async ({ key }) => {
    try {
      const file = vfs.get(key);
      if (file) {
        return file.content;
      }

      throw LlmToolExecutionError.build('attachment', `Attachment with key "${key}" not found`);
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('attachment', error);
    }
  });

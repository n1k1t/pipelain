import { z } from 'zod/v3';

import { LlmToolCompiler, LlmToolExecutionError } from './model';
import { ArticleContent } from '../../content';

export default LlmToolCompiler
  .build(
    ArticleContent
      .build({
        title: 'Skill content extraction',

        content: [
          { p: 'Extracts the content of a specific skill by its name.' },
        ],
      })
      .render()
  )
  .input(
    z.object({
      name: z.string().describe('The name of the skill to extract content for'),
    })
  )
  .output(z.string().describe('Skill content'))
  .execute(({ context }) => async ({ name }) => {
    try {
      const skill = context.project.sources.skills[name];
      if (!skill) {
        throw LlmToolExecutionError.build('skill', `Skill "${name}" not found`);
      }

      return skill.content;
    } catch (error: unknown) {
      throw LlmToolExecutionError.build('skill', error);
    }
  });

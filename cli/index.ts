import { Command, program } from 'commander';
import fs from 'fs/promises';

import { PipelineCompiler, Project, stdout, TLlmProviderReasoning } from '../src';
import { cast } from '../src/utils';

program
  .description('PipelAIn')
  .addCommand(
    new Command()
      .command('exec')
      .description('Executes prompt/pipeline by provided params')
      .option('-p --prompt <text>', 'User prompt text')
      .option('-s --silent [boolean]', 'Hides logs of pipeline execution', false)
      .option('-o --output [path]', 'Output file path')
      .option('-l --limit [number]', 'Tool calls limit')
      .option('-r --reasoning [level]', 'Reasoning level', cast<TLlmProviderReasoning>('provider-default'))
      .option('--system [text]', 'System prompt text')
      .option('--cwd [path]', 'Working directory', process.cwd())
      .action(async (options: {
        reasoning: TLlmProviderReasoning;
        silent: boolean;
        prompt: string;
        cwd: string;

        system?: string;
        output?: string;
        limit?: string;
      }) => {
        const pipeline = PipelineCompiler
          .build('Executor')
          .step('output', ({ factory }) => factory
            .ai('Execution')
            .llm(({ context }) =>
              context.llm.assign({
                reasoning: options.reasoning,
                tools: factory.tools.all().provide(),

                ...(options.limit && { limit: Number(options.limit) }),
              })
            )
            .prompt(({ utils }) => [
              utils.content.system(options.system ?? ''),
              utils.content.user(options.prompt),
            ])
          );

        const project = await Project.build({ cwd: options.cwd });
        const compiled = await pipeline.compile({
          project,
          stdout: options.silent ? undefined : stdout.console,
        });

        const result = await compiled.run();

        if (options.output) {
          await fs.writeFile(options.output, result.output, 'utf8');
        }
        if (!options.silent) {
          console.log('\n');
        }

        process.stdout.write(result.output);
        process.exit(0);
      })
  )
  .addCommand(
    new Command()
      .command('serve')
      .description('Starts server')
      .option('-h --host [host]', 'Host address', 'localhost')
      .option('-p --port [port]', 'Port', '8080')
      .action(async (input, command) => {

      })
  )
  .parse();

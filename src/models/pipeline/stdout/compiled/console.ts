import colors from 'colors';
import _ from 'lodash';

import type { PipelineStep } from '../../steps';
import type { Pipeline } from '../../model';

import { PipelineStdout } from '../model';
import { preview } from '../../../../utils';

const convertStepTypeIntoIcon = (() => {
  const map: Record<PipelineStep['type'], string> = {
    swarm: '⚭',
    loop: '⟳',
    self: '⚒',
    ai: '⚛',
  };

  return (step: PipelineStep) => map[step.type];
})();

const renderTitle = (predicate: Pipeline | PipelineStep) => predicate.parent
  ? [
    colors.gray(predicate.trace().slice(1).reverse().map((nested) => `${nested.title}`).join(' ⇢ ')),
    colors.gray('⇢'),
  ]
  : [];

const renderHeader = (icon: string, spent?: number) => [
  icon,
  spent !== undefined
    ? colors.gray((spent / 1000).toFixed(2).padStart(7, ' ') + 's')
    : colors.gray(String().padEnd(8, ' ')),

  colors.gray('‧‧'),
].join(' ');

export default PipelineStdout
  .build()
  .override('log',({ pipeline, message }) => {
    console.log(
      renderHeader(colors.gray('↩')),
      ...renderTitle(pipeline),

      colors.gray(pipeline.title),
      colors.gray('⇢'),

      ...message.map((segment) => typeof segment === 'string' ? colors.white(segment) : segment)
    );
  })
  .override('run', ({ pipeline, meta }) => {
    if (meta.state === 'INIT' && pipeline.context.input !== undefined) {
      const input = typeof pipeline.context.input === 'string'
        ? _.truncate(pipeline.context.input, { length: 100 })
        : preview(pipeline.context.input)

      return console.log(
        renderHeader(colors.yellow.bold('⦿'), meta.spent),
        ...renderTitle(pipeline),

        colors.yellow.bold(pipeline.title),
        colors.gray('⇢'),

        colors.white(input.replace(/\n/g, '↩ '))
      );
    }

    if (!pipeline.parent && meta.state === 'DONE') {
      const { input, output } = pipeline.session.meta.llm.tokens;

      return console.log(
        renderHeader(colors.yellow.bold('⚑'), meta.spent),
        colors.yellow.bold(pipeline.title),
        colors.gray('⇢'),

        colors.yellow.bold('✓ Done'),

        colors.gray(`in ${input + output} tokens`),
        colors.gray('⇢'),

        colors.gray(`${input} input + ${output} output`)
      );
    }
  })
  .override('step:run', ({ step, meta }) => {
    if (meta.state === 'INIT') {
      return console.log(
        renderHeader(colors.green.bold(convertStepTypeIntoIcon(step))),
        ...renderTitle(step),

        colors.gray(`⏱ ${step.title}`)
      );
    }

    console.log(
      renderHeader(colors.green.bold(convertStepTypeIntoIcon(step)), meta.spent),
      ...renderTitle(step),

      meta.state === 'ERROR'
        ? colors.red.bold(`✗ ${step.title}`)
        : colors.green.bold(`✓ ${step.title}`)
    );
  })
  .override('step:llm:reasoning', ({ message, step, meta }) => {
    if (meta.state !== 'DONE') {
      return null;
    }

    console.log(
      renderHeader(colors.blue.bold('⚖'), meta.spent),
      ...renderTitle(step),

      colors.gray(`⏱ ${step.title}`),
      colors.gray('⇢'),

      colors.gray(_.truncate(message, { length: 100 }).replace(/\n/g, '↩ '))
    );
  })
  .override('step:llm:tool', ({ name, message, step, meta }) => {
    if (meta.state === 'INIT') {
      return null;
    }

    console.log(
      renderHeader(colors.cyan.bold('∮'), meta.spent),
      ...renderTitle(step),

      colors.gray(`⏱ ${step.title}`),
      colors.gray('⇢'),

      meta.state === 'ERROR'
        ? colors.red.bold(`${name}`)
        : colors.cyan.bold(`${name}`),

      colors.gray(message.replace(/\n/g, '↩ '))
    );
  });

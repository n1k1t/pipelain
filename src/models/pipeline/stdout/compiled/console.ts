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
  .override('log',({ pipeline, message, level }) =>
    console.log(
      renderHeader(level === 'WARN' ? colors.yellow('‧') : colors.gray('‧')),
      ...renderTitle(pipeline),

      colors.gray(pipeline.title),
      colors.gray('⇢'),

      ...message.map(
        (segment) => typeof segment === 'string'
          ? level === 'DEBUG'
            ? colors.gray(segment)
            : colors.white(segment)
          : segment
      )
    )
  )
  .override('run', ({ pipeline }) => {
    if (pipeline.meta.is('INIT') && pipeline.context.input !== undefined) {
      const input = typeof pipeline.context.input === 'string'
        ? _.truncate(pipeline.context.input, { length: 100 })
        : preview(pipeline.context.input)

      return console.log(
        renderHeader(colors.yellow.bold('⦿'), pipeline.meta.spent),
        ...renderTitle(pipeline),

        colors.yellow.bold(pipeline.title),
        colors.gray('⇢'),

        colors.white(input.replace(/\n/g, '↩ '))
      );
    }

    if (!pipeline.parent && pipeline.meta.is('DONE')) {
      const total = Object
        .values(pipeline.session.meta.usage.llm)
        .reduce((acc, usage) => acc + usage.prompt + usage.completion, 0);

      const separated = Object
        .entries(pipeline.session.meta.usage.llm)
        .map(([key, usage]) => colors.gray(`${key} ⭡ ${usage.prompt} ⭣ ${usage.completion}`));

      return console.log(
        renderHeader(colors.yellow.bold('⚑'), pipeline.meta.spent),

        colors.yellow.bold(pipeline.title),
        colors.gray('⇢'),

        colors.yellow.bold('✓ Done'),

        colors.gray(`in ${total} tokens`),
        colors.gray('⇢'),

        separated.length
          ? separated.join(colors.gray(' ‧‧ '))
          : colors.gray('debug')
      );
    }
  })
  .override('step:run', ({ step }) => {
    if (step.meta.is('INIT')) {
      return console.log(
        renderHeader(colors.green.bold(convertStepTypeIntoIcon(step))),
        ...renderTitle(step),

        colors.gray(`⏱ ${step.title}`)
      );
    }

    console.log(
      renderHeader(colors.green.bold(convertStepTypeIntoIcon(step)), step.meta.spent),
      ...renderTitle(step),

      step.meta.is('ERROR')
        ? colors.red.bold(`✗ ${step.title}`)
        : colors.green.bold(`✓ ${step.title}`)
    );
  })
  .override('step:ai:reasoning', (action) => {
    if (!action.meta.is('DONE') || !action.output.length) {
      return null;
    }

    console.log(
      renderHeader(colors.blue.bold('⚖'), action.meta.spent),
      ...renderTitle(action.step),

      colors.gray(`⏱ ${action.step.title}`),
      colors.gray('⇢'),

      colors.gray(action.preview())
    );
  })
  .override('step:ai:tool', (action) => {
    if (action.meta.is('INIT')) {
      return null;
    }

    console.log(
      renderHeader(colors.cyan.bold('∮'), action.meta.spent),
      ...renderTitle(action.step),

      colors.gray(`⏱ ${action.step.title}`),
      colors.gray('⇢'),

      action.meta.is('ERROR')
        ? colors.red.bold(`${action.name}`)
        : colors.cyan.bold(`${action.name}`),

      colors.gray(action.preview())
    );
  })
  .override('step:ai:fallback', ({ step, llm: providers }) =>
    console.log(
      renderHeader(colors.magenta.bold('⦸')),
      ...renderTitle(step),

      colors.gray(`⏱ ${step.title}`),
      colors.gray('⇢'),

      colors.gray(`Fallback from [${providers.old.model}] to [${providers.new.model}]`)
    )
  );

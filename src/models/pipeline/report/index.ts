import dayjs from 'dayjs';
import path from 'path';
import hbs from 'handlebars';
import fs from 'fs/promises';
import _ from 'lodash';

import type { IPipelineReportTemplateData, TPipelineReportSnapshot } from './types';
import type { PipelineSession } from '../session';

import { cast } from '../../../utils';
import { File } from '../../file';

import env from '../../../env';

export class PipelineReport {
  public snapshots: TPipelineReportSnapshot[] = [];
  public location: string = path.join(
    '.pipelain',
    'reports',
    `${dayjs(this.session.meta.timestamp).format('YYYY-MM-DD--HH-mm-ss')}--${this.session.id}.html`
  );

  constructor(public session: PipelineSession) {}

  /** Maximum length of a block content which is rendered into HTML (the rest is rendered on demand) */
  static BLOCK_LIMIT: number = 20000;

  /** Compiles report HTML file content */
  public async compile(): Promise<string | null> {
    if (!this.snapshots.length) {
      return null;
    }

    const assets = path.join(env.dirs.assets, 'report');
    const template = await fs.readFile(path.join(assets, 'index.hbs'), 'utf8');

    /** Rest contents of the long blocks which are rendered by the report script on demand */
    const blocks: string[] = [];

    const helpers = {
      /**
       * Renders the block content (objects are formatted as JSON)
       * A long content is cut to keep the page light: the rest is stored into blocks and marked to be rendered by the report script
       * The cut part stays in HTML to be visible without scripts (e.g. in Quick Look)
       */
      block: (content: unknown): hbs.SafeString => {
        const text = _.isObject(content) ? JSON.stringify(content, null, 2) : String(content ?? '');

        if (text.length <= PipelineReport.BLOCK_LIMIT) {
          return new hbs.SafeString(hbs.escapeExpression(text));
        }

        const index = blocks.push(text.slice(PipelineReport.BLOCK_LIMIT)) - 1;
        const size = Math.ceil((text.length - PipelineReport.BLOCK_LIMIT) / 1024);

        return new hbs.SafeString(
          `${hbs.escapeExpression(text.slice(0, PipelineReport.BLOCK_LIMIT))}<span class="block-rest" data-block="${index}">\n… (${size} KB more)</span>`
        );
      },

      /** Serializes stored blocks for `<script type="application/json">` (must be called after all the blocks) */
      blocks: (): hbs.SafeString => new hbs.SafeString(JSON.stringify(blocks).replace(/</g, '\\u003c')),
    };

    return hbs.compile(template)(cast<IPipelineReportTemplateData>({
      snapshots: this.snapshots.map((snapshot) => {
        if ('actions' in snapshot) {
          snapshot.actions = snapshot.actions.filter((action) =>
            action.type === 'ai:reasoning' && !action.output.length
              ? false
              : true
          );
        }

        return snapshot;
      }),

      usage: {
        llm: {
          separated: this.session.meta.usage.llm,

          total: Object
            .values(this.session.meta.usage.llm)
            .reduce((acc, usage) => {
              acc.completion += usage.completion;
              acc.prompt += usage.prompt;
              acc.cached += usage.cached;

              return acc;
            }, { completion: 0, prompt: 0, cached: 0 }),
        },
      },

      session: {
        timestamp: this.session.meta.timestamp,
        spent: this.session.meta.spent,
        id: this.session.id,
      },

      assets: {
        main: {
          script: await fs.readFile(path.join(assets, 'main.js'), 'utf8'),
          style: await fs.readFile(path.join(assets, 'main.css'), 'utf8'),
        },
      },
    }), { helpers });
  }

  /** Compiles and saves HTML report file */
  public async save(location: string = this.location): Promise<void | null> {
    const compiled = await this.compile();
    if (!compiled) {
      return null;
    }

    const file = await File.build(location);
    await file.write(compiled);
  }

  static build(session: PipelineSession): PipelineReport {
    const report = new PipelineReport(session);

    session.on('step:ai:complete', (event) => report.snapshots.push({
      type: 'step:done',

      messages: event.messages,
      meta: event.step.meta.toPlain(),

      actions: event.actions.map((action) => action.toPlain()),
      output: event.output,
      usage: event.usage,

      step: {
        title: event.step.trace().reverse().map((entity) => entity.title).join(' | '),
      },

      llm: {
        name: event.llm.name,
        model: event.llm.model,

        parameters: {
          limit: event.llm.limit,
          reasoning: event.llm.reasoning,
          temperature: event.llm.temperature,
        },
      },
    }));

    session.on('step:ai:error', (event) => report.snapshots.push({
      type: 'step:error',

      messages: event.messages,
      meta: event.step.meta.toPlain(),

      actions: event.actions.map((action) => action.toPlain()),
      error: event.error,

      step: {
        title: event.step.trace().reverse().map((entity) => entity.title).join(' | '),
      },

      llm: {
        name: event.llm.name,
        model: event.llm.model,

        parameters: {
          limit: event.llm.limit,
          reasoning: event.llm.reasoning,
          temperature: event.llm.temperature,
        },
      },
    }));

    session.on('log', ({ message, level }) => {
      if (!message.length || level === 'DEBUG') {
        return null;
      }

      const formatted = message.length === 1 && typeof message[0] === 'object'
        ? JSON.stringify(message[0], null, 2)
        : message.map((segment) => typeof segment === 'object' ? JSON.stringify(segment) : segment).join(' ');

      return report.snapshots.push({
        level,

        timestamp: Date.now(),
        message: formatted,
        type: 'log',
      });
    });

    return report;
  }
}

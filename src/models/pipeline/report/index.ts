import path from 'path';
import hbs from 'handlebars';
import fs from 'fs/promises';

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
    `${new Date(this.session.timestamp).toLocaleTimeString()}-${this.session.id}.html`
  );

  constructor(public session: PipelineSession) {}

  /** Compiles report HTML file content */
  public async compile(): Promise<string | null> {
    if (!this.snapshots.length) {
      return null;
    }

    const assets = path.join(env.dirs.assets, 'report');
    const template = await fs.readFile(path.join(assets, 'index.hbs'), 'utf8');

    return hbs.compile(template)(cast<IPipelineReportTemplateData>({
      snapshots: this.snapshots,

      usage: {
        llm: {
          separated: this.session.meta.usage.llm,

          total: Object
            .values(this.session.meta.usage.llm)
            .reduce((acc, usage) => {
              acc.completion += usage.completion;
              acc.prompt += usage.prompt;

              return acc;
            }, { completion: 0, prompt: 0 }),
        },
      },

      session: {
        timestamp: this.session.timestamp,
        id: this.session.id,
      },

      assets: {
        main: {
          script: await fs.readFile(path.join(assets, 'main.js'), 'utf8'),
          style: await fs.readFile(path.join(assets, 'main.css'), 'utf8'),
        },
      },
    }));
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
      state: 'DONE',

      timestamp: Date.now(),
      messages: event.messages,

      actions: event.actions.map((action) => action.toPlain()),
      output: event.output,
      usage: event.usage,

      step: {
        title: event.step.trace().reverse().map((entity) => entity.title).join(' | '),
      },

      llm: {
        name: event.llm.name,
        model: event.llm.model,
      },
    }));

    session.on('step:ai:error', (event) => report.snapshots.push({
      state: 'ERROR',

      timestamp: Date.now(),
      messages: event.messages,

      actions: event.actions.map((action) => action.toPlain()),
      error: event.error,

      step: {
        title: event.step.trace().reverse().join(' | '),
      },

      llm: {
        name: event.llm.name,
        model: event.llm.model,
      },
    }));

    return report;
  }
}

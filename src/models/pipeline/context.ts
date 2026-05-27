import merge from 'deepmerge';
import _ from 'lodash';

import { IPipelineConfiguration } from './types';
import { LlmProvider, LlmRouter } from '../llm';
import { PartialDeep } from '../../../types';
import { Project } from '../project';

export class PipelineContext<TConfiguration extends IPipelineConfiguration = any> {
  public llm: LlmProvider = LlmRouter.build().provide();

  public input: TConfiguration['input'] = this.defaults?.input ?? undefined;
  public state: TConfiguration['state'] = this.defaults?.state ?? {};

  constructor(public project: Project, private defaults?: {
    input?: TConfiguration['input'];
    state?: Partial<TConfiguration['state']>;
  }) {}

  public assign(payload: Partial<Pick<PipelineContext<TConfiguration>, 'llm' | 'input' | 'state'>>): this {
    if (payload.input) {
      this.input = payload.input;
    }
    if (payload.state) {
      this.state = payload.state;
    }
    if (payload.llm) {
      this.llm = payload.llm;
    }

    return this;
  }

  public merge(payload: {
    state?: PartialDeep<TConfiguration['state']>;
    input?: TConfiguration['input'] extends object ? PartialDeep<TConfiguration['input']> : TConfiguration['input'];
    llm?: Partial<Pick<LlmProvider, 'temperature' | 'tools'>>;
  }): this {
    if (payload.input) {
      this.input = _.isObject(this.input)
        ? merge(this.input, payload.input, { arrayMerge: (target, source) => source })
        : this.input;
    }

    if (payload.state) {
      this.state = merge(this.state, <PipelineContext['state']>payload.state, { arrayMerge: (target, source) => source });
    }
    if (payload.llm) {
      this.llm = this.llm.assign(payload.llm);
    }

    return this;
  }

  static build<TConfiguration extends IPipelineConfiguration>(
    project: Project,
    defaults?: PipelineContext<TConfiguration>['defaults']
  ): PipelineContext<TConfiguration> {
    return new PipelineContext(project, defaults);
  }
}

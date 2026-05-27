import type { IPipelineConfiguration } from './types';
import type { Pipeline } from './model';

import { LlmSkillsFactory, LlmToolsFactory } from '../llm';
import {
  PipelineAiStepCompiler,
  PipelineSwarmStepCompiler,
  PipelineSelfStepCompiler,
  PipelineLoopStepCompiler,
} from './steps';

export class PipelineFactory<TConfiguration extends IPipelineConfiguration = any> {
  constructor(private pipeline: Pipeline<TConfiguration>) {}

  /** LLM tools factory */
  public get tools(): LlmToolsFactory {
    return LlmToolsFactory.build();
  }

  /** LLM skills factory */
  public get skills(): LlmSkillsFactory {
    return LlmSkillsFactory.build(this.pipeline.context.project.sources.skills);
  }

  /** Executes on this machine side */
  public self(description?: string): PipelineSelfStepCompiler<TConfiguration> {
    return PipelineSelfStepCompiler.build(description);
  }

  /** Executes on LLM side */
  public ai(description?: string): PipelineAiStepCompiler<TConfiguration> {
    return PipelineAiStepCompiler.build(description);
  }

  /** Executes provided steps or pipelines in parallel */
  public swarm(description?: string): PipelineSwarmStepCompiler<TConfiguration> {
    return PipelineSwarmStepCompiler.build(description);
  }

  /** Creates a loop of provided steps or pipelines */
  public loop(description?: string): PipelineLoopStepCompiler<TConfiguration> {
    return PipelineLoopStepCompiler.build(description);
  }

  static build<TConfiguration extends IPipelineConfiguration>(
    pipeline: Pipeline<TConfiguration>
  ): PipelineFactory<TConfiguration> {
    return new PipelineFactory(pipeline);
  }
}

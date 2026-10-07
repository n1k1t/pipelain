import { PipelineAiReasoningAction, PipelineAiToolAction } from './actions';
import { compileMessages } from './utils';

const buildReasoning = (id: string): PipelineAiReasoningAction =>
  new PipelineAiReasoningAction({} as any, {} as any, { id, type: 'reasoning-start' } as any);

const buildTool = (id: string): PipelineAiToolAction =>
  new PipelineAiToolAction({} as any, {} as any, {
    type: 'tool-call',
    toolCallId: id,
    toolName: 'read',
    input: { path: 'a.ts' },
  } as any);

it('compileMessages should return only user message without history', () => {
  const messages = compileMessages({ user: 'task' });
  expect(messages).toEqual([{ role: 'user', content: 'task' }]);
});

it('compileMessages should end with tool message when history has tool actions', () => {
  const messages = compileMessages({
    user: 'task',
    history: [{ actions: [buildReasoning('r1'), buildTool('t1')] }],
  });

  expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool']);
});

it('compileMessages should append user message when history ends with reasoning only record', () => {
  const messages = compileMessages({
    user: 'task',
    history: [{ actions: [buildReasoning('r1')] }],
  });

  expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
});

it('compileMessages should not end with assistant message after mixed history', () => {
  const messages = compileMessages({
    user: 'task',
    history: [
      { actions: [buildTool('t1')] },
      { actions: [buildReasoning('r1')] },
    ],
  });

  expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant', 'user']);
});

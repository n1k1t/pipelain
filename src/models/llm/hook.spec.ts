import { LlmToolCompiler } from './tools/model';
import { LlmHook } from './hook';

const parameters = {
  session: {} as any,
  context: {} as any,
  step: {} as any,
};

const options = { toolCallId: 'id', messages: [] } as any;

it('LlmHook.build should create hook by name', () => {
  const hook = LlmHook.build('read');

  expect(hook).toBeInstanceOf(LlmHook);
  expect(hook.belongs({ name: 'read' })).toBe(true);
});

it('LlmHook.build should create hook by compiler', () => {
  const compiler = LlmToolCompiler.build('description');
  const hook = LlmHook.build(compiler);

  expect(hook.belongs({ name: 'read', compiler })).toBe(true);
});

it('LlmHook.build should create hook by tool', () => {
  const tool = { execute: jest.fn() } as any;
  const hook = LlmHook.build(tool);

  expect(hook.belongs({ name: 'read', tool })).toBe(true);
});

it('LlmHook.belongs should not match by different name', () => {
  expect(LlmHook.build('read').belongs({ name: 'write' })).toBe(false);
});

it('LlmHook.belongs should not match by different compiler', () => {
  const hook = LlmHook.build(LlmToolCompiler.build('a'));
  expect(hook.belongs({ compiler: LlmToolCompiler.build('b') })).toBe(false);
});

it('LlmHook.belongs should not match by different tool', () => {
  const hook = LlmHook.build({ execute: jest.fn() } as any);
  expect(hook.belongs({ tool: { execute: jest.fn() } as any })).toBe(false);
});

it('LlmHook.belongs should prefer name over compiler when both are provided', () => {
  const compiler = LlmToolCompiler.build('description');
  const hook = LlmHook.build(compiler, { name: 'read' });

  expect(hook.belongs({ name: 'write', compiler })).toBe(false);
  expect(hook.belongs({ name: 'read', compiler: LlmToolCompiler.build('other') })).toBe(true);
});

it('LlmHook.belongs should return false when target has nothing to compare', () => {
  expect(LlmHook.build('read').belongs({ compiler: LlmToolCompiler.build('description') })).toBe(false);
});

it('LlmHook.wrap should keep original output by default', async () => {
  const execute = jest.fn().mockResolvedValue('output');
  const tool = { execute } as any;

  LlmHook.build(tool).wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('output');
  expect(execute).toHaveBeenCalledWith('input', options);
});

it('LlmHook.wrap should rethrow original error by default', async () => {
  const error = new Error('failed');
  const tool = { execute: jest.fn().mockRejectedValue(error) } as any;

  LlmHook.build(tool).wrap(tool, parameters);

  await expect(tool.execute('input', options)).rejects.toBe(error);
});

it('LlmHook.wrap should skip tool without execute', () => {
  const tool = {} as any;

  LlmHook.build(tool).wrap(tool, parameters);

  expect(tool.execute).toBeUndefined();
});

it('LlmHook.wrap should call original execute with tool as context', async () => {
  const tool = {
    execute: jest.fn(function (this: unknown) {
      return this;
    }),
  } as any;

  LlmHook.build(tool).wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe(tool);
});

it('LlmHook.before should receive parameters and input', async () => {
  const before = jest.fn(({ input, next }) => next(input));
  const tool = { execute: jest.fn().mockResolvedValue('output') } as any;

  LlmHook.build(tool).before(before).wrap(tool, parameters);
  await tool.execute('input', options);

  expect(before).toHaveBeenCalledWith(expect.objectContaining({ ...parameters, input: 'input' }));
});

it('LlmHook.before should modify input of original execute', async () => {
  const execute = jest.fn().mockResolvedValue('output');
  const tool = { execute } as any;

  LlmHook.build<{ input: string }>('read')
    .before(({ input, next }) => next(`${input}:modified`))
    .wrap(tool, parameters);

  await tool.execute('input', options);

  expect(execute).toHaveBeenCalledWith('input:modified', options);
});

it('LlmHook.before should skip original execute without next call', async () => {
  const execute = jest.fn();
  const tool = { execute } as any;

  LlmHook.build('read')
    .before(() => 'cached')
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('cached');
  expect(execute).not.toHaveBeenCalled();
});

it('LlmHook.before should override output of original execute', async () => {
  const tool = { execute: jest.fn().mockResolvedValue('output') } as any;

  LlmHook.build<{ output: string }>('read')
    .before(async ({ input, next }) => `${await next(input)}:modified`)
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('output:modified');
});

it('LlmHook.before should pass thrown error to after as rejected output', async () => {
  const error = new Error('denied');
  const after = jest.fn(() => 'fallback');
  const tool = { execute: jest.fn() } as any;

  LlmHook.build('read')
    .before(() => {
      throw error;
    })
    .after(after)
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('fallback');
  expect(after).toHaveBeenCalledWith(expect.objectContaining({
    ...parameters,

    input: 'input',
    output: { status: 'rejected', reason: error },
  }));
});

it('LlmHook.after should receive fulfilled output', async () => {
  const after = jest.fn(({ output }) => output.value);
  const tool = { execute: jest.fn().mockResolvedValue('output') } as any;

  LlmHook.build('read').after(after).wrap(tool, parameters);
  await tool.execute('input', options);

  expect(after).toHaveBeenCalledWith(expect.objectContaining({
    ...parameters,

    input: 'input',
    output: { status: 'fulfilled', value: 'output' },
  }));
});

it('LlmHook.after should modify output', async () => {
  const tool = { execute: jest.fn().mockResolvedValue('output') } as any;

  LlmHook.build('read')
    .after(({ output }) => output.status === 'fulfilled' ? `${output.value}:modified` : null)
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('output:modified');
});

it('LlmHook.after should convert original error into output', async () => {
  const tool = { execute: jest.fn().mockRejectedValue(new Error('failed')) } as any;

  LlmHook.build('read')
    .after(({ output }) => output.status === 'rejected' ? `Error: ${output.reason.message}` : output.value)
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).resolves.toBe('Error: failed');
});

it('LlmHook.after should throw error into tool execution', async () => {
  const error = new Error('after');
  const tool = { execute: jest.fn().mockResolvedValue('output') } as any;

  LlmHook.build('read')
    .after(() => {
      throw error;
    })
    .wrap(tool, parameters);

  await expect(tool.execute('input', options)).rejects.toBe(error);
});

it('LlmHook.wrap should run nested hooks from outer to inner', async () => {
  const sequence: string[] = [];
  const tool = {
    execute: jest.fn(() => {
      sequence.push('execute');
      return 'output';
    }),
  } as any;

  const build = (name: string) => LlmHook.build('read')
    .before(({ input, next }) => {
      sequence.push(`${name}:before`);
      return next(input);
    })
    .after(({ output }) => {
      sequence.push(`${name}:after`);
      return output.status === 'fulfilled' ? output.value : null;
    });

  build('inner').wrap(tool, parameters);
  build('outer').wrap(tool, parameters);

  await tool.execute('input', options);

  expect(sequence).toEqual(['outer:before', 'inner:before', 'execute', 'inner:after', 'outer:after']);
});

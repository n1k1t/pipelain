### Code style

**Formatting:**

1. 2 spaces indentation, LF line endings, final newline, no trailing whitespace (see `.editorconfig`)
2. Single quotes, semicolons, trailing commas in multiline objects, arrays and parameters
3. Module-level constants use UPPER_SNAKE_CASE with a unit comment: `const DEFAULT_TIMEOUT = 30 * 1000; // 30 seconds`

**Imports:**

1. Imports should be in strict order:
  - External default `import a from 'a'`
  - External entity `import { b } from 'b'`
  - Internal entity `import { c } from './c'`
  - Internal default `import d from './d'`
2. Between imports all the types should be empty line (if there are more than 1 import of the same type)
3. Imports of the same type should be sorted by length of code before `from` keyword (from long to short)
4. Type-only imports use `import type` and are grouped separately before entity imports of the same origin. Use `import type` for imports which are needed only for types (it also prevents circular dependencies between modules)
5. Namespace imports `import * as x from './x'` are grouped with internal default imports

```ts
import { LanguageModelUsage } from 'ai';
import EventEmitter from 'events';

import type { TPipelineLogLevel } from './types';
import type { LlmProvider } from '../llm';
import type { Pipeline } from './model';

import { buildCounter, cast, extractLlmUsageTokens } from '../../utils';

import * as providers from './providers';
import env from '../../env';
```

**Exports:**

1. Exports should be sorted by length of of code before `from` keyword (from long to short)
2. Exports should be places right after imports
3. Every directory exposes its entities through barrel `index.ts`. Group exports by meaning with empty lines between groups
4. Public API of the package is exported from `src/index.ts`. New public entities must be added there

```ts
export { default as search } from './search';
export { default as fetch } from './fetch';

export * from './providers/model';
export * from './providers';
```

**Objects:**

1. Save empty lines between object properties like on code examples (group properties by meaning)
2. Use conditional spread for optional properties `...(value && { key: value })`

```ts
return tool({
  type: 'function',

  inputSchema: this.provided.schema.input,
  description: this.description,

  ...(this.provided.schema.output && {
    outputSchema: this.provided.schema.output,
  }),
});
```

**Function:**

1. DO NOT use `function keyword`. Use arrow functions instead
2. Prefer early return (guard clauses) over nested `if/else`
3. Function names start with a verb: `build*`, `compile*`, `convert*`, `extract*`, `resolve*`

**Classes:**

1. Every class has a static factory `static build(...)`. Create instances with `X.build()`, not `new X()` (exception: `this`-typed internals and tests)
2. Static methods are placed at the end of the class
3. Use explicit access modifiers (`public`, `private`, `protected`) and explicit return types of methods
4. Methods which mutate the instance return `this` to allow fluent chains. Methods which must not mutate the instance return a clone (`clone()`)
5. Keep constructor parameters in protected properties (`protected provided`, `protected configuration`) and initialize public fields from them
6. Typed events: extend `EventEmitter<IEvents>` with `interface I<Name>Events` where keys are event names (`'step:ai:complete'`) and values are tuples of arguments
7. Phantom type properties for type inference start with `T` and use definite assignment: `public TEvents!: IPipelineSessionEvents`

```ts
export class LlmRouter {
  protected setups: { [K in TLlmModelProviderName]?: ILlmRouterSetup<K> } = {};

  constructor(protected configuration: {
    key: string;

    provider?: string;
    url?: string;
  }) {}

  /** Saves connection and options of a provider to pass them into its models */
  public setup<K extends TLlmModelProviderName>(provider: K, parameters: ILlmRouterSetup<K>): this {
    this.setups[provider] = <(typeof this.setups)[K]>parameters;
    return this;
  }

  static build(options?: Partial<LlmRouter['configuration']>): LlmRouter {
    return new LlmRouter({ key: options?.key ?? env.key ?? 'none' });
  }
}
```

**Types:**

1. Interfaces start with `I` (`ILlmSkill`), type aliases start with `T` (`TLlmModelProviderName`), constant lists of values start with `L` (`LLlmModelProviderName`)
2. Derive union types from constant lists: `type TName = ConvertTupleToUnion<typeof LName>`
3. Type casts use angle brackets `<T>value` and `<const>[...]`, not `as` (exception: tests)
4. Use `satisfies` to check object literals. Use `cast<T>(value)` from `src/utils` to type a value in place
5. Reference types of class members with indexed access (`PipelineAiError['type']`) instead of duplicating them
6. Use global utility types from `types/common.ts` (`TFunction`, `SetRequiredKeys`, `SetPartialKeys`, `ConvertTupleToUnion`, etc.)

```ts
export type TLlmModelProviderName = ConvertTupleToUnion<typeof LLlmModelProviderName>;
export const LLlmModelProviderName = <const>['google', 'anthropic', 'mistral', 'openai', 'proxy'];
```

**Naming:**

1. Classes have a domain prefix: `Llm*` (`LlmRouter`, `LlmToolCompiler`), `Pipeline*` (`PipelineSession`, `PipelineAiError`)
2. File names are short lower case nouns by role: `model.ts` (base class), `factory.ts`, `types.ts`, `errors.ts`, `utils.ts`, `index.ts`. Kinds of an entity live in a directory with their own files (`tools/grep.ts`, `providers/openai.ts`)
3. Tests are placed next to the source file: `router.ts` and `router.spec.ts`

**Errors:**

1. Error classes end with `Error` and extend `Error` (`LlmToolExecutionError`, `PipelineStepCompilationError`)
2. Error messages start with a capital letter and wrap dynamic values in square brackets: `` `Cannot compile without [${property}] property` ``
3. Errors with conversion logic have `static build` / `static convert` which accept `unknown` and return the same instance when it is already of this class

**Comments:**

1. Document public methods and non-obvious properties with a one-line JSDoc `/** ... */`
2. Use `@example` blocks for utilities

**Tools:**

1. Each LLM tool is a default export of a file in `src/models/llm/tools/` built with `LlmToolCompiler.build(description).input(schema).execute(executor)`
2. Describe the tool with `ArticleContent.build({ ... }).render()`
3. Validate input with `zod/v3`. Throw `LlmToolExecutionError` for execution failures

```ts
export default LlmToolCompiler
  .build(ArticleContent.build({ title: 'Fetch web resource by URL', content: [...] }).render())
  .input(z.object({ url: z.string() }))
  .execute(({ vfs }) => async ({ url }) => { ... });
```

**Tests:**

1. Jest, files `*.spec.ts` next to the source (`src/**/*.spec.ts`)
2. Flat `it('<method> should <result> when <condition>')` without `describe`
3. Restore spies and mocks inside the test (`spy.mockRestore()`)

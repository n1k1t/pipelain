---
name: pipelain-basic
description: Skill for package @n1k1t/pipelain to build and execute type-safe AI pipelines with structured outputs and tool integration
---

# PipelAIn Basic Skill

Instructions for building and executing type-safe AI pipelines with structured outputs, context sharing, parallel execution, loops, custom tools, and skills.

## When to Use

Use this skill when you need to:
1. Build and run complex workflows as a series of step-by-step execution pipelines.
2. Enforce AI responses to strictly match specified Zod schemas for full type safety.
3. Provide LLM tools (web interaction, file system, shell command execution) and register MCP servers.
4. Manage shared state and configuration across all pipeline steps using a global context.
5. Execute multiple tasks in parallel using a `swarm` step.
6. Build iterative workflows (e.g. self-correction, retries, and validations) using a `loop` step.
7. Inject reusable domain-specific instructions or workflows using LLM skills.

## Pipeline Utilities

Each pipeline step receives a set of utilities to interact with the environment, AI, and context.

### `factory`
Used to create different types of steps and retrieve tools or skills:
- `ai(description?)`: Creates a step that executes on the AI side.
- `self(description?)`: Creates a step that executes on the local machine.
- `swarm(description?)`: Executes multiple steps or pipelines in parallel.
- `loop(description?)`: Creates a loop of steps.
- `tools`: Access to LLM tools factory (e.g., `factory.tools.web()`).
- `skills`: Access to LLM skills factory (e.g., `factory.skills.all()`).

### `utils`
General-purpose utilities:
- `content`: `ContentFactory` instance to create structured prompt content (articles, tasks, rules, attachments, files, globs).
- `bash`: Execute shell commands on the local machine.
- `log`: Emit log events for the current pipeline session.

### `context`
Shared state and configuration:
- `input`: The input data provided to the pipeline.
- `state`: Shared state across all steps (contains results of previous steps).
- `llm`: Current LLM provider configuration.
- `project`: Information about the current project.

### `utils.content` (ContentFactory)
Used to create structured prompt content. These methods are available via `utils.content` in pipeline steps.

- `article(title, content)`: Creates a `## Title` section with nested markdown content.
- `rules(list)`: Creates a bulleted list of rules/constraints.
- `tasks(list)`: Creates a numbered list of tasks for the AI.
- `sources(list)`: Creates a list of source links.
- `attachment(title, payload)`: Attaches data (object, string) as a file-like block.
- `file(title, path)`: Reads a local file and attaches it as context.
- `glob(title, pattern)`: Reads multiple files by pattern and attaches them.
- `plain(text)`: Adds raw markdown text.

### `factory.tools` (LlmToolsFactory)
Used to provide tools to the AI. These methods are available via `factory.tools` in pipeline steps.

- `all()`: Includes all available tools.
- `web()`: Tools for web interaction (e.g., `search`, `fetch`).
- `files('read')`: Read-only file system tools (e.g., `read`, `grep`, `glob`, `ls`).
- `files('read-write', options?)`: Read and write file system tools (e.g., `read`, `grep`, `glob`, `ls`, `mkdir`, `write`, `edit`, `rm`). Can restrict write/edit/rm to specific glob patterns using the `allowed` parameter.
- `commands(allowedCmds)`: Package manager tools (e.g., `npm`, `npx`).
- `custom(tools)`: Includes custom tool implementations compiled with `LlmToolCompiler`.

### `factory.skills` (LlmSkillsFactory)
Used to provide domain-specific instructions and workflows to the AI.

- `all()`: Includes all registered skills.
- `match(pattern)`: Includes skills matching a minimatch pattern.
- `register(raw)`: Registers a new skill from raw markdown content (with frontmatter).
- `custom(skills)`: Includes custom skill objects.
- `provide()`: Returns the list of included skills for LLM configuration.

---

## Usage Examples

### Simple Pipeline

```ts
import z from 'zod';
import { PipelineCompiler } from '@n1k1t/pipelain';

const translate = PipelineCompiler
  .build('Translator')
  .input(z.string())
  .step('translated', ({ factory, context }) => factory
    .ai('Translating')
    .schema(z.object({
      ru: z.string().describe('Russian translation'),
      es: z.string().describe('Spanish translation'),
      en: z.string().describe('English translation'),
    }))
    .prompt([
      `Translate this text to Russian, Spanish and English: ${context.input}`,
    ])
  );

(async () => {
  const compiled = await translate.compile();
  const result = await compiled.run('Hello');
  console.log(result.translated.es); // Hola
})();
```

### Structured Prompt Content

Create rich, structured prompts for the AI by combining multiple content types.

```ts
.step('complex_task', async ({ factory, utils }) => factory
  .ai('Complex Processing')
  .prompt([
    // 1. Global rules
    utils.content.rules([
      'Use professional tone',
      'Output must be valid JSON'
    ]),

    // 2. Structured article
    utils.content.article('Project Overview', [
      { p: 'This project is a type-safe pipeline builder.' },
      { h2: 'Key Goals' },
      { ul: ['Safety', 'Performance', 'Flexibility'] }
    ]),

    // 3. Attachments
    utils.content.attachment('User Data', {
      content: { id: 1, name: 'John Doe' }
    }),

    // 4. Local files and glob patterns
    await utils.content.file('Package Info', 'package.json'),
    await utils.content.glob('Source Code', 'src/utils/*.ts'),

    // 5. External sources
    utils.content.sources(['https://github.com/n1k1t/pipelain']),

    // 6. Raw markdown
    utils.content.plain('> Note: This is a critical task.'),

    // 7. Specific tasks for the AI to complete
    utils.content.tasks([
      'Review the `Project Overview` article',
      'Analyze `User Data` and `Source Code`',
      'Generate a summary based on the rules'
    ])
  ])
)
```

### AI Step with LLM Configuration and Restricted Tools

Customize LLM behavior (temperature, retry limits, tools, restricted paths) for specific steps.

```ts
.step('research', ({ factory, context, utils }) => factory
  .ai('Researching')
  .llm(({ context }) => context.llm.assign({
    temperature: 0.7,
    limit: 10, // Max tool execution attempts
    tools: factory.tools
      .web()
      .files('read-write', {
        allowed: {
          write: ['src/generated/*.ts'],
          edit: ['src/**/*.ts'],
          rm: ['temp/**/*']
        }
      })
      .provide(),
  }))
  .schema(z.object({
    summary: z.string(),
    links: z.array(z.string())
  }))
  .prompt([
    utils.content.tasks([
      `Find information about: ${context.input}`,
      'Summarize findings and provide source links'
    ])
  ])
)
```

### AI Step with Fallback

Configure fallback providers for an AI step to automatically switch to alternative models or providers if the primary one fails.

```ts
import { llm } from '@n1k1t/pipelain';

.step('translation', ({ factory }) => factory
  .ai('Translating with fallback')
  .llm(({ context }) => context.llm.assign({
    temperature: 0.3,
    fallback: {
      // 'continue' - resumes the session with the new provider keeping existing tool calls and reasoning results.
      // 'restart'  - restarts the step execution from scratch using the fallback provider.
      strategy: 'continue',
      providers: [
        // Backup 1: If primary provider fails, try this model
        llm.providers.LlmGoogleProvider.build('gemini-1.5-pro', {
          connection: { key: process.env.GOOGLE_API_KEY! }
        }),
        // Backup 2: If the first backup also fails, try this model
        llm.providers.LlmOpenAiProvider.build('gpt-4o', {
          connection: { key: process.env.OPENAI_API_KEY! }
        })
      ]
    }
  }))
  .schema(z.object({ text: z.string() }))
  .prompt(['Translate this text into Spanish...'])
)
```

### Combining `self` and `ai` Steps

Use `self` steps to perform local computations, log messages, or modify/transform the shared state.

```ts
const pipeline = PipelineCompiler
  .build('Data Processor')
  .input(z.string())
  .step('extracted', ({ factory, context }) => factory
    .ai('Extracting data')
    .schema(z.object({
      items: z.array(z.string())
    }))
    .prompt([`Extract items from: ${context.input}`])
  )
  // Local self step
  .step(({ context, utils }) => {
    utils.log(`Extracted ${context.state.extracted.items.length} items`);

    context.merge({
      state: {
        processedCount: context.state.extracted.items.length
      }
    });
  })
  .step('summary', ({ factory, context }) => factory
    .ai('Summarizing')
    .schema(z.object({ text: z.string() }))
    .prompt([
      `Summarize these ${context.state.processedCount} items:`,
      context.state.extracted.items.join(', ')
    ])
  );
```

### Parallel Execution with `swarm`

Run multiple independent AI tasks in parallel to improve performance.

```ts
.step('analysis', ({ factory }) => factory
  .swarm('Parallel Analysis')
  .subtasks([
    factory
      .ai('Sentiment Analysis')
      .schema(z.object({ score: z.number() }))
      .prompt(({ context }) => [`Analyze sentiment of: ${context.input}`]),

    factory
      .ai('Keyword Extraction')
      .schema(z.object({ tags: z.array(z.string()) }))
      .prompt(({ context }) => [`Extract keywords from: ${context.input}`]),
  ])
  .limit(2) // Limit parallel executions
)
// Results will be available in context.state.analysis as an array of PromiseSettledResult
```

### Iterative Execution with `loop` (Self-Correction)

Create validation loops where the AI evaluates its own responses or retries until a condition is met.

```ts
.step('refined_answer', ({ factory }) => factory
  .loop('Self-Correction Loop')
  .limit(3) // Max 3 attempts
  .action(({ factory, context, verdict }) => factory
    .ai('Answering')
    .schema(z.object({
      answer: z.string(),
      isCorrect: z.boolean().describe('Self-check result')
    }))
    .prompt([
      `Question: ${context.input}`,
      verdict.status === 'pending' ? verdict.content : ''
    ])
  )
  .condition(({ result }) => {
    if (result.isCorrect) {
      return { status: 'fulfilled' };
    }

    return {
      status: 'pending',
      content: 'Your previous answer was incorrect. Please try again and be more specific.'
    };
  })
)
// Result will be { status: 'fulfilled' | 'voided', value: { answer, isCorrect } }
```

### Model Context Protocol (MCP) Integration

Integrate MCP servers to allow the AI to use tools provided by external service servers.

```ts
import { LlmMcp } from '@n1k1t/pipelain';

pipeline.step('mcp_research', ({ factory }) => factory
  .ai('Researching with MCP')
  .llm(({ context }) => context.llm.assign({
    mcp: [
      LlmMcp.build({
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-gdrive'],
        },
        tools: {
          enabled: ['list-files', 'read-file'], // Limit enabled tools
        },
      }),
    ],
  }))
  .prompt(['List my recent files in Google Drive and summarize them.'])
);
```

### Custom LLM Tools

Create and integrate your own custom tools using `LlmToolCompiler`.

```ts
import z from 'zod';
import { LlmToolCompiler } from '@n1k1t/pipelain';

const weatherTool = LlmToolCompiler
  .build('Get current weather for a location')
  .input(z.object({
    city: z.string().describe('The city name')
  }))
  .output(z.object({
    temperature: z.number(),
    condition: z.string()
  }))
  .execute(() => async ({ city }) => {
    return { temperature: 22, condition: 'Sunny' };
  });

pipeline.step('weather_report', ({ factory, context }) => factory
  .ai('Checking weather')
  .llm(({ context }) => context.llm.assign({
    tools: factory.tools
      .web()
      .custom({ weather: weatherTool })
      .provide()
  }))
  .prompt([`Check weather in ${context.input}`])
);
```

---

## Steps

### 1. Analysis and Planning

Review the tasks and workflows that need to be accomplished by the AI:
- Determine step structure: Can the task be done in a single AI step, or does it require a sequence of steps?
- Assess if parallel execution (`swarm`) can speed up independent tasks.
- Assess if validation or correction is needed, requiring an iterative loop step (`loop`).
- Define inputs and outputs clearly, writing matching Zod schemas for structured responses.

### 2. Implementation Workflow

1. **Define Input**: Use `.input()` on `PipelineCompiler` to specify the entry schema.
2. **Chain Steps**: Chain `.step()` operations to orchestrate your workflow:
   - Use `factory.ai()` for AI-driven steps, assigning prompt components (`utils.content`) and Zod schemas.
   - Use local `self` steps (anonymous functions) to log, process outputs, or manipulate pipeline state.
3. **Configure Tools & Skills**: Use `.llm()` mapping to supply tools (`factory.tools`) or load skills (`factory.skills`) relevant to the current step.
4. **Compile and Execute**: Compile the pipeline using `.compile({ stdout })` and trigger execution using `.run(input)`.

### 3. Verification

- Enable debug mode `.debug()` on a step to mock execution and save the generated prompts into `.pipelain/${timestamp}-${session-id}/${step-title}.md` for inspection.
- Monitor log events by compiling the pipeline with `stdout: stdout.console`.
- Run TS type checking command `npm run build:check` to ensure correctness of Zod schemas and step definitions.

### 4. Refinement

- Optimize tokens and context size by restricting tool availability or specific paths (e.g. `allowed` paths in `files('read-write')`).
- If an AI step behaves inconsistently, split it into smaller, more granular steps or add a `loop` validation step.

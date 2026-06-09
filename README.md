<div align='center'>
  <h1>PipelAIn</h1>
  <p>Type-safe AI-powered execution pipelines</p>

  <img width="640px" src="https://raw.githubusercontent.com/n1k1t/pipelain/refs/heads/master/images/preview.png?raw=true" />

  <br />
  <br />

  ![License](https://img.shields.io/badge/License-MIT-yellow.svg)
  ![npm version](https://badge.fury.io/js/@n1k1t%2Fpipelain.svg)
  ![Dynamic XML Badge](https://img.shields.io/badge/dynamic/xml?url=https%3A%2F%2Fgithub.com%2Fn1k1t%2Fpipelain%2Fblob%2Fmaster%2Fcoverage%2Fcobertura-coverage.xml%3Fraw%3Dtrue&query=round(%2Fcoverage%2F%40line-rate%20*%201000)%20div%201000&label=coverage)
</div>

Powerful utility to build and execute type-safe AI pipelines with structured outputs and tool integration.

- [Features](#features)
- [Installation](#installation)
- [First Steps](#first-steps)
- [Add Skills](#add-skills)
- [Simple Example](#simple-example)
- [Environment Variables](#environment-variables)
- [Pipeline Step Utilities](#pipeline-step-utilities)
  - [factory](#factory)
  - [utils](#utils)
  - [context](#context)
  - [utils.content (ContentFactory)](#utilscontent-contentfactory)
  - [factory.tools (LlmToolsFactory)](#factorytools-llmtoolsfactory)
  - [factory.skills (LlmSkillsFactory)](#factoryskills-llmskillsfactory)
- [Usage](#usage)
  - [Logging and Events](#logging-and-events)
  - [Structured Prompt Content](#structured-prompt-content)
  - [AI Step with LLM Configuration](#ai-step-with-llm-configuration)
  - [Debugging AI Steps](#debugging-ai-steps)
  - [Combining self and ai Steps](#combining-self-and-ai-steps)
  - [Parallel Execution with swarm](#parallel-execution-with-swarm)
  - [Iterative Execution with loop](#iterative-execution-with-loop)
  - [Multi-Provider Pipelines](#multi-provider-pipelines)
  - [MCP (Model Context Protocol) Integration](#mcp-model-context-protocol-integration)
  - [Using Skills](#using-skills)
- [Extensions](#extensions)
  - [Custom LLM Tools](#custom-llm-tools)
  - [Custom LLM Skills](#custom-llm-skills)
  - [Registering Skills from Markdown](#registering-skills-from-markdown)
- [License](#license)

## Features

- **Type-safe**: Built with TypeScript and Zod for full type safety of inputs, outputs, and intermediate states.
- **Structured Outputs**: Enforce AI responses to match specific Zod schemas.
- **Tool Integration**: Easily provide tools (web search, file system, etc.) to the AI.
- **Step-by-step Execution**: Define complex workflows as a series of steps.
- **Context-aware**: Shared context and state across all pipeline steps.

## Installation

```bash
npm install @n1k1t/pipelain zod
```

## First Steps

To use the library, you need to provide an API key for the LLM provider. Create a `.env` file in your project root and add your key:

```env
PIPELAIN_API_KEY=your_api_key_here
```

## Add Skills

If you are using the [skills](https://www.npmjs.com/package/skills) package, you can add `n1k1t/pipelain` to your project using the following command:

```bash
npx skills add n1k1t/pipelain
```

## Simple Example

A basic pipeline that translates text and returns a structured response:

```ts
import z from 'zod/v3';
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

## Environment Variables

The following environment variables are supported:

| Variable | Description | Default |
| --- | --- | --- |
| `PIPELAIN_API_KEY` | API key for the LLM provider. | - |
| `PIPELAIN_API_URL` | Custom API URL for the LLM provider. | - |
| `PIPELAIN_SKILLS_DIR` | Directory path where LLM skills are stored. | `~/.agents/skills` |
| `PIPELAIN_MODEL` | Default LLM model to use. | `gemini-flash-latest` |
| `PIPELAIN_PROVIDER` | LLM provider name (e.g., `google`, `openai`). | - |

## Pipeline Step Utilities

Each pipeline step receives a set of utilities to interact with the environment, AI, and context.

### `factory`
Used to create different types of steps:
- `ai(description?)`: Creates a step that executes on the AI side.
- `self(description?)`: Creates a step that executes on the local machine.
- `swarm(description?)`: Executes multiple steps or pipelines in parallel.
- `loop(description?)`: Creates a loop of steps.
- `tools`: Access to LLM tools factory (e.g., `factory.tools.web()`).
- `skills`: Access to LLM skills factory (e.g., `factory.skills.all()`).

### `utils`
General-purpose utilities:
- `content`: `ContentFactory` instance to create structured prompt content (articles, tasks, rules, attachments).
- `bash`: Execute shell commands on the local machine.
- `log`: Emit log events for the current pipeline session.

### `context`
Shared state and configuration:
- `input`: The input data provided to the pipeline.
- `state`: Shared state across all steps.
- `llm`: Current LLM provider configuration.
- `project`: Information about the current project.

### `utils.content` (ContentFactory)
Used to create structured prompt content. These methods are available via `utils.content` in pipeline steps.

| Method | Description | Example |
| --- | --- | --- |
| `article(title, content)` | Creates a `## Title` section with nested markdown content. | `utils.content.article('Context', [{ p: 'Some text' }])` |
| `rules(list)` | Creates a bulleted list of rules/constraints. | `utils.content.rules(['Use JSON', 'Be concise'])` |
| `tasks(list)` | Creates a numbered list of tasks for the AI. | `utils.content.tasks(['Analyze data', 'Write summary'])` |
| `sources(list)` | Creates a list of source links. | `utils.content.sources(['https://google.com'])` |
| `attachment(title, payload)` | Attaches data (object, string) as a file-like block. | `utils.content.attachment('Data', { content: { id: 1 } })` |
| `file(title, path)` | Reads a local file and attaches it as context. | `await utils.content.file('Config', 'package.json')` |
| `glob(title, pattern)` | Reads multiple files by pattern and attaches them. | `await utils.content.glob('Source', 'src/**/*.ts')` |
| `plain(text)` | Adds raw markdown text. | `utils.content.plain('### Subtitle\nText')` |

### `factory.tools` (LlmToolsFactory)
Used to provide tools to the AI. These methods are available via `factory.tools` in pipeline steps.

| Method | Description | Included Tools |
| --- | --- | --- |
| `all()` | Includes all available tools. | -|
| `web()` | Tools for web interaction. | `search`, `fetch` |
| `files('read')` | Read-only file system tools. | `read`, `grep`, `glob`, `ls` |
| `files('read-write')` | Read and write file system tools. | `read`, `grep`, `glob`, `ls`, `mkdir`, `write`, `edit`, `rm` |
| `commands(['npm', 'npx'])` | Package manager tools. | `npm`, `npx` |
| `custom(tools)` | Includes custom tool implementations. | - |

### `factory.skills` (LlmSkillsFactory)
Used to provide domain-specific instructions and workflows to the AI. These methods are available via `factory.skills` in pipeline steps.

| Method | Description |
| --- | --- |
| `all()` | Includes all registered skills. |
| `match(pattern)` | Includes skills matching a minimatch pattern. |
| `register(raw)` | Registers a new skill from raw markdown content (with frontmatter). |
| `custom(skills)` | Includes custom skill objects. |
| `provide()` | Returns the list of included skills for LLM configuration. |

---

## Usage

### Logging and Events

You can use `stdout.console` to output pipeline progress and logs to `stdout`:

```ts
import { stdout } from '@n1k1t/pipelain';

(async () => {
  const compiled = await translate.compile({ stdout: stdout.console });
  await compiled.run('Hello');
})();
```

To use a custom logger or override specific event handlers, use `PipelineStdout`:

```ts
import { PipelineStdout } from '@n1k1t/pipelain';

const customStdout = PipelineStdout
  .build(console) // Pass any logger with .info and .warn methods
  .override('log', (event) => {
    console.log(`[CUSTOM LOG] ${event.message}`);
  })
  .override('step:run', (event) => {
    if (event.meta.state === 'SUCCESS') {
      console.log(`Step ${event.step.title} finished in ${event.meta.spent}ms`);
    }
  });

(async () => {
  const compiled = await translate.compile({ stdout: customStdout });
  await compiled.run('Hello');
})();
```

### Structured Prompt Content

You can combine multiple content types to create a rich, structured prompt for the AI:

```ts
.step('complex_task', async ({ factory, utils, context }) => factory
  .ai('Complex Processing')
  .prompt([
    // 1. Global rules for the AI
    utils.content.rules([
      'Use professional tone',
      'Output must be valid JSON'
    ]),

    // 2. Structured article with nested content
    utils.content.article('Project Overview', [
      { p: 'This project is a type-safe pipeline builder.' },
      { h2: 'Key Goals' },
      { ul: ['Safety', 'Performance', 'Flexibility'] }
    ]),

    // 3. Attachments (data or files)
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

### AI Step with LLM Configuration

You can customize the LLM behavior for a specific step, such as changing the temperature or providing tools. You can also restrict file tools to specific paths using `allowed` patterns:

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
          // Restrict 'write' tool to specific directory
          write: ['src/generated/*.ts'],
          // Restrict 'edit' tool to all TypeScript files
          edit: ['src/**/*.ts'],
          // Restrict 'rm' tool to temporary files
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

### Debugging AI Steps

You can use the `.debug()` method to inspect the prompts sent to the AI. When debug mode is enabled, the step will mock the AI response and save the generated prompt into a markdown file in the `.pipelain` directory:

```ts
.step('debug_example', ({ factory }) => factory
  .ai('Debugging Step')
  .debug() // Enables debug mode for this step
  .schema(z.object({ result: z.string() }))
  .prompt(['Analyze this complex data...'])
)
```

The prompt will be saved to: `.pipelain/${timestamp}-${session-id}/${step-title}.md`.

### Combining `self` and `ai` Steps

You can use `self` steps to perform local computations, logging, or data transformation between AI steps:

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
  // Local step to process data or log progress
  .step(({ context, utils }) => {
    utils.log(`Extracted ${context.state.extracted.items.length} items`);

    // You can also modify the state or context here
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

Use `swarm` to execute multiple AI tasks in parallel. You can define subtasks using the `subtasks` method:

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
  .limit(2) // Optional: limit parallel executions
)
// Results will be available in context.state.analysis as an array of PromiseSettledResult
```

### Iterative Execution with `loop`

Use `loop` for tasks that require multiple iterations or validation, such as self-correction:

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
      // If this is a retry, include previous feedback
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
// Result will contain { status: 'fulfilled' | 'voided', value: { answer, isCorrect } }
```

### Multi-Provider Pipelines

You can use different LLM providers for different steps in the same pipeline:

```ts
import { PipelineCompiler, llm } from '@n1k1t/pipelain';

const pipeline = PipelineCompiler
  .build('Multi-Provider')
  .input(z.string())
  .step('initial_analysis', ({ factory }) => factory
    .ai('Google Analysis')
    .llm(() => llm.providers.LlmGoogleProvider.build('gemini-1.5-flash', {
      connection: { key: process.env.GOOGLE_API_KEY! }
    }))
    .prompt(({ context }) => [`Analyze this: ${context.input}`])
  )
  .step('final_summary', ({ factory }) => factory
    .ai('Anthropic Summary')
    .llm(() => llm.providers.LlmAnthropicProvider.build('claude-3-5-sonnet-20240620', {
      connection: { key: process.env.ANTHROPIC_API_KEY! }
    }))
    .prompt(({ context }) => [
      `Summarize the analysis: ${context.state.initial_analysis}`
    ])
  );
```

### MCP (Model Context Protocol) Integration

You can integrate MCP servers into your pipeline steps. This allows the AI to use tools provided by external MCP servers. You can also filter which tools are enabled:

```ts
import { LlmMcp } from '@n1k1t/pipelain';

pipeline.step('mcp_research', ({ factory, context }) => factory
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
          // Enable only specific tools using names or minimatch patterns
          enabled: ['list-files', 'read-file'],
          // Or disable specific tools
          // disabled: ['delete-file'],
        },
      }),
    ],
  }))
  .prompt(['List my recent files in Google Drive and summarize them.'])
);
```

### Using Skills

Skills allow you to inject reusable domain-specific instructions or workflows into your AI steps. You can manage them via `factory.skills`:

```ts
.step('specialized_task', ({ factory, context }) => factory
  .ai('Executing with skills')
  .llm(({ context }) => context.llm.assign({
    // Include all registered skills from PIPELAIN_SKILLS_DIR
    skills: factory.skills.all().provide(),

    // OR: Include only specific skills by pattern
    // skills: factory.skills.match('coding-*').provide(),
  }))
  .prompt([
    `Perform this task using available skills: ${context.input}`
  ])
)
```

## Extensions

### Custom LLM Tools

You can create custom tools for the AI using `LlmToolCompiler`. This allows the AI to interact with your own services or perform specialized tasks:

```ts
import z from 'zod/v3';
import { LlmToolCompiler } from '@n1k1t/pipelain';

// 1. Define the tool
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
    // Your implementation here
    return { temperature: 22, condition: 'Sunny' };
  });

// 2. Use it in a step
pipeline.step('weather_report', ({ factory, context }) => factory
  .ai('Checking weather')
  .llm(({ context }) => context.llm.assign({
    tools: factory.tools
      .web() // Include standard web tools
      .custom({ weather: weatherTool }) // Add your custom tool
      .provide()
  }))
  .prompt([`Check weather in ${context.input}`])
);
```

### Custom LLM Skills

You can also provide custom skills programmatically:

```ts
pipeline.step('custom_skills', ({ factory, context }) => factory
  .ai('Using custom skills')
  .llm(({ context }) => context.llm.assign({
    skills: factory.skills
      // Provide custom skill objects
      .custom([{
        name: 'manual-skill',
        description: 'Manually defined skill',
        content: 'Manual skill content'
      }])
      .provide()
  }))
  .prompt(['...'])
);
```

### Registering Skills from Markdown

You can register new skills from raw markdown content (with frontmatter) using `LlmSkillsFactory`:

```ts
import { LlmSkillsFactory } from '@n1k1t/pipelain';

const rawSkill = `---
name: custom-skill
description: A custom skill description
---
Skill content goes here.`;

// 1. Create a skills factory (optionally with existing skills)
const skills = LlmSkillsFactory.build();

// 2. Register new skills from raw markdown
skills.register(rawSkill);

// 3. Use in a pipeline step
pipeline.step('specialized_task', ({ factory, context }) => factory
  .ai('Executing with registered skill')
  .llm(({ context }) => context.llm.assign({
    skills: skills.all().provide(),
  }))
  .prompt(['...'])
);
```

---

## License

MIT

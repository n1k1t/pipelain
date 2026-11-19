# Git

Rules for commits in the repository.

## Commit message

- Language: **English** only.
- Format: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>(<scope>)!: <summary>

<body>

<footer>
```

- `<type>` — required, lower case, one of the types below.
- `(<scope>)` — optional, lower case, the affected area of the project: `llm`, `providers`, `tools`, `router`, `hooks`, `mcp`, `pipeline`, `steps`, `session`, `report`, `content`, `meta`, `deps`, etc.
- `!` — optional, marks a breaking change of the public API (exported classes, methods, types, options).
- `<summary>` — required:
  - imperative mood, present tense: `add`, `fix`, `remove` (not `added`, `fixes`);
  - starts with a lower case letter, no period at the end;
  - up to 72 characters for the whole first line;
  - describes **what** is changed, not how.
- `<body>` — optional, separated from the first line by a blank line. Explains **why** the change is made and what is important for a reviewer. Wrap lines at 72 characters.
- `<footer>` — optional: `BREAKING CHANGE: <description>`, references to issues (`Refs: #12`), trailers (`Co-Authored-By: ...`).

## Types

| Type | When to use |
| --- | --- |
| `feat` | New functionality of the package or a new public API |
| `fix` | Bug fix |
| `docs` | Documentation only: `.ai/docs`, `AGENTS.md`, `README`, skills, comments |
| `style` | Code formatting without changes of the behaviour |
| `refactor` | Code change that neither fixes a bug nor adds a feature (moves, renames, restructuring) |
| `perf` | Performance improvement |
| `test` | Adding or changing tests (`*.spec.ts`, `test/`) |
| `build` | Build system, dependencies, `package.json`, TypeScript / Jest configuration |
| `ci` | CI configuration, git hooks (`.husky/`) |
| `chore` | Maintenance that does not affect the source code and the build |
| `revert` | Revert of a previous commit, the body contains `This reverts commit <hash>.` |

## Examples

```
feat(hooks): add fatal flag for ai errors
```

```
fix(tools): return relative paths in grep and glob output
```

```
fix(providers): send json schema to deepseek over proxy
```

```
refactor(pipeline): move error sequence to the steps module
```

```
build: update typescript to 5.9
```

```
feat(router)!: require setup method for custom routers

BREAKING CHANGE: `Router` subclasses must implement `setup()`
before the first request.
```

## Rules

- One commit — one logical change. Do not mix a feature, a refactoring and dependency updates in one commit.
- Run `npm run build:check` before commit. The `pre-commit` hook runs `npm test`: do not skip it with `--no-verify`.
- Do not commit build artifacts (`lib/`, `*.tsbuildinfo`, coverage reports except `coverage/cobertura-coverage.xml`) and secrets (`.env`).
- Version commits (`1.0.12`) are created by `npm version` only and are not written manually: `preversion` runs the type check and tests, `postversion` builds the package and pushes the commit and the tag.
- AI agents commit only when explicitly asked.

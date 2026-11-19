# AGENTS.md

Instructions for AI agents working in this repository (`@n1k1t/pipelain`).

## Mandatory rules

- If the `caveman` skill is installed, use it for communication in this session.

## Project documentation

Before starting work, review the documentation in `.ai/docs`:

- [`.ai/docs/structure.md`](.ai/docs/structure.md) — project structure, purpose of the main directories and files.
- [`.ai/docs/style.md`](.ai/docs/style.md) — code style: import/export order, object and function formatting, class, type, naming and error conventions, LLM tools and tests patterns.
- [`.ai/docs/git.md`](.ai/docs/git.md) — git commits: English Conventional Commits messages (`feat`, `fix`, `docs`, etc.), commit rules.

## Useful commands

- `npm test` — run tests (Jest).
- `npm run build:check` — type-check without building (`tsc --noEmit`).
- `npm run build` — build the project into `lib/`.

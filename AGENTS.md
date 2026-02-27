# Agent Instructions

## Before Committing

Run all checks before committing changes:

```bash
npm run lint && npm run check && npm test && npm run build && npm run build-storybook
```

This runs:

1. **Lint** (`biome check .`) — code formatting and linting
2. **Check** (`npm run lint && npm run typecheck`) — lint + TypeScript type checking
3. **Test** (`vitest run`) — unit and integration tests
4. **Build** (`react-router build`) — production build
5. **Build Storybook** (`storybook build`) — Storybook build

All must pass before committing.

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope?): subject
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`, `revert`

## Server/Client Boundary

This is a React Router app with server/client code splitting. Files ending in `.server.ts` are server-only and **cannot** be imported in client-side code (component default exports, hooks, etc.). Shared constants must live in non-server files (e.g., `app/db/sync-job-types.ts`).

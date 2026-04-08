# Linting & Typechecking Design

**Date:** 2026-04-07  
**Status:** Approved

## Overview

Add Biome (linting + formatting) and TypeScript typechecking to the crawlers project. Checks run automatically after Claude edits `.ts` files (via Claude Code hook), on save in VS Code (via Biome extension), and manually via npm scripts.

## Components

### 1. Biome

- Install `@biomejs/biome` as a devDependency
- Add `biome.json` at project root
- Linting and formatting enabled with defaults
- `node_modules` excluded from checks

### 2. TypeScript config (`tsconfig.json`)

Replace the current empty `tsconfig.json` with:

| Setting | Value | Reason |
|---|---|---|
| `noImplicitAny` | `true` | Moderate strictness |
| `strictNullChecks` | `true` | Moderate strictness |
| `module` | `"NodeNext"` | ESM project |
| `moduleResolution` | `"NodeNext"` | ESM project |
| `target` | `"ES2022"` | Modern Node.js |
| `noEmit` | `true` | Typecheck only, no output files |
| `include` | `["*.ts"]` | Cover all crawler files |

### 3. npm scripts

Added to `package.json`:

| Script | Command | Purpose |
|---|---|---|
| `lint` | `biome check .` | Lint + format check |
| `typecheck` | `tsc --noEmit` | Type errors only |
| `check` | `npm run lint && npm run typecheck` | Both together |

### 4. Claude Code `PostToolUse` hook

- Trigger: after any `Edit` or `Write` tool call on a `.ts` file
- Action: run `npx biome check <file>` and `tsc --noEmit`
- Output surfaces in the conversation for immediate fixing
- Configured in Claude Code `settings.json`

### 5. VS Code integration

Add `.vscode/settings.json`:

- Biome as default formatter for TypeScript files
- Format-on-save enabled
- Built-in VS Code TypeScript formatter disabled
- Requires the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)

## Out of Scope

- Pre-commit git hooks
- CI/CD integration
- Custom lint rule configuration beyond Biome defaults

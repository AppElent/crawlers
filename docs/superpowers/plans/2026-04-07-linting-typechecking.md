# Linting & Typechecking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Biome (linting + formatting) and TypeScript typechecking with npm scripts, VS Code format-on-save, and a Claude Code PostToolUse hook that runs checks after editing `.ts` files.

**Architecture:** Biome handles linting and formatting via `biome.json`; TypeScript typechecking runs via `tsc --noEmit` with a project-level `tsconfig.json`. Both are wired up as npm scripts, triggered by a Claude Code hook after file edits, and auto-applied on save via VS Code settings.

**Tech Stack:** `@biomejs/biome`, TypeScript (already via `crawlee`), Claude Code hooks, VS Code Biome extension

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@biomejs/biome` devDep + `lint`/`typecheck`/`check` scripts |
| `biome.json` | Create | Biome linting + formatting config |
| `tsconfig.json` | Overwrite | Moderate strict TypeScript config (currently empty) |
| `.vscode/settings.json` | Create | Format-on-save via Biome extension |
| `.claude/settings.json` | Create | PostToolUse hook to run checks after `.ts` edits |

---

## Task 1: Install Biome

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Biome as devDependency**

```bash
cd D:/dev/crawlers && npm install --save-dev @biomejs/biome
```

Expected output: `added 1 package` (Biome is a single self-contained binary)

- [ ] **Step 2: Verify install**

```bash
npx biome --version
```

Expected: prints a version string like `1.9.x`

---

## Task 2: Create biome.json

**Files:**
- Create: `biome.json`

- [ ] **Step 1: Create `biome.json`**

Write the following to `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 4
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single"
    }
  },
  "files": {
    "ignore": ["node_modules", "storage"]
  }
}
```

- [ ] **Step 2: Run Biome check to verify config is valid**

```bash
npx biome check .
```

Expected: output listing any lint/format issues in `.ts` files, or a clean pass. No config errors.

- [ ] **Step 3: Commit**

```bash
git add biome.json package.json package-lock.json
git commit -m "chore: add Biome for linting and formatting"
```

---

## Task 3: Configure tsconfig.json

**Files:**
- Overwrite: `tsconfig.json`

- [ ] **Step 1: Write `tsconfig.json`**

Overwrite the existing empty `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["*.ts"]
}
```

> `skipLibCheck: true` avoids errors in third-party type definitions. `noEmit: true` means `tsc` only typechecks — it never writes output files.

- [ ] **Step 2: Run typechecking**

```bash
npx tsc --noEmit
```

Expected: either clean output (no errors) or a list of type errors to fix in Task 4. Note any errors and proceed.

- [ ] **Step 3: Commit (even if there are type errors — they'll be fixed in Task 4)**

```bash
git add tsconfig.json
git commit -m "chore: add tsconfig with moderate strict settings"
```

---

## Task 4: Add npm scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add scripts to `package.json`**

Update the `"scripts"` block:

```json
"scripts": {
  "test": "echo \"Error: no test specified\" && exit 1",
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "typecheck": "tsc --noEmit",
  "check": "npm run lint && npm run typecheck"
}
```

- [ ] **Step 2: Verify scripts run**

```bash
npm run lint
npm run typecheck
npm run check
```

Expected: each command runs without shell errors (lint/type errors in source files are fine — they'll be fixed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add lint, typecheck, and check npm scripts"
```

---

## Task 5: Fix TypeScript errors in existing files

**Files:**
- Modify: `kaas_nl.ts` (and any other `.ts` files that report errors)

- [ ] **Step 1: Run typechecking and capture output**

```bash
npx tsc --noEmit
```

Read the full output. Fix each error in turn.

- [ ] **Step 2: Fix errors**

For each error reported, apply the minimal fix. Common patterns with `strictNullChecks`:

- If `x` might be `undefined`, guard with `if (x !== undefined)` or use `x ?? fallback`
- If a function parameter lacks a type annotation, add the type explicitly
- If an array or value could be `null`, narrow the type before use

Example fix for a `string | undefined` used where `string` is expected:

```typescript
// before
const val = map.get(key);
doSomething(val); // error: string | undefined not assignable to string

// after
const val = map.get(key);
if (val !== undefined) {
  doSomething(val);
}
```

- [ ] **Step 3: Run typechecking again — must be clean**

```bash
npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 4: Run lint to make sure fixes didn't introduce lint issues**

```bash
npm run lint
```

Expected: clean or only pre-existing warnings.

- [ ] **Step 5: Commit**

```bash
git add kaas_nl.ts
git commit -m "fix: resolve TypeScript errors under strict null checks"
```

---

## Task 6: VS Code settings

**Files:**
- Create: `.vscode/settings.json`

- [ ] **Step 1: Create `.vscode/settings.json`**

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "biomejs.biome",
    "editor.formatOnSave": true
  },
  "typescript.format.enable": false
}
```

> Requires the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome). Install it from the VS Code marketplace if not already installed.

- [ ] **Step 2: Verify in VS Code**

Open `kaas_nl.ts` in VS Code and save it. The file should be formatted automatically by Biome (not the built-in TypeScript formatter).

- [ ] **Step 3: Commit**

```bash
git add .vscode/settings.json
git commit -m "chore: configure VS Code to format-on-save with Biome"
```

---

## Task 7: Claude Code PostToolUse hook

**Files:**
- Create: `.claude/settings.json`

- [ ] **Step 1: Invoke the `update-config` skill**

Use the `update-config` skill. Tell it:

> "Add a PostToolUse hook that fires after Edit or Write tool calls. If the edited file ends in `.ts`, run `npx biome check <file>` and `npx tsc --noEmit`. Show output in the conversation."

The skill will write the correct hook format to `.claude/settings.json` (or the user-level `~/.claude/settings.json`). Follow whatever it produces — hook schema varies by Claude Code version.

- [ ] **Step 2: Verify the hook fires**

Make a small edit to `kaas_nl.ts` (e.g., add and remove a blank line). After the Edit tool completes, the hook output should appear in the conversation showing Biome and tsc results.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "chore: add PostToolUse hook to run Biome and tsc after .ts edits"
```

---

## Done

After all tasks complete, verify the full setup:

```bash
npm run check
```

Expected: clean output from both Biome and tsc.

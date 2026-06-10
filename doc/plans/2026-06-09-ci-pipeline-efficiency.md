# Plan for CI Pipeline Optimization: Implementing Affected Test Filtering

## 1. Context & Problem Statement
The current CI/CD pipeline defined in `.github/workflows/pr.yml` is static and monolithic. When any commit is pushed to a Pull Request, the workflow executes the entire test suite, which includes:
- Policy checks and manifests validation.
- Full TypeScript compilation (Typecheck).
- 3 parallel groups of general tests (`general-server`, `general-workspaces-a`, `general-workspaces-b`).
- 4 shards of serialized server test suites running in parallel.
- Full workspace production build.
- Canary dry run release process.

This runs unconditionally, even when changes are strictly confined to a single subproject or package. For instance:
> **Case Study:** Modifying a single frontend testing file (`ui/src/pages/InstancePlatformsAdmin.test.tsx`) triggers the entire backend server tests suite (~170 server test files, hundreds of unit tests) and shards, consuming substantial runner minutes and creating an inefficient feedback loop for developers.

---

## 2. Impact Analysis
- **Developer Feedback Loop:** A simple UI change or local UI test fix takes **5 to 10 minutes** to be validated on GitHub Actions before the PR is merge-ready.
- **Resource Consumption:** Executing server shards and heavy integration test runs on every minor UI tweak exhausts GitHub Actions runner minutes unnecessarily.
- **Flakiness Risk:** Running hundreds of unrelated integration tests increases the chance of transient failures (infrastructure flakes, database locks) affecting unrelated PRs.

---

## 3. Investigation & Analysis of Current Setup

### Monorepo Structure (pnpm)
The project is structured as a pnpm monorepo:
```yaml
packages:
  - packages/*
  - packages/adapters/*
  - packages/plugins/*
  - server
  - ui
  - cli
```

- `ui/` hosts the React + Vite frontend board, which only consumes schemas/contracts from `packages/shared` and is served as static files by the `server/` dev/prod middleware.
- `server/` hosts the Express REST API and orchestration logic, containing the bulk of heavy test suites and serialized database test suites.
- `packages/db/` and `packages/shared/` contain database schemas and validation logic that both frontend and backend depend on.

Currently, all test suites are triggered inside GitHub Actions using static scripts like:
```bash
pnpm test:run:general -- --group 'general-server'
pnpm test:run:serialized -- --shard-index 0 --shard-count 4
```

---

## 4. Proposed Solutions

### Option 1: Turborepo / Nx Affected Runs (Recommended)
Since the repository is a monorepo managed by `pnpm`, integrating **Turborepo** or **Nx** is the most robust and standard way to solve this.
- **Implementation:** Install Turborepo (`turbo`) as a dev dependency. Define a pipeline topology (`turbo.json`) where `test` tasks depend on `build` and configuration files.
- **CI Configuration:** In `.github/workflows/pr.yml`, run tests using the `--filter` flag comparing against the base branch:
  ```bash
  pnpm turbo test --filter=[...origin/main]
  ```
- **Pros:** Correctly traces dependency graphs (e.g., if `packages/shared` changes, both `ui` and `server` tests run. If only `ui` changes, only `ui` tests run). It also brings local and remote task caching.
- **Cons:** Requires initial setup of a `turbo.json` config file and alignment of workspace dependencies.

### Option 2: Native GitHub Actions Path Filtering
Configure job-level conditions or workflow paths in `.github/workflows/pr.yml` to skip execution of jobs based on git diff paths.
- **Implementation:**
  ```yaml
  on:
    pull_request:
      paths-ignore:
        - 'ui/**' # Trigger backend tests only when backend changes (or vice-versa)
  ```
- **Pros:** Zero-dependency, purely native to GitHub Actions.
- **Cons:** Hard to maintain and fragile. If a file in `packages/shared` or `packages/db` is modified, it's easy to miss dependencies and omit running tests that should have run.

### Option 3: Scripted Git Diff + Vitest `--related`
Create a custom bash script that detects changed files and feeds them to Vitest's automatic dependency tracker.
- **Implementation:**
  ```bash
  CHANGED_FILES=$(git diff --name-only origin/main...HEAD | tr '\n' ' ')
  pnpm exec vitest run --related $CHANGED_FILES
  ```
- **Pros:** Directly utilizes Vitest's built-in dependency resolution (`--related` flag).
- **Cons:** Doesn't handle build caching or task orchestration as cleanly as Turborepo/Nx.

---

## 5. Action Plan & Recommendations
1. **Short-term:** Review `.github/workflows/pr.yml` to isolate the `ui` build and tests from the heavy serialized server shards using simple path-based execution scripts, or ensure frontend-only PRs skip database/canary shards.
2. **Medium-term:** Initialize Turborepo (`pnpm add -wd turbo` and `turbo.json`) to control task execution pipelines. Map out the `typecheck`, `build`, and `test` dependencies. This will ensure that if `ui` doesn't import any changed packages, its cache is hit or the job completes instantly without running unrelated tests.

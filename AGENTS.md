# AGENTS.md - AI Code Reviewer Development Guide

This document provides essential information for agents working on the AI Code Reviewer project.

## Project Overview

AI Code Reviewer is a GitHub Action that leverages multiple AI providers (OpenAI, Anthropic, Google Gemini, Custom) to provide intelligent code review feedback on pull requests. It supports reviewing only new changes, filtering files, and integrates with GitHub's review system.

## Essential Commands

```bash
# Install dependencies
yarn install

# Build TypeScript to lib/ (required before running or packaging)
yarn build

# Run unit tests
yarn test

# Run tests with coverage
yarn test --coverage

# Format code with Prettier
yarn format

# Lint code with ESLint
yarn lint

# Run pre-commit checks (lint + test)
yarn precommit

# Package for GitHub Actions distribution (builds + ncc bundle)
yarn package

# Run development mode (requires GITHUB_EVENT_PATH env var set)
yarn dev

# Generate PR payload for e2e testing
yarn generate-pr-payload <owner> <repo> <pr_number>

# Run end-to-end tests (requires build first)
yarn test:e2e <owner> <repo> <pr_number>
```

## Node.js Version

The project requires Node.js 20.11.0 or higher (specified in `.nvmrc` as `20` and `package.json` engines).

## Code Organization

```
src/
├── main.ts              # Entry point, initializes services and orchestrates review
├── providers/
│   ├── AIProvider.ts    # Interface and types for AI providers
│   ├── OpenAIProvider.ts
│   ├── AnthropicProvider.ts
│   ├── GeminiProvider.ts
│   └── CustomProvider.ts  # OpenAI-compatible API provider (Ollama, LM Studio, vLLM)
├── services/
│   ├── GitHubService.ts # GitHub API interactions (PR details, file content, reviews)
│   ├── DiffService.ts   # Parse diffs, filter excluded files
│   └── ReviewService.ts # Orchestrate review flow, manage comments
└── prompts/
    ├── code-reviews.ts  # System prompts for AI review
    └── index.ts
tests/
├── unit/
│   └── DiffService.test.ts
└── integration/
    └── reviewFlow.test.ts
scripts/
├── test-e2e.ts          # E2E testing script
└── generate-pr-payload.ts
```

## Architecture

### Main Entry Point (`src/main.ts`)

1. Reads GitHub Actions inputs using `@actions/core`
2. Initializes AI provider based on `AI_PROVIDER` input
3. Creates services: `GitHubService`, `DiffService`, `ReviewService`
4. Extracts PR number from `GITHUB_EVENT_PATH` payload
5. Calls `reviewService.performReview(prNumber)`

### Provider Pattern

All AI providers implement the `AIProvider` interface:

```typescript
interface AIProvider {
  initialize(config: AIProviderConfig): Promise<void>;
  review(request: ReviewRequest): Promise<ReviewResponse>;
}
```

**Providers:**
- `OpenAIProvider` - Uses official OpenAI SDK
- `AnthropicProvider` - Uses official Anthropic SDK
- `GeminiProvider` - Uses official Google Generative AI SDK
- `CustomProvider` - Uses raw fetch for OpenAI-compatible APIs (Ollama, LM Studio, vLLM)

### Services

**GitHubService** - Handles all GitHub API interactions:
- `getPRDetails(prNumber)` - Fetch PR metadata
- `getFileContent(path, ref?)` - Get file content from repo
- `submitReview(prNumber, review)` - Submit PR review with comments
- `getLastReviewedCommit(prNumber)` - Find last review from bot
- `getPreviousReviews(prNumber)` - Get historical reviews

**DiffService** - Handles diff parsing:
- `getRelevantFiles(prDetails, lastReviewedCommit?)` - Parse diff and filter excluded files

**ReviewService** - Orchestrates review:
- `performReview(prNumber)` - Full review workflow

### Review Flow

1. Get PR details from GitHub
2. Check if this is an update (has previous reviews)
3. Get modified files with diffs from last reviewed commit
4. Get full file content for changed files
5. Get configured context files (package.json, README.md by default)
6. Send to AI provider with system prompt and PR data
7. Parse AI response
8. Submit review to GitHub with summary and line comments

## Code Conventions

### TypeScript Style

- **Strict mode enabled** in `tsconfig.json`
- **ES2019 target** with CommonJS modules
- **Explicit types** - Avoid `any`, use proper interfaces
- **Async/await** - Prefer over promise chains
- **Error handling** - Use `try/catch` with typed errors

### Testing Patterns

**Jest Configuration** (`jest.config.js`):
- Uses `ts-jest` preset
- Test coverage threshold: 80% for branches, functions, lines, statements
- Tests use `describe()` and `it()` blocks

**Mocking**:
- Use `jest.fn()` and `jest.spyOn()`
- Mock `@actions/core` with `jest.spyOn(core, 'method')`
- Mock `global.fetch` for API calls
- Mock `@octokit/rest` with `jest.mock()`

**Unit Tests**:
- Located in `tests/unit/`
- Test single services with mocked dependencies

**Integration Tests**:
- Located in `tests/integration/`
- Test full review flow with mocked GitHub API

### GitHub Actions Integration

**Action Inputs** (`action.yml`):
- `GITHUB_TOKEN` - Required, GitHub authentication
- `AI_PROVIDER` - Required, one of: `openai`, `anthropic`, `google`, `custom`
- `AI_API_KEY` - API key for provider
- `AI_BASE_URL` - Custom API base URL (required for `custom` provider - must include full endpoint path like `/v1`)
- `AI_MODEL` - Model identifier
- `AI_TEMPERATURE` - 0-1, higher = more creative
- `APPROVE_REVIEWS` - Boolean, auto-approve after review
- `MAX_COMMENTS` - 0 = unlimited
- `PROJECT_CONTEXT` - Custom project context string
- `CONTEXT_FILES` - Comma-separated files to include in review
- `EXCLUDE_PATTERNS` - Comma-separated glob patterns to skip

**Environment Variables** (set by GitHub Actions):
- `GITHUB_EVENT_PATH` - Path to PR event payload JSON
- `GITHUB_REPOSITORY` - `owner/repo` format
- `GITHUB_REPOSITORY_OWNER` - Repository owner
- `INPUT_*` - Normalized action inputs

### Prompts

**System Prompt** (`src/prompts/code-reviews.ts`):
- `baseCodeReviewPrompt` - Main review instructions
- `updateReviewPrompt` - Additional instructions for PR updates
- AI must return JSON in specified format:
  ```json
  {
    "summary": "Markdown summary",
    "comments": [{"path": "file", "line": 10, "comment": "text"}],
    "suggestedAction": "approve|request_changes|comment",
    "confidence": 0-100
  }
  ```

## Build and Distribution

**TypeScript Compilation**:
- `tsconfig.json` configured with:
  - Output: `lib/` directory
  - Target: ES2019
  - Module: CommonJS
  - Strict mode enabled
  - Includes: `src/**/*`, `scripts/**/*`
  - Excludes: `node_modules`, `**/*.test.ts`, `tests/**/*`, `lib`, `dist`

**GitHub Actions Distribution**:
- Uses `@vercel/ncc` to bundle into single file
- Output: `dist/index.js` with source maps
- Must be rebuilt after any code changes: `yarn package`

## Common Issues and Gotchas

### GitHub Actions Environment

- Action runs in GitHub-hosted runner with `GITHUB_TOKEN` available
- `GITHUB_EVENT_PATH` contains PR event payload - must be set for local testing
- Environment variables prefixed with `INPUT_` are auto-converted from action inputs

### Line Comments

- Line numbers in AI response must match diff line numbers (after `@@` in unified diff)
- Comments on removed lines should only be added if removal causes issues
- Line 0 comments are not supported by GitHub API

### Provider-Specific Issues

**Custom Provider**:
- Requires JSON mode support from the model
- Handles responses in various formats (raw, wrapped in ```json ```)
- Falls back to regex JSON extraction if parsing fails

**Retry Logic**:
- `GitHubService.submitReview()` retries without line comments if review submission fails

### Testing E2E

- E2E tests require a real PR with `pull_request` event saved to `scripts/pull-requests/test-pr-payload-{pr}.json`
- Set `GITHUB_TOKEN` environment variable before running
- Set `AI_API_KEY` or `OPENAI_API_KEY` for the AI provider

### Package Script

- Always run `yarn build` before `yarn package`
- The `package` script bundles `lib/src/main.js`, not `src/main.ts`

## Adding New AI Providers

1. Create new provider class in `src/providers/`
2. Implement `AIProvider` interface with `initialize()` and `review()`
3. Add provider to factory switch in `src/main.ts`:
   ```typescript
   case 'newprovider':
     return new NewProvider();
   ```
4. Add test coverage in `tests/integration/`
5. Update `action.yml` inputs if needed

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, engines |
| `tsconfig.json` | TypeScript configuration |
| `jest.config.js` | Jest configuration |
| `action.yml` | GitHub Action inputs/outputs |
| `.nvmrc` | Node.js version (20) |
| `.claude/settings.local.json` | Claude CLI permissions |

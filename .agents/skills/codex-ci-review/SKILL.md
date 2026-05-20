---
name: codex-ci-review
description: >
  Use when the user wants to automate code quality checks in their CI/CD pipeline
  using AI-powered review. Covers PR review automation, code quality gates,
  automated suggestions on pull requests, and any GitHub Actions integration
  that uses Codex for code analysis.
---
# Automated CI Review via codex-action

## Prerequisites

- Repository must be on GitHub
- `OPENAI_API_KEY` must be set as a GitHub secret

## When to Use

- User wants automated feedback on pull requests before human review
- User is setting up or improving their CI/CD pipeline's code quality checks
- User wants AI to catch issues that linters miss (logic errors, design problems)
- User asks about automating any part of the code review process
- User wants to enforce coding standards automatically on every PR

## When NOT to Use

- User wants a one-time manual review → do it directly in the conversation
- User's repo is not on GitHub → codex-action is GitHub-specific
- User doesn't have an OpenAI API key → required for the action

## Scenarios

1. Setting up automated review for a team that merges PRs without enough review
2. Creating quality gates that block merging until AI review passes
3. Automating detection of security issues, performance problems, or anti-patterns
4. Adding AI-generated suggestions as PR comments
5. Running Codex on a schedule to audit the entire codebase periodically

## Steps

1. Create `.github/workflows/codex-review.yml`:

   ```yaml
   name: Codex PR Review
   on:
     pull_request:
       types: [opened, synchronize]

   jobs:
     review:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: openai/codex-action@v1
           with:
             openai_api_key: ${{ secrets.OPENAI_API_KEY }}
   ```

2. Add `OPENAI_API_KEY` to GitHub repository secrets
3. Test with a new PR

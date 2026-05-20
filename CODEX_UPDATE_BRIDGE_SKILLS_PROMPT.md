# Codex Task: Rewrite Bridge Skill Descriptions For Intent-Based Matching

> **Give this entire file as a prompt to Codex.**

## Why This Change

Agent skill matching works on **meaning**, not keywords. The current bridge skill descriptions
use trigger-word lists like `"Triggers on prompts like 'find the retry logic'"`. This means
the agent only activates the skill when the user says those exact phrases.

We need intent-based descriptions that describe **what the user NEEDS**, not **what the user SAYS**.
This way the agent activates the skill for any prompt that has the same intent, regardless of wording.

## Rules

1. Update **both** files for each bridge skill:
   - `.agents/skills/<name>/SKILL.md`
   - `.agent/skills/<name>/SKILL.md`
2. Both files in each pair **must be identical** after the update
3. **Only change the `description` field** in the YAML frontmatter and the `## When to Use` / `## When NOT to Use` sections
4. **Do not change** the `name`, `## Steps`, `## Prerequisites`, or any command examples
5. Descriptions should describe **user intent and scenarios**, not keyword lists
6. Remove all "Triggers on prompts like..." phrasing
7. Keep descriptions 3–5 lines max
8. Add a `## Scenarios` section with 5–8 diverse example intents (described as situations, not exact prompts)

---

## Bridge Skill 1: `semantic-code-search`

Replace the `description` with:

```yaml
description: >
  Use when the user needs to understand how code works, where a behavior is implemented,
  or how different parts of the codebase connect. Covers code exploration, architecture
  understanding, implementation discovery, and tracing how data flows through the system.
  Prefer this over grep when the user describes what code DOES rather than what it CONTAINS.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User wants to understand how a feature or behavior is implemented
- User is exploring unfamiliar code and needs to find where something happens
- User describes a capability or behavior and wants to locate the code responsible
- User asks about code architecture, data flow, or how components interact
- User is debugging and needs to find all code related to a specific concern
- User needs to understand dependencies or relationships between modules
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User gives an exact string, variable name, or error message to search for → use grep
- User asks to read a specific file they already know the path of → use file tools
- User asks a general question that doesn't require looking at code → answer directly
```

Add this section after `## When NOT to Use`:

```markdown
## Scenarios
These are examples of INTENT (not exact words) where this skill should activate:
1. Understanding how authentication or authorization works in the project
2. Finding where a specific business rule is enforced
3. Tracing how a request flows from API route to database
4. Discovering all places where a concept (payments, notifications, sessions) is handled
5. Understanding error handling patterns across the codebase
6. Finding how configuration or environment variables are used
7. Locating middleware, hooks, or interceptors that modify behavior
8. Understanding how the worker/queue system processes jobs
```

---

## Bridge Skill 2: `persistent-memory`

Replace the `description` with:

```yaml
description: >
  Use when the user needs continuity across sessions — saving decisions, recalling past context,
  or building a shared knowledge base about the project. Covers architectural decisions,
  design rationale, meeting notes, agreed-upon conventions, and any information the user
  wants to persist beyond the current conversation.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User makes a decision they'll need to reference later
- User discusses architecture, conventions, or patterns they want documented
- User needs to recall something discussed in a previous session
- User is building up project knowledge incrementally over time
- User asks "why did we..." or "what was the reason for..." about past work
- User wants to save research findings, comparisons, or evaluations
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User asks about code in the current codebase → use code search or file tools
- User asks a general knowledge question → answer directly
- Information is already in project docs/README → reference those instead
```

Add:

```markdown
## Scenarios
1. Saving the rationale behind choosing a technology or pattern
2. Recording agreed team conventions (naming, folder structure, API design)
3. Persisting the results of a debugging session for future reference
4. Saving notes about external API behaviors or quirks discovered during development
5. Recording deployment procedures or environment-specific configurations
6. Preserving onboarding context for future team members
7. Accumulating lessons learned across multiple development sessions
```

---

## Bridge Skill 3: `stable-local-urls`

Replace the `description` with:

```yaml
description: >
  Use when the user needs predictable local development URLs instead of port numbers.
  Covers multi-service development, sharing local URLs between tools or agents,
  and any situation where port numbers are inconvenient, forgettable, or need to be
  referenced consistently across configurations.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User is running multiple local services and needs to tell them apart
- User wants to reference a local service by a meaningful name
- User needs a stable URL to put in environment variables or configs
- User is coordinating between multiple agents or tools that need to access local services
- User complains about forgetting port numbers
- User is setting up a local development environment with multiple interconnected services
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User just wants to run a single dev server normally → `npm run dev` is fine
- User is deploying to production → use real domains
- User is on a platform that doesn't support .localhost URLs
```

Add:

```markdown
## Scenarios
1. Running frontend and backend on different ports and needing named access
2. Configuring OAuth callbacks that need a predictable URL
3. Setting up webhook testing with a stable local endpoint
4. Coordinating between a main app and a worker service locally
5. Sharing a local URL in documentation or with team members
```

---

## Bridge Skill 4: `mobile-agent-qa`

Replace the `description` with:

```yaml
description: >
  Use when the user needs to interact with, test, or automate anything on a physical
  Android device. Covers QA testing, UI verification, flow automation, accessibility
  checks, and any task that requires controlling a real mobile device through
  natural language instead of manual tapping.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User needs to verify that a web app or mobile app works correctly on a real device
- User wants to automate a repetitive testing flow on Android
- User needs screenshots or recordings from a real device
- User is doing QA and wants to test multiple scenarios programmatically
- User needs to verify responsive design on actual mobile hardware
- User wants to test push notifications, deep links, or device-specific features
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User wants to test in a desktop browser → use browser tools
- User is asking about CSS media queries → answer directly
- User doesn't have a connected Android device → this won't work
- User needs iOS testing → droidrun is Android only
```

Add:

```markdown
## Scenarios
1. Verifying a login flow works end-to-end on a real phone
2. Testing that a responsive layout renders correctly on mobile screen sizes
3. Automating a sequence of taps and inputs to test a checkout flow
4. Capturing screenshots of different app states for documentation
5. Testing that push notifications arrive and display correctly
6. Verifying form inputs work correctly with mobile keyboards
```

---

## Bridge Skill 5: `parallel-agent-control`

Replace the `description` with:

```yaml
description: >
  Use when the user has multiple independent tasks that would benefit from simultaneous
  execution by separate agent instances. Covers workload splitting, parallel development
  tracks, and any situation where waiting for sequential completion is inefficient.
  macOS only; requires Codex or Claude Code CLI.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User has two or more tasks with no dependencies between them
- User wants to speed up a large workload by splitting it
- User is working on a feature that has independent frontend and backend components
- User needs to run tests and implement changes at the same time
- User explicitly asks about parallel or concurrent agent work
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- Tasks depend on each other (output of one feeds into another) → do them sequentially
- User has only one task → handle it directly
- User is not on macOS → FleetCode is macOS only
- User is using Antigravity → FleetCode doesn't integrate with Antigravity
```

Add:

```markdown
## Scenarios
1. Refactoring API routes while simultaneously updating their tests
2. Building a new feature while fixing bugs in an unrelated module
3. Running a full test suite while implementing a separate feature
4. Creating documentation while making code changes
5. Setting up CI/CD while developing a new component
```

---

## Bridge Skill 6: `codex-ci-review`

Replace the `description` with:

```yaml
description: >
  Use when the user wants to automate code quality checks in their CI/CD pipeline
  using AI-powered review. Covers PR review automation, code quality gates,
  automated suggestions on pull requests, and any GitHub Actions integration
  that uses Codex for code analysis.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User wants automated feedback on pull requests before human review
- User is setting up or improving their CI/CD pipeline's code quality checks
- User wants AI to catch issues that linters miss (logic errors, design problems)
- User asks about automating any part of the code review process
- User wants to enforce coding standards automatically on every PR
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User wants a one-time manual review → do it directly in the conversation
- User's repo is not on GitHub → codex-action is GitHub-specific
- User doesn't have an OpenAI API key → required for the action
```

Add:

```markdown
## Scenarios
1. Setting up automated review for a team that merges PRs without enough review
2. Creating quality gates that block merging until AI review passes
3. Automating detection of security issues, performance problems, or anti-patterns
4. Adding AI-generated suggestions as PR comments
5. Running Codex on a schedule to audit the entire codebase periodically
```

---

## Bridge Skill 7: `workspace-ops`

Replace the `description` with:

```yaml
description: >
  Use when the user needs to interact with any Google Workspace service programmatically.
  Covers file management (Drive), communication (Gmail, Chat), scheduling (Calendar),
  data operations (Sheets), document creation (Docs), and administration tasks.
  Acts as the bridge between coding agent workflows and Google Workspace.
```

Replace `## When to Use` with:

```markdown
## When to Use
- User needs to access, upload, download, or organize files in Google Drive
- User wants to send, read, search, or manage email via Gmail
- User needs to view, create, or modify calendar events
- User wants to read from or write to Google Sheets
- User needs to create or edit Google Docs
- User wants to send messages to Google Chat spaces
- User needs to manage Google Workspace admin settings or audit logs
- User is building a workflow that connects code changes to Workspace actions
```

Replace `## When NOT to Use` with:

```markdown
## When NOT to Use
- User asks about Google Cloud Platform (GCP) services → different toolset
- User asks about Firebase → use Firebase CLI
- User doesn't have Google Workspace → this won't work
- User can do it faster in the browser → suggest that instead for simple one-off tasks
```

Add:

```markdown
## Scenarios
1. Downloading a requirements document from Drive to use as a spec
2. Sending a summary email after completing a development task
3. Creating a spreadsheet to track feature progress
4. Checking calendar availability before scheduling a deployment
5. Posting deployment notifications to a team Chat space
6. Backing up project documentation to Drive
7. Reading data from a Sheets spreadsheet to use in code generation
```

---

## Verification

After all updates:

1. Confirm each pair (`.agents/skills/<name>/SKILL.md` and `.agent/skills/<name>/SKILL.md`) is **identical**
2. Confirm every SKILL.md has: `description` (YAML), `## When to Use`, `## When NOT to Use`, `## Scenarios`, `## Prerequisites`, `## Steps`
3. Confirm no `"Triggers on prompts like..."` phrasing remains anywhere
4. Report: "All 14 bridge skill files updated to intent-based matching."

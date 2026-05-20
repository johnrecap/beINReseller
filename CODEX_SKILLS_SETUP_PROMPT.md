# Codex Task: Step-by-Step Skills and Bridge Skills Setup

> Give this entire file to Codex as the execution prompt.
> The goal is to install selected skill repos, create bridge skills for both Codex and Antigravity, append the skills section to `AGENTS.md` safely, and create one reference document for this repo.

---

## Mission

Set up project-local skills for this repository in a controlled, reviewable sequence.

By the end, all of the following should be true:

1. `.agents/skills/` exists for Codex project skills
2. `.agent/skills/` exists for Antigravity project skills
3. selected skill repos are installed as far as the environment allows
4. 7 bridge skills exist in both skill directories with identical content
5. `AGENTS.md` has a new appended section for skills and bridge skills
6. `docs/agent-playbooks/BRIDGE_SKILLS_REFERENCE.md` exists
7. a final report lists successes, failures, skipped items, and counts

---

## Context

This is a **Next.js 16 + Prisma 7 + TypeScript 5.9 + BullMQ + Redis + Stripe + next-auth** reseller panel.

- Root: `e:\work\panel_bien_sport\project\bein-reseller-panel1`
- Existing `AGENTS.md` has encoding safety rules. Do not overwrite it; append to it.
- No `.agents/skills/` or `.agent/skills/` directories exist yet.
- The repo already has `CODEX_ANTIGRAVITY_PLAYBOOK.md` in the root. Use it as the compatibility reference when selecting skills.

## Operating System

Windows (PowerShell).

- Use PowerShell-native commands when possible
- Use `\` for Windows paths when needed
- `~` means `$env:USERPROFILE`
- Do not use Unix-only commands unless you provide a Windows equivalent

---

## Execution Rules

Follow these rules strictly:

1. Work only inside `e:\work\panel_bien_sport\project\bein-reseller-panel1`
2. Use `apply_patch` for file edits
3. Do not use `Set-Content`, `Out-File`, or `[System.IO.File]::WriteAllText`
4. Do not overwrite `AGENTS.md`
5. Do not modify application source files under `src\`, `prisma\`, `worker\`, or similar code directories
6. Do not add project dependencies to `package.json`
7. If a networked install command fails, note the failure and continue with the remaining steps
8. If an optional backing tool is missing, still create the bridge skill and document the missing prerequisite
9. Keep all new Markdown files ASCII-safe and free of mojibake
10. Do not start the next phase until the current phase is verified

Stop only if one of these hard blockers is true:

- the repo root does not exist
- `AGENTS.md` is missing
- the current working directory is not the repo root and cannot be changed

---

## Phase 0: Preflight Checks

Run these checks first and report the result before making changes:

1. Confirm current directory is the repo root
2. Confirm `AGENTS.md` exists
3. Confirm `CODEX_ANTIGRAVITY_PLAYBOOK.md` exists
4. Check availability of:
   - `node`
   - `npm`
   - `npx`
   - `git`
   - `python`
   - `pip`
   - `adb`
5. Check whether these directories already exist:
   - `.agents\skills`
   - `.agent\skills`
   - `docs\agent-playbooks`

Suggested PowerShell checks:

```powershell
Get-Location
Test-Path .\AGENTS.md
Test-Path .\CODEX_ANTIGRAVITY_PLAYBOOK.md
node -v
npm -v
npx -v
git --version
python --version
pip --version
adb version
Test-Path .\.agents\skills
Test-Path .\.agent\skills
Test-Path .\docs\agent-playbooks
```

If `python`, `pip`, or `adb` are unavailable, do not treat that as a blocker. Just record it for the final report.

### Phase 0 Exit Criteria

- repo root confirmed
- `AGENTS.md` confirmed
- current tool availability recorded

---

## Phase 1: Create Directory Structure

Create these directories in the repo root:

```text
.agents\skills\           <- Codex project skills
.agent\skills\            <- Antigravity project skills
docs\agent-playbooks\     <- reference docs
```

Suggested PowerShell command:

```powershell
New-Item -ItemType Directory -Force -Path `
  .\.agents\skills, `
  .\.agent\skills, `
  .\docs\agent-playbooks | Out-Null
```

Then verify:

```powershell
Test-Path .\.agents\skills
Test-Path .\.agent\skills
Test-Path .\docs\agent-playbooks
```

### Phase 1 Exit Criteria

- all three directories exist
- no unrelated files changed

---

## Phase 2: Install Skill Repos via `npx skills add`

Run every command below one at a time, in order.

After each command:

1. record success, failure, or skip
2. record any newly created skill directories
3. continue to the next command even if one repo fails

Use `-y` to skip interactive prompts.

### Phase 2A: Core skill repos

```bash
npx -y skills add phuryn/pm-skills --skill '*' -a codex -a antigravity -y
```

```bash
npx -y skills add Dimillian/Skills --skill '*' -a codex -a antigravity -y
```

```bash
npx -y skills add obra/superpowers -a codex -a antigravity -y
```

```bash
npx -y skills add googleworkspace/cli -a codex -a antigravity -y
```

```bash
npx -y skills add openai/skills --skill '*' -a codex -y
```

### Phase 2B: VoltAgent shortlist selection

First list the available skills:

```bash
npx -y skills add VoltAgent/awesome-agent-skills --list
```

Then install only skills that are clearly relevant to this repo.

Include only skills related to:

- Next.js
- React
- TypeScript
- JavaScript
- Node.js
- Prisma
- Tailwind CSS
- API design
- auth
- testing
- debugging
- refactoring
- documentation
- performance
- Git and GitHub workflows
- general web development

Skip skills that are clearly unrelated to this repo, especially:

- Swift / SwiftUI / iOS native
- Kotlin / Android native
- Python-only workflows
- Rust
- Java
- .NET / C#
- PHP
- Ruby
- Go
- cloud-provider-specific stacks that are not already in this repo

If a VoltAgent skill is ambiguous, skip it rather than guessing.

### Phase 2C: Installation audit

After the install phase completes, run:

```bash
npx -y skills add --list
```

Then report all of the following:

1. total installed skill directories under `.agents\skills\`
2. total installed skill directories under `.agent\skills\`
3. each skill name
4. whether it exists for Codex, Antigravity, or both
5. which install commands failed or were skipped

### Phase 2 Exit Criteria

- all core commands were attempted
- `VoltAgent/awesome-agent-skills` was listed
- the final inventory was produced

---

## Phase 3: Create Bridge Skills

Create the 7 bridge skills below.

For each bridge skill:

1. create the directory under `.agents\skills\<name>\`
2. create the directory under `.agent\skills\<name>\`
3. create `SKILL.md` in both directories
4. ensure both files have identical content
5. verify both files exist before moving to the next bridge skill

Required bridge skill names:

1. `semantic-code-search`
2. `persistent-memory`
3. `stable-local-urls`
4. `mobile-agent-qa`
5. `parallel-agent-control`
6. `codex-ci-review`
7. `workspace-ops`

### Bridge Skill 1: `semantic-code-search`

```markdown
---
name: semantic-code-search
description: >
  Use when the user wants to find code by meaning or concept, not literal text.
  Triggers on prompts like "find the retry logic", "where do we handle rate limiting",
  "show me the authentication flow", or "find code related to payment processing".
  Do NOT use for simple text or regex searches; use grep for those.
---
# Semantic Code Search via osgrep

## Prerequisites
- `osgrep` must be installed globally: `npm i -g osgrep`
- The codebase must be indexed first

## When to Use
- User asks to find code by concept, behavior, or meaning
- User says "find", "search for", "where", "locate", "show me" plus a description of what code does
- User asks about code architecture or flow

## When NOT to Use
- User gives a literal string to search for; use grep instead
- User asks to read a specific file; use file reading tools instead

## Steps
1. Check if the index exists: `osgrep list`
2. If not indexed, run: `osgrep index`
3. Search: `osgrep search "<user query>"`
4. Present results with file paths and relevant snippets
5. Offer to open or explain the matching code
```

### Bridge Skill 2: `persistent-memory`

```markdown
---
name: persistent-memory
description: >
  Use when the user wants to save, remember, or recall information across sessions.
  Triggers on prompts like "remember that we chose PostgreSQL", "what did we decide about the API design",
  "save this decision for later", or "recall our previous architecture discussion".
---
# Persistent Memory via memsearch

## Prerequisites
- `memsearch` must be installed: `pip install memsearch`
- Config must be initialized: `memsearch config init`

## When to Use
- User explicitly says "remember", "save", "store", "recall", or "what did we decide"
- User asks about previous decisions or context from past sessions
- User wants to persist architectural decisions, design rationale, or project notes

## When NOT to Use
- User asks about code in the current codebase; use code search or file tools
- User asks a general knowledge question; answer directly

## Steps
1. To save: `memsearch index --input "<markdown content>"`
2. To recall: `memsearch search "<query>"`
3. To see stats: `memsearch stats`
4. Present recalled information with context about when it was saved
```

### Bridge Skill 3: `stable-local-urls`

```markdown
---
name: stable-local-urls
description: >
  Use when the user needs a stable, named .localhost URL for their dev server
  instead of remembering port numbers. Triggers on prompts like "give the app a stable URL",
  "start the dev server with a named URL", or "I need a consistent local address".
---
# Stable Local URLs via portless

## Prerequisites
- `portless` must be installed: `npm i -g portless`

## When to Use
- User starts a dev server and wants a named URL, for example `bein-panel.localhost`
- User is running multiple services and needs to distinguish them by name
- User wants to share a stable URL reference with another agent or tool

## When NOT to Use
- User just wants to run `npm run dev` normally without naming

## Steps
1. Start the dev server: `npm run dev`
2. Map it: `portless add bein-panel 3000`
3. Access at: `https://bein-panel.localhost`
4. List mappings: `portless list`
5. Remove: `portless remove bein-panel`
```

### Bridge Skill 4: `mobile-agent-qa`

```markdown
---
name: mobile-agent-qa
description: >
  Use when the user wants to test or automate actions on a connected Android device.
  Triggers on prompts like "test the app on the phone", "open the browser on the device",
  "verify the mobile layout", or "automate the login flow on Android".
---
# Mobile QA Automation via droidrun

## Prerequisites
- `droidrun` must be installed: `pip install droidrun`
- ADB must be set up and the device must be connected
- Run `adb devices` to verify connection

## When to Use
- User asks to test anything on a mobile device
- User wants to automate a mobile interaction flow
- User wants to verify responsive design on a real device

## When NOT to Use
- User wants to test in a desktop browser; use browser tools instead
- User is just asking about mobile CSS; answer directly

## Steps
1. Verify device: `adb devices`
2. Run task: `droidrun "<natural language instruction>"`
3. Report results and any screenshots captured
```

### Bridge Skill 5: `parallel-agent-control`

```markdown
---
name: parallel-agent-control
description: >
  Use when the user wants to spawn multiple coding agent sessions working in parallel
  on different tasks. Triggers on prompts like "run these two tasks in parallel",
  "start another agent for the API work while I work on the UI", or "use FleetCode".
---
# Parallel Agent Sessions via FleetCode

## Prerequisites
- FleetCode must be installed: clone `https://github.com/built-by-as/FleetCode` and build
- macOS only

## When to Use
- User wants to run multiple independent tasks simultaneously
- User explicitly mentions FleetCode or parallel agents

## When NOT to Use
- User has a single sequential task; handle it directly
- User is not on macOS; FleetCode is macOS only

## Steps
1. Open FleetCode app
2. Create sessions for each parallel task
3. Monitor progress via the FleetCode control pane
4. Report results from each session

## Note
This tool is macOS only and requires Codex or Claude Code CLI. It cannot be used directly by Antigravity.
```

### Bridge Skill 6: `codex-ci-review`

~~~markdown
---
name: codex-ci-review
description: >
  Use when the user wants to set up or configure automated PR review using Codex
  in GitHub Actions. Triggers on prompts like "set up Codex to review PRs",
  "add automated code review to CI", or "configure codex-action".
---
# Automated CI Review via codex-action

## Prerequisites
- Repository must be on GitHub
- `OPENAI_API_KEY` must be set as a GitHub secret

## When to Use
- User wants automated PR review via Codex
- User asks to add code review to their CI/CD pipeline
- User mentions codex-action or automated review

## When NOT to Use
- User wants a manual one-time code review; do it directly

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
~~~

### Bridge Skill 7: `workspace-ops`

```markdown
---
name: workspace-ops
description: >
  Use when the user wants to interact with Google Workspace services
  including Drive, Gmail, Calendar, Sheets, Docs, Chat, or Admin.
  Triggers on prompts like "download the spreadsheet from Drive",
  "send an email via Gmail", "check my calendar", or "update the Google Sheet".
---
# Google Workspace Operations via gws CLI

## Prerequisites
- `gws` must be installed: see https://github.com/googleworkspace/cli
- Authentication must be configured, either OAuth or a service account

## When to Use
- User asks to read or write Google Drive files
- User asks to send or read Gmail
- User asks to manage Calendar events
- User asks to query or update Google Sheets
- User asks to manage Google Workspace Admin settings

## When NOT to Use
- User asks about Google Cloud Platform services; that is different
- User asks about Firebase; use Firebase CLI instead

## Steps
1. Authenticate: `gws auth login`
2. Drive operations: `gws drive files list`, `gws drive files get <id>`
3. Gmail: `gws gmail messages list`, `gws gmail messages send`
4. Calendar: `gws calendar events list`
5. Sheets: `gws sheets spreadsheets values get`
```

### Phase 3 Exit Criteria

- all 7 bridge skill directories exist under both agent paths
- all 14 `SKILL.md` files exist
- each pair is identical in content

---

## Phase 4: Append to `AGENTS.md`

Append the following section to the existing `AGENTS.md`.

Do not overwrite the file.
Do not remove or alter the existing encoding safety rules.
Use `apply_patch` to append only.

```markdown

---

# Agent Skills and Bridge Skills

## Available Skills
This project has agent skills installed in two locations:
- `.agents/skills/` - Codex project skills
- `.agent/skills/` - Antigravity project skills

## Bridge Skills Available
The following bridge skills wrap external CLI tools for auto-discovery:

| Bridge Skill | Backing Tool | Install Command |
|---|---|---|
| `semantic-code-search` | osgrep | `npm i -g osgrep` |
| `persistent-memory` | memsearch | `pip install memsearch` |
| `stable-local-urls` | portless | `npm i -g portless` |
| `mobile-agent-qa` | droidrun | `pip install droidrun` |
| `parallel-agent-control` | FleetCode | Build from source (macOS) |
| `codex-ci-review` | codex-action | GitHub Action (no local install) |
| `workspace-ops` | gws CLI | See googleworkspace/cli repo |

## Skill Discovery
- Codex scans `.agents/skills/` automatically and matches skills based on the `description` field.
- Antigravity skills are placed in `.agent/skills/`; keep descriptions precise so skill matching remains specific.

## Rules for Adding New Skills
1. Skill repos: `npx skills add <repo> -a codex -a antigravity -y`
2. CLI tools: install the tool, then create a bridge `SKILL.md` in both `.agents/skills/<name>/` and `.agent/skills/<name>/`
3. Keep descriptions specific; vague descriptions cause false triggers
```

### Phase 4 Exit Criteria

- `AGENTS.md` still contains its original content
- the new skills section is appended exactly once
- no mojibake was introduced

---

## Phase 5: Create Reference Document

Create `docs/agent-playbooks/BRIDGE_SKILLS_REFERENCE.md` with this exact content:

~~~markdown
# Bridge Skills Reference

> Quick reference for all bridge skills in this project.
> Each bridge skill wraps an external CLI or service tool so that Codex and Antigravity
> can discover and use it more reliably based on prompt matching.
>
> Last updated: March 10, 2026

## Installation Status

Before using any bridge skill, the backing tool must be installed.
Run the status check commands below to verify:

| Bridge Skill | Check Command | Expected Output |
|---|---|---|
| semantic-code-search | `osgrep --version` | Version number |
| persistent-memory | `memsearch --version` | Version number |
| stable-local-urls | `portless --version` | Version number |
| mobile-agent-qa | `droidrun --version` | Version number |
| parallel-agent-control | Open FleetCode app | App launches (macOS only) |
| codex-ci-review | Check `.github/workflows/` | Workflow file exists |
| workspace-ops | `gws --version` | Version number |

## Quick Install All

```bash
# Semantic code search
npm i -g osgrep

# Persistent memory
pip install memsearch

# Stable local URLs
npm i -g portless

# Mobile QA automation
pip install droidrun

# Google Workspace CLI
# See: https://github.com/googleworkspace/cli#installation
```

## Bridge Skill Details

### 1. `semantic-code-search`

- **Backs:** [osgrep](https://github.com/Ryandonofrio3/osgrep)
- **Location:** `.agents/skills/semantic-code-search/SKILL.md` and `.agent/skills/semantic-code-search/SKILL.md`
- **Triggers on:** "find code that does X", "where is the retry logic", "show me the auth flow"
- **Key commands:** `osgrep index`, `osgrep search "<query>"`, `osgrep list`
- **First-time setup:** Run `osgrep index` in the project root to build the index

### 2. `persistent-memory`

- **Backs:** [memsearch](https://github.com/zilliztech/memsearch)
- **Location:** `.agents/skills/persistent-memory/SKILL.md` and `.agent/skills/persistent-memory/SKILL.md`
- **Triggers on:** "remember that...", "what did we decide about...", "recall the..."
- **Key commands:** `memsearch config init`, `memsearch index`, `memsearch search "<query>"`
- **First-time setup:** Run `memsearch config init` then `memsearch index`

### 3. `stable-local-urls`

- **Backs:** [portless](https://github.com/vercel-labs/portless)
- **Location:** `.agents/skills/stable-local-urls/SKILL.md` and `.agent/skills/stable-local-urls/SKILL.md`
- **Triggers on:** "give it a stable URL", "named localhost", "stop using port numbers"
- **Key commands:** `portless add <name> <port>`, `portless list`, `portless remove <name>`
- **Project default:** `portless add bein-panel 3000` -> `https://bein-panel.localhost`

### 4. `mobile-agent-qa`

- **Backs:** [droidrun](https://github.com/droidrun/droidrun)
- **Location:** `.agents/skills/mobile-agent-qa/SKILL.md` and `.agent/skills/mobile-agent-qa/SKILL.md`
- **Triggers on:** "test on the phone", "automate on Android", "verify mobile layout"
- **Key commands:** `droidrun "<natural language instruction>"`
- **First-time setup:** Connect an Android device via USB, enable USB debugging, and verify with `adb devices`

### 5. `parallel-agent-control`

- **Backs:** [FleetCode](https://github.com/built-by-as/FleetCode)
- **Location:** `.agents/skills/parallel-agent-control/SKILL.md` and `.agent/skills/parallel-agent-control/SKILL.md`
- **Triggers on:** "run in parallel", "start another agent", "multiple tasks at once"
- **Limitation:** macOS only; requires Codex or Claude Code CLI
- **Note:** Antigravity cannot use FleetCode directly; this bridge skill is informational for Antigravity

### 6. `codex-ci-review`

- **Backs:** [codex-action](https://github.com/openai/codex-action)
- **Location:** `.agents/skills/codex-ci-review/SKILL.md` and `.agent/skills/codex-ci-review/SKILL.md`
- **Triggers on:** "set up PR review", "automated code review", "codex in CI"
- **Key setup:** Create `.github/workflows/codex-review.yml` and set `OPENAI_API_KEY`
- **Note:** Codex-native; Antigravity skill is informational only

### 7. `workspace-ops`

- **Backs:** [gws CLI](https://github.com/googleworkspace/cli)
- **Location:** `.agents/skills/workspace-ops/SKILL.md` and `.agent/skills/workspace-ops/SKILL.md`
- **Triggers on:** "download from Drive", "send email", "check calendar", "update the Sheet"
- **Key commands:** `gws auth login`, `gws drive files list`, `gws gmail messages send`
- **First-time setup:** Run `gws auth login` to authenticate with Google

## Adding a New Bridge Skill

1. Identify the CLI tool you want to wrap
2. Install the tool globally
3. Create `SKILL.md` in both:
   - `.agents/skills/<skill-name>/SKILL.md`
   - `.agent/skills/<skill-name>/SKILL.md`
4. Write a clear `description` in the YAML frontmatter; this is what triggers discovery
5. Document prerequisites, when to use, when not to use, and step-by-step instructions
6. Update this reference document
7. Update `AGENTS.md` bridge skills table
~~~

### Phase 5 Exit Criteria

- `docs/agent-playbooks/BRIDGE_SKILLS_REFERENCE.md` exists
- content matches exactly

---

## Phase 6: Final Verification

After completing all prior phases, verify all of the following:

1. `.agents/skills/` exists and contains installed skills plus 7 bridge skill directories
2. `.agent/skills/` exists and contains installed skills plus 7 bridge skill directories
3. every bridge skill exists in both locations
4. bridge skill file pairs are identical
5. `AGENTS.md` contains the appended skills section
6. `docs/agent-playbooks/BRIDGE_SKILLS_REFERENCE.md` exists
7. no unrelated source files were changed
8. no mojibake patterns were introduced

Suggested verification checks:

```powershell
Get-ChildItem .\.agents\skills -Directory
Get-ChildItem .\.agent\skills -Directory
rg -n "Agent Skills and Bridge Skills|Bridge Skills Available" .\AGENTS.md
Test-Path .\docs\agent-playbooks\BRIDGE_SKILLS_REFERENCE.md
rg -n "â|Ã|Â|ï؟½" .\AGENTS.md .\CODEX_SKILLS_SETUP_PROMPT.md .\docs\agent-playbooks\BRIDGE_SKILLS_REFERENCE.md
```

### Final report format

Print a final summary with:

1. preflight status
2. directories created
3. install commands attempted
4. installed skill counts for Codex and Antigravity
5. skipped or failed installs
6. total bridge skills created, expected `7`
7. total `SKILL.md` files created under both paths
8. whether `AGENTS.md` append succeeded
9. whether the reference doc was created

Use a short Markdown table for the final summary.

---

## Important Rules

1. Do not modify existing source files under `src\`, `prisma\`, `worker\`, or similar app directories
2. Do not add repo dependencies to `package.json`
3. Respect the encoding safety rules in the existing `AGENTS.md`
4. All commands must work on Windows PowerShell
5. If `npx skills add` fails for a repo, note the failure and continue
6. If Python is unavailable, do not install Python; create the bridge skills anyway and mark Python-backed tools as not ready
7. If ADB is unavailable, do not install it automatically; document the missing prerequisite
8. Do not auto-install FleetCode on Windows; create the bridge skill and document the limitation
9. Keep bridge skill content identical between `.agents\skills\` and `.agent\skills\`
10. Prefer explicit verification over assumptions at every phase

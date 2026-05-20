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

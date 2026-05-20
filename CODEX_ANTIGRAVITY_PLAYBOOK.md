# Codex And Antigravity Playbook

> A curated (not exhaustive) catalog of repos and tools that enhance Codex and Antigravity agent workflows.
> Sources include `@github_repos` community posts plus bonus ecosystem repos that materially improve coding-agent setups.
>
> **Date:** March 10, 2026
>
> Antigravity path guidance is based on the open [vercel-labs/skills](https://github.com/vercel-labs/skills) ecosystem and community conventions, **not** official Google documentation.

---

## Legend

### Type
| Label | Meaning |
|---|---|
| Skill Pack | A repo that ships `SKILL.md` files or installable agent skills |
| Automation | CI/CD, GitHub Actions, or workflow automation |
| Runtime | An agent runtime, CLI, or execution engine |
| Starter | Template or starter app to bootstrap a product |
| Infra | Infrastructure tooling (memory, search, networking) |
| Context/Memory | Persistent memory or context management for agents |
| Search | Code or semantic search tooling |
| UI/Client | Desktop, mobile, or web client for agent interaction |
| Manager/Ops | GUI or CLI to manage skills, sessions, or agents |
| Demo/Reference | Example or showcase repo; not a production tool |

### Compatibility
| Label | Meaning |
|---|---|
| Direct | Works natively with the agent — install and use immediately |
| Portable | Uses the standard `SKILL.md` format; can be copied or installed into any compatible agent via `npx skills add` |
| Indirect | Not a skill repo; use as a CLI/service and optionally wrap with a bridge skill |
| Reference | Example or showcase — study it, don't install it |

---

## Auto-Use In Projects

### Project-Local Skill Folders
Agents discover skills automatically from these project-local directories:

| Agent | Project path | User (global) path |
|---|---|---|
| **Codex** | `.agents/skills/` | `~/.codex/skills/` |
| **Antigravity** | `.agent/skills/` | `~/.gemini/antigravity/skills/` |

### Installing Skills With `npx skills add`
The [`vercel-labs/skills`](https://github.com/vercel-labs/skills) CLI installs skill repos to the correct agent folders automatically:

```bash
# Install a skill repo for both agents
npx skills add <repo-or-url> -a codex -a antigravity -y

# Install all skills from a multi-skill repo
npx skills add <repo-or-url> --skill '*' -a codex -a antigravity -y
```

The `-a` flag accepts any supported agent name. The CLI auto-detects installed agents when `-a` is omitted.

### Bridge Skills For Non-Skill Repos
For repos that ship a CLI or service but no `SKILL.md`:

1. Install the CLI/app normally (e.g. `npm i -g`, `pip install`, `brew install`)
2. Create a small bridge skill in **both** `.agents/skills/<name>/SKILL.md` and `.agent/skills/<name>/SKILL.md`
3. Make the bridge `description` field specific enough that the agent auto-selects it when relevant

---

## Recommended Project Layout

```text
project-root/
  CODEX_ANTIGRAVITY_PLAYBOOK.md   ← this file
  AGENTS.md                        ← Codex project instructions
  .agents/skills/                  ← Codex project skills
  .agent/skills/                   ← Antigravity project skills
  docs/agent-playbooks/            ← additional playbooks or guides
```

---

## Core Repos From @github_repos

| Repo | What it does | Type | Codex | Antigravity | Use it for | How to use it | Auto-use idea | Notes |
|---|---|---|---|---|---|---|---|---|
| [openai/codex](https://github.com/openai/codex) | Lightweight coding agent that runs in your terminal | Runtime | Direct | Indirect | Running local coding-agent tasks from the CLI | `npm i -g @openai/codex` then `codex` | N/A — it is the agent itself | Codex-native; Antigravity cannot run inside it |
| [PeonPing/peon-ping](https://github.com/PeonPing/peon-ping) | Warcraft III–themed voice notifications for coding agents (Codex, Claude Code, Gemini CLI, IDEs) | Automation | Direct | Direct | Getting notified when agent tasks finish so you stop babysitting the terminal | `brew install peonping/tap/peon-ping` or use the installer scripts; supports MCP server and multi-IDE hooks | Bridge skill: describe when to call `peon-ping notify` | Works cross-platform; supports Gemini CLI setup natively |
| [googleworkspace/cli](https://github.com/googleworkspace/cli) | Google Workspace CLI (`gws`) for Drive, Gmail, Calendar, Sheets, Docs, Chat, Admin — includes AI agent skills | Skill Pack | Portable | Portable | Automating Google Workspace tasks from agent prompts | `npm i -g @anthropic-community/gws`; ships agent skills in `/skills/` | `npx skills add googleworkspace/cli -a codex -a antigravity -y` or bridge skill | Has built-in Gemini CLI extension; skills are portable |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | PM Skills Marketplace: 100+ agentic skills for product management | Skill Pack | Portable | Portable | Discovery, strategy, execution, launch, and growth workflows | `npx skills add phuryn/pm-skills --skill '*' -a codex -a antigravity -y` | Auto-discovered by description matching | Claude-first but skills use standard `SKILL.md` format |
| [Dimillian/Skills](https://github.com/Dimillian/Skills) | Codex-focused skills pack (Swift, SwiftUI, App Store, iOS debugging) | Skill Pack | Direct | Portable | iOS/macOS development — SwiftUI patterns, debugging, app packaging | `npx skills add Dimillian/Skills --skill '*' -a codex -a antigravity -y` | Auto-discovered; Apple-dev skills trigger on Swift/SwiftUI prompts | Codex-native; `SKILL.md` format is portable to Antigravity |
| [built-by-as/FleetCode](https://github.com/built-by-as/FleetCode) | Light-weight control pane to run CLI coding agents (Claude Code, Codex) in parallel | Manager/Ops | Direct | Indirect | Running multiple agent sessions side-by-side with shared context | Clone and build the Electron app; configure sessions | Bridge skill: describe when to spawn parallel sessions | macOS app; Codex sessions supported; no Antigravity integration |
| [obra/superpowers](https://github.com/obra/superpowers) | Agentic skills framework and dev methodology with automatic skill triggering | Skill Pack | Direct | Portable | Skills-driven development workflow with structured prompting | Install via Codex Plugin Marketplace or `npx skills add obra/superpowers -a codex -a antigravity -y` | Skills auto-trigger based on task content | Ships installable skills; Codex has marketplace listing |
| [ChrisWiles/claude-code-showcase](https://github.com/ChrisWiles/claude-code-showcase) | Comprehensive Claude Code project configuration example (hooks, skills, agents, commands, GitHub Actions) | Reference | Reference | Reference | Learning best practices for agent project configuration | Read the repo; adapt patterns to your project | N/A — reference only | Claude Code–first; patterns (skills, hooks) are transferable concepts |
| [Dimillian/CodexSkillManager](https://github.com/Dimillian/CodexSkillManager) | macOS GUI app to manage your Codex skills | Manager/Ops | Direct | Indirect | Browsing, enabling, disabling, and organizing Codex skills | Download from releases or build from source | N/A — standalone macOS app | Codex-only; manages `.agents/skills/` |
| [rebornix/Agmente](https://github.com/rebornix/Agmente) | iOS client for coding agents via ACP or Codex app-server | UI/Client | Direct | Indirect | Monitoring and interacting with coding agents from your phone | Build from source (Swift/Xcode); connect to your agent server | N/A — native iOS app | Codex app-server integration; no Antigravity connection |

---

## Product And App Builders From @github_repos

| Repo | What it does | Type | Codex | Antigravity | Use it for | How to use it | Auto-use idea | Notes |
|---|---|---|---|---|---|---|---|---|
| [openai/codex-action](https://github.com/openai/codex-action) | Run Codex inside GitHub Actions for automated PR review and code generation | Automation | Direct | Indirect | CI/CD automation — auto-review PRs, run Codex tasks on push/schedule | Add the action to `.github/workflows/`; configure inputs | Bridge skill: trigger when user mentions CI review | Codex-native GitHub Action; Antigravity has no GH Action equivalent |
| [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples) | Apps SDK + MCP widget/server examples for ChatGPT apps | Demo/Reference | Indirect | Indirect | Learning how to build ChatGPT apps with MCP servers and widgets | Clone and run the example MCP servers locally | N/A — reference only | OpenAI platform–specific; study the MCP patterns |
| [openai/openai-chatkit-starter-app](https://github.com/openai/openai-chatkit-starter-app) | Minimal ChatKit starter template | Starter | Indirect | Indirect | Bootstrapping a ChatKit-based product quickly | Clone and customize; follows ChatKit conventions | N/A — starter template | OpenAI ChatKit–specific |
| [openai/openai-chatkit-advanced-samples](https://github.com/openai/openai-chatkit-advanced-samples) | Richer ChatKit product demos (tools, widgets, annotations, attachments) | Demo/Reference | Indirect | Indirect | Studying advanced ChatKit features (server tools, client effects, widgets) | Clone and run locally; browse the feature index | N/A — reference only | OpenAI ChatKit–specific |
| [vercel-labs/portless](https://github.com/vercel-labs/portless) | Replace port numbers with stable, named `.localhost` URLs for humans and agents | Infra | Indirect | Indirect | Giving dev servers stable URLs so agents can reference them by name | `npm i -g portless` then `portless start` | Bridge skill: use when agent needs a stable local URL | Works with any local dev server; agent-friendly naming |
| [droidrun/droidrun](https://github.com/droidrun/droidrun) | Automate mobile devices with natural language commands — LLM-agnostic mobile agent | Automation | Portable | Portable | Mobile device automation and QA testing via natural language | `pip install droidrun`; connect via ADB | Bridge skill: trigger on mobile QA or device automation prompts | Python-based; LLM-agnostic so works with any agent backend |
| [MooseGoose0701/skill-compose](https://github.com/MooseGoose0701/skill-compose) | Skill-powered agent builder/runtime with web/API publishing | Runtime | Portable | Portable | Building and deploying skill-powered agents as web services | Clone the repo; configure and deploy | N/A — runtime platform | ⚠️ Repo has been archived (now `dp-archive/archive`); may not receive updates |

---

## Context, Search, And Automation Infra From @github_repos

| Repo | What it does | Type | Codex | Antigravity | Use it for | How to use it | Auto-use idea | Notes |
|---|---|---|---|---|---|---|---|---|
| [zilliztech/memsearch](https://github.com/zilliztech/memsearch) | Markdown-first memory system with CLI, Python API, and agent integrations | Context/Memory | Portable | Portable | Giving your agent persistent memory across sessions | `pip install memsearch`; use CLI (`memsearch index`, `memsearch search`) or Python API | Bridge skill: trigger when agent needs to remember or recall | Has Claude Code plugin; portable to any agent via CLI |
| [divagr18/memlayer](https://github.com/divagr18/memlayer) | Plug-and-play memory layer for LLMs — persistent, intelligent recall in 3 lines of code | Context/Memory | Indirect | Indirect | Adding persistent memory to LLM-powered apps | `pip install memlayer`; integrate via Python API | N/A — library integration, not a direct agent skill | Python library; useful for app backends, not direct agent use |
| [Ryandonofrio3/osgrep](https://github.com/Ryandonofrio3/osgrep) | Open-source semantic code search for AI agents | Search | Portable | Portable | Semantic search across your codebase for better agent context | `npm i -g osgrep`; run `osgrep index` then `osgrep search` | Bridge skill: trigger on "find code that does X" prompts | Has Claude Code and OpenCode plugins; CLI is agent-agnostic |
| [memovai/mimiclaw](https://github.com/memovai/mimiclaw) | Run OpenClaw on a $5 ESP32 chip — pocket AI assistant with memory and tools | Infra | Indirect | Indirect | Edge/hardware AI agent experiments | Flash to ESP32-S3; connect via UART/USB | N/A — hardware project | Niche hardware project; not a direct coding-agent tool |
| [mksglu/context-mode](https://github.com/mksglu/context-mode) | Context virtualization and session continuity for coding agents | Context/Memory | Indirect | Indirect | Sandbox isolation, knowledge base, and session continuity | `npx context-mode` or install as MCP server | Bridge skill: trigger when context isolation is needed | Originally `claude-context-mode`; renamed to `context-mode`; MCP-based |

---

## Bonus Ecosystem Repos

> Bonus extras beyond `@github_repos` — these repos materially improve agent skill workflows.

| Repo | What it does | Type | Codex | Antigravity | Use it for | How to use it | Auto-use idea | Notes |
|---|---|---|---|---|---|---|---|---|
| [openai/skills](https://github.com/openai/skills) | Official Codex skills catalog | Skill Pack | Direct | Portable | Installing official Codex skills (e.g. Linear, skill-creator) | `$skill-installer <name>` in Codex; or `npx skills add openai/skills -a codex -a antigravity -y` | Auto-discovered in Codex; install to Antigravity via `npx skills add` | Codex-native; `SKILL.md` format is portable |
| [vercel-labs/skills](https://github.com/vercel-labs/skills) | The open agent skills CLI — `npx skills add` | Infra | Direct | Direct | Installing, listing, finding, and managing agent skills across all supported agents | `npx skills add <repo> -a codex -a antigravity -y` | N/A — it is the install tool itself | Supports 40+ agents including Codex and Antigravity |
| [openai/symphony](https://github.com/openai/symphony) | Turns project work into isolated, autonomous implementation runs | Automation | Direct | Indirect | Managing autonomous multi-task Codex runs without babysitting | Clone and run; requires Codex | N/A — orchestration layer | Early-stage (2 contributors); Codex-dependent |
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | Multi-agent AI coding platform powered by Vercel Sandbox and AI Gateway | Starter | Indirect | Indirect | Deploying your own coding-agent platform with MCP support | Deploy to Vercel; configure OAuth and DB | N/A — deploy-and-use template | Vercel-specific; good for building agent-as-a-service |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | Curated list of 500+ agent skills from official dev teams and community | Skill Pack | Portable | Portable | Discovering skills by language, framework, or team | Browse the catalog; install individual skills via `npx skills add` | Pick relevant skills and install per project | Covers Claude Code, Codex, Antigravity, Gemini CLI, Cursor |
| [simonw/claude-skills](https://github.com/simonw/claude-skills) | Contents of `/mnt/skills` in Claude's code interpreter environment | Reference | Reference | Reference | Understanding Claude's built-in code interpreter skills | Read the repo to learn what Claude has built-in | N/A — reference only | Claude-specific internals; study only |

---

## Suggested Bridge Skills

Bridge skills wrap non-skill CLIs/services so agents can auto-discover and use them.

### `workspace-ops`
- **Backs:** [`googleworkspace/cli`](https://github.com/googleworkspace/cli)
- **Triggers when:** User asks to read/write Google Drive files, send Gmail, manage Calendar events, or query Sheets
- **Example prompt:** *"Download the Q1 spreadsheet from Drive and summarize the revenue column"*

### `semantic-code-search`
- **Backs:** [`Ryandonofrio3/osgrep`](https://github.com/Ryandonofrio3/osgrep)
- **Triggers when:** User asks to find code by meaning rather than text, e.g. "find the retry logic" or "where do we handle auth errors"
- **Example prompt:** *"Find all functions that handle rate limiting across the codebase"*

### `persistent-memory`
- **Backs:** [`zilliztech/memsearch`](https://github.com/zilliztech/memsearch)
- **Triggers when:** User asks the agent to remember, recall, or search past decisions and context
- **Example prompt:** *"Remember that we decided to use PostgreSQL for the user service"*

### `stable-local-urls`
- **Backs:** [`vercel-labs/portless`](https://github.com/vercel-labs/portless)
- **Triggers when:** User starts a dev server and needs a stable `.localhost` URL for testing or agent reference
- **Example prompt:** *"Start the app with a stable URL so I can share it with the QA agent"*

### `mobile-agent-qa`
- **Backs:** [`droidrun/droidrun`](https://github.com/droidrun/droidrun)
- **Triggers when:** User asks to test or automate actions on a mobile device
- **Example prompt:** *"Open the app on the connected Android device and verify the login flow"*

### `parallel-agent-control`
- **Backs:** [`built-by-as/FleetCode`](https://github.com/built-by-as/FleetCode)
- **Triggers when:** User wants to run multiple agent sessions in parallel on different tasks
- **Example prompt:** *"Run the API refactor and the test suite update in parallel"*

### `codex-ci-review`
- **Backs:** [`openai/codex-action`](https://github.com/openai/codex-action)
- **Triggers when:** User wants to set up automated PR review or Codex-powered CI tasks
- **Example prompt:** *"Set up Codex to auto-review every PR on the main branch"*

---

## Best Bundles By Project Type

### Next.js / SaaS
| Tool | Role |
|---|---|
| `vercel-labs/portless` | Stable local dev URLs |
| `zilliztech/memsearch` | Persistent memory across sessions |
| `Ryandonofrio3/osgrep` | Semantic code search |
| `PeonPing/peon-ping` | Agent completion notifications |
| `openai/openai-apps-sdk-examples` | MCP/widget reference |
| `openai/openai-chatkit-starter-app` | ChatKit bootstrapping |
| `phuryn/pm-skills` | Product management workflows |

### Internal Ops / Workspace Automation
| Tool | Role |
|---|---|
| `googleworkspace/cli` | Google Workspace automation |
| `openai/codex-action` | CI/CD with Codex |
| `zilliztech/memsearch` | Persistent memory |
| `PeonPing/peon-ping` | Notifications |
| `obra/superpowers` | Skills-driven workflows |

### Mobile App / QA Automation
| Tool | Role |
|---|---|
| `droidrun/droidrun` | Mobile device automation |
| `rebornix/Agmente` | iOS agent client |
| `zilliztech/memsearch` | Persistent memory |
| `vercel-labs/portless` | Stable dev URLs for device testing |

### Autonomous Backlog / Multi-Agent
| Tool | Role |
|---|---|
| `openai/codex` | Agent runtime |
| `built-by-as/FleetCode` | Parallel agent sessions |
| `obra/superpowers` | Skills-driven workflow |
| `openai/symphony` | Autonomous implementation runs |
| `openai/codex-action` | CI automation |

### Skill-Heavy Agent Platform
| Tool | Role |
|---|---|
| `Dimillian/Skills` | iOS/Swift skills |
| `phuryn/pm-skills` | PM skills marketplace |
| `MooseGoose0701/skill-compose` | Agent builder/runtime (⚠️ archived) |
| `openai/skills` | Official Codex skills |
| `vercel-labs/skills` | Skills CLI |
| `VoltAgent/awesome-agent-skills` | 500+ curated skills |

---

## Caveats

1. **Antigravity does not have an official public skills spec from Google.** The `.agent/skills/` convention and `~/.gemini/antigravity/skills/` path come from the [vercel-labs/skills](https://github.com/vercel-labs/skills) open ecosystem, not from official Google documentation.
2. **`AGENTS.md` is a Codex convention.** Antigravity does not natively read `AGENTS.md`. Use it for Codex project rules only.
3. **Archived repo:** `MooseGoose0701/skill-compose` has been archived and moved to `dp-archive/archive`. It may not receive updates.
4. **Renamed repo:** `mksglu/claude-context-mode` has been renamed to [`mksglu/context-mode`](https://github.com/mksglu/context-mode). Old URLs redirect but update your references.
5. **Claude-first repos** like `ChrisWiles/claude-code-showcase` and `simonw/claude-skills` are reference-only. Their patterns are transferable but they are not plug-and-play for Codex or Antigravity.
6. **Star counts and activity levels change.** This playbook does not include star counts. Always check the repo directly for current status.
7. **Bridge skills require manual creation.** There is no auto-generation tool; you write a thin `SKILL.md` per tool.

---

## Sources

### @github_repos Community Posts
- Posts `11702`, `12409`, `12414`, `12597`, `12754`, `12781`, `12916`, `12917`, and `?before=13007`

### Official Documentation
- OpenAI Codex skills docs: [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills)
- Vercel skills ecosystem: [github.com/vercel-labs/skills](https://github.com/vercel-labs/skills)
- Vercel skills announcement: [vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem](https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem)
- Agent Skills specification: [agentskills.io](https://agentskills.io)

### OpenAI Repos
- [openai/codex](https://github.com/openai/codex)
- [openai/codex-action](https://github.com/openai/codex-action)
- [openai/openai-apps-sdk-examples](https://github.com/openai/openai-apps-sdk-examples)
- [openai/openai-chatkit-starter-app](https://github.com/openai/openai-chatkit-starter-app)
- [openai/openai-chatkit-advanced-samples](https://github.com/openai/openai-chatkit-advanced-samples)
- [openai/skills](https://github.com/openai/skills)
- [openai/symphony](https://github.com/openai/symphony)

### Antigravity Community Reference
- Antigravity skills page: [antigravity.codes/agent-skills/marketing/game-changing-features](https://antigravity.codes/agent-skills/marketing/game-changing-features)

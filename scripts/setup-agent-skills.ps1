<#
.SYNOPSIS
    Setup all agent skills for Codex and Antigravity in any project.
.DESCRIPTION
    Run this script from any project root to:
    1. Install skill packs via npx skills add
    2. Create all 7 bridge skills for both agents
    3. Add .osgrep and .memsearch to .gitignore
.USAGE
    cd E:\your-project
    powershell -ExecutionPolicy Bypass -File path\to\setup-agent-skills.ps1
#>

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Agent Skills Setup - Codex & Antigravity" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Create directories ──
Write-Host "[1/4] Creating skill directories..." -ForegroundColor Yellow

$dirs = @(
    ".agents\skills",
    ".agent\skills",
    "docs\agent-playbooks"
)
foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
        Write-Host "  + Created $d" -ForegroundColor Green
    } else {
        Write-Host "  = $d already exists" -ForegroundColor DarkGray
    }
}

# ── Step 2: Install skill packs ──
Write-Host ""
Write-Host "[2/4] Installing skill packs via npx skills add..." -ForegroundColor Yellow
Write-Host "  (This may take a few minutes)" -ForegroundColor DarkGray

$packs = @(
    @{ repo = "phuryn/pm-skills";      args = "--skill '*' -a codex -a antigravity -y" },
    @{ repo = "Dimillian/Skills";      args = "--skill '*' -a codex -a antigravity -y" },
    @{ repo = "obra/superpowers";      args = "-a codex -a antigravity -y" },
    @{ repo = "googleworkspace/cli";   args = "-a codex -a antigravity -y" },
    @{ repo = "openai/skills";         args = "--skill '*' -a codex -y" }
)

foreach ($pack in $packs) {
    Write-Host "  Installing $($pack.repo)..." -ForegroundColor White
    $cmd = "npx -y skills add $($pack.repo) $($pack.args)"
    try {
        Invoke-Expression $cmd 2>&1 | Out-Null
        Write-Host "    OK" -ForegroundColor Green
    } catch {
        Write-Host "    FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ── Step 3: Create bridge skills ──
Write-Host ""
Write-Host "[3/4] Creating 7 bridge skills..." -ForegroundColor Yellow

$bridgeSkills = @{}

# --- semantic-code-search ---
$bridgeSkills["semantic-code-search"] = @"
---
name: semantic-code-search
description: >
  Use when the user needs to understand how code works, where a behavior is implemented,
  or how different parts of the codebase connect. Covers code exploration, architecture
  understanding, implementation discovery, and tracing how data flows through the system.
  Prefer this over grep when the user describes what code DOES rather than what it CONTAINS.
---
# Semantic Code Search via osgrep

## Prerequisites
- ``osgrep`` must be installed globally: ``npm i -g osgrep``
- The codebase must be indexed first

## When to Use
- User wants to understand how a feature or behavior is implemented
- User is exploring unfamiliar code and needs to find where something happens
- User describes a capability or behavior and wants to locate the code responsible
- User asks about code architecture, data flow, or how components interact
- User is debugging and needs to find all code related to a specific concern
- User needs to understand dependencies or relationships between modules

## When NOT to Use
- User gives an exact string, variable name, or error message to search for - use grep
- User asks to read a specific file they already know the path of - use file tools
- User asks a general question that does not require looking at code - answer directly

## Scenarios
1. Understanding how authentication or authorization works in the project
2. Finding where a specific business rule is enforced
3. Tracing how a request flows from API route to database
4. Discovering all places where a concept (payments, notifications, sessions) is handled
5. Understanding error handling patterns across the codebase
6. Finding how configuration or environment variables are used
7. Locating middleware, hooks, or interceptors that modify behavior
8. Understanding how the worker/queue system processes jobs

## Steps
1. Check if the index exists: ``osgrep list``
2. If not indexed, run: ``osgrep index``
3. Search: ``osgrep search "<user query>"``
4. Present results with file paths and relevant snippets
5. Offer to open or explain the matching code
"@

# --- persistent-memory ---
$bridgeSkills["persistent-memory"] = @"
---
name: persistent-memory
description: >
  Use when the user needs continuity across sessions - saving decisions, recalling past context,
  or building a shared knowledge base about the project. Covers architectural decisions,
  design rationale, meeting notes, agreed-upon conventions, and any information the user
  wants to persist beyond the current conversation.
---
# Persistent Memory via memsearch

## Prerequisites
- ``memsearch`` must be installed: ``pip install memsearch``
- Config must be initialized: ``memsearch config init``

## When to Use
- User makes a decision they will need to reference later
- User discusses architecture, conventions, or patterns they want documented
- User needs to recall something discussed in a previous session
- User is building up project knowledge incrementally over time
- User asks "why did we..." or "what was the reason for..." about past work
- User wants to save research findings, comparisons, or evaluations

## When NOT to Use
- User asks about code in the current codebase - use code search or file tools
- User asks a general knowledge question - answer directly
- Information is already in project docs/README - reference those instead

## Scenarios
1. Saving the rationale behind choosing a technology or pattern
2. Recording agreed team conventions (naming, folder structure, API design)
3. Persisting the results of a debugging session for future reference
4. Saving notes about external API behaviors or quirks discovered during development
5. Recording deployment procedures or environment-specific configurations
6. Preserving onboarding context for future team members
7. Accumulating lessons learned across multiple development sessions

## Steps
1. To save: ``memsearch index --input "<markdown content>"``
2. To recall: ``memsearch search "<query>"``
3. To see stats: ``memsearch stats``
4. Present recalled information with context about when it was saved
"@

# --- stable-local-urls ---
$bridgeSkills["stable-local-urls"] = @"
---
name: stable-local-urls
description: >
  Use when the user needs predictable local development URLs instead of port numbers.
  Covers multi-service development, sharing local URLs between tools or agents,
  and any situation where port numbers are inconvenient, forgettable, or need to be
  referenced consistently across configurations.
---
# Stable Local URLs via portless

## Prerequisites
- ``portless`` must be installed: ``npm i -g portless``

## When to Use
- User is running multiple local services and needs to tell them apart
- User wants to reference a local service by a meaningful name
- User needs a stable URL to put in environment variables or configs
- User is coordinating between multiple agents or tools that need to access local services
- User complains about forgetting port numbers
- User is setting up a local development environment with multiple interconnected services

## When NOT to Use
- User just wants to run a single dev server normally
- User is deploying to production - use real domains

## Scenarios
1. Running frontend and backend on different ports and needing named access
2. Configuring OAuth callbacks that need a predictable URL
3. Setting up webhook testing with a stable local endpoint
4. Coordinating between a main app and a worker service locally
5. Sharing a local URL in documentation or with team members

## Steps
1. Start the dev server: ``npm run dev``
2. Map it: ``portless add my-app 3000``
3. Access at: ``https://my-app.localhost``
4. List mappings: ``portless list``
5. Remove: ``portless remove my-app``
"@

# --- mobile-agent-qa ---
$bridgeSkills["mobile-agent-qa"] = @"
---
name: mobile-agent-qa
description: >
  Use when the user needs to interact with, test, or automate anything on a physical
  Android device. Covers QA testing, UI verification, flow automation, accessibility
  checks, and any task that requires controlling a real mobile device through
  natural language instead of manual tapping.
---
# Mobile QA Automation via droidrun

## Prerequisites
- ``droidrun`` must be installed: ``pip install droidrun``
- ADB must be set up and the device must be connected
- Run ``adb devices`` to verify connection

## When to Use
- User needs to verify that a web app or mobile app works correctly on a real device
- User wants to automate a repetitive testing flow on Android
- User needs screenshots or recordings from a real device
- User is doing QA and wants to test multiple scenarios programmatically

## When NOT to Use
- User wants to test in a desktop browser - use browser tools
- User does not have a connected Android device
- User needs iOS testing - droidrun is Android only

## Scenarios
1. Verifying a login flow works end-to-end on a real phone
2. Testing that a responsive layout renders correctly on mobile screen sizes
3. Automating a sequence of taps and inputs to test a checkout flow
4. Capturing screenshots of different app states for documentation

## Steps
1. Verify device: ``adb devices``
2. Run task: ``droidrun "<natural language instruction>"``
3. Report results and any screenshots captured
"@

# --- parallel-agent-control ---
$bridgeSkills["parallel-agent-control"] = @"
---
name: parallel-agent-control
description: >
  Use when the user has multiple independent tasks that would benefit from simultaneous
  execution by separate agent instances. Covers workload splitting, parallel development
  tracks, and any situation where waiting for sequential completion is inefficient.
  macOS only; requires Codex or Claude Code CLI.
---
# Parallel Agent Sessions via FleetCode

## Prerequisites
- FleetCode must be installed: clone https://github.com/built-by-as/FleetCode and build
- macOS only

## When to Use
- User has two or more tasks with no dependencies between them
- User wants to speed up a large workload by splitting it
- User is working on a feature that has independent frontend and backend components

## When NOT to Use
- Tasks depend on each other - do them sequentially
- User has only one task - handle it directly
- User is not on macOS - FleetCode is macOS only

## Scenarios
1. Refactoring API routes while simultaneously updating their tests
2. Building a new feature while fixing bugs in an unrelated module
3. Running a full test suite while implementing a separate feature

## Steps
1. Open FleetCode app
2. Create sessions for each parallel task
3. Monitor progress via the FleetCode control pane
4. Report results from each session

## Note
This tool is macOS only and requires Codex or Claude Code CLI.
"@

# --- codex-ci-review ---
$bridgeSkills["codex-ci-review"] = @"
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
- OPENAI_API_KEY must be set as a GitHub secret

## When to Use
- User wants automated feedback on pull requests before human review
- User is setting up or improving their CI/CD pipeline code quality checks
- User wants AI to catch issues that linters miss (logic errors, design problems)

## When NOT to Use
- User wants a one-time manual review - do it directly
- User does not have an OpenAI API key

## Scenarios
1. Setting up automated review for a team that merges PRs without enough review
2. Creating quality gates that block merging until AI review passes
3. Automating detection of security issues or anti-patterns

## Steps
1. Create .github/workflows/codex-review.yml with the codex-action
2. Add OPENAI_API_KEY to GitHub repository secrets
3. Test with a new PR
"@

# --- workspace-ops ---
$bridgeSkills["workspace-ops"] = @"
---
name: workspace-ops
description: >
  Use when the user needs to interact with any Google Workspace service programmatically.
  Covers file management (Drive), communication (Gmail, Chat), scheduling (Calendar),
  data operations (Sheets), document creation (Docs), and administration tasks.
  Acts as the bridge between coding agent workflows and Google Workspace.
---
# Google Workspace Operations via gws CLI

## Prerequisites
- gws must be installed: see https://github.com/googleworkspace/cli
- Authentication must be configured (OAuth or service account)

## When to Use
- User needs to access, upload, download, or organize files in Google Drive
- User wants to send, read, search, or manage email via Gmail
- User needs to view, create, or modify calendar events
- User wants to read from or write to Google Sheets
- User needs to create or edit Google Docs
- User wants to send messages to Google Chat spaces

## When NOT to Use
- User asks about Google Cloud Platform (GCP) services - different toolset
- User asks about Firebase - use Firebase CLI

## Scenarios
1. Downloading a requirements document from Drive to use as a spec
2. Sending a summary email after completing a development task
3. Creating a spreadsheet to track feature progress
4. Posting deployment notifications to a team Chat space

## Steps
1. Authenticate: ``gws auth login``
2. Drive: ``gws drive files list``
3. Gmail: ``gws gmail messages send``
4. Calendar: ``gws calendar events list``
5. Sheets: ``gws sheets spreadsheets values get``
"@

# Write bridge skills to both agent paths
foreach ($name in $bridgeSkills.Keys) {
    foreach ($agentDir in @(".agents\skills", ".agent\skills")) {
        $skillDir = Join-Path $agentDir $name
        if (-not (Test-Path $skillDir)) {
            New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
        }
        $skillFile = Join-Path $skillDir "SKILL.md"
        $bridgeSkills[$name] | Set-Content -Path $skillFile -Encoding UTF8 -NoNewline
    }
    Write-Host "  + $name (both agents)" -ForegroundColor Green
}

# ── Step 4: Update .gitignore ──
Write-Host ""
Write-Host "[4/4] Updating .gitignore..." -ForegroundColor Yellow

$gitignorePath = ".gitignore"
$entries = @(".osgrep", ".memsearch")

if (Test-Path $gitignorePath) {
    $content = Get-Content $gitignorePath -Raw
    foreach ($entry in $entries) {
        if ($content -notmatch [regex]::Escape($entry)) {
            Add-Content -Path $gitignorePath -Value "`n$entry"
            Write-Host "  + Added $entry to .gitignore" -ForegroundColor Green
        } else {
            Write-Host "  = $entry already in .gitignore" -ForegroundColor DarkGray
        }
    }
} else {
    $entries -join "`n" | Set-Content -Path $gitignorePath -Encoding UTF8
    Write-Host "  + Created .gitignore with agent entries" -ForegroundColor Green
}

# ── Summary ──
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$codexCount   = (Get-ChildItem -Path ".agents\skills" -Directory -ErrorAction SilentlyContinue).Count
$antiCount    = (Get-ChildItem -Path ".agent\skills"  -Directory -ErrorAction SilentlyContinue).Count

Write-Host "  Codex skills:       $codexCount directories" -ForegroundColor White
Write-Host "  Antigravity skills: $antiCount directories" -ForegroundColor White
Write-Host "  Bridge skills:      7 pairs (14 files)" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. osgrep index        (index this project for semantic search)" -ForegroundColor DarkGray
Write-Host "    2. memsearch config    (setup persistent memory - needs Docker on Windows)" -ForegroundColor DarkGray
Write-Host ""

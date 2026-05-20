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

- FleetCode must be installed: clone `https://github.com/built-by-as/FleetCode` and build
- macOS only

## When to Use

- User has two or more tasks with no dependencies between them
- User wants to speed up a large workload by splitting it
- User is working on a feature that has independent frontend and backend components
- User needs to run tests and implement changes at the same time
- User explicitly asks about parallel or concurrent agent work

## When NOT to Use

- Tasks depend on each other (output of one feeds into another) → do them sequentially
- User has only one task → handle it directly
- User is not on macOS → FleetCode is macOS only
- User is using Antigravity → FleetCode doesn't integrate with Antigravity

## Scenarios

1. Refactoring API routes while simultaneously updating their tests
2. Building a new feature while fixing bugs in an unrelated module
3. Running a full test suite while implementing a separate feature
4. Creating documentation while making code changes
5. Setting up CI/CD while developing a new component

## Steps

1. Open FleetCode app
2. Create sessions for each parallel task
3. Monitor progress via the FleetCode control pane
4. Report results from each session

## Note

This tool is macOS only and requires Codex or Claude Code CLI. It cannot be used directly by Antigravity.

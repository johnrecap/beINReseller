---
name: persistent-memory
description: >
  Use when the user needs continuity across sessions — saving decisions, recalling past context,
  or building a shared knowledge base about the project. Covers architectural decisions,
  design rationale, meeting notes, agreed-upon conventions, and any information the user
  wants to persist beyond the current conversation.
---
# Persistent Memory via memsearch

## Prerequisites

- `memsearch` must be installed: `pip install memsearch`
- Config must be initialized: `memsearch config init`

## When to Use

- User makes a decision they'll need to reference later
- User discusses architecture, conventions, or patterns they want documented
- User needs to recall something discussed in a previous session
- User is building up project knowledge incrementally over time
- User asks "why did we..." or "what was the reason for..." about past work
- User wants to save research findings, comparisons, or evaluations

## When NOT to Use

- User asks about code in the current codebase → use code search or file tools
- User asks a general knowledge question → answer directly
- Information is already in project docs/README → reference those instead

## Scenarios

1. Saving the rationale behind choosing a technology or pattern
2. Recording agreed team conventions (naming, folder structure, API design)
3. Persisting the results of a debugging session for future reference
4. Saving notes about external API behaviors or quirks discovered during development
5. Recording deployment procedures or environment-specific configurations
6. Preserving onboarding context for future team members
7. Accumulating lessons learned across multiple development sessions

## Steps

1. To save: `memsearch index --input "<markdown content>"`
2. To recall: `memsearch search "<query>"`
3. To see stats: `memsearch stats`
4. Present recalled information with context about when it was saved

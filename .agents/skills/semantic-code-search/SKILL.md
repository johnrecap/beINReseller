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

- `osgrep` must be installed globally: `npm i -g osgrep`
- The codebase must be indexed first

## When to Use

- User wants to understand how a feature or behavior is implemented
- User is exploring unfamiliar code and needs to find where something happens
- User describes a capability or behavior and wants to locate the code responsible
- User asks about code architecture, data flow, or how components interact
- User is debugging and needs to find all code related to a specific concern
- User needs to understand dependencies or relationships between modules

## When NOT to Use

- User gives an exact string, variable name, or error message to search for → use grep
- User asks to read a specific file they already know the path of → use file tools
- User asks a general question that doesn't require looking at code → answer directly

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

## Steps

1. Check if the index exists: `osgrep list`
2. If not indexed, run: `osgrep index`
3. Search: `osgrep search "<user query>"`
4. Present results with file paths and relevant snippets
5. Offer to open or explain the matching code

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

- `portless` must be installed: `npm i -g portless`

## When to Use

- User is running multiple local services and needs to tell them apart
- User wants to reference a local service by a meaningful name
- User needs a stable URL to put in environment variables or configs
- User is coordinating between multiple agents or tools that need to access local services
- User complains about forgetting port numbers
- User is setting up a local development environment with multiple interconnected services

## When NOT to Use

- User just wants to run a single dev server normally → `npm run dev` is fine
- User is deploying to production → use real domains
- User is on a platform that doesn't support .localhost URLs

## Scenarios

1. Running frontend and backend on different ports and needing named access
2. Configuring OAuth callbacks that need a predictable URL
3. Setting up webhook testing with a stable local endpoint
4. Coordinating between a main app and a worker service locally
5. Sharing a local URL in documentation or with team members

## Steps

1. Start the dev server: `npm run dev`
2. Map it: `portless add bein-panel 3000`
3. Access at: `https://bein-panel.localhost`
4. List mappings: `portless list`
5. Remove: `portless remove bein-panel`

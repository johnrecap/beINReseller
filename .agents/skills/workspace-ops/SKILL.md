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

- `gws` must be installed: see <https://github.com/googleworkspace/cli>
- Authentication must be configured, either OAuth or a service account

## When to Use

- User needs to access, upload, download, or organize files in Google Drive
- User wants to send, read, search, or manage email via Gmail
- User needs to view, create, or modify calendar events
- User wants to read from or write to Google Sheets
- User needs to create or edit Google Docs
- User wants to send messages to Google Chat spaces
- User needs to manage Google Workspace admin settings or audit logs
- User is building a workflow that connects code changes to Workspace actions

## When NOT to Use

- User asks about Google Cloud Platform (GCP) services → different toolset
- User asks about Firebase → use Firebase CLI
- User doesn't have Google Workspace → this won't work
- User can do it faster in the browser → suggest that instead for simple one-off tasks

## Scenarios

1. Downloading a requirements document from Drive to use as a spec
2. Sending a summary email after completing a development task
3. Creating a spreadsheet to track feature progress
4. Checking calendar availability before scheduling a deployment
5. Posting deployment notifications to a team Chat space
6. Backing up project documentation to Drive
7. Reading data from a Sheets spreadsheet to use in code generation

## Steps

1. Authenticate: `gws auth login`
2. Drive operations: `gws drive files list`, `gws drive files get <id>`
3. Gmail: `gws gmail messages list`, `gws gmail messages send`
4. Calendar: `gws calendar events list`
5. Sheets: `gws sheets spreadsheets values get`

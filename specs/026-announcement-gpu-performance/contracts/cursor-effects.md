# Contract: Cursor Effects

## Scope

Defines the dashboard default for decorative pointer effects.

## Required Behavior

- The dashboard provider must not mount the global cursor particle canvas by default.
- Normal dashboard mouse movement must not trigger a fullscreen canvas drawing loop.
- The existing cursor effect component may remain in the codebase for future explicit opt-in.

## Non-Goals

- Do not redesign cursor effects.
- Do not add new settings UI for cursor effects in this feature.
- Do not remove unrelated animations across the whole app.

## Verification

- Inspect rendered dashboard DOM: no cursor effect canvas should be present by default.
- Move mouse for 30 seconds and confirm no pointer particle effect appears.
- Browser performance sanity check should show lower activity during mouse movement than before the change.

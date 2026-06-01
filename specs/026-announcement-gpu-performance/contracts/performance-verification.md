# Contract: Performance Verification

## Required Checks

- Focused tests for slide selection and adjacent preload logic where a test seam exists.
- Targeted lint for edited renderer/provider files.
- TypeScript check.
- Production build.
- Local cache check showing repeated uploaded image requests can return not-modified or cache behavior.
- Browser or Playwright screenshot showing the dashboard/announcement area after changes.
- Manual or browser task-manager sanity check for mouse movement and autoplay.

## Success Signals

- One visible announcement image in the slider card area.
- No global cursor canvas mounted by default.
- Repeated image request does not transfer the full body when cache validators match.
- Autoplay/manual navigation still works.
- Admin preview and live dashboard do not diverge.

## Invalid Success Signals

- DevTools with "Disable cache" enabled.
- Only passing build without rendered verification.
- Only network-cache proof while GPU-heavy layered rendering remains.

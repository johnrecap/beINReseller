# Data Model: Announcement GPU Performance

## Announcement Slider State

Represents the client-side state needed to render the announcement slider.

**Fields**:

- `activeIndex`: current visible slide index.
- `isPaused`: whether autoplay is paused by hover/focus.
- `safeIntervalMs`: bounded autoplay interval.
- `activeSlide`: the single slide currently visible.
- `preloadSlides`: unique adjacent slides selected for preload only.

**Rules**:

- If there are fewer than two slides, autoplay and navigation should not create extra work.
- Adjacent preload must avoid duplicate URLs.
- The visible card shell should remain stable while `activeSlide` changes.

## Announcement Slide

Represents one image slide already provided by the existing announcement data.

**Fields**:

- `id`
- `imageUrl`
- `imageAlt`
- `title`
- `description`
- `linkLabel`
- `linkUrl`
- `imageFit`

**Rules**:

- Only slides with resolvable image URLs are considered active in the renderer.
- Slide link presence must not change the top-level card shell shape.
- Image fit behavior must match the existing `cover` or `contain` choices.

## Cursor Effect Mount State

Represents whether the decorative cursor particle effect is mounted.

**Fields**:

- `enabledByDefault`: false for dashboard sessions.
- `optInSurface`: optional future surface allowed to mount the effect.

**Rules**:

- Dashboard provider must not mount the effect by default.
- The component may remain available for future opt-in use.

## Performance Evidence

Represents proof collected during verification.

**Fields**:

- `networkResult`: cache or not-modified behavior for repeated image requests.
- `renderResult`: visible slide count and DOM/card stability evidence.
- `gpuResult`: browser task manager or performance sanity observation.
- `buildResult`: lint, type check, and production build outcome.

**Rules**:

- Evidence must include one-slide, two-slide, and three-or-more-slide cases when practical.
- DevTools "Disable cache" results are not valid evidence for normal cache behavior.

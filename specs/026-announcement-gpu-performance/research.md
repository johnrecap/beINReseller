# Research: Announcement GPU Performance

## Decision 1: Fix runtime rendering before image compression

**Decision**: First remove the runtime causes of high GPU use: three stacked slide cards, blur/blend effects, unstable card remounting, and global cursor particles.

**Rationale**: Cache headers already improved network behavior, but the user still reports slow transitions and high GPU. The reviewed code renders up to three full image layers with transforms, blur, opacity, blend mode, backdrop blur, and broad transitions. The global cursor effect draws on a fullscreen canvas during mouse movement. These are direct GPU costs even when the image is cached.

**Alternatives considered**:

- Add upload compression immediately: deferred because it adds a dependency/deploy risk and does not fix already uploaded files without a backfill.
- App-wide CSS cleanup: deferred because it is too broad for the reported issue.

## Decision 2: Render one visible slide with adjacent preload only

**Decision**: The announcement slider should render one stable visible card and preload adjacent unique images offscreen.

**Rationale**: Rendering stacked visible cards multiplies image decode/composite work. A stable card shell reduces React teardown and browser layer churn. Adjacent preload keeps the next transition ready without drawing hidden visual layers.

**Alternatives considered**:

- Keep three-card depth effect but remove blur: rejected because it still composites multiple image layers and does not address the main cost.
- Use `key={slide.id}` on the active card: less preferred because it intentionally remounts the whole card on each slide change.

## Decision 3: Disable global cursor particles by default

**Decision**: Do not mount the global cursor particle canvas in the dashboard provider by default.

**Rationale**: The dashboard is an operational tool. A fullscreen pointer-driven drawing loop does not serve the workflow and is a likely source of GPU/CPU use during normal mouse movement.

**Alternatives considered**:

- Reduce particle count only: rejected for the immediate fix because any pointer-driven canvas still consumes resources and the effect is non-essential.
- Keep it on marketing/login pages only: possible later, but not required for the dashboard fix.

## Decision 4: Defer upload optimization and backfill

**Decision**: Document image compression/backfill as a follow-up after measuring runtime fixes.

**Rationale**: Large source images remain a real risk, but adding image processing requires dependency verification on the production server and careful handling of JPEG, PNG transparency, WebP, and GIF. Existing production images would not benefit unless migrated or re-uploaded.

**Alternatives considered**:

- Convert all uploads to WebP now: rejected because it can affect transparency/GIF behavior and introduces operational risk.
- Rewrite existing uploads in place: rejected because immutable URLs and cache behavior assume files are not overwritten.

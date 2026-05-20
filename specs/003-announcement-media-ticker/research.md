# Research: Announcement Media, Slider, and News Ticker

## Decision 1: Use a normalized `AnnouncementSlide` table

**Decision**: Store slider images in a new `AnnouncementSlide` model related to `AnnouncementBanner`.

**Rationale**:

- The admin needs ordering, active/disabled state, text, and links per image.
- A normalized table is easier to reorder and query safely than a JSON blob.
- Public API can select only active slides in order.
- It avoids changing the meaning of the legacy `imageUrl` field.

**Alternatives Considered**:

- Store slides as JSON on `AnnouncementBanner`.
  - Rejected because validation, ordering, partial updates, and admin editing become harder.
- Create one banner per slide.
  - Rejected because one announcement campaign should control shared ticker, schedule, and active state.

## Decision 2: Keep legacy image fields

**Decision**: Keep `AnnouncementBanner.imageUrl` and `AnnouncementBanner.imageAlt` as fallback fields.

**Rationale**:

- Production may already have records with these fields.
- Removing or repurposing them creates unnecessary risk.
- Existing public rendering can continue while the new slider is introduced.

**Alternatives Considered**:

- Migrate all legacy images into `AnnouncementSlide` immediately and remove legacy fields.
  - Rejected because this is riskier for a live site.

## Decision 3: Separate ticker from message animation

**Decision**: Add dedicated ticker settings instead of reusing `animationType = marquee`.

**Rationale**:

- The requested ticker is a separate strip like a news channel, not just animated text.
- Admin should be able to hide ticker while keeping image/message visible.
- Ticker needs separate direction, speed, colors, and placement.

**Alternatives Considered**:

- Reuse existing `animationType`.
  - Rejected because it mixes two different features and limits control.

## Decision 4: Validate image dimensions with purpose-based rules

**Decision**: Use different dimension recommendations for main banner and slider slide images.

**Rationale**:

- A wide banner and a card slider need different aspect ratios.
- Clear rules prevent distorted or poor-looking ads.
- The admin should know what to upload before publishing.

**Rules**:

- Main banner recommended: 1600x400, minimum: 1200x300, aspect: 4:1.
- Slider slide recommended: 1200x675, minimum: 800x450, aspect: 16:9.

**Alternatives Considered**:

- Accept any image.
  - Rejected because the user specifically said the current image behavior needs improvement.
- Hard-crop all images.
  - Rejected for the first version because browser-side cropping/editor UX is a larger feature.

## Decision 5: Safe link allowlist

**Decision**: Allow relative internal links and HTTPS links. Reject JavaScript and unsafe protocols.

**Rationale**:

- Admin may need slides that link to internal pages or external promotions.
- Unsafe protocols can create a security issue.

## Decision 6: Add admin preview before publishing

**Decision**: Include preview modes for desktop, tablet, and mobile.

**Rationale**:

- The main risk is visual breakage on a live customer dashboard.
- Preview reduces trial-and-error on production.

## Decision 7: No financial or worker changes

**Decision**: This feature must not touch renewal, verification, balance, refund, worker queue, or beIN account code.

**Rationale**:

- The announcement feature is visual/admin content.
- The site has live customer money and operational transactions.
- Keeping scope separate reduces rollout risk.

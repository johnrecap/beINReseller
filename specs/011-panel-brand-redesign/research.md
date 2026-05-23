# Research: Panel Brand Redesign

## Decision 1: Use A Dark Operations-First Theme

**Decision**: Keep the panel dark-first with deep near-black surfaces, purple depth accents, and neon green for brand activity/status highlights.

**Rationale**: The panel is used for operations, tables, balances, renewals, reviews, and logs. A dark operational theme matches the supplied references and existing sidebar direction while keeping focus on data.

**Alternatives Considered**:

- **Full neon/cyber theme everywhere**: Rejected because it can reduce table readability and make warning/error states less clear.
- **Light corporate theme**: Rejected for v1 because the supplied assets and current UI direction are dark/purple/green.
- **Keep current slate/indigo theme**: Rejected because it does not fully match the provided Desh Panel visuals.

## Decision 2: Token-First Implementation

**Decision**: Future implementation must update `src/styles/tokens.css` and `src/app/globals.css` first, then consume those tokens in components.

**Rationale**: Existing styles are currently split between reusable tokens, Tailwind variables, and hard-coded stitch classes. A token-first pass reduces random color patches and makes future edits cheaper.

**Alternatives Considered**:

- **Page-by-page hard-coded changes**: Rejected because it creates inconsistent colors and makes later fixes slow.
- **Replace all UI components at once**: Rejected because it increases regression risk across forms and tables.

## Decision 3: Copy Approved Assets Into `public/images/brand/`

**Decision**: Approved assets from `E:\work\panel_bien_sport\photos 1` should be copied and optimized into `public/images/brand/` during implementation.

**Rationale**: Runtime code should not depend on a local external folder. Public app assets need stable paths and production deployment compatibility.

**Alternatives Considered**:

- **Reference the original folder directly**: Rejected because it will not work on production.
- **Upload assets through the current upload system**: Rejected for core brand assets because they are not user-generated content.

## Decision 4: Use Asset Categories With Clear Rules

**Decision**: Treat source folders as categories:

- `logo`: full brand marks, square app icons, favicon/collapsed logo candidates.
- `banner`: login/dashboard hero and limited summary banners.
- `bot`: login illustration, empty states, confirmation/success/pending visual panels.
- `screens`: references/mockups only unless explicitly approved as content.
- `ايقونه`: feature icons for cards and dashboards only when they improve recognition.

**Rationale**: The asset set contains good visuals, but overusing robots/banners inside operational tables will hurt clarity.

**Alternatives Considered**:

- **Use every image somewhere**: Rejected because visual clutter will reduce operational quality.
- **Use no images except logo**: Rejected because the user explicitly wants the images incorporated.

## Decision 5: Preserve Business Status Colors

**Decision**: Brand green and purple can decorate shell and neutral surfaces, but business status colors remain semantic.

**Rationale**: Operators must distinguish completed, failed, pending, refund, warning, review-required, and cancelled states instantly.

**Alternatives Considered**:

- **Make all positive states neon green**: Rejected because brand green and status success need controlled contrast.
- **Use purple for pending/review**: Rejected unless tested carefully because purple is also the active navigation color.

## Decision 6: No Backend Or Database Changes

**Decision**: The redesign must avoid API, Prisma, worker, auth, credit request, and transaction logic changes.

**Rationale**: The panel currently has sensitive operation flows. Visual redesign should not risk payment, renewal, credit, ledger, or permission behavior.

**Alternatives Considered**:

- **Add admin-controlled image settings in DB now**: Rejected for this phase. It adds schema and permission scope beyond visual redesign.
- **Add theme customization per user**: Rejected for this phase. It adds complexity without solving the main brand consistency problem.

## Decision 7: Manual Visual QA Is Required

**Decision**: Every major role/page group must be checked with desktop and mobile screenshots after implementation.

**Rationale**: Build success does not prove readability, crop correctness, or RTL layout quality.

**Alternatives Considered**:

- **Only run build/lint**: Rejected because visual issues often pass builds.
- **Full automated visual regression suite now**: Deferred. Manual screenshots are enough for v1 and faster to execute.

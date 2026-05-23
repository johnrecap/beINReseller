# UI Contract: Panel Brand Redesign

This contract defines what the redesign may and may not change.

## Non-Negotiable Boundaries

- Must not change API behavior.
- Must not change Prisma schema.
- Must not change beIN worker, renewal, package loading, payment, confirmation, review, refund, or ledger logic.
- Must not change user permissions or role access.
- Must not remove existing navigation routes.
- Must not depend on source images outside the repository at runtime.

## Brand Asset Contract

Every shipped brand image must have:

- Stable public path under `public/images/brand/`.
- Human-readable filename, for example `logo-full.png`, `logo-icon.png`, `login-hero.png`.
- Documented category and use.
- Fallback if it fails to load.
- Responsive crop behavior.
- Optimization target.

## Page Coverage Contract

The redesign must cover these page groups:

| Page group | Required coverage |
|------------|-------------------|
| Login | Logo, visual hero/image, form contrast, mobile layout |
| Shell | Dashboard background, header, sidebar, active nav, footer profile |
| Admin dashboard | Stats cards, worker/status cards, recent operation cards |
| User dashboard | Balance cards, quick actions, request credit entry |
| Manager dashboard | Manager stats, users list, deleted users |
| Agent dashboard | Read-only report cards and assigned users/requests |
| Renewal flows | Package lists, card status, contracts, confirmation panels |
| Financial pages | Transactions, financial review, spend report |
| Admin settings | Forms, notification settings, BeIN config, announcements |
| Logs/history | Filters, tables, empty states |
| Points/rewards/credit requests | Badges, status cards, approval tables |

## Component Contract

Shared components must expose the brand look through reusable classes/tokens:

- `BrandLogo` handles full/compact logo variants.
- `DashboardShell`, `Header`, and `Sidebar` own shell composition only.
- UI primitives (`button`, `card`, `table`, `badge`, `input`, `dialog`) must preserve accessibility and states.
- Page components consume shared primitives instead of redefining the same colors repeatedly.

## Visual Quality Contract

- Tables prioritize text contrast over decoration.
- Buttons must keep familiar icon+text behavior where commands need clarity.
- Status badges must be readable without relying only on color.
- Images must not overlap table rows, forms, buttons, or financial values.
- Mobile layout must not require horizontal scrolling except for explicitly scrollable wide tables.
- RTL and LTR must both pass visual QA.

## Acceptance Evidence

Future implementation should provide:

- Build/lint output.
- Screenshot set for each role and viewport listed in `quickstart.md`.
- List of assets copied and optimized.
- Notes for any intentionally deferred pages or assets.

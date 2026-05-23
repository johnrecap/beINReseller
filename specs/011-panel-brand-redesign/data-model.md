# Data Model: Panel Brand Redesign

This feature has no database model changes. The entities below are design/documentation entities used to guide implementation.

## BrandAsset

Represents one image used by the panel.

| Field | Meaning |
|-------|---------|
| `sourcePath` | Original file path in `E:\work\panel_bien_sport\photos 1` |
| `publicPath` | Final stable path under `public/images/brand/` |
| `category` | `logo`, `banner`, `bot`, `icon`, or `reference` |
| `intendedUse` | Where it is allowed to appear |
| `fallback` | What to show if image fails |
| `cropRule` | `contain`, `cover-center`, `cover-subject-right`, etc. |
| `optimizationTarget` | Target dimensions/quality for production asset |

### Proposed Asset Map

| Source group | Recommended use | Notes |
|--------------|-----------------|-------|
| `logo/*` | Sidebar logo, header/logo variants, favicon/app icon candidates | Choose one full logo and one square icon |
| Top-level `1.png`, `3.png`, `4.png` | Primary brand candidates | Use only after comparing with existing `public/images/desh-panel-brand.jpeg` |
| `banner/2-1.png`, `banner/3-1.png`, `banner/4-1.png` | Login or dashboard hero visuals | Good for wide desktop; define mobile crop |
| `banner/5-1.png`, `banner/6-1.png`, `banner/7-1.png` | Internal system/bot monitor panels only | Avoid on customer-facing credit or renewal pages unless text is approved |
| `bot/*` | Login art, empty states, success/pending confirmations | Do not place inside dense tables |
| `screens/*` | Design references only | Do not ship as UI content without explicit approval |
| `ايقونه/*` | Dashboard summary cards, reward/point/credit visuals | Use sparingly and keep lucide icons for interactive controls |

## DesignToken

Represents reusable visual values.

| Token group | Purpose |
|-------------|---------|
| `brand` | Purple, neon green, logo glow, accent surfaces |
| `surface` | Page background, card, raised card, sidebar, modal, input |
| `text` | Primary, secondary, muted, disabled |
| `status` | Success, warning, error, info, pending, review, refund |
| `border` | Default, subtle, active, danger, success |
| `shadow` | Low, medium, glow, modal |
| `motion` | Duration and reduced-motion behavior |

## PageSurface

Represents a UI surface affected by the redesign.

| Surface | Examples | Redesign rule |
|---------|----------|---------------|
| Shell | Dashboard background, page container | Brand background, no visual clutter |
| Sidebar | Logo, navigation, active state, footer | Strong brand identity, stable navigation |
| Header | Page title, controls, language switcher | Clear controls and consistent spacing |
| Card | Stats, forms, summaries | 8px or consistent radius unless existing system requires otherwise |
| Table | History, transactions, users, reviews | Highest readability priority |
| Modal/Dialog | Forms, confirmations | Clear hierarchy, no image-heavy backgrounds |
| Empty State | No data, pending review empty list | Limited robot/icon use allowed |

## StatusSemantic

Business states that must remain visually distinct.

| Status | Required visual behavior |
|--------|--------------------------|
| Completed/Success | Clear green success, not only decorative glow |
| Failed/Error | Red/danger remains dominant |
| Pending | Neutral/amber/blue pending, not confused with success |
| Review Required | Warning amber/yellow stronger than decorative purple |
| Refunded | Distinct info/blue or agreed refund style |
| Cancelled | Muted/neutral with readable label |

## VisualQASnapshot

Represents a manual verification target.

| Field | Example |
|-------|---------|
| `role` | `ADMIN`, `MANAGER`, `AGENT`, `USER` |
| `language` | `ar`, `en` |
| `viewport` | `390x844`, `768x1024`, `1440x900`, wide desktop |
| `page` | `/dashboard/admin/financial-review` |
| `result` | Pass/fail plus note |

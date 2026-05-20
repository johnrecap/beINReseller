# Data Model: Announcement Media, Slider, and News Ticker

## Existing Entity: AnnouncementBanner

The existing model remains the parent announcement/campaign record.

### Existing Fields Kept

- `id`
- `message`
- `imageUrl`
- `imageAlt`
- `isActive`
- `animationType`
- `colors`
- `textSize`
- `position`
- `isDismissable`
- `startDate`
- `endDate`
- `createdAt`
- `updatedAt`

### New Fields

| Field | Type | Default | Purpose |
|---|---|---:|---|
| `displayMode` | String | `banner` | Controls `banner`, `slider`, or `mixed` display |
| `imageFit` | String | `cover` | Controls image fit for legacy/main image |
| `imageAspectRatio` | String | `4:1` | Documents expected main banner aspect |
| `sliderEnabled` | Boolean | `false` | Enables slide rendering |
| `sliderAutoplay` | Boolean | `false` | Enables automatic slide advance |
| `sliderIntervalMs` | Int | `5000` | Autoplay interval |
| `sliderCardsDesktop` | Int | `3` | Cards visible on desktop |
| `sliderCardsTablet` | Int | `2` | Cards visible on tablet |
| `sliderCardsMobile` | Int | `1` | Cards visible on mobile |
| `tickerEnabled` | Boolean | `false` | Shows or hides ticker |
| `tickerText` | String? | `null` | Ticker text |
| `tickerSpeed` | String | `normal` | `slow`, `normal`, or `fast` |
| `tickerDirection` | String | `auto` | `auto`, `rtl`, or `ltr` |
| `tickerPosition` | String | `below` | `top`, `below`, or `bottom` relative to announcement |
| `tickerBackgroundColor` | String | `#111827` | Ticker background |
| `tickerTextColor` | String | `#ffffff` | Ticker text color |
| `dismissalVersion` | Int | `1` | Lets updated banners reappear after prior dismissal |

## New Entity: AnnouncementSlide

Represents one image card in an announcement slider.

| Field | Type | Required | Purpose |
|---|---|---:|---|
| `id` | String | Yes | Unique slide id |
| `bannerId` | String | Yes | Parent announcement id |
| `imageUrl` | String | Yes | Uploaded image URL |
| `imageAlt` | String? | No | Accessibility description |
| `title` | String? | No | Optional card title |
| `description` | String? | No | Optional card body |
| `linkLabel` | String? | No | Optional button/link label |
| `linkUrl` | String? | No | Optional safe link |
| `sortOrder` | Int | Yes | Display order |
| `isActive` | Boolean | Yes | Whether public users can see it |
| `imageFit` | String | Yes | `cover` or `contain` |
| `createdAt` | DateTime | Yes | Creation time |
| `updatedAt` | DateTime | Yes | Last update time |

### Relations

- `AnnouncementBanner` has many `AnnouncementSlide`.
- `AnnouncementSlide.bannerId` references `AnnouncementBanner.id`.
- Delete behavior should remove slides when the parent banner is deleted.

### Indexes

- `AnnouncementSlide.bannerId`
- `AnnouncementSlide.bannerId, sortOrder`
- `AnnouncementSlide.bannerId, isActive, sortOrder`

## DTOs

### AdminAnnouncementDTO

Contains:

- Full banner fields.
- All slides, including disabled slides.
- Ticker settings.
- Schedule fields.
- Audit timestamps.

### PublicAnnouncementDTO

Contains only:

- Safe banner display fields.
- Active schedule-compatible content.
- Active slides only.
- Ticker settings only when ticker is enabled.
- No admin-only metadata.

## Backward Compatibility Rules

1. If `slides` is empty and `imageUrl` exists, render legacy image.
2. If `slides` has active items and `sliderEnabled` is true, render slider.
3. If `tickerEnabled` is false, do not render ticker even if `tickerText` exists.
4. Existing records default to `displayMode = banner`, `sliderEnabled = false`, and `tickerEnabled = false`.
5. No existing announcement is deleted by the migration.

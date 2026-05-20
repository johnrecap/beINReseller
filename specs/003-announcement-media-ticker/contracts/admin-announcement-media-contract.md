# API Contracts: Announcement Media, Slider, and News Ticker

## Admin: List Announcements

`GET /api/admin/announcement`

### Response

```json
{
  "announcements": [
    {
      "id": "banner_id",
      "message": "Main message",
      "imageUrl": "/uploads/announcement/example.webp",
      "imageAlt": "Promotion image",
      "isActive": true,
      "displayMode": "mixed",
      "sliderEnabled": true,
      "sliderAutoplay": true,
      "sliderIntervalMs": 5000,
      "tickerEnabled": true,
      "tickerText": "Breaking news style text",
      "tickerSpeed": "normal",
      "tickerDirection": "rtl",
      "tickerPosition": "below",
      "isDismissable": true,
      "dismissalVersion": 1,
      "slides": [
        {
          "id": "slide_id",
          "imageUrl": "/uploads/announcement/slide.webp",
          "imageAlt": "Slide alt text",
          "title": "Slide title",
          "description": "Slide description",
          "linkLabel": "Open",
          "linkUrl": "/dashboard",
          "sortOrder": 1,
          "isActive": true,
          "imageFit": "cover"
        }
      ]
    }
  ]
}
```

## Admin: Create Announcement

`POST /api/admin/announcement`

### Request

```json
{
  "message": "Main announcement text",
  "imageUrl": "/uploads/announcement/main.webp",
  "imageAlt": "Main image alt",
  "isActive": false,
  "displayMode": "mixed",
  "imageFit": "cover",
  "sliderEnabled": true,
  "sliderAutoplay": false,
  "sliderIntervalMs": 5000,
  "tickerEnabled": true,
  "tickerText": "Ticker text",
  "tickerSpeed": "normal",
  "tickerDirection": "auto",
  "tickerPosition": "below",
  "tickerBackgroundColor": "#111827",
  "tickerTextColor": "#ffffff",
  "isDismissable": true,
  "startDate": null,
  "endDate": null,
  "slides": [
    {
      "imageUrl": "/uploads/announcement/slide-1.webp",
      "imageAlt": "Slide one",
      "title": "Optional title",
      "description": "Optional description",
      "linkLabel": "Optional label",
      "linkUrl": "/dashboard",
      "sortOrder": 1,
      "isActive": true,
      "imageFit": "cover"
    }
  ]
}
```

### Validation

- `message` is optional only if at least one image or ticker text exists.
- `slides` maximum should be configurable; first version target is at least 20.
- `linkUrl` must be relative internal path or HTTPS URL.
- `tickerText` is required when `tickerEnabled` is true.
- `sliderIntervalMs` must be between 3000 and 15000.
- Color values must be valid hex colors.

## Admin: Update Announcement

`PUT /api/admin/announcement/:id`

Uses the same payload shape as create. The server validates the full payload before applying changes. Slide replacement/reordering must happen in a database transaction.

## Admin: Toggle Announcement

`PATCH /api/admin/announcement/:id`

### Request

```json
{
  "isActive": true
}
```

### Rule

Toggling active state must not delete slides or ticker settings.

## Admin: Delete Announcement

`DELETE /api/admin/announcement/:id`

### Rule

Deleting an announcement deletes its slides. Uploaded files may be cleaned up only if the existing file cleanup pattern already supports safe deletion.

## Public: Active Announcement

`GET /api/announcement/active`

### Response

```json
{
  "announcement": {
    "id": "banner_id",
    "message": "Main announcement text",
    "imageUrl": "/uploads/announcement/main.webp",
    "imageAlt": "Main image alt",
    "displayMode": "mixed",
    "imageFit": "cover",
    "sliderEnabled": true,
    "sliderAutoplay": false,
    "sliderIntervalMs": 5000,
    "ticker": {
      "enabled": true,
      "text": "Ticker text",
      "speed": "normal",
      "direction": "auto",
      "position": "below",
      "backgroundColor": "#111827",
      "textColor": "#ffffff"
    },
    "isDismissable": true,
    "dismissalVersion": 1,
    "slides": [
      {
        "id": "slide_id",
        "imageUrl": "/uploads/announcement/slide-1.webp",
        "imageAlt": "Slide one",
        "title": "Optional title",
        "description": "Optional description",
        "linkLabel": "Optional label",
        "linkUrl": "/dashboard",
        "sortOrder": 1,
        "imageFit": "cover"
      }
    ]
  }
}
```

### Public Safety Rules

- Disabled slides are excluded.
- Admin timestamps are excluded unless already publicly needed.
- Unsafe links are excluded or rejected before save.
- Ticker object is `null` or disabled when ticker is off.

## Upload: Announcement Media

`POST /api/admin/upload`

### Request

Multipart form-data:

- `file`
- `type=announcement`
- `purpose=main` or `purpose=slide`

### Response

```json
{
  "url": "/uploads/announcements/example.webp",
  "width": 1200,
  "height": 675,
  "size": 220000,
  "mimeType": "image/webp",
  "purpose": "slide",
  "dimensionStatus": "recommended"
}
```

### Rules

- Main image minimum: 1200x300.
- Slide image minimum: 800x450.
- File size maximum follows the current upload policy unless explicitly changed.
- Unsupported MIME types are rejected.

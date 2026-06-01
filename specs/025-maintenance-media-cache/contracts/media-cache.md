# Contract: Public Media Cache

## Public Uploaded Image

**Endpoint**: `GET /api/uploads/{folder}/{filename}`

**Access**: Public.

**Allowed folders**:

- `products`
- `categories`
- `announcements`

**Allowed file types**:

- JPEG
- PNG
- WebP
- GIF

**Rejected file types**:

- SVG
- Any unsupported extension
- Any path escaping `public/uploads`

**Successful response headers**:

- `Content-Type`: detected safe image MIME type.
- `Content-Length`: exact byte length.
- `Cache-Control`: long public immutable cache for generated upload URLs.
- `ETag`: validator for current file.
- `Last-Modified`: file modification date.
- `X-Content-Type-Options`: `nosniff`.

**Not-modified behavior**:

- If request validators match the current file, return not modified without a file body.
- Prefer stat/metadata before reading full file bytes.

## Static Brand Images

**Path**: `/images/*`

**Expected behavior**:

- Must not inherit blanket `no-store`.
- Must use moderate public cache because filenames are not guaranteed versioned.
- Must be manually verified in browser navigation with DevTools cache enabled.

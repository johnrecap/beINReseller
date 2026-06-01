# Contract: Image Upload Validation

## Admin Upload

**Endpoint**: `POST /api/admin/upload`

**Access**: ADMIN only.

**Accepted public image types**:

- JPEG
- PNG
- WebP
- GIF

**Validation requirements**:

- Detect image type from bytes, not only from `file.type` or filename.
- Reject SVG even if a client claims another MIME type.
- Reject unsupported bytes or mismatched claimed type.
- Enforce max file size.
- Validate dimensions for announcement purpose using existing dimension rules.
- Derive saved extension from detected type.
- Generate a unique filename and retry if the path exists.
- Never overwrite an existing public upload URL.

## Delete Upload

**Endpoint**: `DELETE /api/admin/upload?url=/uploads/...`

**Access**: ADMIN only.

**Expected behavior**:

- Preserve current path traversal protections.
- Deleting a public image does not guarantee removal from browser caches.
- Deleted public images must no longer be referenced by current app data.

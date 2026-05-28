# Data Model: Bulk Proxy Import

## Existing Entity: Proxy

Relevant fields:

- `id`
- `host`
- `port`
- `username`
- `password`
- `label`
- `isActive`
- `lastTestedAt`
- `lastIp`
- `responseTimeMs`
- `failureCount`
- `createdAt`
- `updatedAt`

Rules:

- `host + port` must remain unique.
- `password` is stored encrypted.
- API responses expose `hasPassword`, not plaintext password.

## New Internal Entity: ProxyImportRow

Represents one non-blank pasted line.

Fields:

- `lineNumber`
- `rawLine`
- `host`
- `port`
- `username`
- `password`

Validation:

- Host is required and must use safe hostname/IP characters.
- Port is required and must be a number from 1 to 65535.
- Username and password must both be present or both absent.
- Rows with unsupported field counts are invalid.

## New Internal Entity: ProxyImportPreview

Represents parser output before persistence.

Fields:

- `totalLines`
- `blankLines`
- `validRows`
- `invalidRows`
- `duplicateRows`
- `nextLabelStart`

Rules:

- Duplicate rows are detected against existing `host + port` records and earlier rows in the same pasted input.
- Invalid and duplicate rows include row numbers and user-facing reasons.

## New Internal Entity: ProxyImportResult

Represents save output after persistence.

Fields:

- `totalLines`
- `importedCount`
- `skippedDuplicateCount`
- `invalidCount`
- `createdProxies`
- `errors`

Rules:

- Only valid non-duplicate rows are saved.
- Saved rows receive labels in sequential order.
- Failed DB uniqueness race conditions are reported without exposing secrets.

## State Transitions

1. Pasted text -> parsed rows.
2. Parsed rows -> classified preview.
3. Confirm import -> saved proxy records.
4. Saved proxy records -> visible in existing proxy table.

## No Schema Changes

The existing `proxies` table supports all required fields. No migration is expected.

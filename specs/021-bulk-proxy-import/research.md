# Research: Bulk Proxy Import

## Decision 1: Use textarea paste import first

**Decision**: Build the first version around a textarea paste dialog instead of direct file upload.

**Rationale**: The user's provider data is plain text, and paste import avoids file encoding, upload size, and browser file handling issues. It is faster to implement and easier to preview.

**Alternatives considered**:

- File upload: rejected for v1 because it adds file parsing and encoding concerns without improving the admin's immediate workflow.
- Keep manual one-by-one add: rejected because it does not solve the operational pain.

## Decision 2: Parser supports `host:port:username:password`

**Decision**: The parser accepts Webshare-style authenticated proxy rows in `host:port:username:password` format and may also accept `host:port` rows for unauthenticated proxies.

**Rationale**: The provided sample file uses `host:port:username:password`, while existing manual proxy creation supports both authenticated and unauthenticated proxies.

**Alternatives considered**:

- Only authenticated rows: rejected because it would be stricter than existing manual behavior.
- Free-form parsing of every possible proxy URL format: rejected as unnecessary for v1 and riskier.

## Decision 3: Add a dedicated parser/import service

**Decision**: Put parsing, validation, duplicate classification, and label calculation in a shared server library.

**Rationale**: This keeps API code thin and makes the risky logic testable without a browser or database-heavy setup.

**Alternatives considered**:

- Put parsing in the React page: rejected because the server must be authoritative and protect secrets.
- Put all logic directly in the API route: rejected because it would be harder to test and maintain.

## Decision 4: Auto-label using existing Arabic prefix

**Decision**: Imported proxies are labeled `بروكسي N`, where `N` starts after the highest existing matching label.

**Rationale**: The user asked for automatic names like `بروكسي 1`, `بروكسي 2`, `بروكسي 3`, and continuing existing numbering prevents duplicate labels.

**Alternatives considered**:

- Ask for label per row: rejected because it recreates manual work.
- Use host as label: rejected because it is less readable and can expose provider-specific details in UI labels.

## Decision 5: Skip duplicates and report them

**Decision**: Duplicate `host + port` rows are skipped, not updated.

**Rationale**: Existing single add rejects duplicates. Skipping duplicates lets valid new rows import successfully while preserving existing records.

**Alternatives considered**:

- Update existing proxies from imports: rejected because it can silently change credentials for proxies already linked to accounts.
- Fail entire import on first duplicate: rejected because it makes bulk import frustrating.

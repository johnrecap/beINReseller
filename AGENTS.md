# Encoding Safety Rules

These rules are mandatory for all automated edits in this repository.

1. Never rewrite source files using risky PowerShell text APIs:
- Do not use `Set-Content`, `Out-File`, or `[System.IO.File]::WriteAllText` for code edits.
- Do not run any codepage conversion (for example `Encoding.GetEncoding(...).GetBytes(...)` on file text).

2. Preferred edit method:
- Use `apply_patch` for manual edits.
- If a scripted edit is required, preserve original bytes/encoding and do not change encoding format.

3. BOM safety:
- Do not add UTF-8 BOM to existing files.
- If a file did not start with BOM, it must remain BOM-free after edits.

4. Unicode/mojibake safety check after edits:
- Verify no mojibake patterns were introduced (examples: `â`, `ï؟½`, `Ã`, `Â` in logs/comments/strings unless intentionally present).

5. Scope safety:
- Make minimal diffs only.
- Never perform full-file rewrites unless explicitly requested by the user.


# Requirements Checklist: Eid Rewards

**Feature**: `016-eid-rewards`

## Completeness

- [x] Target stack identified: Next.js, React, Prisma, PostgreSQL, NextAuth.
- [x] Existing balance source identified: `users.balance`.
- [x] Existing point source identified: `point_ledger_entries`.
- [x] Existing conversion settings identified: `point_program_settings`.
- [x] Existing conversion audit identified: `point_cash_redemptions` and `transactions`.
- [x] User role scope clarified: all roles.
- [x] Currency clarified: current site currency.
- [x] Popup location clarified: main dashboard only.
- [x] Admin location clarified: standalone page.
- [x] Lottie handling clarified: track existing files and fallback to CSS.

## Security

- [x] Frontend never chooses points.
- [x] Public API does not expose weights.
- [x] Claim endpoint requires auth and rate limit.
- [x] Admin endpoints require exact admin role.
- [x] Claim uniqueness is database-enforced.
- [x] IP and user agent are recorded.
- [x] No secrets or provider runtime data are exposed.

## Accounting

- [x] Claim writes `EidRewardClaim`.
- [x] Claim writes positive `PointLedgerEntry`.
- [x] Redeem writes negative `PointLedgerEntry`.
- [x] Redeem writes `PointCashRedemption`.
- [x] Redeem writes `Transaction`.
- [x] Redeem updates `User.balance`.

## Open Risks To Handle During Implementation

- [ ] Existing point summary must be updated to count `EID_REWARD` as available earned points.
- [ ] Existing generic point redemption excludes `ADMIN`; Eid flow must support admin conversion safely.
- [ ] Prisma enum migration must be production-safe.
- [ ] Full repo lint has known pre-existing failures; use focused lint plus build unless broader lint is separately fixed.

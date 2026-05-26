# UI Contract: Admin Report Center

## Route

`GET /dashboard/admin/reports`

## Access

Admin only. Non-admin users must be redirected or blocked using the same behavior as the current admin report pages.

## Query Parameters

| Name | Required | Example | Behavior |
|------|----------|---------|----------|
| `tab` | No | `bein-spend` | Selects the active tab. Unknown values fall back to `analytics`. |

## Required Tabs

| Key | Label | Legacy Route |
|-----|-------|--------------|
| `analytics` | Analytics | `/dashboard/admin/analytics` |
| `activity` | Activity Monitoring | `/dashboard/admin/users/activity` |
| `integrity` | Integrity Reports | `/dashboard/admin/reports/integrity` |
| `bein-spend` | beIN Spend Report | `/dashboard/admin/reports/bein-spend` |
| `login-monitor` | Account Login Monitor | `/dashboard/admin/bein-accounts/login-failures` |
| `balance-monitor` | Balance Alert Monitor | `/dashboard/admin/bein-accounts/low-balance` |
| `logs` | Activity Logs | `/dashboard/admin/logs` |

## Visibility Rules

- `login-monitor` is visible only when the existing login failure sidebar setting is enabled.
- `balance-monitor` is visible only when the existing low balance sidebar setting is enabled.
- All other tabs are visible to admins.

## Loading Behavior

- Initial page load renders only the selected tab.
- Switching tabs shows a loading state for the selected tab if its panel is still loading.
- A failed tab shows an error area inside the tab without unmounting the report center.

## Backward Compatibility

All legacy routes must continue to load. The first release must not delete old pages or old API endpoints.

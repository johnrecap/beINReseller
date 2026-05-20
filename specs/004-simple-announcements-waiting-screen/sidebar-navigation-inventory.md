# Sidebar Navigation Inventory

This inventory captures the current production sidebar content that must be preserved during the exact Stitch visual refresh.

## Source

- `src/components/layout/Sidebar.tsx`
- Current path source: `usePathname()`
- Current role source: `useSession()`
- Translation source: `useTranslation()`
- Renewal permission source: `canAccessSubscription(userRole)`
- Admin visibility source: `/api/admin/sidebar-settings`

## Global Behavior to Preserve

- Sidebar opens/closes through `isOpen` and `onClose`.
- Mobile overlay closes the sidebar when clicked.
- RTL layout places the sidebar on the right.
- LTR layout places the sidebar on the left.
- Loading state shows a skeleton.
- Logout uses `signOut({ callbackUrl: '/login' })`.
- Active route highlighting uses exact match for reseller links and exact-or-child match for manager/admin links.

## Reseller Menu

Always visible to authenticated users:

| Route | Label Source | Icon |
|---|---|---|
| `/dashboard` | `t.sidebar.home` | `Home` |

Visible only when `canAccessSubscription(userRole)` is true:

| Route | Label Source | Icon |
|---|---|---|
| `/dashboard/renew` | `t.bulk?.interactiveRenewal || 'Interactive Renewal'` | `Sparkles` |
| `/dashboard/operations/active` | `t.operations?.activeOperations || 'Active Operations'` | `Loader2` |
| `/dashboard/history` | `t.sidebar.history` | `History` |

Always visible common links:

| Route | Label Source | Icon |
|---|---|---|
| `/dashboard/transactions` | `t.sidebar.transactions` | `CreditCard` |
| `/dashboard/profile` | `t.sidebar.profile` | `User` |

## Manager Menu

Visible only when role is `MANAGER`:

| Route | Label Source | Icon |
|---|---|---|
| `/dashboard/manager` | `t.sidebar.managerPanel` | `BarChart3` |
| `/dashboard/manager/users` | `t.sidebar.manageUsers` | `Users` |
| `/dashboard/manager/deleted-users` | `t.sidebar.deletedAccounts` | `Trash2` |

## Admin Menu

Visible only when role is `ADMIN`:

| Route | Label Source | Icon | Visibility |
|---|---|---|---|
| `/dashboard/admin` | `t.sidebar.mainMenu` | `Home` | Always |
| `/dashboard/admin/users` | `t.sidebar.users` | `Users` | Always |
| `/dashboard/admin/users/activity` | `t.sidebar.activityMonitoring || 'Activity Monitoring'` | `Activity` | Always |
| `/dashboard/admin/deleted-users` | `t.sidebar.deletedAccounts` | `Trash2` | Always |
| `/dashboard/admin/bein-accounts` | `t.sidebar.beinAccounts` | `Users` | Always |
| `/dashboard/admin/bein-accounts/login-failures` | `'Account Login Monitor'` | `AlertTriangle` | `sidebar_show_login_failures` |
| `/dashboard/admin/bein-accounts/low-balance` | `'Balance Alert Monitor'` | `DollarSign` | `sidebar_show_low_balance` |
| `/dashboard/admin/proxies` | `t.sidebar.proxyManagement` | `Globe` | Always |
| `/dashboard/admin/analytics` | `t.sidebar.analytics` | `BarChart3` | Always |
| `/dashboard/admin/reports/integrity` | `t.sidebar.integrityReports || 'Integrity Reports'` | `AlertTriangle` | Always |
| `/dashboard/admin/reports/bein-spend` | `t.sidebar.beinSpendReport || 'beIN Spend Report'` | `WalletCards` | Always |
| `/dashboard/admin/bein-config` | `t.sidebar.beinConfig` | `Bot` | Always |
| `/dashboard/admin/settings` | `t.sidebar.settings` | `Settings` | Always |
| `/dashboard/admin/settings/announcements` | `t.sidebar.announcements || 'Announcements'` | `Megaphone` | Always |
| `/dashboard/admin/logs` | `t.sidebar.logs` | `FileText` | Always |

## Footer

The footer must keep:

- User avatar/icon.
- `session?.user?.username`.
- `session?.user?.role?.toLowerCase() || 'User'`.
- Logout button label: `t.common.logout || 'Logout'`.
- Existing logout action.

## Exact Stitch Refresh Rules

- Visual styling must match the Stitch sidebar exactly.
- Spacing, active item treatment, hover state, status indicator, and footer treatment must match Stitch exactly.
- Link content, route destinations, permissions, and visibility settings must not change.
- Do not add Stitch placeholder items such as `CORE ENGINE`, `Maintenance`, `Operations`, `Emergency Stop`, or `Support` as production links.
- Replace Stitch placeholder navigation content with the production links above inside the same Stitch visual shell.

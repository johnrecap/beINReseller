# Quickstart: Future Implementation And Validation

This quickstart is for the later implementation phase. It is not meant to run during planning.

## 1. Confirm Owner Choices

Read [user-actions.md](./user-actions.md) and confirm:

- Primary full logo.
- Square icon/favicon.
- Login/dashboard hero banner.
- Whether the app is dark-only or dark-first with light fallback.
- Which robot images are approved for login/empty states.

## 2. Prepare Assets

Create a stable public asset folder:

```powershell
New-Item -ItemType Directory -Force -Path public\images\brand
```

Copy only approved images from:

```text
E:\work\panel_bien_sport\photos 1
```

Recommended target names:

```text
public/images/brand/logo-full.png
public/images/brand/logo-icon.png
public/images/brand/login-hero.png
public/images/brand/dashboard-hero.png
public/images/brand/bot-empty-state.png
public/images/brand/icon-wallet.png
public/images/brand/icon-rewards.png
```

Optimize/rescale before production use. Avoid shipping every source image.

## 3. Implement In Safe Order

1. Update `src/styles/tokens.css`.
2. Update Tailwind/CSS variables in `src/app/globals.css`.
3. Update `src/components/brand/BrandLogo.tsx`.
4. Update shell components: `DashboardShell`, `Header`, `Sidebar`.
5. Update shared UI primitives.
6. Update page groups by priority: login, dashboards, financial/review/history, renewal, settings, points/rewards.

## 4. Validate Locally

Run:

```powershell
npm run lint
npm run build
```

Then start the app:

```powershell
npm run dev
```

## 5. Visual QA Matrix

Check these roles:

- ADMIN
- MANAGER
- AGENT
- USER

Check these languages:

- Arabic RTL
- English LTR

Check these viewport widths:

- 390px mobile
- 768px tablet
- 1440px desktop
- Wide desktop

Check these pages:

- `/login`
- `/dashboard`
- `/dashboard/admin`
- `/dashboard/admin/users`
- `/dashboard/admin/financial-review`
- `/dashboard/admin/credit-requests`
- `/dashboard/admin/points`
- `/dashboard/admin/rewards`
- `/dashboard/history`
- `/dashboard/transactions`
- `/dashboard/renew`
- `/dashboard/manager`
- `/dashboard/agent`

## 6. Final Safety Checks

Before finishing implementation:

```powershell
git diff --check
rg "<repo-mojibake-patterns-from-AGENTS>" src public specs
```

Confirm:

- No business logic files changed unless explicitly required.
- No missing images.
- No text overlap.
- No status color confusion.
- No full-file rewrites of unrelated files.

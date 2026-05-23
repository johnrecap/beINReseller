# What I Need From You Before Implementation

This file lists the owner decisions needed before the redesign is implemented.

## 1. Choose The Main Logo

Pick one full logo for the sidebar/login/header.

Recommended candidates:

- `E:\work\panel_bien_sport\photos 1\logo\1-3.png`
- `E:\work\panel_bien_sport\photos 1\logo\2-3.png`
- `E:\work\panel_bien_sport\photos 1\1.png`
- Existing fallback: `public\images\desh-panel-brand.jpeg`

Needed from you: tell me which one is the official full logo.

## 2. Choose The Square Icon

Pick one square icon for favicon/collapsed usage.

Recommended candidates:

- `E:\work\panel_bien_sport\photos 1\3.png`
- `E:\work\panel_bien_sport\photos 1\10.png`
- Any square file from `E:\work\panel_bien_sport\photos 1\logo`

Needed from you: tell me which one should represent the panel as an icon.

## 3. Choose The Login/Dashboard Banner

Recommended candidates:

- `E:\work\panel_bien_sport\photos 1\banner\2-1.png`
- `E:\work\panel_bien_sport\photos 1\banner\3-1.png`
- `E:\work\panel_bien_sport\photos 1\banner\4-1.png`
- `E:\work\panel_bien_sport\photos 1\7.png`

Needed from you: choose one primary banner and one backup.

## 4. Confirm Robot Usage

Recommended usage:

- Login visual: one robot image maximum.
- Empty states: small robot or icon only.
- Tables/forms: no robot art.

Needed from you: confirm if robots are allowed only in login/empty states, or if you want them on dashboard cards too.

## 5. Confirm Theme Mode

Recommended:

- Dark-first theme.
- Keep light mode technically safe but not the visual priority.

Needed from you: confirm whether the panel should be dark-only or dark-first with light fallback.

## 6. Confirm Text Direction Priority

Recommended:

- Arabic RTL is primary.
- English LTR remains supported.

Needed from you: confirm if Arabic is the main design target.

## 7. Approve Screenshot Review

Before deployment, review screenshots for:

- Login page.
- Main dashboard.
- Admin dashboard.
- Financial review.
- Transactions.
- Renewal flow.
- Mobile sidebar.

Needed from you: approve or request edits before production deployment.

## 8. Deployment Note

After implementation, the server will need:

- Pull latest branch.
- Install/build if dependencies change.
- Restart app.
- Clear browser/CDN cache if old images remain visible.

Needed from you: confirm deployment timing so users are not interrupted during active operations.

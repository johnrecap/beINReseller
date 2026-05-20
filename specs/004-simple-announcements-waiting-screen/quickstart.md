# Quickstart: Simple Announcements and Waiting Screen

## Review the Mockup

1. Open `docs/mockups/simple-announcements-waiting-screen.html` in a browser.
2. Click "Choose images".
3. Select several images.
4. Reorder images with the left/right controls.
5. Toggle ticker on.
6. Edit ticker text.
7. Change ticker corner style.
8. Switch between desktop and mobile preview.
9. Open the waiting screen preview section.
10. Set the pause duration to hours or days and apply the timer.

Expected result:

- Image cards remain readable.
- Public preview order matches admin order.
- Ticker settings are reflected instantly.
- Waiting screen matches the Stitch maintenance design exactly.
- Waiting screen copy clearly fits a paused renewal/check operation flow.
- Countdown displays days, hours, minutes, and seconds.

## Review Stitch Alignment

1. Open `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/admin_settings_panel/screen.png`.
2. Open `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/announcement_widget/screen.png`.
3. Open `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/maintenance_screen/screen.png`.
4. Read `E:/work/panel_bien_sport/project/stitch_desh_panel_dashboard_ui/hyper_lattice_tech/DESIGN.md`.

Expected result:

- Admin settings match the Stitch admin settings design exactly.
- Announcement display matches the Stitch stacked-card widget exactly.
- Waiting screen matches the Stitch centered countdown screen exactly.
- Sidebar matches the Stitch side rail/active-state design exactly while preserving production links.
- Placeholder Stitch navigation text is replaced with production navigation text only; the visual layout stays exact.
- `specs/004-simple-announcements-waiting-screen/sidebar-navigation-inventory.md` matches the current production sidebar before styling work starts.

## Implementation Validation Later

After production implementation, validate in a staging environment:

1. Create a test announcement with one image.
2. Create a test announcement with 10 images.
3. Verify public display on desktop and mobile.
4. Enable ticker and verify no layout overlap.
5. Disable ticker and verify no empty reserved area.
6. Enable maintenance mode or a controlled operation-pause setting and verify the waiting screen.
7. Set a pause duration in hours and verify the countdown.
8. Set a pause duration in days and verify the countdown.
9. Verify no new operation is created when the relevant flow is paused.
10. Validate sidebar navigation as admin, manager, and normal user.
11. Toggle admin sidebar settings for login failure and low balance links and verify hidden links stay hidden.
12. Validate sidebar desktop, mobile, RTL, LTR, active route, close button, and logout behavior.
13. Disable maintenance/pause mode and verify normal routes return.

## Rollback Check

1. Disable simplified display feature flag if available.
2. Confirm legacy banner still renders.
3. Revert only sidebar visual styling if navigation behavior regresses.
4. Confirm no operation, balance, renewal, verification, or worker data changed.

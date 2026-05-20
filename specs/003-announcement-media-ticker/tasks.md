# Tasks: Announcement Media, Slider, and News Ticker

**Input**: `specs/003-announcement-media-ticker/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/admin-announcement-media-contract.md`

## Phase 1: Setup and Baseline

**Goal**: Understand the existing feature and create a safe baseline without changing production behavior.

- [x] T001 Review the current admin form in `src/components/admin/AnnouncementSettings.tsx` and document every field currently saved.
- [x] T002 Review the current public renderer in `src/components/announcements/AnnouncementBannerView.tsx` and record current layout behavior.
- [x] T003 Review `src/components/AnnouncementBanner.tsx` and confirm how public active announcement data is fetched.
- [x] T004 Review `src/lib/announcement/schema.ts` and list current validation rules.
- [x] T005 Review `src/lib/announcement/constants.ts` and list current animation/color/text-size options.
- [x] T006 Review `src/lib/announcement/helpers.ts` and list current helper responsibilities.
- [x] T007 Review `src/app/api/admin/announcement/route.ts` and document create/list behavior.
- [x] T008 Review `src/app/api/admin/announcement/[id]/route.ts` and document update/toggle/delete behavior.
- [x] T009 Review `src/app/api/announcement/active/route.ts` and document public response shape.
- [x] T010 Review `src/components/ui/ImageUpload.tsx` and document current upload validation.
- [x] T011 Review `src/app/api/admin/upload/route.ts` and document current file validation and response.
- [x] T012 Confirm no implementation task in this feature requires changes to renewal, verification, refund, balance, worker, queue, or beIN ledger files.

---

## Phase 2: Foundational Tests and Contracts

**Goal**: Define tests/simulations before implementing behavior.

- [x] T013 Create `scripts/announcement-media-ticker-simulations.ts` with simulation cases for legacy banner fallback.
- [x] T014 Add simulation case for active slide sorting.
- [x] T015 Add simulation case proving disabled slides are excluded from public DTO.
- [x] T016 Add simulation case proving unsafe slide links are rejected.
- [x] T017 Add simulation case proving ticker disabled state hides ticker output.
- [x] T018 Add simulation case proving ticker enabled state returns ticker output.
- [x] T019 Add simulation case for main banner image dimension rules.
- [x] T020 Add simulation case for slider image dimension rules.
- [x] T021 Add simulation case proving full validation failure leaves existing banner payload unchanged.
- [x] T022 Ensure simulations can run without a live production database.

---

## Phase 3: Database Model

**Goal**: Add storage for slider and ticker without breaking existing records.

- [x] T023 Add new optional announcement display fields to `prisma/schema.prisma`.
- [x] T024 Add new ticker fields to `prisma/schema.prisma`.
- [x] T025 Add new dismissal version field to `prisma/schema.prisma`.
- [x] T026 Add `AnnouncementSlide` model to `prisma/schema.prisma`.
- [x] T027 Add relation from `AnnouncementBanner` to `AnnouncementSlide` in `prisma/schema.prisma`.
- [x] T028 Add indexes for slide lookup and ordering in `prisma/schema.prisma`.
- [x] T029 Mirror the same schema changes in `worker/prisma/schema.prisma` if the worker build requires the copied schema.
- [x] T030 Create an additive Prisma migration under `prisma/migrations/`.
- [x] T031 Confirm migration does not delete, rename, or repurpose `AnnouncementBanner.imageUrl`.
- [x] T032 Confirm existing rows receive safe defaults for slider and ticker fields.

---

## Phase 4: Shared Validation and Helpers

**Goal**: Centralize the new rules before API/UI work.

- [x] T033 Extend `src/lib/announcement/schema.ts` with display mode validation.
- [x] T034 Extend `src/lib/announcement/schema.ts` with slider settings validation.
- [x] T035 Extend `src/lib/announcement/schema.ts` with ticker settings validation.
- [x] T036 Extend `src/lib/announcement/schema.ts` with slide validation.
- [x] T037 Add safe URL validation for slide links in `src/lib/announcement/schema.ts`.
- [x] T038 Add image dimension constants in `src/lib/announcement/constants.ts`.
- [x] T039 Add slider option constants in `src/lib/announcement/constants.ts`.
- [x] T040 Add ticker speed/direction/position constants in `src/lib/announcement/constants.ts`.
- [x] T041 Add helper to build public announcement DTO in `src/lib/announcement/helpers.ts`.
- [x] T042 Add helper to choose active slides or legacy image fallback in `src/lib/announcement/helpers.ts`.
- [x] T043 Add helper to validate image dimensions by purpose in `src/lib/announcement/helpers.ts`.
- [x] T044 Add helper to increment or compare dismissal version when content changes.

---

## Phase 5: Upload and Image Input

**Goal**: Make image uploads safer and clearer.

- [x] T045 Update `src/app/api/admin/upload/route.ts` to accept announcement media purpose.
- [x] T046 Update `src/app/api/admin/upload/route.ts` to return image metadata when available.
- [x] T047 Update `src/app/api/admin/upload/route.ts` to reject unsupported image types using the existing policy.
- [x] T048 Update `src/app/api/admin/upload/route.ts` to apply minimum dimension rules for main images and slide images.
- [x] T049 Update `src/components/ui/ImageUpload.tsx` to display recommended dimensions.
- [x] T050 Update `src/components/ui/ImageUpload.tsx` to show dimension warnings or errors.
- [x] T051 Update `src/components/ui/ImageUpload.tsx` to avoid changing existing callers that do not pass announcement purpose.

---

## Phase 6: Admin API

**Goal**: Save and return banners, slides, and ticker settings safely.

- [x] T052 Update `src/app/api/admin/announcement/route.ts` GET response to include slides for admin users.
- [x] T053 Update `src/app/api/admin/announcement/route.ts` POST validation to accept new display, slider, and ticker fields.
- [x] T054 Update `src/app/api/admin/announcement/route.ts` POST behavior to create slides in order.
- [x] T055 Ensure POST validates the whole payload before any database write.
- [x] T056 Update `src/app/api/admin/announcement/[id]/route.ts` GET response to include slides.
- [x] T057 Update `src/app/api/admin/announcement/[id]/route.ts` PUT validation to accept full new payload.
- [x] T058 Update `src/app/api/admin/announcement/[id]/route.ts` PUT behavior to update banner and slides in one transaction.
- [x] T059 Update `src/app/api/admin/announcement/[id]/route.ts` PATCH toggle behavior so active toggles do not remove slider/ticker settings.
- [x] T060 Update delete behavior to cascade or safely delete related slides.
- [x] T061 Add protection so invalid save attempts leave the previous live banner unchanged.

---

## Phase 7: Public API

**Goal**: Return safe customer-facing announcement data.

- [x] T062 Update `src/app/api/announcement/active/route.ts` to include active slides sorted by `sortOrder`.
- [x] T063 Update `src/app/api/announcement/active/route.ts` to exclude disabled slides.
- [x] T064 Update `src/app/api/announcement/active/route.ts` to include ticker only when enabled.
- [x] T065 Update `src/app/api/announcement/active/route.ts` to preserve legacy `imageUrl` fallback.
- [x] T066 Confirm public response excludes admin-only or unsafe fields.

---

## Phase 8: Admin UI

**Goal**: Give admins a clear editor for images, slides, ticker, and preview.

- [x] T067 Refactor `src/components/admin/AnnouncementSettings.tsx` into clear internal sections or child components.
- [x] T068 Add basic content section for message, active state, schedule, and position.
- [x] T069 Add main image section with dimension guidance.
- [x] T070 Add `isDismissable` toggle because the field already exists.
- [x] T071 Add slider section with enable toggle.
- [x] T072 Add slide creation UI.
- [x] T073 Add slide delete UI.
- [x] T074 Add slide enable/disable UI.
- [x] T075 Add slide reorder controls.
- [x] T076 Add slide title, description, alt text, link label, and link URL inputs.
- [x] T077 Add slider autoplay toggle.
- [x] T078 Add slider interval control with safe min/max.
- [x] T079 Add ticker section with enable toggle.
- [x] T080 Add ticker text input.
- [x] T081 Add ticker speed control.
- [x] T082 Add ticker direction control.
- [x] T083 Add ticker placement control.
- [x] T084 Add ticker color controls.
- [x] T085 Add desktop/tablet/mobile preview controls.
- [x] T086 Ensure admin form handles old records with missing new fields.
- [x] T087 Ensure save errors are shown clearly and do not clear unsaved slide input.

---

## Phase 9: Public Renderer

**Goal**: Show the improved announcement safely to customers.

- [x] T088 Update `src/components/announcements/AnnouncementBannerView.tsx` to render legacy single image fallback.
- [x] T089 Update `src/components/announcements/AnnouncementBannerView.tsx` to render slider cards when active slides exist.
- [x] T090 Add stable aspect-ratio containers for main and slide images.
- [x] T091 Add next/previous slider controls.
- [x] T092 Add optional autoplay behavior with pause on hover/focus.
- [x] T093 Add reduced motion handling for autoplay and ticker.
- [x] T094 Add ticker strip rendering independent from the main message.
- [x] T095 Add RTL/LTR/auto direction handling for ticker.
- [x] T096 Add dismissal behavior using banner id plus dismissal version.
- [x] T097 Update `src/components/AnnouncementBanner.tsx` only as needed for new public DTO shape.
- [x] T098 Update `src/app/globals.css` with ticker/slider animations while preserving existing classes.
- [x] T099 Verify layout at 360px, 768px, 1280px, and 1536px.

---

## Phase 10: Verification and Rollout

**Goal**: Prove the feature is safe before production.

- [x] T100 Run announcement simulations and fix failures.
- [x] T101 Run TypeScript type check.
- [x] T102 Run lint.
- [x] T103 Run production build.
- [ ] T104 Test with a local or staging copy of production announcement records.
- [x] T105 Confirm no financial, wallet, refund, renewal, verification, worker, queue, or beIN ledger files changed for this feature.
- [x] T106 Confirm migration rollback plan is documented.
- [ ] T107 Publish first with slider disabled and ticker disabled.
- [ ] T108 Enable one main image announcement.
- [ ] T109 Enable slider with a small number of slides.
- [ ] T110 Enable ticker last.

**Phase 10 status note**:

- T100-T103 passed locally on 2026-05-14.
- T102 means feature-scoped lint for announcement files. Full repository lint currently fails on unrelated pre-existing files outside this announcement feature.
- T104 and T107-T110 require a local/staging production database copy and real rollout access, so they remain manual production gates.
- T105 is scoped to this announcement feature. The wider working tree still contains unrelated financial/worker changes from other phases and should not be treated as an announcement-only release package.
- T106 is documented in `specs/003-announcement-media-ticker/production-rollout-gate.md`.

## Dependencies

- Phase 2 must be written before implementation changes so tests/simulations define expected behavior.
- Phase 3 must finish before API/UI can persist slides and ticker settings.
- Phase 4 must finish before API endpoints accept new payloads.
- Phase 6 must finish before Admin UI can save real data.
- Phase 7 and Phase 9 must be verified together.
- Phase 10 is required before production rollout.

## Parallel Work

These can be handled by separate people after Phase 3:

- Admin UI sections and preview.
- Public renderer and ticker.
- API validation and DTO helpers.
- Upload dimension validation.

Do not parallelize database schema edits unless ownership is clear.

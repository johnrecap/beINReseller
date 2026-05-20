ALTER TABLE "announcement_banners"
  ADD COLUMN IF NOT EXISTS "display_mode" TEXT NOT NULL DEFAULT 'banner',
  ADD COLUMN IF NOT EXISTS "image_fit" TEXT NOT NULL DEFAULT 'cover',
  ADD COLUMN IF NOT EXISTS "image_aspect_ratio" TEXT NOT NULL DEFAULT '4:1',
  ADD COLUMN IF NOT EXISTS "slider_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "slider_autoplay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "slider_interval_ms" INTEGER NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS "slider_cards_desktop" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "slider_cards_tablet" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "slider_cards_mobile" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "ticker_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ticker_text" TEXT,
  ADD COLUMN IF NOT EXISTS "ticker_speed" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "ticker_direction" TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "ticker_position" TEXT NOT NULL DEFAULT 'below',
  ADD COLUMN IF NOT EXISTS "ticker_background_color" TEXT NOT NULL DEFAULT '#111827',
  ADD COLUMN IF NOT EXISTS "ticker_text_color" TEXT NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS "dismissal_version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "announcement_slides" (
    "id" TEXT NOT NULL,
    "banner_id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "image_alt" TEXT,
    "title" TEXT,
    "description" TEXT,
    "link_label" TEXT,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "image_fit" TEXT NOT NULL DEFAULT 'cover',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_slides_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'announcement_slides_banner_id_fkey'
  ) THEN
    ALTER TABLE "announcement_slides"
      ADD CONSTRAINT "announcement_slides_banner_id_fkey"
      FOREIGN KEY ("banner_id") REFERENCES "announcement_banners"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "announcement_slides_banner_id_idx"
  ON "announcement_slides"("banner_id");

CREATE INDEX IF NOT EXISTS "announcement_slides_banner_id_sort_order_idx"
  ON "announcement_slides"("banner_id", "sort_order");

CREATE INDEX IF NOT EXISTS "announcement_slides_banner_id_is_active_sort_order_idx"
  ON "announcement_slides"("banner_id", "is_active", "sort_order");

ALTER TABLE "announcement_banners"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "image_alt" TEXT;

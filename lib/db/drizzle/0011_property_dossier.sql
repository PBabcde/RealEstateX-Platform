-- Additive dossier extension: existing rows and ownership remain unchanged.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "naam" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "postcode" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "plaats" text;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "huurprijs" numeric(15, 2);
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "marktwaarde" numeric(15, 2);
ALTER TABLE "properties" ALTER COLUMN "woonoppervlak" TYPE double precision;
ALTER TABLE "properties" ALTER COLUMN "perceel" TYPE double precision;

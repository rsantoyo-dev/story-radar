-- Provider seeds span the full unsigned 32-bit range (FLUX and other fal
-- models), which overflows int4 and fails the completion write with 22003.
-- Widening is lossless: every stored seed already fits in bigint.
ALTER TABLE "creative_assets" ALTER COLUMN "seed" SET DATA TYPE bigint;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN "translations" JSONB;

-- AlterTable
ALTER TABLE "categories" ADD COLUMN "translations" JSONB;

-- AlterTable
ALTER TABLE "products" ADD COLUMN "translations" JSONB;

-- AlterTable
ALTER TABLE "attributes" ADD COLUMN "translations" JSONB;

-- AlterTable
ALTER TABLE "attribute_values" ADD COLUMN "translations" JSONB;

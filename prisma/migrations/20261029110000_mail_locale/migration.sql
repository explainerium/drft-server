-- AlterTable
ALTER TABLE "users" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'de';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'de';

-- AlterTable
ALTER TABLE "newsletter_subscribers" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'de';

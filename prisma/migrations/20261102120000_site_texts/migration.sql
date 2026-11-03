
-- CreateTable
CREATE TABLE "site_texts" (
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_texts_pkey" PRIMARY KEY ("key","locale")
);

-- CreateTable
CREATE TABLE "site_text_revisions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_text_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_texts_locale_idx" ON "site_texts"("locale");

-- CreateIndex
CREATE INDEX "site_text_revisions_key_createdAt_idx" ON "site_text_revisions"("key", "createdAt");

-- AddForeignKey
ALTER TABLE "site_texts" ADD CONSTRAINT "site_texts_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_text_revisions" ADD CONSTRAINT "site_text_revisions_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


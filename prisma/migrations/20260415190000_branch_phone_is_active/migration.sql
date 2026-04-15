-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "phone" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

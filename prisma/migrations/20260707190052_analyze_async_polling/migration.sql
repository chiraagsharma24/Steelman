-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ClaimAnalysisStatus" ADD VALUE 'PENDING';
ALTER TYPE "ClaimAnalysisStatus" ADD VALUE 'PROCESSING';

-- AlterTable
ALTER TABLE "ClaimAnalysis" ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "sortIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "webEligible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ClaimAnalysis_analysisId_sortIndex_idx" ON "ClaimAnalysis"("analysisId", "sortIndex");

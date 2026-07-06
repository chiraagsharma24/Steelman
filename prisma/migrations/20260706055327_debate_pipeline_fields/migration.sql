/*
  Warnings:

  - Added the required column `againstSummary` to the `Verdict` table without a default value. This is not possible if the table is not empty.
  - Added the required column `forSummary` to the `Verdict` table without a default value. This is not possible if the table is not empty.
  - Added the required column `keyEvidenceJson` to the `Verdict` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reasoning` to the `Verdict` table without a default value. This is not possible if the table is not empty.
  - Added the required column `verdictLabel` to the `Verdict` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerdictLabel" AS ENUM ('SUPPORTED', 'CONTESTED', 'UNSUPPORTED');

-- AlterTable
ALTER TABLE "Verdict" ADD COLUMN     "againstSummary" TEXT NOT NULL,
ADD COLUMN     "forSummary" TEXT NOT NULL,
ADD COLUMN     "keyEvidenceJson" JSONB NOT NULL,
ADD COLUMN     "reasoning" TEXT NOT NULL,
ADD COLUMN     "verdictLabel" "VerdictLabel" NOT NULL;

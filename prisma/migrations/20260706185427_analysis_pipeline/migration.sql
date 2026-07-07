-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('FACTUAL', 'OPINION', 'PREDICTION', 'VALUE_JUDGMENT');

-- CreateEnum
CREATE TYPE "FactVerdict" AS ENUM ('SUPPORTED', 'MISLEADING', 'FALSE', 'UNVERIFIABLE', 'NEEDS_CONTEXT');

-- CreateEnum
CREATE TYPE "Grounding" AS ENUM ('WEB', 'MODEL_KNOWLEDGE');

-- CreateEnum
CREATE TYPE "Agreement" AS ENUM ('UNANIMOUS', 'MAJORITY', 'SPLIT');

-- CreateEnum
CREATE TYPE "ClaimAnalysisStatus" AS ENUM ('DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'YOUTUBE';

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "title" TEXT NOT NULL,
    "status" "DebateStatus" NOT NULL DEFAULT 'PENDING',
    "credibilityScore" INTEGER,
    "distributionJson" JSONB,
    "framingCountsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimAnalysis" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "claimType" "ClaimType" NOT NULL,
    "checkable" BOOLEAN NOT NULL,
    "framingJson" JSONB NOT NULL,
    "status" "ClaimAnalysisStatus" NOT NULL,
    "error" TEXT,
    "factVerdict" "FactVerdict",
    "factConfidence" "Confidence",
    "factExplanation" TEXT,
    "sourcesJson" JSONB,
    "correction" TEXT,
    "grounding" "Grounding",
    "consensusJson" JSONB,
    "agreement" "Agreement",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimAnalysis_analysisId_idx" ON "ClaimAnalysis"("analysisId");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimAnalysis" ADD CONSTRAINT "ClaimAnalysis_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

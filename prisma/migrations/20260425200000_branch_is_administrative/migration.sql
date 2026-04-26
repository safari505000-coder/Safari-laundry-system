-- V19.25 — Administrative (HQ-only) branch flag for cost-center logic.
ALTER TABLE "Branch" ADD COLUMN "isAdministrative" BOOLEAN NOT NULL DEFAULT false;

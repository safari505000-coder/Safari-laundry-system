-- V19.28 — Manual payroll roster lines (external beneficiaries + IBAN).

CREATE TABLE "PayrollAdHocLine" (
    "id" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "periodYm" TEXT NOT NULL,
    "lineSort" INTEGER NOT NULL DEFAULT 0,
    "beneficiaryName" TEXT NOT NULL,
    "bankName" TEXT,
    "bankIban" TEXT,
    "basicSalary" DECIMAL(19, 4) NOT NULL,
    "allowances" DECIMAL(19, 4) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(19, 4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAdHocLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollAdHocLine_branchId_periodYm_idx" ON "PayrollAdHocLine"("branchId", "periodYm");

ALTER TABLE "PayrollAdHocLine" ADD CONSTRAINT "PayrollAdHocLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

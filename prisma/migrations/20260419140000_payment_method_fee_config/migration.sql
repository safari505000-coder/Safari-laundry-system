-- V8.5 — Global payment-method fee defaults for reporting-layer bank commission (KNET / card & links).

CREATE TYPE "KnetCommissionRule" AS ENUM (
  'HIGHER_OF_FLAT_AND_PERCENT',
  'FLAT_ONLY',
  'PERCENT_ONLY'
);

CREATE TABLE "PaymentMethodFeeConfig" (
    "id" TEXT NOT NULL,
    "knetFlatKd" DECIMAL(19,4) NOT NULL DEFAULT 0.1000,
    "knetPercentOfGross" DECIMAL(19,6) NOT NULL DEFAULT 0.015000,
    "knetRule" "KnetCommissionRule" NOT NULL DEFAULT 'HIGHER_OF_FLAT_AND_PERCENT',
    "cardPercentOfGross" DECIMAL(19,6) NOT NULL DEFAULT 0.025000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethodFeeConfig_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PaymentMethodFeeConfig" ("id", "knetFlatKd", "knetPercentOfGross", "knetRule", "cardPercentOfGross", "updatedAt")
VALUES ('default', 0.1000, 0.015000, 'HIGHER_OF_FLAT_AND_PERCENT', 0.025000, CURRENT_TIMESTAMP);

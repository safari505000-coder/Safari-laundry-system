-- Additive B2C customer portal refresh-token table.
-- Raw refresh tokens are never stored; tokenHash is SHA-256(raw token).
CREATE TABLE "CustomerRefreshToken" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customerId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "CustomerRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRefreshToken_tokenHash_key" ON "CustomerRefreshToken"("tokenHash");
CREATE INDEX "CustomerRefreshToken_customerId_idx" ON "CustomerRefreshToken"("customerId");
CREATE INDEX "CustomerRefreshToken_customerId_revokedAt_idx" ON "CustomerRefreshToken"("customerId", "revokedAt");
CREATE INDEX "CustomerRefreshToken_expiresAt_idx" ON "CustomerRefreshToken"("expiresAt");

ALTER TABLE "CustomerRefreshToken"
  ADD CONSTRAINT "CustomerRefreshToken_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

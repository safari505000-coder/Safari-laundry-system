-- DropIndex
DROP INDEX "Customer_phone_idx";

-- DropIndex
DROP INDEX "Order_invoiceNumber_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceNumber_key" ON "Order"("invoiceNumber");

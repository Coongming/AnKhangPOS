DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "purchases" WHERE "type" = 'return') THEN
    RAISE EXCEPTION 'Không thể bỏ tính năng trả hàng: database vẫn còn phiếu trả';
  END IF;
END
$$;

ALTER TABLE "purchases" DROP COLUMN "type";

ALTER TABLE "debt_transactions"
  DROP COLUMN "sale_id",
  DROP COLUMN "purchase_id";

CREATE TABLE "customer_payment_allocations" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "amount" DECIMAL(15, 0) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_payment_allocations_transaction_id_sale_id_key"
  ON "customer_payment_allocations"("transaction_id", "sale_id");

CREATE INDEX "customer_payment_allocations_sale_id_idx"
  ON "customer_payment_allocations"("sale_id");

ALTER TABLE "customer_payment_allocations"
  ADD CONSTRAINT "customer_payment_allocations_transaction_id_fkey"
  FOREIGN KEY ("transaction_id")
  REFERENCES "debt_transactions"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "customer_payment_allocations"
  ADD CONSTRAINT "customer_payment_allocations_sale_id_fkey"
  FOREIGN KEY ("sale_id")
  REFERENCES "sales"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

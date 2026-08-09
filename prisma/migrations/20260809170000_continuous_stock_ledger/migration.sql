ALTER TABLE "purchases"
  ADD COLUMN "stock_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sales"
  ADD COLUMN "stock_version" INTEGER NOT NULL DEFAULT 0;

UPDATE "sales"
SET "stock_version" = 1
WHERE "status" = 'completed';

ALTER TABLE "stock_movements"
  ADD COLUMN "ledger_sequence" SERIAL NOT NULL,
  ADD COLUMN "stock_before" DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "operation_id" TEXT,
  ADD COLUMN "document_version" INTEGER,
  ADD COLUMN "document_date" TIMESTAMP(3);

CREATE UNIQUE INDEX "stock_movements_ledger_sequence_key"
  ON "stock_movements"("ledger_sequence");

DROP INDEX IF EXISTS "stock_movements_product_id_created_at_idx";

CREATE INDEX "stock_movements_product_id_ledger_sequence_idx"
  ON "stock_movements"("product_id", "ledger_sequence");

CREATE INDEX "stock_movements_operation_id_idx"
  ON "stock_movements"("operation_id");

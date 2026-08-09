DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sales" WHERE "code" !~ '^HD[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã hóa đơn không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "customers" WHERE "code" !~ '^KH[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã khách hàng không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "purchases" WHERE "code" !~ '^PN[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã phiếu nhập không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "employees" WHERE "code" !~ '^NV[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã nhân viên không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "products" WHERE "code" !~ '^SP[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã sản phẩm không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "suppliers" WHERE "code" !~ '^NCC[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã nhà cung cấp không hợp lệ, không thể chuẩn hóa';
  END IF;
  IF EXISTS (SELECT 1 FROM "blend_history" WHERE "code" !~ '^TR[0-9]+$') THEN
    RAISE EXCEPTION 'Có mã phiếu trộn không hợp lệ, không thể chuẩn hóa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "sales"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "customers"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "purchases"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "employees"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "products"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "suppliers"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM "blend_history"
    GROUP BY (substring("code" FROM '[0-9]+$'))::BIGINT HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Có mã trùng phần số sau khi chuẩn hóa; migration đã dừng';
  END IF;
END
$$;

UPDATE "sales"
SET "code" = 'HD' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 6, '0');
UPDATE "customers"
SET "code" = 'KH' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');
UPDATE "purchases"
SET "code" = 'PN' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');
UPDATE "employees"
SET "code" = 'NV' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');
UPDATE "products"
SET "code" = 'SP' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');
UPDATE "suppliers"
SET "code" = 'NCC' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');
UPDATE "blend_history"
SET "code" = 'TR' || LPAD(((substring("code" FROM '[0-9]+$'))::BIGINT)::TEXT, 4, '0');

CREATE TABLE "code_sequences" (
  "prefix" TEXT NOT NULL,
  "current_value" INTEGER NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "code_sequences_pkey" PRIMARY KEY ("prefix")
);

INSERT INTO "code_sequences" ("prefix", "current_value")
VALUES
  ('HD', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "sales"), 0)),
  ('KH', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "customers"), 0)),
  ('PN', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "purchases"), 0)),
  ('NV', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "employees"), 0)),
  ('SP', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "products"), 0)),
  ('NCC', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "suppliers"), 0)),
  ('TR', COALESCE((SELECT MAX((substring("code" FROM '[0-9]+$'))::INTEGER) FROM "blend_history"), 0));

ALTER TABLE "debt_transactions"
  ADD COLUMN "source_purchase_id" TEXT;

CREATE UNIQUE INDEX "debt_transactions_source_purchase_id_key"
  ON "debt_transactions"("source_purchase_id");

ALTER TABLE "debt_transactions"
  ADD CONSTRAINT "debt_transactions_source_purchase_id_fkey"
  FOREIGN KEY ("source_purchase_id")
  REFERENCES "purchases"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE TABLE "supplier_payment_allocations" (
  "id" TEXT NOT NULL,
  "transaction_id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "amount" DECIMAL(15, 0) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_payment_allocations_transaction_id_purchase_id_key"
  ON "supplier_payment_allocations"("transaction_id", "purchase_id");
CREATE INDEX "supplier_payment_allocations_purchase_id_idx"
  ON "supplier_payment_allocations"("purchase_id");

ALTER TABLE "supplier_payment_allocations"
  ADD CONSTRAINT "supplier_payment_allocations_transaction_id_fkey"
  FOREIGN KEY ("transaction_id")
  REFERENCES "debt_transactions"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "supplier_payment_allocations"
  ADD CONSTRAINT "supplier_payment_allocations_purchase_id_fkey"
  FOREIGN KEY ("purchase_id")
  REFERENCES "purchases"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Chuyển số tiền thực trả đang nằm trên phiếu nhập thành giao dịch tiền độc lập.
INSERT INTO "debt_transactions" (
  "id",
  "type",
  "supplier_id",
  "source_purchase_id",
  "amount",
  "balance_after",
  "notes",
  "payment_method",
  "created_at"
)
SELECT
  'purchase-payment-' || "id",
  'supplier_payment',
  "supplier_id",
  "id",
  -"paid_amount",
  0,
  'Thanh toán khi nhập - ' || "code",
  NULL,
  "purchase_date"
FROM "purchases"
WHERE "paid_amount" > 0;

-- Phân bổ FIFO bằng giao của khoảng lũy kế phiếu nhập và khoảng lũy kế thanh toán.
WITH ordered_purchases AS (
  SELECT
    p."id",
    p."supplier_id",
    COALESCE(
      SUM(p."total_amount") OVER (
        PARTITION BY p."supplier_id"
        ORDER BY p."purchase_date", p."created_at", p."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS purchase_start,
    SUM(p."total_amount") OVER (
      PARTITION BY p."supplier_id"
      ORDER BY p."purchase_date", p."created_at", p."id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS purchase_end
  FROM "purchases" p
  WHERE p."status" = 'completed'
),
ordered_payments AS (
  SELECT
    d."id",
    d."supplier_id",
    COALESCE(
      SUM(ABS(d."amount")) OVER (
        PARTITION BY d."supplier_id"
        ORDER BY d."created_at", d."id"
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    ) AS payment_start,
    SUM(ABS(d."amount")) OVER (
      PARTITION BY d."supplier_id"
      ORDER BY d."created_at", d."id"
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS payment_end
  FROM "debt_transactions" d
  WHERE d."type" = 'supplier_payment' AND d."supplier_id" IS NOT NULL
),
allocations AS (
  SELECT
    payment."id" AS transaction_id,
    purchase."id" AS purchase_id,
    LEAST(purchase.purchase_end, payment.payment_end)
      - GREATEST(purchase.purchase_start, payment.payment_start) AS amount
  FROM ordered_purchases purchase
  JOIN ordered_payments payment
    ON payment."supplier_id" = purchase."supplier_id"
   AND purchase.purchase_start < payment.payment_end
   AND payment.payment_start < purchase.purchase_end
)
INSERT INTO "supplier_payment_allocations" (
  "id", "transaction_id", "purchase_id", "amount"
)
SELECT
  'supplier-allocation-' || MD5(transaction_id || ':' || purchase_id),
  transaction_id,
  purchase_id,
  amount
FROM allocations
WHERE amount > 0;

UPDATE "purchases" purchase
SET "debt_amount" = CASE
  WHEN purchase."status" = 'completed' THEN GREATEST(
    purchase."total_amount" - COALESCE((
      SELECT SUM(allocation."amount")
      FROM "supplier_payment_allocations" allocation
      WHERE allocation."purchase_id" = purchase."id"
    ), 0),
    0
  )
  ELSE 0
END;

UPDATE "suppliers" supplier
SET "debt" =
  COALESCE((
    SELECT SUM(purchase."total_amount")
    FROM "purchases" purchase
    WHERE purchase."supplier_id" = supplier."id"
      AND purchase."status" = 'completed'
  ), 0)
  - COALESCE((
    SELECT SUM(ABS(payment."amount"))
    FROM "debt_transactions" payment
    WHERE payment."supplier_id" = supplier."id"
      AND payment."type" = 'supplier_payment'
  ), 0);

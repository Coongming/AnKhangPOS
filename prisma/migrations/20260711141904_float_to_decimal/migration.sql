-- Float → Decimal migration
-- Tiền: DECIMAL(15,0) | Khối lượng/số lượng: DECIMAL(15,2) | Giờ: DECIMAL(5,2)

-- product_categories
ALTER TABLE product_categories ALTER COLUMN delivery_rate TYPE DECIMAL(15,0) USING ROUND(delivery_rate);

-- products
ALTER TABLE products ALTER COLUMN sale_price TYPE DECIMAL(15,0) USING ROUND(sale_price);
ALTER TABLE products ALTER COLUMN cost_price TYPE DECIMAL(15,0) USING ROUND(cost_price);
ALTER TABLE products ALTER COLUMN last_purchase_price TYPE DECIMAL(15,0) USING ROUND(last_purchase_price);
ALTER TABLE products ALTER COLUMN stock TYPE DECIMAL(15,2) USING ROUND(stock::numeric, 2);
ALTER TABLE products ALTER COLUMN min_stock TYPE DECIMAL(15,2) USING ROUND(min_stock::numeric, 2);

-- suppliers
ALTER TABLE suppliers ALTER COLUMN debt TYPE DECIMAL(15,0) USING ROUND(debt);

-- customers
ALTER TABLE customers ALTER COLUMN debt TYPE DECIMAL(15,0) USING ROUND(debt);

-- purchases
ALTER TABLE purchases ALTER COLUMN total_amount TYPE DECIMAL(15,0) USING ROUND(total_amount);
ALTER TABLE purchases ALTER COLUMN paid_amount TYPE DECIMAL(15,0) USING ROUND(paid_amount);
ALTER TABLE purchases ALTER COLUMN debt_amount TYPE DECIMAL(15,0) USING ROUND(debt_amount);

-- purchase_items
ALTER TABLE purchase_items ALTER COLUMN quantity TYPE DECIMAL(15,2) USING ROUND(quantity::numeric, 2);
ALTER TABLE purchase_items ALTER COLUMN unit_price TYPE DECIMAL(15,0) USING ROUND(unit_price);
ALTER TABLE purchase_items ALTER COLUMN total_price TYPE DECIMAL(15,0) USING ROUND(total_price);

-- sales
ALTER TABLE sales ALTER COLUMN subtotal TYPE DECIMAL(15,0) USING ROUND(subtotal);
ALTER TABLE sales ALTER COLUMN discount TYPE DECIMAL(15,0) USING ROUND(discount);
ALTER TABLE sales ALTER COLUMN total_amount TYPE DECIMAL(15,0) USING ROUND(total_amount);
ALTER TABLE sales ALTER COLUMN total_cost TYPE DECIMAL(15,0) USING ROUND(total_cost);
ALTER TABLE sales ALTER COLUMN paid_amount TYPE DECIMAL(15,0) USING ROUND(paid_amount);
ALTER TABLE sales ALTER COLUMN debt_amount TYPE DECIMAL(15,0) USING ROUND(debt_amount);

-- sale_items
ALTER TABLE sale_items ALTER COLUMN quantity TYPE DECIMAL(15,2) USING ROUND(quantity::numeric, 2);
ALTER TABLE sale_items ALTER COLUMN unit_price TYPE DECIMAL(15,0) USING ROUND(unit_price);
ALTER TABLE sale_items ALTER COLUMN cost_price TYPE DECIMAL(15,0) USING ROUND(cost_price);
ALTER TABLE sale_items ALTER COLUMN discount TYPE DECIMAL(15,0) USING ROUND(discount);
ALTER TABLE sale_items ALTER COLUMN total_price TYPE DECIMAL(15,0) USING ROUND(total_price);

-- debt_transactions
ALTER TABLE debt_transactions ALTER COLUMN amount TYPE DECIMAL(15,0) USING ROUND(amount);
ALTER TABLE debt_transactions ALTER COLUMN balance_after TYPE DECIMAL(15,0) USING ROUND(balance_after);

-- stock_movements
ALTER TABLE stock_movements ALTER COLUMN quantity TYPE DECIMAL(15,2) USING ROUND(quantity::numeric, 2);
ALTER TABLE stock_movements ALTER COLUMN stock_after TYPE DECIMAL(15,2) USING ROUND(stock_after::numeric, 2);

-- expenses
ALTER TABLE expenses ALTER COLUMN amount TYPE DECIMAL(15,0) USING ROUND(amount);

-- blend_history
ALTER TABLE blend_history ALTER COLUMN output_quantity TYPE DECIMAL(15,2) USING ROUND(output_quantity::numeric, 2);
ALTER TABLE blend_history ALTER COLUMN output_cost_price TYPE DECIMAL(15,0) USING ROUND(output_cost_price);

-- blend_history_items
ALTER TABLE blend_history_items ALTER COLUMN quantity TYPE DECIMAL(15,2) USING ROUND(quantity::numeric, 2);
ALTER TABLE blend_history_items ALTER COLUMN cost_price TYPE DECIMAL(15,0) USING ROUND(cost_price);

-- blend_template_items
ALTER TABLE blend_template_items ALTER COLUMN quantity TYPE DECIMAL(15,2) USING ROUND(quantity::numeric, 2);

-- employees
ALTER TABLE employees ALTER COLUMN hourly_rate TYPE DECIMAL(15,0) USING ROUND(hourly_rate);
ALTER TABLE employees ALTER COLUMN delivery_rate TYPE DECIMAL(15,0) USING ROUND(delivery_rate);

-- employee_shifts
ALTER TABLE employee_shifts ALTER COLUMN hours TYPE DECIMAL(5,2) USING ROUND(hours::numeric, 2);

-- salary_payments
ALTER TABLE salary_payments ALTER COLUMN hourly_pay TYPE DECIMAL(15,0) USING ROUND(hourly_pay);
ALTER TABLE salary_payments ALTER COLUMN delivery_pay TYPE DECIMAL(15,0) USING ROUND(delivery_pay);
ALTER TABLE salary_payments ALTER COLUMN total_pay TYPE DECIMAL(15,0) USING ROUND(total_pay);

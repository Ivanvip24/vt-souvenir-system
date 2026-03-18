-- Migration 011: Add wholesale_price column for 1000+ tier pricing
-- base_price = 100-999 pzas (standard), wholesale_price = 1000+ pzas (bulk)

ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price DECIMAL(10, 2);

-- Update base_price to 100-999 tier and wholesale_price to 1000+ tier
-- Product: Imanes de MDF (id=4): 100-999=$11, 1000+=$8
UPDATE products SET base_price = 11.00, wholesale_price = 8.00 WHERE id = 4;

-- Product: Imán 3D MDF 3mm (id=6): 100-999=$15, 1000+=$12
UPDATE products SET base_price = 15.00, wholesale_price = 12.00 WHERE id = 6;

-- Product: Imán de MDF con Foil (id=7): 100-999=$13, 1000+=$10
UPDATE products SET base_price = 13.00, wholesale_price = 10.00 WHERE id = 7;

-- Product: Llaveros de MDF (id=5): 100-999=$10, 1000+=$8
UPDATE products SET base_price = 10.00, wholesale_price = 8.00 WHERE id = 5;

-- Product: Destapador de MDF (id=8): 100-999=$20, 1000+=$17
UPDATE products SET base_price = 20.00, wholesale_price = 17.00 WHERE id = 8;

-- Product: Botones Metálicos (id=9): 100-999=$8, 1000+=$6
UPDATE products SET base_price = 8.00, wholesale_price = 6.00 WHERE id = 9;

-- Product: Portallaves de MDF (id=10): same price both tiers
UPDATE products SET base_price = 45.00, wholesale_price = 45.00 WHERE id = 10;

-- Product: Souvenir Box (id=11): same price both tiers
UPDATE products SET wholesale_price = 2250.00 WHERE id = 11;

-- Set wholesale_price = base_price for any products that didn't get updated
UPDATE products SET wholesale_price = base_price WHERE wholesale_price IS NULL;
-- Database Schema Check for Variant Products
-- Run this script to verify your database schema is correct

-- Check if all required tables exist
SELECT 
    table_name,
    CASE 
        WHEN table_name IN ('products', 'product_variants', 'variant_images', 'variant_attributes', 'attribute_types', 'attribute_values') 
        THEN '✅ Required' 
        ELSE '❌ Missing' 
    END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'product_variants', 'variant_images', 'variant_attributes', 'attribute_types', 'attribute_values');

-- Check products table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'products' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check product_variants table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'product_variants' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check variant_images table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'variant_images' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check variant_attributes table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'variant_attributes' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check attribute_types table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'attribute_types' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check attribute_values table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'attribute_values' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check foreign key constraints
SELECT 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public'
AND tc.table_name IN ('products', 'product_variants', 'variant_images', 'variant_attributes', 'attribute_types', 'attribute_values')
ORDER BY tc.table_name, kcu.column_name;

-- Check if there are any existing products with variants
SELECT 
    p.id,
    p.name,
    p.has_variants,
    COUNT(pv.id) as variant_count
FROM products p
LEFT JOIN product_variants pv ON p.id = pv.product_id
GROUP BY p.id, p.name, p.has_variants
ORDER BY p.id;

-- Check if there are any existing variants with their attributes
SELECT 
    pv.id as variant_id,
    pv.sku,
    pv.price,
    pv.stock,
    pv.status,
    p.name as product_name,
    COUNT(va.id) as attribute_count,
    COUNT(vi.id) as image_count
FROM product_variants pv
JOIN products p ON pv.product_id = p.id
LEFT JOIN variant_attributes va ON pv.id = va.variant_id
LEFT JOIN variant_images vi ON pv.id = vi.variant_id
GROUP BY pv.id, pv.sku, pv.price, pv.stock, pv.status, p.name
ORDER BY pv.id;

-- Check attribute types and values
SELECT 
    at.id as attribute_type_id,
    at.name as attribute_type_name,
    p.name as product_name,
    COUNT(av.id) as value_count
FROM attribute_types at
JOIN products p ON at.product_id = p.id
LEFT JOIN attribute_values av ON at.id = av.attribute_type_id
GROUP BY at.id, at.name, p.name
ORDER BY at.id;

-- Sample data insertion test (run this to test the schema)
-- Note: Replace the IDs with actual existing IDs from your database

/*
-- Test inserting a product with variants
INSERT INTO products (name, description, has_variants, subcategory_id, vendor_id, created_at, updated_at)
VALUES ('Test Product', 'Test Description', true, 1, 1, NOW(), NOW())
RETURNING id;

-- Test inserting a variant
INSERT INTO product_variants (sku, price, stock, status, product_id)
VALUES ('TEST-SKU-001', 29.99, 10, 'AVAILABLE', 1)
RETURNING id;

-- Test inserting an attribute type
INSERT INTO attribute_types (name, product_id)
VALUES ('Color', 1)
RETURNING id;

-- Test inserting an attribute value
INSERT INTO attribute_values (value, attribute_type_id)
VALUES ('Red', 1)
RETURNING id;

-- Test inserting a variant attribute
INSERT INTO variant_attributes (variant_id, attribute_value_id)
VALUES (1, 1)
RETURNING id;

-- Test inserting a variant image
INSERT INTO variant_images (image_url, variant_id, product_id)
VALUES ('https://example.com/image.jpg', 1, 1)
RETURNING id;
*/ 
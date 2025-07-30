# Product Variant Creation Guide

## Overview

This guide explains how to create products with variants using the DajuVai backend API.

## Creating Products with Variants

### API Endpoint

```
POST /categories/:categoryId/subcategories/:subcategoryId/products
```

### Request Structure

#### For Variant Products:

```json
{
  "name": "Product Name",
  "description": "Product Description",
  "hasVariants": true,
  "variants": [
    {
      "sku": "VARIANT-001",
      "price": 29.99,
      "stock": 50,
      "status": "AVAILABLE",
      "attributes": [
        {
          "attributeType": "Color",
          "attributeValues": ["Red", "Blue"]
        },
        {
          "attributeType": "Size",
          "attributeValues": ["Small", "Medium"]
        }
      ]
    },
    {
      "sku": "VARIANT-002",
      "price": 34.99,
      "stock": 30,
      "status": "AVAILABLE",
      "attributes": [
        {
          "attributeType": "Color",
          "attributeValues": ["Green"]
        },
        {
          "attributeType": "Size",
          "attributeValues": ["Large"]
        }
      ]
    }
  ]
}
```

#### File Upload for Variants:

- Use `multipart/form-data` content type
- Upload variant images using the field name `variantImages`
- **Important**: Upload images in the same order as variants in the array
- Each variant gets exactly one image
- Maximum 50 variant images allowed

#### Example cURL:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "name=Product Name" \
  -F "description=Product Description" \
  -F "hasVariants=true" \
  -F "variants=[{\"sku\":\"VARIANT-001\",\"price\":29.99,\"stock\":50,\"status\":\"AVAILABLE\"}]" \
  -F "variantImages=@image1.jpg" \
  -F "variantImages=@image2.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
```

### For Non-Variant Products:

```json
{
  "name": "Product Name",
  "description": "Product Description",
  "hasVariants": false,
  "basePrice": 29.99,
  "stock": 100,
  "status": "AVAILABLE",
  "discount": 10,
  "discountType": "PERCENTAGE"
}
```

#### File Upload for Non-Variants:

- Use field name `productImages`
- Maximum 5 images allowed
- Maximum 10MB total file size

## Key Points

1. **Image Order**: For variants, upload images in the same order as variants in the array
2. **One Image Per Variant**: Each variant gets exactly one image
3. **Required Fields**: Each variant must have SKU, price, stock, and status
4. **Attributes**: Optional but recommended for variant differentiation
5. **File Limits**:
   - Variant images: max 50 files
   - Product images: max 10 files
   - File size: max 5MB per file

## Common Issues Fixed

1. **File Naming**: No longer requires specific filename patterns
2. **Image Matching**: Uses array order instead of filename matching
3. **Validation**: Better error messages for missing images
4. **Type Safety**: Proper TypeScript types for file handling

## Error Messages

- `"No variant images provided"` - Missing variant images
- `"Expected X variant images, but received Y"` - Wrong number of images
- `"No image provided for variant SKU"` - Missing image for specific variant
- `"Maximum 5 images allowed for non-variant products"` - Too many product images

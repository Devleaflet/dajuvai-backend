# Postman Test Collection for Variant Products

## Setup Instructions

### 1. Create a new request in Postman

**Method:** `POST`
**URL:** `{{base_url}}/categories/{{category_id}}/subcategories/{{subcategory_id}}/products`

### 2. Headers
```
Authorization: Bearer {{vendor_token}}
Content-Type: multipart/form-data
```

### 3. Body (form-data)

#### For Variant Products:

| Key | Type | Value |
|-----|------|-------|
| name | Text | Test T-Shirt with Variants |
| description | Text | A comfortable cotton t-shirt available in different colors and sizes |
| hasVariants | Text | true |
| variants | Text | `[{"sku":"TSHIRT-RED-S","price":25.99,"stock":50,"status":"AVAILABLE","attributes":[{"attributeType":"Color","attributeValues":["Red"]},{"attributeType":"Size","attributeValues":["Small"]}]},{"sku":"TSHIRT-BLUE-M","price":27.99,"stock":30,"status":"AVAILABLE","attributes":[{"attributeType":"Color","attributeValues":["Blue"]},{"attributeType":"Size","attributeValues":["Medium"]}]}]` |
| variantImages | File | Select image file 1 |
| variantImages | File | Select image file 2 |

#### For Non-Variant Products:

| Key | Type | Value |
|-----|------|-------|
| name | Text | Test Single Product |
| description | Text | A product without variants |
| hasVariants | Text | false |
| basePrice | Text | 29.99 |
| stock | Text | 50 |
| status | Text | AVAILABLE |
| discount | Text | 10 |
| discountType | Text | PERCENTAGE |
| productImages | File | Select image file 1 |
| productImages | File | Select image file 2 |

### 4. Environment Variables

Create an environment with these variables:

```
base_url: http://localhost:3000
vendor_token: YOUR_ACTUAL_VENDOR_TOKEN
category_id: 1
subcategory_id: 1
```

## Test Cases

### Test Case 1: Simple Variant Product
- **Variants:** 2 variants (Red Small, Blue Medium)
- **Images:** 2 variant images
- **Expected:** Success with product and variants created

### Test Case 2: Variant Product with 3 Variants
- **Variants:** 3 variants (different sizes)
- **Images:** 3 variant images
- **Expected:** Success with 3 variants created

### Test Case 3: Error Case - Wrong Number of Images
- **Variants:** 2 variants
- **Images:** 1 variant image
- **Expected:** Error "Expected 2 variant images, but received 1"

### Test Case 4: Error Case - Missing SKU
- **Variants:** 1 variant without SKU
- **Images:** 1 variant image
- **Expected:** Error "Variant at index 0 is missing SKU"

### Test Case 5: Error Case - Invalid JSON
- **Variants:** Invalid JSON string
- **Images:** 1 variant image
- **Expected:** Error "Invalid variants JSON format"

## Troubleshooting

### Common Issues:

1. **"No images provided for variant undefined"**
   - **Cause:** Variants array not properly parsed
   - **Solution:** Ensure variants is a valid JSON string

2. **"Expected X variant images, but received Y"**
   - **Cause:** Wrong number of images uploaded
   - **Solution:** Upload exactly the same number of images as variants

3. **"Invalid variants JSON format"**
   - **Cause:** Malformed JSON in variants field
   - **Solution:** Validate JSON syntax before sending

4. **"Variant at index X is missing SKU"**
   - **Cause:** Missing or empty SKU in variant object
   - **Solution:** Ensure all variants have valid SKUs

### Debug Steps:

1. **Check Console Logs:** Look at server console for debug information
2. **Validate JSON:** Use a JSON validator for the variants field
3. **Count Images:** Ensure image count matches variant count
4. **Check File Types:** Ensure images are JPEG/PNG and under 5MB

## Example cURL Commands

### Variant Product:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "name=Test T-Shirt with Variants" \
  -F "description=A comfortable cotton t-shirt" \
  -F "hasVariants=true" \
  -F "variants=[{\"sku\":\"TSHIRT-RED-S\",\"price\":25.99,\"stock\":50,\"status\":\"AVAILABLE\"}]" \
  -F "variantImages=@image1.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
```

### Non-Variant Product:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "name=Test Single Product" \
  -F "description=A product without variants" \
  -F "hasVariants=false" \
  -F "basePrice=29.99" \
  -F "stock=50" \
  -F "status=AVAILABLE" \
  -F "productImages=@image1.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
``` 
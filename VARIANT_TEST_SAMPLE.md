# Product Variant Testing Samples

## Test Case 1: Simple Product with 2 Variants

### Form Data Structure:

```
POST /categories/1/subcategories/1/products
Content-Type: multipart/form-data
Authorization: Bearer YOUR_VENDOR_TOKEN
```

### Form Fields:

```
name: "Test T-Shirt with Variants"
description: "A comfortable cotton t-shirt available in different colors and sizes"
hasVariants: true
variants: [
  {
    "sku": "TSHIRT-RED-S",
    "price": 25.99,
    "stock": 50,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Color",
        "attributeValues": ["Red"]
      },
      {
        "attributeType": "Size",
        "attributeValues": ["Small"]
      }
    ]
  },
  {
    "sku": "TSHIRT-BLUE-M",
    "price": 27.99,
    "stock": 30,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Color",
        "attributeValues": ["Blue"]
      },
      {
        "attributeType": "Size",
        "attributeValues": ["Medium"]
      }
    ]
  }
]
variantImages: [file1.jpg, file2.jpg]  // Upload 2 images in order
```

### cURL Example:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -F "name=Test T-Shirt with Variants" \
  -F "description=A comfortable cotton t-shirt available in different colors and sizes" \
  -F "hasVariants=true" \
  -F "variants=[{\"sku\":\"TSHIRT-RED-S\",\"price\":25.99,\"stock\":50,\"status\":\"AVAILABLE\",\"attributes\":[{\"attributeType\":\"Color\",\"attributeValues\":[\"Red\"]},{\"attributeType\":\"Size\",\"attributeValues\":[\"Small\"]}]},{\"sku\":\"TSHIRT-BLUE-M\",\"price\":27.99,\"stock\":30,\"status\":\"AVAILABLE\",\"attributes\":[{\"attributeType\":\"Color\",\"attributeValues\":[\"Blue\"]},{\"attributeType\":\"Size\",\"attributeValues\":[\"Medium\"]}]}]" \
  -F "variantImages=@red-shirt-small.jpg" \
  -F "variantImages=@blue-shirt-medium.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
```

---

## Test Case 2: Product with 3 Variants (Different Sizes)

### Form Data Structure:

```
name: "Premium Jeans"
description: "High-quality denim jeans with perfect fit"
hasVariants: true
variants: [
  {
    "sku": "JEANS-30",
    "price": 89.99,
    "stock": 25,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Size",
        "attributeValues": ["30"]
      }
    ]
  },
  {
    "sku": "JEANS-32",
    "price": 89.99,
    "stock": 40,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Size",
        "attributeValues": ["32"]
      }
    ]
  },
  {
    "sku": "JEANS-34",
    "price": 89.99,
    "stock": 15,
    "status": "LOW_STOCK",
    "attributes": [
      {
        "attributeType": "Size",
        "attributeValues": ["34"]
      }
    ]
  }
]
variantImages: [jeans30.jpg, jeans32.jpg, jeans34.jpg]  // Upload 3 images in order
```

### cURL Example:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -F "name=Premium Jeans" \
  -F "description=High-quality denim jeans with perfect fit" \
  -F "hasVariants=true" \
  -F "variants=[{\"sku\":\"JEANS-30\",\"price\":89.99,\"stock\":25,\"status\":\"AVAILABLE\",\"attributes\":[{\"attributeType\":\"Size\",\"attributeValues\":[\"30\"]}]},{\"sku\":\"JEANS-32\",\"price\":89.99,\"stock\":40,\"status\":\"AVAILABLE\",\"attributes\":[{\"attributeType\":\"Size\",\"attributeValues\":[\"32\"]}]},{\"sku\":\"JEANS-34\",\"price\":89.99,\"stock\":15,\"status\":\"LOW_STOCK\",\"attributes\":[{\"attributeType\":\"Size\",\"attributeValues\":[\"34\"]}]}]" \
  -F "variantImages=@jeans30.jpg" \
  -F "variantImages=@jeans32.jpg" \
  -F "variantImages=@jeans34.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
```

---

## Test Case 3: Complex Product with Multiple Attributes

### Form Data Structure:

```
name: "Smartphone Pro"
description: "Latest smartphone with multiple configuration options"
hasVariants: true
variants: [
  {
    "sku": "PHONE-128-BLACK",
    "price": 999.99,
    "stock": 20,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Storage",
        "attributeValues": ["128GB"]
      },
      {
        "attributeType": "Color",
        "attributeValues": ["Black"]
      }
    ]
  },
  {
    "sku": "PHONE-256-BLACK",
    "price": 1199.99,
    "stock": 15,
    "status": "AVAILABLE",
    "attributes": [
      {
        "attributeType": "Storage",
        "attributeValues": ["256GB"]
      },
      {
        "attributeType": "Color",
        "attributeValues": ["Black"]
      }
    ]
  },
  {
    "sku": "PHONE-128-WHITE",
    "price": 999.99,
    "stock": 10,
    "status": "LOW_STOCK",
    "attributes": [
      {
        "attributeType": "Storage",
        "attributeValues": ["128GB"]
      },
      {
        "attributeType": "Color",
        "attributeValues": ["White"]
      }
    ]
  },
  {
    "sku": "PHONE-256-WHITE",
    "price": 1199.99,
    "stock": 8,
    "status": "LOW_STOCK",
    "attributes": [
      {
        "attributeType": "Storage",
        "attributeValues": ["256GB"]
      },
      {
        "attributeType": "Color",
        "attributeValues": ["White"]
      }
    ]
  }
]
variantImages: [phone128black.jpg, phone256black.jpg, phone128white.jpg, phone256white.jpg]  // Upload 4 images in order
```

---

## Test Case 4: Minimal Variant (No Attributes)

### Form Data Structure:

```
name: "Simple Product"
description: "A simple product with variants but no attributes"
hasVariants: true
variants: [
  {
    "sku": "SIMPLE-001",
    "price": 10.99,
    "stock": 100,
    "status": "AVAILABLE"
  },
  {
    "sku": "SIMPLE-002",
    "price": 15.99,
    "stock": 75,
    "status": "AVAILABLE"
  }
]
variantImages: [simple1.jpg, simple2.jpg]  // Upload 2 images in order
```

---

## Test Case 5: Non-Variant Product (For Comparison)

### Form Data Structure:

```
name: "Single Product"
description: "A product without variants"
hasVariants: false
basePrice: 29.99
stock: 50
status: AVAILABLE
discount: 10
discountType: PERCENTAGE
productImages: [product1.jpg, product2.jpg]  // Upload product images
```

### cURL Example:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_VENDOR_TOKEN" \
  -F "name=Single Product" \
  -F "description=A product without variants" \
  -F "hasVariants=false" \
  -F "basePrice=29.99" \
  -F "stock=50" \
  -F "status=AVAILABLE" \
  -F "discount=10" \
  -F "discountType=PERCENTAGE" \
  -F "productImages=@product1.jpg" \
  -F "productImages=@product2.jpg" \
  http://localhost:3000/categories/1/subcategories/1/products
```

---

## Testing Checklist

### Before Testing:

- [ ] Ensure you have a valid vendor token
- [ ] Verify category and subcategory IDs exist
- [ ] Prepare test images (JPEG/PNG, max 5MB each)
- [ ] Check that images are in the correct order for variants

### Test Scenarios:

- [ ] Test with 2 variants (Test Case 1)
- [ ] Test with 3 variants (Test Case 2)
- [ ] Test with complex attributes (Test Case 3)
- [ ] Test with minimal variants (Test Case 4)
- [ ] Test non-variant product (Test Case 5)
- [ ] Test error cases (wrong number of images, missing fields)

### Error Cases to Test:

- [ ] Wrong number of variant images
- [ ] Missing variant images
- [ ] Missing required variant fields (SKU, price, stock, status)
- [ ] Invalid category/subcategory IDs
- [ ] Missing vendor authentication
- [ ] File size too large
- [ ] Invalid file type

### Expected Success Response:

```json
{
  "success": true,
  "message": "Product created successfully",
  "data": {
    "id": 123,
    "name": "Test Product",
    "description": "Test Description",
    "hasVariants": true,
    "variants": [
      {
        "id": 456,
        "sku": "VARIANT-001",
        "price": 25.99,
        "stock": 50,
        "status": "AVAILABLE",
        "images": [
          {
            "id": 789,
            "imageUrl": "https://cloudinary.com/..."
          }
        ]
      }
    ]
  }
}
```

### Common Error Responses:

```json
{
  "success": false,
  "message": "Expected 2 variant images, but received 1"
}
```

```json
{
  "success": false,
  "message": "No variant images provided"
}
```

```json
{
  "success": false,
  "message": "Each variant must have SKU, price, stock, and status."
}
```

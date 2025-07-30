# Frontend Guide: Multiple Images Per Variant

## Overview

With the updated backend using `multer().any()`, you can now send multiple images per variant using different approaches. The backend supports three different methods for organizing variant images.

## Approach 1: Separate Field Names (Recommended)

**How it works:** Use different field names for each variant's images.

### Frontend Implementation:

```javascript
const createProductWithVariants = async (productData, variants) => {
  const formData = new FormData();

  // Add product data
  formData.append("name", productData.name);
  formData.append("description", productData.description);
  formData.append("hasVariants", "true");
  formData.append("variants", JSON.stringify(variants));

  // Add images for each variant using separate field names
  variants.forEach((variant, variantIndex) => {
    if (variant.images && variant.images.length > 0) {
      variant.images.forEach((imageFile, imageIndex) => {
        // Field name format: variantImages_0, variantImages_1, etc.
        formData.append(`variantImages_${variantIndex}`, imageFile);
      });
    }
  });

  // Send request
  const response = await fetch("/api/categories/1/subcategories/1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return response.json();
};
```

### Example Usage:

```javascript
const productData = {
  name: "Test T-Shirt",
  description: "A comfortable t-shirt with variants",
};

const variants = [
  {
    sku: "TSHIRT-RED-S",
    price: 25.99,
    stock: 50,
    status: "AVAILABLE",
    attributes: [
      {
        attributeType: "Color",
        attributeValues: ["Red"],
      },
      {
        attributeType: "Size",
        attributeValues: ["Small"],
      },
    ],
    images: [file1, file2, file3], // Multiple images for this variant
  },
  {
    sku: "TSHIRT-BLUE-M",
    price: 27.99,
    stock: 30,
    status: "AVAILABLE",
    attributes: [
      {
        attributeType: "Color",
        attributeValues: ["Blue"],
      },
      {
        attributeType: "Size",
        attributeValues: ["Medium"],
      },
    ],
    images: [file4, file5], // Multiple images for this variant
  },
];

await createProductWithVariants(productData, variants);
```

## Approach 2: Naming Convention

**How it works:** Use the same field name but with specific filename prefixes.

### Frontend Implementation:

```javascript
const createProductWithVariantsNaming = async (productData, variants) => {
  const formData = new FormData();

  // Add product data
  formData.append("name", productData.name);
  formData.append("description", productData.description);
  formData.append("hasVariants", "true");
  formData.append("variants", JSON.stringify(variants));

  // Add images with naming convention
  variants.forEach((variant, variantIndex) => {
    if (variant.images && variant.images.length > 0) {
      variant.images.forEach((imageFile, imageIndex) => {
        // Create filename with variant prefix
        const fileName = `variant${variantIndex + 1}_image${imageIndex + 1}.jpg`;
        formData.append("variantImages", imageFile, fileName);
      });
    }
  });

  // Send request
  const response = await fetch("/api/categories/1/subcategories/1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return response.json();
};
```

## Approach 3: Order-Based (Simple but Limited)

**How it works:** Upload images in the same order as variants (one image per variant).

### Frontend Implementation:

```javascript
const createProductWithVariantsOrder = async (productData, variants) => {
  const formData = new FormData();

  // Add product data
  formData.append("name", productData.name);
  formData.append("description", productData.description);
  formData.append("hasVariants", "true");
  formData.append("variants", JSON.stringify(variants));

  // Add one image per variant in order
  variants.forEach((variant, variantIndex) => {
    if (variant.images && variant.images.length > 0) {
      // Take the first image for this variant
      formData.append("variantImages", variant.images[0]);
    }
  });

  // Send request
  const response = await fetch("/api/categories/1/subcategories/1/products", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  return response.json();
};
```

## React Component Example

```jsx
import React, { useState } from "react";

const ProductVariantForm = () => {
  const [variants, setVariants] = useState([
    {
      sku: "",
      price: 0,
      stock: 0,
      status: "AVAILABLE",
      attributes: [],
      images: [],
    },
  ]);

  const handleVariantImageChange = (variantIndex, files) => {
    const updatedVariants = [...variants];
    updatedVariants[variantIndex].images = Array.from(files);
    setVariants(updatedVariants);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("name", "Test Product");
    formData.append("description", "Test Description");
    formData.append("hasVariants", "true");
    formData.append("variants", JSON.stringify(variants));

    // Add images using Approach 1 (separate field names)
    variants.forEach((variant, variantIndex) => {
      variant.images.forEach((image) => {
        formData.append(`variantImages_${variantIndex}`, image);
      });
    });

    try {
      const response = await fetch(
        "/api/categories/1/subcategories/1/products",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const result = await response.json();
      console.log("Product created:", result);
    } catch (error) {
      console.error("Error creating product:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {variants.map((variant, variantIndex) => (
        <div key={variantIndex}>
          <h3>Variant {variantIndex + 1}</h3>

          <input
            type="text"
            placeholder="SKU"
            value={variant.sku}
            onChange={(e) => {
              const updatedVariants = [...variants];
              updatedVariants[variantIndex].sku = e.target.value;
              setVariants(updatedVariants);
            }}
          />

          <input
            type="number"
            placeholder="Price"
            value={variant.price}
            onChange={(e) => {
              const updatedVariants = [...variants];
              updatedVariants[variantIndex].price = parseFloat(e.target.value);
              setVariants(updatedVariants);
            }}
          />

          <input
            type="number"
            placeholder="Stock"
            value={variant.stock}
            onChange={(e) => {
              const updatedVariants = [...variants];
              updatedVariants[variantIndex].stock = parseInt(e.target.value);
              setVariants(updatedVariants);
            }}
          />

          {/* Multiple image upload for this variant */}
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) =>
              handleVariantImageChange(variantIndex, e.target.files)
            }
          />

          {/* Display selected images */}
          <div>
            {variant.images.map((image, imageIndex) => (
              <img
                key={imageIndex}
                src={URL.createObjectURL(image)}
                alt={`Variant ${variantIndex + 1} Image ${imageIndex + 1}`}
                style={{ width: 100, height: 100, margin: 5 }}
              />
            ))}
          </div>
        </div>
      ))}

      <button type="submit">Create Product</button>
    </form>
  );
};

export default ProductVariantForm;
```

## File Upload Validation

```javascript
const validateVariantImages = (variants) => {
  const errors = [];

  variants.forEach((variant, variantIndex) => {
    if (!variant.images || variant.images.length === 0) {
      errors.push(
        `Variant ${variantIndex + 1} (${variant.sku}) must have at least one image`
      );
    }

    variant.images?.forEach((image, imageIndex) => {
      // Check file size (5MB limit)
      if (image.size > 5 * 1024 * 1024) {
        errors.push(
          `Image ${imageIndex + 1} for variant ${variantIndex + 1} is too large (max 5MB)`
        );
      }

      // Check file type
      if (
        !["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(
          image.type
        )
      ) {
        errors.push(
          `Image ${imageIndex + 1} for variant ${variantIndex + 1} has invalid file type`
        );
      }
    });
  });

  return errors;
};
```

## Error Handling

```javascript
const handleProductCreation = async (productData, variants) => {
  try {
    // Validate images before upload
    const validationErrors = validateVariantImages(variants);
    if (validationErrors.length > 0) {
      throw new Error(`Validation errors: ${validationErrors.join(", ")}`);
    }

    const result = await createProductWithVariants(productData, variants);

    if (result.success) {
      console.log("Product created successfully:", result.data);
      // Handle success (redirect, show message, etc.)
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error("Error creating product:", error);
    // Handle error (show error message, etc.)
  }
};
```

## Best Practices

1. **Use Approach 1 (Separate Field Names)** for maximum flexibility and clarity
2. **Validate images** on the frontend before upload
3. **Show preview** of selected images
4. **Handle loading states** during upload
5. **Provide clear error messages** for validation failures
6. **Limit file sizes** and types on the frontend
7. **Use proper file naming** for better organization

## Testing

```javascript
// Test with different image combinations
const testCases = [
  {
    name: "Single image per variant",
    variants: [
      { sku: "TEST-1", images: [file1] },
      { sku: "TEST-2", images: [file2] },
    ],
  },
  {
    name: "Multiple images per variant",
    variants: [
      { sku: "TEST-1", images: [file1, file2, file3] },
      { sku: "TEST-2", images: [file4, file5] },
    ],
  },
  {
    name: "Mixed image counts",
    variants: [
      { sku: "TEST-1", images: [file1] },
      { sku: "TEST-2", images: [file2, file3, file4] },
    ],
  },
];
```

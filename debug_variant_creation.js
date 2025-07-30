const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const VENDOR_TOKEN = 'YOUR_VENDOR_TOKEN_HERE'; // Replace with your actual token
const CATEGORY_ID = 1; // Replace with actual category ID
const SUBCATEGORY_ID = 1; // Replace with actual subcategory ID

// Simple test data for debugging
const debugProductData = {
    name: "Debug Test Product",
    description: "Testing variant creation with debugging",
    hasVariants: true,
    variants: [
        {
            sku: "DEBUG-001",
            price: 10.99,
            stock: 5,
            status: "AVAILABLE",
            attributes: [
                {
                    attributeType: "Color",
                    attributeValues: ["Red"]
                }
            ]
        }
    ]
};

async function debugVariantCreation() {
    try {
        console.log('🔍 Starting debug test for variant creation...');

        // Create FormData
        const formData = new FormData();

        // Add text fields
        formData.append('name', debugProductData.name);
        formData.append('description', debugProductData.description);
        formData.append('hasVariants', debugProductData.hasVariants.toString());
        formData.append('variants', JSON.stringify(debugProductData.variants));

        // Create a simple test image
        const testImageBuffer = Buffer.from('fake-image-data-for-testing');
        formData.append('variantImages', testImageBuffer, { filename: 'test-image.jpg' });

        console.log('📋 Debug data prepared:');
        console.log('- Name:', debugProductData.name);
        console.log('- Has Variants:', debugProductData.hasVariants);
        console.log('- Variants JSON:', JSON.stringify(debugProductData.variants, null, 2));
        console.log('- Variants Count:', debugProductData.variants.length);

        // Make the request
        console.log('🚀 Sending request...');
        const response = await axios.post(
            `${BASE_URL}/categories/${CATEGORY_ID}/subcategories/${SUBCATEGORY_ID}/products`,
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${VENDOR_TOKEN}`,
                    ...formData.getHeaders()
                },
                timeout: 30000 // 30 second timeout
            }
        );

        console.log('✅ Success! Product created:');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));

        // Check if variants were created
        if (response.data.data && response.data.data.variants) {
            console.log('🎉 Variants created successfully!');
            console.log('Number of variants:', response.data.data.variants.length);
            response.data.data.variants.forEach((variant, index) => {
                console.log(`Variant ${index + 1}:`, {
                    id: variant.id,
                    sku: variant.sku,
                    price: variant.price,
                    stock: variant.stock,
                    status: variant.status,
                    imagesCount: variant.images ? variant.images.length : 0,
                    attributesCount: variant.attributes ? variant.attributes.length : 0
                });
            });
        } else {
            console.log('⚠️ No variants found in response');
        }

    } catch (error) {
        console.error('❌ Error in debug test:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error('No response received:', error.message);
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test non-variant product for comparison
async function debugNonVariantCreation() {
    try {
        console.log('\n🔍 Testing non-variant product creation for comparison...');

        const formData = new FormData();

        formData.append('name', 'Debug Non-Variant Product');
        formData.append('description', 'Testing non-variant creation');
        formData.append('hasVariants', 'false');
        formData.append('basePrice', '15.99');
        formData.append('stock', '10');
        formData.append('status', 'AVAILABLE');

        const testImageBuffer = Buffer.from('fake-image-data-for-testing');
        formData.append('productImages', testImageBuffer, { filename: 'test-product-image.jpg' });

        const response = await axios.post(
            `${BASE_URL}/categories/${CATEGORY_ID}/subcategories/${SUBCATEGORY_ID}/products`,
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${VENDOR_TOKEN}`,
                    ...formData.getHeaders()
                }
            }
        );

        console.log('✅ Non-variant product created successfully:');
        console.log('Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ Error creating non-variant product:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Run debug tests
async function runDebugTests() {
    console.log('🧪 Running Debug Tests\n');

    // Test non-variant first
    await debugNonVariantCreation();

    // Test variant product
    await debugVariantCreation();

    console.log('\n🏁 Debug tests completed!');
}

// Instructions
console.log(`
🔧 Debug Instructions:
1. Install dependencies: npm install form-data axios
2. Replace VENDOR_TOKEN with your actual vendor token
3. Replace CATEGORY_ID and SUBCATEGORY_ID with actual IDs
4. Make sure your server is running and has debug logging enabled
5. Run: node debug_variant_creation.js

📊 This will help identify where the variant creation is failing
`);

// Run the debug tests
runDebugTests(); 
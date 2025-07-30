const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const VENDOR_TOKEN = 'YOUR_VENDOR_TOKEN_HERE'; // Replace with your actual token
const CATEGORY_ID = 1; // Replace with actual category ID
const SUBCATEGORY_ID = 1; // Replace with actual subcategory ID

// Test data for a simple product with 2 variants
const testProductData = {
    name: "Test T-Shirt with Variants",
    description: "A comfortable cotton t-shirt available in different colors and sizes",
    hasVariants: true,
    variants: [
        {
            sku: "TSHIRT-RED-S",
            price: 25.99,
            stock: 50,
            status: "AVAILABLE",
            attributes: [
                {
                    attributeType: "Color",
                    attributeValues: ["Red"]
                },
                {
                    attributeType: "Size",
                    attributeValues: ["Small"]
                }
            ]
        },
        {
            sku: "TSHIRT-BLUE-M",
            price: 27.99,
            stock: 30,
            status: "AVAILABLE",
            attributes: [
                {
                    attributeType: "Color",
                    attributeValues: ["Blue"]
                },
                {
                    attributeType: "Size",
                    attributeValues: ["Medium"]
                }
            ]
        }
    ]
};

async function testVariantProductCreation() {
    try {
        console.log('🚀 Starting variant product creation test...');

        // Create FormData
        const formData = new FormData();

        // Add text fields
        formData.append('name', testProductData.name);
        formData.append('description', testProductData.description);
        formData.append('hasVariants', testProductData.hasVariants.toString());
        formData.append('variants', JSON.stringify(testProductData.variants));

        // Add variant images (you need to have these files in your project)
        // For testing, you can use any image files and rename them
        try {
            formData.append('variantImages', fs.createReadStream('./test-images/variant1.jpg'));
            formData.append('variantImages', fs.createReadStream('./test-images/variant2.jpg'));
        } catch (error) {
            console.log('⚠️  Image files not found. Using placeholder images...');
            // Create placeholder images for testing
            const placeholderImage = Buffer.from('fake-image-data');
            formData.append('variantImages', placeholderImage, { filename: 'variant1.jpg' });
            formData.append('variantImages', placeholderImage, { filename: 'variant2.jpg' });
        }

        console.log('📋 Form data prepared:');
        console.log('- Name:', testProductData.name);
        console.log('- Description:', testProductData.description);
        console.log('- Has Variants:', testProductData.hasVariants);
        console.log('- Variants Count:', testProductData.variants.length);
        console.log('- Variants SKUs:', testProductData.variants.map(v => v.sku));

        // Make the request
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

        console.log('✅ Success! Product created:');
        console.log('Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ Error creating variant product:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Test non-variant product for comparison
async function testNonVariantProductCreation() {
    try {
        console.log('\n🚀 Starting non-variant product creation test...');

        const formData = new FormData();

        formData.append('name', 'Test Single Product');
        formData.append('description', 'A product without variants');
        formData.append('hasVariants', 'false');
        formData.append('basePrice', '29.99');
        formData.append('stock', '50');
        formData.append('status', 'AVAILABLE');
        formData.append('discount', '10');
        formData.append('discountType', 'PERCENTAGE');

        try {
            formData.append('productImages', fs.createReadStream('./test-images/product1.jpg'));
        } catch (error) {
            console.log('⚠️  Image file not found. Using placeholder image...');
            const placeholderImage = Buffer.from('fake-image-data');
            formData.append('productImages', placeholderImage, { filename: 'product1.jpg' });
        }

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

        console.log('✅ Success! Non-variant product created:');
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

// Run tests
async function runTests() {
    console.log('🧪 Running Product Creation Tests\n');

    // Test non-variant first (should work)
    await testNonVariantProductCreation();

    // Test variant product
    await testVariantProductCreation();

    console.log('\n🏁 Tests completed!');
}

// Instructions
console.log(`
📝 Test Instructions:
1. Install dependencies: npm install form-data axios
2. Replace VENDOR_TOKEN with your actual vendor token
3. Replace CATEGORY_ID and SUBCATEGORY_ID with actual IDs
4. Create a test-images folder with some image files (optional)
5. Run: node test_variant_creation.js

🔧 Troubleshooting:
- Make sure your server is running on ${BASE_URL}
- Ensure you have valid category and subcategory IDs
- Check that your vendor token is valid
- Verify that the API endpoint is correct
`);

// Run the tests
runTests(); 
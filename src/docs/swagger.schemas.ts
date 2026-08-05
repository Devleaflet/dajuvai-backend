const paymentMethods = [
  "ONLINE_PAYMENT",
  "CASH_ON_DELIVERY",
  "KHALTI",
  "ESEWA",
  "NPX",
];

const provinceValues = [
  "Koshi",
  "Madhesh",
  "Bagmati",
  "Gandaki",
  "Lumbini",
  "Karnali",
  "Sudurpashchim",
];

const shippingAddress = {
  type: "object",
  required: ["province", "district", "city", "streetAddress"],
  properties: {
    province: { type: "string", enum: provinceValues, example: "Bagmati" },
    district: { type: "string", example: "Kathmandu" },
    city: { type: "string", example: "Kathmandu" },
    streetAddress: { type: "string", example: "Thamel 10" },
    landmark: { type: "string", nullable: true, example: "Near chowk" },
  },
};

const responseEnvelope = (schema: Record<string, unknown>) => ({
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", example: true },
    data: schema,
  },
});

export const swaggerSchemas = {
  SearchProductResult: {
    type: "object",
    required: ["id", "name", "effectivePrice", "originalPrice", "inStock"],
    properties: {
      id: { type: "integer", example: 12 },
      name: { type: "string", example: "Glow Face Wash" },
      thumbnailUrl: { type: "string", nullable: true, format: "uri" },
      effectivePrice: { type: "number", example: 450 },
      originalPrice: { type: "number", example: 500 },
      discountPercentage: { type: "number", example: 10 },
      averageRating: { type: "number", example: 4.5 },
      totalReviews: { type: "integer", example: 21 },
      inStock: { type: "boolean", example: true },
      matchedVariant: { type: "object", nullable: true, example: null },
    },
  },
  TaxonomySuggestion: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "integer", example: 7 },
      name: { type: "string", example: "Cosmetics & Beauty" },
      image: { type: "string", nullable: true, format: "uri" },
    },
  },
  BrandSuggestion: {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "integer", example: 3 },
      name: { type: "string", example: "Radiant" },
    },
  },
  SearchCatalogResponse: {
    type: "object",
    required: ["query", "normalizedQuery", "resolvedFilters", "products", "categories", "subcategories", "brands", "totalProducts", "page", "limit", "totalPages"],
    properties: {
      query: { type: "string", example: "cosmetics" },
      normalizedQuery: { type: "string", example: "cosmetics" },
      resolvedFilters: {
        type: "object",
        required: ["categoryIds", "subcategoryIds", "brandNames", "keyword"],
        properties: {
          categoryIds: { type: "array", items: { type: "integer" }, example: [7] },
          subcategoryIds: { type: "array", items: { type: "integer" }, example: [] },
          brandNames: { type: "array", items: { type: "string" }, example: [] },
          keyword: { type: "string", nullable: true, example: null },
        },
      },
      products: { type: "array", items: { $ref: "#/components/schemas/SearchProductResult" } },
      categories: { type: "array", items: { $ref: "#/components/schemas/TaxonomySuggestion" } },
      subcategories: { type: "array", items: { $ref: "#/components/schemas/TaxonomySuggestion" } },
      brands: { type: "array", items: { $ref: "#/components/schemas/BrandSuggestion" } },
      totalProducts: { type: "integer", example: 42 },
      page: { type: "integer", example: 1 },
      limit: { type: "integer", example: 40 },
      totalPages: { type: "integer", example: 2 },
    },
  },
  CheckoutEstimate: {
    type: "object",
    required: ["merchandiseSubtotal", "shippingTotal", "discountTotal", "taxTotal", "grandTotal"],
    properties: {
      merchandiseSubtotal: { type: "number", example: 4200 },
      priceBreakdown: { type: "object", nullable: true },
      vendorShippingBreakdown: { type: "array", items: { type: "object" } },
      shippingTotal: { type: "number", example: 120 },
      discountTotal: { type: "number", example: 300 },
      appliedPromoCode: { type: "string", nullable: true, example: null },
      taxTotal: { type: "number", example: 0 },
      grandTotal: { type: "number", example: 4020 },
    },
  },
  CheckoutEstimateResponse: responseEnvelope({ $ref: "#/components/schemas/CheckoutEstimate" }),
  MobileCheckoutEstimateRequest: {
    type: "object",
    required: ["shippingAddress"],
    properties: {
      shippingAddress,
      promoCode: { type: "string", nullable: true, example: "SUMMER" },
      isBuyNow: { type: "boolean", example: false },
      productId: { type: "integer", nullable: true, example: null },
      variantId: { type: "integer", nullable: true, example: null },
      quantity: { type: "integer", minimum: 1, nullable: true, example: null },
    },
  },
  CreateOrderRequest: {
    type: "object",
    required: ["shippingAddress", "paymentMethod", "phoneNumber"],
    properties: {
      shippingAddress,
      paymentMethod: { type: "string", enum: paymentMethods, example: "CASH_ON_DELIVERY" },
      phoneNumber: { type: "string", minLength: 10, maxLength: 10, example: "9800000000" },
      fullName: { type: "string", nullable: true, example: "Ramesh Shah" },
      promoCode: { type: "string", nullable: true, example: null },
      serviceCharge: { type: "number", minimum: 0, nullable: true, example: 0 },
      instrumentName: { type: "string", nullable: true, example: null },
      idempotencyKey: { type: "string", nullable: true, example: "mobile-uuid-123" },
      ageRestrictedAcknowledged: { type: "boolean", example: false },
      isBuyNow: { type: "boolean", example: false },
      productId: { type: "integer", nullable: true, example: null },
      variantId: { type: "integer", nullable: true, example: null },
      quantity: { type: "integer", minimum: 1, example: 1 },
    },
  },
  MobileCheckoutResponse: {
    type: "object",
    required: ["user", "cart", "checkoutReady", "missingCheckoutFields", "checkoutDefaults", "availablePaymentMethods", "checkoutEstimate", "checkoutEstimateError", "priceBreakdown", "vendorShippingBreakdown", "totals"],
    properties: {
      user: { type: "object", required: ["id", "fullName", "username", "email", "phoneNumber", "role"], properties: { id: { type: "integer", example: 5 }, fullName: { type: "string", example: "Ramesh Shah" }, username: { type: "string", example: "ramesh" }, email: { type: "string", format: "email", example: "ramesh@example.com" }, phoneNumber: { type: "string", example: "9800000000" }, role: { type: "string", example: "user" }, address: { type: "object", nullable: true } } },
      cart: { type: "object", required: ["id", "total", "items"], properties: { id: { type: "integer", nullable: true, example: 3 }, total: { type: "number", example: 4200 }, items: { type: "array", items: { type: "object" } } } },
      checkoutReady: { type: "boolean", example: true },
      missingCheckoutFields: { type: "array", items: { type: "string" }, example: [] },
      checkoutDefaults: { type: "object", properties: { fullName: { type: "string" }, phoneNumber: { type: "string" }, shippingAddress: { $ref: "#/components/schemas/MobileShippingAddress" }, paymentMethod: { type: "string", enum: paymentMethods } } },
      availablePaymentMethods: { type: "array", items: { type: "string", enum: paymentMethods }, example: ["CASH_ON_DELIVERY", "ESEWA", "NPX"] },
      checkoutEstimate: { $ref: "#/components/schemas/CheckoutEstimate", nullable: true },
      checkoutEstimateError: { type: "string", nullable: true, example: null },
      priceBreakdown: { type: "object", nullable: true },
      vendorShippingBreakdown: { type: "array", items: { type: "object" } },
      totals: { type: "object", nullable: true },
    },
  },
  MobileShippingAddress: shippingAddress,
};

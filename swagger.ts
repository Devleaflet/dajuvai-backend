import swaggerJSDoc from "swagger-jsdoc";
import path from "path";
import { mountedRouteInventory } from "./src/scripts/routeInventory";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DajuVai Backend",
      version: "1.0.0",
      description:
        "HTTP API for DajuVai customer, vendor, admin, delivery, catalog, checkout, payment, notification, and merchandising workflows.",
    },
    servers: [
      {
        url: "http://localhost:5000",
      },
      {
        url: "https://dev.api.dajuvai.com",
      },
      {
        url: "https://api.dajuvai.com",
      },
    ],
    components: {
      schemas: {
        ValidationFieldError: {
          type: "object",
          required: ["field", "message"],
          properties: {
            field: {
              type: "string",
              example: "email",
            },
            message: {
              type: "string",
              example: "Invalid email format",
            },
          },
        },
        ApiError: {
          type: "object",
          required: ["success", "errorCode", "message"],
          properties: {
            success: {
              type: "boolean",
              enum: [false],
              example: false,
            },
            errorCode: {
              type: "string",
              example: "VALIDATION_ERROR",
            },
            message: {
              type: "string",
              example: "Validation failed",
            },
            errors: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ValidationFieldError",
              },
              description: "Present when the error contains field-level validation details.",
            },
            stack: {
              type: "string",
              description: "Included only in non-production environments.",
            },
          },
        },
        Error: {
          $ref: "#/components/schemas/ApiError",
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "integer", example: 42 },
            orderNumber: { type: "string", example: "DV-20260729-00042" },
            orderedById: { type: "integer", example: 7 },
            totalPrice: { type: "number", format: "decimal", example: 1850.5 },
            shippingFee: { type: "number", format: "decimal", example: 100 },
            merchandiseSubtotal: { type: "number", format: "decimal", nullable: true, example: 1750.5 },
            discountTotal: { type: "number", format: "decimal", example: 0 },
            taxTotal: { type: "number", format: "decimal", example: 0 },
            paymentStatus: { type: "string", enum: ["PAID", "UNPAID"], example: "UNPAID" },
            paymentMethod: {
              type: "string",
              enum: ["ONLINE_PAYMENT", "CASH_ON_DELIVERY", "KHALIT", "ESEWA", "NPX"],
              example: "CASH_ON_DELIVERY",
            },
            status: {
              type: "string",
              enum: ["ORDER_PLACED", "CONFIRMED", "PROCESSING", "ARRIVED_AT_WAREHOUSE", "DELAYED", "ASSIGNED_TO_RIDER", "DELIVERED", "NOT_RECEIVED", "CANCELLED", "RETURNED"],
              example: "ORDER_PLACED",
            },
            deliveryStatus: {
              type: "string",
              enum: ["order_processing", "at_warehouse", "ready_for_delivery", "rider_assigned", "out_for_delivery", "delivered", "delivery_failed", "returned_warehouse"],
              example: "order_processing",
            },
            appliedPromoCode: { type: "string", nullable: true, example: null },
            phoneNumber: { type: "string", nullable: true, example: "9800000000" },
            mTransactionId: { type: "string", nullable: true, example: "TXN_1700000000000_abc123" },
            createdAt: { type: "string", format: "date-time", example: "2026-07-29T10:30:00.000Z" },
            updatedAt: { type: "string", format: "date-time", example: "2026-07-29T10:35:00.000Z" },
          },
        },
        Vendor: {
          type: "object",
          properties: {
            id: { type: "integer", example: 12 },
            businessName: { type: "string", example: "Tech Supplies Co." },
            email: { type: "string", format: "email", example: "vendor@example.com" },
            phoneNumber: { type: "string", example: "9800000000" },
            telePhone: { type: "string", nullable: true, example: "01-1234567" },
            districtId: { type: "integer", nullable: true, example: 3 },
            businessRegNumber: { type: "string", nullable: true, example: "REG-12345" },
            taxNumber: { type: "string", nullable: true, example: "PAN-12345" },
            isVerified: { type: "boolean", example: true },
            isApproved: { type: "boolean", example: true },
            profilePicture: { type: "string", nullable: true, example: "https://cdn.example.com/vendor.jpg" },
            createdAt: { type: "string", format: "date-time", example: "2026-07-29T10:30:00.000Z" },
            updatedAt: { type: "string", format: "date-time", example: "2026-07-29T10:35:00.000Z" },
          },
        },
        Banner: {
          type: "object",
          properties: {
            id: { type: "integer", example: 3 },
            name: { type: "string", example: "Summer Sale Banner" },
            desktopImage: { type: "string", nullable: true, example: "https://cdn.example.com/banners/summer-desktop.jpg" },
            mobileImage: { type: "string", nullable: true, example: "https://cdn.example.com/banners/summer-mobile.jpg" },
            type: { type: "string", enum: ["HERO", "SIDEBAR", "PRODUCT", "SPECIAL_DEALS"], example: "HERO" },
            status: { type: "string", enum: ["SCHEDULED", "ACTIVE", "EXPIRED"], example: "SCHEDULED" },
            startDate: { type: "string", format: "date-time", example: "2026-08-01T00:00:00.000Z" },
            endDate: { type: "string", format: "date-time", example: "2026-08-31T23:59:59.000Z" },
            productSource: { type: "string", nullable: true, enum: ["manual", "category", "subcategory", "deal", "external"], example: "external" },
            placementAfterSection: { type: "integer", nullable: true, example: 3 },
            selectedProducts: { type: "array", nullable: true, items: { type: "integer" }, example: [101, 102] },
            selectedCategoryId: { type: "integer", nullable: true, example: 4 },
            selectedSubcategoryId: { type: "integer", nullable: true, example: 12 },
            selectedDealId: { type: "integer", nullable: true, example: 8 },
            externalLink: { type: "string", nullable: true, format: "uri", example: "https://dajuvai.com/offers/summer" },
            createdById: { type: "integer", example: 1 },
            createdAt: { type: "string", format: "date-time", example: "2026-07-29T10:30:00.000Z" },
            updatedAt: { type: "string", format: "date-time", example: "2026-07-29T10:30:00.000Z" },
          },
        },
      },
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Enter the access JWT returned by login. User/admin tokens must include id and role; vendor tokens must include id and businessName. Do not use refresh, email-change, or test tokens.",
        },
      },
      responses: {
        ValidationError: {
          description: "Request validation failed.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        Unauthorized: {
          description: "Authentication is missing or invalid.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        Forbidden: {
          description: "Authenticated account lacks required role or permission.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        NotFound: {
          description: "Requested resource or route was not found.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        Conflict: {
          description: "Request conflicts with an existing resource or state.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        InternalServerError: {
          description: "Unexpected server or database failure.",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApiError",
              },
            },
          },
        },
        PaymentRequired: {
          description: "Payment processing failed or payment is required.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        UnprocessableEntity: {
          description: "The request is valid JSON but cannot be processed in its current state.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        TooManyRequests: {
          description: "Rate limit exceeded. Retry after a short delay.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        Gone: {
          description: "The requested token or resource is no longer available.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
        ServiceUnavailable: {
          description: "A required downstream service is temporarily unavailable.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
        },
      },
    },
  },
  apis: [
    path.resolve(__dirname, "src/routes/**/*.ts"),
    path.resolve(__dirname, "src/routes/**/*.js"),
  ],
};

const swaggerSpec = swaggerJSDoc(options);
const swaggerDocument = swaggerSpec as {
  paths?: Record<string, Record<string, unknown>>;
};

const legacyPathAliases: Record<string, string> = {
  "/api/delivery/admin/riders": "/api/admin/delivery/riders",
  "/api/delivery/admin/riders/{riderId}": "/api/admin/delivery/riders/{riderId}",
  "/api/delivery/admin/riders/{riderId}/reset-password":
    "/api/admin/delivery/riders/{riderId}/reset-password",
  "/api/delivery/admin/orders/processing": "/api/admin/delivery/orders/processing",
  "/api/delivery/admin/orders/{orderId}/processing":
    "/api/admin/delivery/orders/{orderId}/processing",
  "/api/delivery/admin/orders/{orderId}/returned-warehouse":
    "/api/admin/delivery/orders/{orderId}/returned-warehouse",
  "/api/delivery/admin/orders/orderItems/{orderItemId}/collect-items":
    "/api/admin/delivery/orders/orderItems/{orderItemId}/collect-items",
  "/api/delivery/admin/warehouse-order-queue":
    "/api/admin/delivery/warehouse-order-queue",
  "/api/delivery/admin/orders/{orderId}/assign-rider":
    "/api/admin/delivery/orders/{orderId}/assign-rider",
  "/api/delivery/admin/assignments": "/api/admin/delivery/assignments",
  "/api/delivery/admin/orders/{orderId}/assignment":
    "/api/admin/delivery/orders/{orderId}/assignment",
  "/api/delivery/admin/orders/{orderId}/reset-to-warehouse":
    "/api/admin/delivery/orders/{orderId}/reset-to-warehouse",
  "/api/delivery/rider/my-assignments": "/api/rider/delivery/my-assignments",
  "/api/delivery/rider/orders/{orderId}/pickup":
    "/api/rider/delivery/orders/{orderId}/pickup",
  "/api/delivery/rider/orders/{orderId}/delivered":
    "/api/rider/delivery/orders/{orderId}/delivered",
  "/api/delivery/rider/orders/{orderId}/failed":
    "/api/rider/delivery/orders/{orderId}/failed",
};

for (const [aliasPath, canonicalPath] of Object.entries(legacyPathAliases)) {
  const canonicalOperation = swaggerDocument.paths?.[canonicalPath];
  if (canonicalOperation && !swaggerDocument.paths?.[aliasPath]) {
    swaggerDocument.paths[aliasPath] = canonicalOperation;
  }
}

const operationKey = (method: string, routePath: string) =>
  `${method.toLowerCase()} ${routePath}`;
const routeSecurity = new Map(
  mountedRouteInventory.map((route) => [
    operationKey(
      route.method,
      route.path.replace(/:\w+/g, (name) => `{${name.slice(1)}}`),
    ),
    route.requiresAuthentication,
  ]),
);

for (const [routePath, pathItem] of Object.entries(swaggerDocument.paths ?? {})) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const operation = pathItem[method] as Record<string, unknown> | undefined;
    if (!operation) continue;
    const requiresAuthentication = routeSecurity.get(operationKey(method, routePath));
    if (requiresAuthentication === undefined) continue;
    operation.security = requiresAuthentication ? [{ bearerAuth: [] }] : [];

    const responses = operation.responses as Record<string, unknown> | undefined;
    if (responses) {
      const responseRefs: Record<string, string> = {
        "400": "ValidationError",
        "401": "Unauthorized",
        "403": "Forbidden",
        "404": "NotFound",
        "409": "Conflict",
        "500": "InternalServerError",
        "402": "PaymentRequired",
        "410": "Gone",
        "422": "UnprocessableEntity",
        "429": "TooManyRequests",
        "503": "ServiceUnavailable",
      };
      for (const [status, responseName] of Object.entries(responseRefs)) {
        if (responses[status]) responses[status] = { $ref: `#/components/responses/${responseName}` };
      }
    }
  }
}

export default swaggerSpec;

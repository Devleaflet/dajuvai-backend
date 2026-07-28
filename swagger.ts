import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DajuVai Backend",
      version: "1.0.0",
      description: "Your API Description",
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
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Enter the access JWT returned by login. User/admin tokens must include id and role; vendor tokens must include id and businessName. Do not use refresh, email-change, or test tokens.",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // apis: ["./src/routes/*.ts"], // Path to your API docs
  apis: ["./src/routes/*.ts"], // Path to your API docs
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;

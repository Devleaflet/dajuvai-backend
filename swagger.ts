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
        url: "https://leafletdv.onrender.com", // or your actual URL
        // url: "http://localhost:4000", // or your actual URL
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT Bearer token **_only_**",
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

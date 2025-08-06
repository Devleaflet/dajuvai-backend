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
        url:"https://dev.api.dajuvai.com",
      },
      {
        url:"https://api.dajuvai.com",
      },
      {
        url: "http://localhost:4000", 
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

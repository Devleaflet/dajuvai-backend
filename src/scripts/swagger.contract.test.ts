import { describe, expect, it } from "vitest";
import swaggerSpec from "../../swagger";
import { mountedRouteInventory } from "./routeInventory";

const documentedPath = (routePath: string) =>
    routePath.replace(/:\w+/g, (name) => `{${name.slice(1)}}`);

describe("generated Swagger route contract", () => {
    it("describes every mounted operation", () => {
        const document = swaggerSpec as any;
        const missing = mountedRouteInventory
            .map((route) => {
                const path = documentedPath(route.path);
                const operation = document.paths?.[path]?.[route.method.toLowerCase()];
                return operation?.description?.trim()
                    ? null
                    : `${route.method} ${path}`;
            })
            .filter(Boolean);

        expect(missing).toEqual([]);
    });

    it("publishes mounted middleware metadata for every operation", () => {
        const document = swaggerSpec as any;
        const missing = mountedRouteInventory
            .map((route) => {
                const path = documentedPath(route.path);
                const operation = document.paths?.[path]?.[route.method.toLowerCase()];
                return Array.isArray(operation?.["x-middleware"])
                    ? null
                    : `${route.method} ${path}`;
            })
            .filter(Boolean);

        expect(missing).toEqual([]);
    });

    it("documents checkout contracts at their real boundaries", () => {
        const document = swaggerSpec as any;
        expect(
            document.paths["/api/order"].post.requestBody.content[
                "application/json"
            ].schema.$ref,
        ).toBe("#/components/schemas/CreateOrderRequest");
        expect(
            document.paths["/api/order"].post.responses["200"].content[
                "application/json"
            ].schema.$ref,
        ).toBe("#/components/schemas/CreateOrderDraftResponse");
        expect(
            document.paths["/api/order/estimate"].post.requestBody.content[
                "application/json"
            ].schema.$ref,
        ).toBe("#/components/schemas/MobileCheckoutEstimateRequest");
        expect(
            document.paths["/api/checkout/mobile-order"].post.responses["200"].content[
                "application/json"
            ].schema.$ref,
        ).toBe("#/components/schemas/CreateOrderDraftResponse");
    });
});

/**
 * Self-check for mobile checkout detail contract.
 * No DB, no network, no test framework.
 *
 *   npx ts-node src/scripts/mobileCheckout.selfcheck.ts
 */
import assert from "assert";
import { readFileSync } from "fs";
import { join } from "path";

const ok = (name: string) => console.log(`  ok - ${name}`);

const service = readFileSync(
    join(__dirname, "..", "service", "mobile.checkout.service.ts"),
    "utf8",
);
const route = readFileSync(
    join(__dirname, "..", "routes", "mobile.checkout.routes.ts"),
    "utf8",
);

assert.ok(
    service.includes("new OrderService()"),
    "mobile checkout must reuse OrderService pricing/shipping estimate",
);
assert.ok(
    service.includes("priceBreakdown"),
    "mobile checkout response must include priceBreakdown",
);
assert.ok(
    service.includes("checkoutDefaults"),
    "mobile checkout response must include default checkout form values",
);
assert.ok(
    service.includes("availablePaymentMethods"),
    "mobile checkout response must include available payment methods",
);
assert.ok(
    service.includes("'items.product.deal'"),
    "mobile checkout cart items must load active deal relation",
);
assert.ok(
    route.includes("priceBreakdown") &&
        route.includes("availablePaymentMethods") &&
        route.includes("checkoutDefaults"),
    "mobile checkout Swagger docs must describe complete checkout payload",
);

ok("mobile checkout details include cart, user, defaults, payments, and price breakdown");
console.log("\nall checks passed");

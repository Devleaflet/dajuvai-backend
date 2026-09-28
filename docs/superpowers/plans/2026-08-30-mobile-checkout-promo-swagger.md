# Mobile Checkout Promo and Swagger Accuracy

> **For the agent executing this plan:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make promo validation/checkout contracts reliable for web and mobile, preserve cart behavior while suppressing Buy Now cart pushes, and make Swagger reflect actual routes, middleware, schemas, envelopes, statuses, and errors.

**Architecture:** Keep pricing and promo calculation in `OrderService`; add boundary validation only where routes currently lack it; reuse the existing mobile estimate schema for the equivalent estimate route; update centralized Swagger schemas and route metadata; strengthen the Swagger validator for contract drift.

**Tech stack:** TypeScript, Express, Zod, TypeORM, Jest/Vitest project scripts, OpenAPI 3.

### Task 1: Lock promo and checkout contracts with tests

**Files:** `src/utils/zod_validations/promo.zod.ts`, `src/utils/zod_validations/order.zod.ts`, `src/utils/zod_validations/*.test.ts` or focused service tests.

- Add failing tests for trimmed/bounded promo input, invalid estimate payloads, and Buy Now field coherence.
- Add failing regression coverage for valid promo lookup/discount parity and existing cart notification behavior if coverage is missing.
- Run the focused tests and confirm failures are contract failures, not test setup errors.

### Task 2: Implement minimal backend boundary fixes

**Files:** `src/routes/order.routes.ts`, `src/utils/zod_validations/promo.zod.ts`, `src/utils/zod_validations/order.zod.ts`, `src/controllers/promo.controller.ts`.

- Add check-promo validation and estimate validation middleware.
- Align safe validation constraints with the mobile estimate schema and existing normalization.
- Correct response-envelope typo(s) only where the change is backward-safe and covered.
- Keep order pricing, inventory, payment, and notification algorithms unchanged.
- Run focused tests plus the backend unit suite.

### Task 3: Make Swagger accurate and enforceable

**Files:** `src/routes/order.routes.ts`, `src/routes/mobile.checkout.routes.ts`, `src/routes/promo.routes.ts`, `src/docs/swagger.schemas.ts`, `swagger.ts`, `src/scripts/validate-swagger.ts`.

- Document actual request fields, validation, auth middleware, response envelopes, draft/COD variants, error statuses, and examples.
- Ensure every mounted operation has a meaningful description and every validated/authenticated route is represented accurately.
- Add validator checks for descriptions and required checkout/promo contracts without inventing undocumented behavior.
- Run Swagger generation/validation and route inventory parity checks.

### Task 4: Verify cross-client behavior and regressions

**Files:** no production changes unless verification exposes a defect.

- Inspect web request payloads against backend schemas.
- Reconfirm no mobile source exists in the workspace; report that boundary explicitly.
- Run TypeScript, backend tests, Swagger validation, route audit, frontend build/check, and `git diff --check`.
- Review the final diff for scope leaks and preserve unrelated user edits.

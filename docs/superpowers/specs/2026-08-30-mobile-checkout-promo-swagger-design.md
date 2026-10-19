# Mobile Checkout Promo and Swagger Accuracy Design

## Context

Web checkout sends promo codes through `/api/order/check-promo`, `/api/order/estimate`, and `/api/order`. Mobile uses the same order service through `/api/mobile-checkout/*`. The backend already owns promo normalization and discount calculation, so the safest parity fix is to make validation and route documentation match that shared contract rather than create a mobile-only pricing path.

## Decisions

1. Promo codes are trimmed, bounded, and validated before the check-promo and estimate handlers. Existing missing/legacy fields remain accepted where backward compatibility is required.
2. Buy Now cart creation keeps creating the cart item but suppresses only the add-to-cart FCM notification. Missing `source` remains the legacy add-to-cart behavior.
3. Checkout estimate/order schemas require coherent Buy Now fields and document the actual response envelopes, including online-payment drafts and COD orders.
4. Swagger is updated from the mounted routes and current serializer/controller behavior. Route-level middleware, validation, auth, statuses, examples, and error envelopes are documented; no pricing, stock, payment, or checkout algorithm changes are introduced.
5. No mobile client source is present in this workspace. Backend contracts are verified against the web client and mobile route schemas; any remaining mobile-only payload mismatch must be fixed in the mobile repository.

## Non-goals

- Changing payment-provider behavior or renaming the existing `KHALIT` enum without evidence from an integrated client.
- Making the public promo-list route private, since that changes authorization behavior beyond the reported checkout defect.
- Sending any new push notifications.

## Verification

Backend unit tests, Swagger validation, route inventory parity, TypeScript compilation, and frontend production build/check are required. The final report must distinguish verified backend behavior from mobile-client behavior that cannot be inspected here.

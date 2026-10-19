/**
 * Prose for operations whose jsdoc carries a summary but no description.
 *
 * Kept in one file rather than scattered across sixty-seven jsdoc blocks: the
 * text is what a reader of the API reference needs, it is easier to keep
 * consistent in one place, and `swagger.ts` applies it only where the block
 * itself says nothing. A jsdoc `description` always wins — this is a fallback,
 * never an override.
 *
 * Each entry says something the summary does not: who may call it, what it
 * costs, or the constraint that catches people out.
 */
export const operationDescriptions: Record<string, string> = {
    "POST /api/auth/signup/staff":
        "Creates a staff account with a permission matrix. Admin only; the staff member verifies their own email before they can sign in.",
    "GET /api/search/suggestions":
        "Ranked type-ahead suggestions drawn from products, categories and approved search aliases. Public and response-cached.",
    "GET /api/placements":
        "Every storefront placement and the entries it shows, in display order. Public.",
    "GET /api/placements/{slug}":
        "One placement's entries in display order. Public; the slug is the placement key, not an id.",
    "DELETE /api/vendors/me":
        "Schedules the calling vendor's own account for deletion after a grace period, during which signing in cancels it. The account and its products stay live until the period expires.",
    "POST /api/cart":
        "Adds a product or variant to the caller's cart. Pass source=buy_now to skip the 'added to cart' notification for a direct purchase.",
    "DELETE /api/cart":
        "Removes a cart item, or decreases its quantity by one when decreaseOnly is set.",
    "POST /api/banners":
        "Creates a banner. Artwork must already be uploaded; this stores the URLs and the schedule.",
    "PATCH /api/banners/{id}":
        "Updates a banner. Only the fields sent are changed, so artwork survives a schedule-only edit.",
    "GET /api/banners/{id}":
        "One banner with its products resolved, which is what an edit form needs to prefill.",
    "GET /api/banners":
        "Every banner, live and scheduled. The storefront filters by date; this does not.",
    "GET /api/banners/search/{bannerName}":
        "Case-insensitive partial match on banner name.",
    "POST /api/order":
        "Creates an order from the caller's cart, or from a single product when isBuyNow is set. Reserves stock and claims any promo in one transaction, so an exhausted promo or insufficient stock rolls the whole order back.",
    "GET /api/order":
        "Every order across all customers, paginated and filterable. Admin or staff with the order permission.",
    "GET /api/order/payment/success":
        "Gateway redirect target. Verifies the payment with the provider before marking the order paid; never trust it as proof on its own.",
    "GET /api/order/payment/cancel":
        "Gateway redirect target for an abandoned payment. Releases the reserved stock and any claimed promo usage.",
    "GET /api/order/{orderId}":
        "One order in full. The owner sees their own; an admin sees any.",
    "GET /api/order/customer/order/{id}":
        "One of the calling customer's own orders, with its items and price breakdown.",
    "GET /api/order/admin/{orderId}":
        "One order in full, including every vendor's items and the shipping charged per vendor. Admin or staff.",
    "PUT /api/order/admin/{orderId}/status":
        "Moves an order to a new status. A reason is required and recorded against the actor; send expectedCurrentStatus so a concurrent change is rejected rather than overwritten.",
    "GET /api/order/admin/order/search":
        "Finds orders by number, customer or vendor. Admin or staff.",
    "GET /api/order/vendor/orders":
        "Orders containing the calling vendor's products, scoped to their own items and settlement. Never another vendor's items, and never the order's grand total.",
    "GET /api/order/vendor/orders/export":
        "Every order matching the current filters, unpaginated, for export. Deliberately ignores page and limit.",
    "GET /api/order/vendor/{orderId}":
        "One order as the calling vendor may see it: their own lines, their own payable, and the delivery address.",
    "GET /api/order/customer/history":
        "The calling customer's own orders, newest first.",
    "DELETE /api/order/order/delete/all":
        "Deletes every order. Development and test environments only.",
    "POST /api/district":
        "Adds a district. Districts drive shipping zones, so the name must be unique.",
    "PUT /api/district/{id}":
        "Renames a district. Addresses and vendor shipping zones already referencing it keep their data.",
    "GET /api/district":
        "Every district, for address and shipping-zone pickers. Public.",
    "GET /api/district/{id}": "One district by id.",
    "DELETE /api/district/{id}":
        "Removes a district. Existing references keep their stored values, but it can no longer be chosen.",
    "POST /api/homepage":
        "Creates a homepage section from one product source: chosen products, a category, a subcategory or a deal.",
    "PUT /api/homepage/{id}":
        "Updates a homepage section. Changing its source clears the previous source's selection.",
    "GET /api/homepage":
        "Every homepage section with its resolved products, in display order.",
    "GET /api/homepage/{id}":
        "One homepage section with its products resolved.",
    "DELETE /api/homepage/{id}":
        "Removes a homepage section. The products it showed are not affected.",
    "PATCH /api/homepage/{id}/toggle-status":
        "Shows or hides a section on the storefront without deleting it.",
    "GET /api/product/{id}":
        "One product with its variants, images and vendor. Public.",
    "DELETE /api/product/{id}":
        "Archives a product rather than deleting it, so its order history survives and it can be restored.",
    "POST /api/product/image/upload":
        "Uploads product artwork to Cloudinary and returns the stored URLs. Images are capped and re-encoded by the folder's preset.",
    "GET /api/product/admin/products":
        "Every product from every vendor, with the filters and sorting the admin table offers.",
    "GET /api/admin/placements/{slug}/items":
        "A placement's entries: nested by category for the mega menu, flat elsewhere.",
    "PATCH /api/admin/placements/{slug}/items/{itemId}":
        "Shows or hides one entry without removing it, which keeps its position.",
    "DELETE /api/admin/placements/{slug}/items/{itemId}":
        "Removes an entry from the placement. The catalog row itself is untouched, and re-adding puts it at the end.",
    "GET /api/admin/placements/{slug}/available-items":
        "Catalog rows eligible for this placement and not already in it, for the add picker.",
    "GET /api/admin/search-aliases":
        "Alias candidates learned from searches that found nothing, awaiting approval.",
    "POST /api/admin/search-aliases/{id}/approve":
        "Approves an alias so the term starts matching in search.",
    "POST /api/admin/search-aliases/{id}/disable":
        "Disables an alias without deleting it, so it is not relearned.",
    "POST /api/admin/delivery/orders/bulk-assign":
        "Assigns one rider to several orders. Reports per-order results rather than failing the batch on the first refusal.",
    "GET /api/payments/payment-instruments":
        "Instruments the gateway currently offers, for the checkout picker.",
    "POST /api/payments/service-charge":
        "The gateway's charge for a given amount and instrument, so checkout can show the real total before paying.",
    "POST /api/payments/process-id":
        "Obtains the gateway process id a payment must be initiated with.",
    "POST /api/payments/initiate-payment":
        "Starts a payment and returns where to send the customer. The order stays unpaid until the gateway confirms.",
    "POST /api/payments/check-status":
        "Asks the gateway the current state of a transaction, for reconciling a payment whose callback never arrived.",
    "GET /api/payments/response":
        "Gateway redirect handler. Verifies the result with the provider before changing the order.",
    "GET /api/notification":
        "The caller's notifications, newest first, whichever kind of account they hold.",
    "PATCH /api/notification/read-all":
        "Marks every notification the caller can see as read.",
    "DELETE /api/notification/devices/{deviceId}":
        "Unregisters a device so it stops receiving pushes. Call this on sign-out.",
    "POST /api/notification/admin/send/user":
        "Sends a push to one user's registered devices. Admin only.",
    "POST /api/notification/admin/send/multicast":
        "Sends one push to many users at once. Admin only.",
    "POST /api/notification/admin/send/topic":
        "Sends a push to everyone subscribed to a topic. Admin only.",
    "GET /api/notification/admin/history":
        "Pushes already sent, with their delivery outcome. Admin only.",
    "GET /api/notification/admin/stats":
        "Delivery and read counts across sent pushes. Admin only.",
    "GET /api/notification/{id}":
        "One notification by id, if the caller may see it.",
    "GET /api/delivery/admin/orders/at-warehouse":
        "Orders sitting at the warehouse and ready to be given to a rider.",
    "POST /api/delivery/admin/orders/bulk-assign":
        "Assigns one rider to several warehouse orders, reporting each result separately.",
    "GET /api/delivery/admin/orders/failed-deliveries":
        "Failed delivery attempts. These are log entries, so a recovered order stays listed; read the order's own status for where it is now.",
};

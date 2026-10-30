# Part-3 Part-B: E-Commerce Store, Product Management, Cart, and Checkout

## Customer storefront
- Select **Shop** from the main bottom navigation.
- Search published products by title or description. Product cards show the first media item, current price, compare-at price, and a calculated discount badge.
- Open a product to view all uploaded media, description, variant selectors, quantity controls, **Add to Cart**, and **Buy Now**.
- The cart icon shows the item count. The cart drawer supports quantity changes and shows item subtotals.
- Checkout requires a signed-in customer. Step 1 collects street, building number, landmark, address lines, 6-digit PIN code, and optional email. Step 2 offers COD or administrator-configured online methods. COD adds ₹20.
- Order totals and item prices are recomputed by the server from published product records. The server records the customer's name and mobile from the verified session, not from the submitted form.
- Confirmation displays **Your Order is Confirmed! Delivered within 7 days.** Online payment details are displayed for customer action; the app does not verify payment receipts automatically.

## Admin Store
- Open Admin Panel → **Store** → **Add a Product**.
- Upload multiple image/video files. Uploads use a server-signed Cloudinary request; published products require at least one media URL.
- Enter title, description, selling price, optional compare price, and optional variants. Enter each variant on a new line, for example `Size: Small, Medium, Large`.
- Publish to make the product immediately available through `GET /api/products`.
- The payment details section supports a QR image upload or URL, phone number, and UPI ID. Save settings to show configured options at checkout.

## Admin Orders
- Open Admin Panel → **Orders** to search, inspect, and update order status.
- Order details include customer name/mobile/email, full delivery address, item quantities, variants, payment method, totals, and timestamp with seconds.

## Backend endpoints
- `GET /api/products` — published product catalog.
- `GET /api/products?all=true` — admin-only complete catalog.
- `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id` — admin product management.
- `POST /api/admin/cloudinary-signature` — admin-only Cloudinary signature for image/video upload.
- `GET /api/admin/payment-settings`, `POST /api/admin/payment-settings` — payment configuration.
- `POST /api/orders` — signed-in customer order placement with server-side product price validation.
- `GET /api/orders` — signed-in customer's own orders.
- `GET /api/orders?admin=true`, `PUT /api/orders/:id/status` — admin-only order management.

## Required deployment configuration
Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the server environment for direct media uploads. Do not expose the Cloudinary API secret in frontend variables. `DATABASE_URL` must point to the configured PostgreSQL/Neon database.

## Verification notes
The updated TypeScript/TSX files were parsed with the TypeScript transpiler and passed syntax diagnostics. The full production build and live Neon/Cloudinary/device tests were not run in this environment because project dependencies are not installed here.

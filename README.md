# Draft Orders Lambda

Request-a-quote endpoint for roofvents.com. Receives the cart + contact form as JSON, finds or creates the Shopify customer, creates a draft order (GraphQL Admin API), and emails a confirmation via Gmail SMTP.

## 1. Shopify app (Dev Dashboard)

1. Go to the Shopify **Dev Dashboard** (dev.shopify.com) → **Create app** → name it e.g. "Quote Requests".
2. Create a version with these Admin API **scopes**:
   - `read_customers`, `write_customers`
   - `read_draft_orders`, `write_draft_orders`
   - `read_products` (needed to read product URLs/images for the email)
3. Release the version, then **install** the app on `e91eee-4.myshopify.com`.
4. Under the app's **Settings**, copy the **Client ID** and **Client secret** into `.env`.

The app uses the client credentials grant, so no OAuth redirect setup is needed.

## 2. Environment

Copy `.env.example` → `.env` and fill it in. Never commit `.env`.

## 3. Local testing (hits the real store)

```
npm install
npm run test:local     # one request with a sample cart
npm run dev            # http://localhost:3000 for use with `shopify theme dev`
```

During dev keep `DRAFT_ORDER_TAGS=test` and `TEST_EMAIL_OVERRIDE=<your email>`, and delete test draft orders afterwards.

## 4. Build + deploy

```
npm run build          # → dist/index.mjs
npm run zip            # → dist/function.zip
```

AWS Lambda console:
1. Create function → Node.js 20.x (or newer), arm64 or x86_64.
2. Upload `dist/function.zip`. Handler: `index.handler`.
3. Configuration → General: timeout **15 s**.
4. Configuration → Environment variables: everything from `.env` except the local-only ones (`TEST_VARIANT_ID`; blank `TEST_EMAIL_OVERRIDE` and `DRAFT_ORDER_TAGS` for production).
5. Configuration → Function URL → Create, auth type **NONE**, **leave CORS off** (the code handles CORS).
6. Put the Function URL in the theme's `custom.js`.

Logs: CloudWatch → Log groups → `/aws/lambda/<function-name>`.

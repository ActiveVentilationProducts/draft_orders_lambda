# Draft Orders Lambda — Project Handoff

Rebuild of the legacy PHP "request a quote" draft-order endpoint for roofvents.com (Active Ventilation Products) as a **Node.js AWS Lambda** using the **Shopify GraphQL Admin API** and a **Dev Dashboard app**.

This folder is a clean start on purpose: the old repo has credentials committed in its history. **Never copy credentials from the old repo.** Copy only code/HTML.

---

## Related directories (outside this folder; ask before reading unless added as working dirs)

- **Old PHP app:** `c:\Users\PC\Documents\site\draft_orders`
  - `draft_order.php` — the live endpoint being replaced. Everything else there is old copies/tests.
  - Email template = the `$body` string, lines ~250–1196 of `draft_order.php`.
  - Line item rows HTML = the `$product_list` loop, lines ~158–233.
- **Shopify theme:** `c:\Users\PC\Documents\site\active-vent-new`
  - Form submit code: `assets/custom.js` (~line 470–575), `$("#itg_form").submit(...)`, posts to `https://dev.roofvents.com/roofvents/draft_order.php` (line ~526).

Store: `e91eee-4.myshopify.com`

---

## What the old PHP does (behavior to preserve)

1. Receives multipart `FormData` POST from the theme.
2. Creates customer via REST (`first_name`, `last_name`, `email`, hardcoded password — drop that). If "email has already been taken", searches by email and uses the existing customer.
3. Creates draft order via REST with: `line_items` (`variant_id`, `quantity`, `properties` as `[{name, value}]`), `customer.id`, `note`, `shipping_address` (first/last name, company, address1, city, province, zip, country, phone).
4. Sends a custom HTML confirmation email to the customer via Gmail SMTP (PHPMailer, `smtp.gmail.com:465` SSL), from `sales@roofvents.com`, name "Active Ventilation Products", subject "Thank you for placing your order!".
5. Echoes text; **always returns HTTP 200 even on failure** (bug).

### Email template variables
| PHP var | Source | Template line(s) |
|---|---|---|
| `$draft_name` | draft order `name` (e.g. `#D123`) | 751, 923, 997 |
| `$itg_fname` | form first name | 914 |
| `$created_at_formatted` | draft `created_at` formatted `F j, Y` (e.g. "November 11, 2026") | 1001 |
| `$product_list` | concatenated line item rows | 1073 |
| `$subtotal_price` | draft `subtotal_price` | 1096 |
| `$year` | current year | 1161 |

Per line item row: product image (100px, linked), title (linked), each property as `Name: Value` muted line, `x qty`, unit price, line total (unit × qty), all `$` with 2 decimals. Old code matched image/URL from cart data by SKU; **new code should take image + product URL from the GraphQL response instead.**

Note: PHP strings escape quotes as `\'` inside the template — unescape when porting.

---

## Incoming payload (from theme `custom.js`)

Current fields (FormData): `bundledata`, `itg_email`, `itg_country`, `itg_fname`, `itg_lname`, `itg_address`, `itg_city`, `itg_state`, `itg_zibcode` (typo is real — keep it), `itg_phone`, `itg_company`, `itg_note` (from `#Cart-note`).

`bundledata` = `JSON.stringify` of the full `/cart.js` `items` array (has `variant_id`, `quantity`, `sku`, `image`, `url`, `properties` (object or null), `title`, `price` in cents, etc.).

Theme JS behavior: on any 2xx → resets form, POSTs `/cart/clear.js`, redirects to `/pages/thank-you`. Response body is not inspected. `error:` handler is empty → loader `.loader_main` spins forever on failure.

---

## Decisions made

- **Runtime:** Node 20+ on AWS Lambda, exposed via a **Function URL** (no API Gateway). User has an AWS account.
- **Auth:** Dev Dashboard app, **client credentials grant**: `POST https://e91eee-4.myshopify.com/admin/oauth/access_token` with `grant_type=client_credentials`, `client_id`, `client_secret` → token (~24h). Cache in module scope; refresh shortly before expiry / on cold start.
  - Scopes: `read_customers`, `write_customers`, `read_draft_orders`, `write_draft_orders`.
- **API:** GraphQL Admin API, versioned endpoint (`/admin/api/<latest stable>/graphql.json` — verify current version). IDs are GIDs (`gid://shopify/ProductVariant/123`).
  - Customer: `customers(query: "email:...")` → else `customerCreate` (no password).
  - Draft: `draftOrderCreate` with `lineItems { variantId, quantity, customAttributes [{key, value}] }`, `purchasingEntity { customerId }` (or current equivalent), `email`, `note`, `shippingAddress`. Request back: `name`, `createdAt`, `subtotalPriceSet`, line items with title, quantity, price, image URL, product URL/handle, custom attributes.
- **Email:** keep the current custom template; send via **Nodemailer** + Gmail SMTP (465).
- **Filter out** properties whose key starts with `_` (hidden theme props) from both draft order and email.
- **Errors:** return proper 4xx (validation) / 5xx (Shopify/mail failure) JSON responses. Decide: if draft order succeeds but email fails, still return success (order exists) but log it.
- **Security:** secrets only in env vars (Lambda env / `.env` locally, never committed). CORS restricted to `https://roofvents.com` (+ `www`, + local theme dev origin as needed). Input validation. Honeypot field for bots (Cloudflare Turnstile optional later).
- **Module format:** `"type": "module"` in `package.json`, `.js` source files, ES module syntax.
- **Build:** esbuild bundles to a single `dist/index.mjs` (`.mjs` because `package.json` isn't in the zip). Zip contains just that file. Handler = `index.handler`. Don't bundle AWS SDK (not needed anyway).
- **Lambda config:** timeout ~15s (default 3s too short). Logs → CloudWatch.
- **Env loading locally:** Node's built-in `--env-file=.env` (no `dotenv`).
- **Dependencies:** `nodemailer`; dev: `esbuild`.

---

## Planned structure

```
draft-orders-lambda/
  src/
    handler.js          # Function URL entry: CORS/OPTIONS, parse JSON (handle base64 body), validate, honeypot, orchestrate, status codes
    shopify-client.js   # client-credentials token fetch + cache; graphql(query, variables) helper with error handling (HTTP + userErrors)
    customer.js         # findOrCreateCustomer(email, firstName, lastName)
    draft-order.js      # createDraftOrder(...) — maps cart items → lineItems, filters _ props
    email-template.js   # ported HTML template; buildEmail(draftOrder, firstName)
    mailer.js           # Nodemailer Gmail transport; sendConfirmation(to, html)
  scripts/
    local-test.js       # calls handler with a fake Function URL event + sample cart
    dev-server.js       # localhost:3000 HTTP wrapper around handler for `shopify theme dev`
  .env.example
  .gitignore            # .env, node_modules/, dist/, *.zip
  package.json
  README.md             # Dev Dashboard app setup, env vars, local testing, build, Lambda deploy steps
```

### Env vars (names TBD in `.env.example`)
`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_FROM_NAME`, `ALLOWED_ORIGINS`, `TEST_EMAIL_OVERRIDE` (dev: send all mail here), `DRAFT_ORDER_TAGS` (e.g. `test` during dev).

### Local testing
Hits the **real store** — tag test draft orders (e.g. `test`) and clean up. Use `TEST_EMAIL_OVERRIDE` so mail only goes to the developer.

---

## Theme changes (in `active-vent-new/assets/custom.js`)
- Point URL at the Lambda Function URL (placeholder until deployed).
- Send JSON (`JSON.stringify`, `Content-Type: application/json`) instead of FormData — Lambda then doesn't need a multipart parser. Field names stay the same; `bundledata` can become a real array instead of a string (handler should accept either).
- Add honeypot field to form.
- `error:` handler: hide `.loader_main`, restore button text, show a user-facing error message. Don't clear cart on failure.

---

## Status / next steps
1. Scaffold project files above.
2. User: create Dev Dashboard app, scopes, install on store, put client ID/secret in `.env`.
3. Local test → dev-server + theme dev → deploy Lambda → update theme URL → retire PHP.
4. User: **rotate** old `shpat_` token and Gmail app password (they're in old repo history), then delete old repo.
   - The Lambda reuses the old Gmail app password until cutover, so the PHP keeps working. After the PHP is retired: create a new app password, update `SMTP_PASS` in the Lambda env vars, then revoke the old one.

### Current status (2026-11-11)
**Lambda deployed and tested end to end** (theme dev → Function URL → draft order + email). The Function URL has auth NONE, CORS off in AWS, and both resource-policy statements (`InvokeFunctionUrl` + `InvokeFunction`). The user set `DRAFT_ORDER_ENDPOINT` in `custom.js` to the Function URL. Theme dropdown styling fixed: `:invalid` shows grey for the placeholder, black once a value is picked.

**Cutover pending (user plans 2026-11-12):**
1. Lambda env: remove `TEST_EMAIL_OVERRIDE` and `DRAFT_ORDER_TAGS`, and optionally the `127.0.0.1:9292` origin. (Both test vars are optional in code.)
2. Confirm `DRAFT_ORDER_ENDPOINT` is the Function URL, then push the theme live.
3. Submit one real live quote: the customer gets the email and the draft has no tag. Delete that draft afterwards.
4. Retire `draft_order.php` on dev.roofvents.com.
5. Rotate secrets: new Gmail app password → update Lambda `SMTP_PASS` → revoke the old one. Revoke the old `shpat_` token.
6. Delete the old repo and the test drafts tagged `test`.

### Build history
2026-11-11: Scaffold done (step 1). `src/validation.js` added (honeypot field `itg_website`). `read_products` scope added (needed for product URL/image on line items). Email template: user wants the HTML **unchanged**, except two approved fixes (no `##` in the hidden preview text, broken `style` attribute on the Button spacer). `src/email-template-html.js` holds the HTML and is edited directly. The one-time port script was deleted on 2026-11-12. `src/email-template.js` fills in the `{{placeholders}}`. The email keeps its `<table>` layout, which email clients need, so the global no-tables rule doesn't apply. Country and state dropdowns now send ISO codes (`US`/`CA`, `MI`/`ON`). The lists are `US_STATES`/`CA_PROVINCES` `{code, name}` in `custom.js`, filled on page load, and the Liquid `<select>` only has a placeholder. `src/regions.js` validates the codes, and an unknown code returns 400. **These theme edits aren't live:** the old PHP still receives codes and passes them to Shopify REST as `country`/`province`. Ship them together with the Lambda switch. Theme submit handler is done: a `DRAFT_ORDER_ENDPOINT` constant at the top of the handler, currently `http://localhost:3000`; JSON body; `itg_website` honeypot; an error handler that shows a plain `alert()`. The user chose this for now, and the inline message markup was removed. **The theme must not be pushed live until `DRAFT_ORDER_ENDPOINT` is the Lambda URL.**

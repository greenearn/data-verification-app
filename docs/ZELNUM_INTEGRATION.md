# Zelnum bulk provider integration

This adapter adds Zelnum as a separate provider while retaining the existing CheckNumber integration. It uses the documented async bulk file workflow only.

## Cloudflare configuration

Set the API key as a Worker secret (never commit it):

```sh
wrangler secret put ZELNUM_API_KEY
```

The non-secret API base URL is configured in `wrangler.toml` as:

```
ZELNUM_BASE_URL = "https://api.zelnum.com/api/v1"
```

The API key is sent only by the Worker in the `X-API-Key` header.

## Admin setup

1. Deploy the Worker after reviewing and merging this PR.
2. Add the `ZELNUM_API_KEY` secret in the Cloudflare Worker settings (or with Wrangler).
3. Open the Admin dashboard and choose **Import Zelnum services**.
4. For each imported service, open Admin Pricing and enter the actual account-specific provider cost per 10,000 rows. Keep pricing disabled until verified.
5. Set the customer markup/final price and enable only products available to your Zelnum account.
6. For phone-number uploads, the admin enters a two-letter ISO 3166-1 alpha-2 country code when submitting to Zelnum. Email products omit country.

## Imported bulk products

The importer now reads the live `GET /v1/products` catalogue and imports every product marked for bulk/async processing, using its exact product slug, series and minimum quantity. It does not rely on a short hardcoded product list. New `zelnum_*` service codes are created without overwriting existing CheckNumber service rows or pricing. Realtime products are detected separately; they are not yet customer-orderable in this bulk workflow.

Imported products are hidden from paid ordering until an admin explicitly enables pricing. Provider cost defaults to zero and pricing is disabled.

## API lifecycle

- Catalogue: `GET /api/v1/products` (product metadata and minimums; no prices).
- Submit: `POST /api/v1/detect/file` with `product`, `file`, and `country` for phone products.
- Poll: `GET /api/v1/tasks/{task_id}`.
- Result metadata: `GET /api/v1/tasks/{task_id}/result`.
- Download: `GET /api/v1/tasks/{task_id}/download` with the API key.

The Worker saves the provider name and country code with each local task. Existing CheckNumber tasks continue to use the old CheckNumber endpoints. Zelnum result downloads are fetched directly from the documented API origin; the returned URL is checked against the configured Zelnum API origin before use.

## Billing and operational safeguards

- Provider submission is admin-triggered. No provider task is submitted by importing the catalogue or checking the balance.
- Existing customer wallet charging, deposit records, ledger entries, referral rewards and refunds are unchanged.
- Customer pricing must be configured separately from Zelnum's provider cost. Zelnum does not expose prices through the product catalogue; copy the actual account prices from the Zelnum website into Admin Pricing. Imported services remain disabled until configured.
- Zelnum's bulk API pre-deducts estimated cost and refunds rows it does not process. The current customer order charge is not automatically recalculated from provider refunds; review the provider's final counts and billing before enabling customer-facing orders.
- The Worker does not retry uncertain submissions, to avoid duplicate provider charges.
- Result files are downloaded and sent to Telegram immediately after Zelnum marks the result available. Zelnum's documented default retention is seven days.
- Do not run paid live tests without an explicit test budget and approval.

## Current scope and limitations

This PR supports admin-triggered bulk TXT/CSV tasks across the live bulk catalogue, polling, result download, and Telegram delivery. It does not yet add customer-facing realtime checks, automatic provider failover, or automatic product price synchronization. Realtime products are listed by the provider API but require a separate wallet-priced single-check workflow before being exposed to customers.

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

The initial safe catalogue includes HLR lookup, phone model detection, phone on/off, phone status, RCS support, WhatsApp number, Telegram number, and Viber number checks. Product slugs and minimum quantities follow the public Zelnum bulk product documentation. The importer creates new `zelnum_*` service codes and does not overwrite existing CheckNumber service rows or pricing.

Imported products are hidden from paid ordering until an admin explicitly enables pricing. Provider cost defaults to zero and pricing is disabled.

## API lifecycle

- Submit: `POST /api/v1/detect/file` with `product`, `file`, and `country` for phone products.
- Poll: `GET /api/v1/tasks/{task_id}`.
- Result metadata: `GET /api/v1/tasks/{task_id}/result`.
- Download: `GET /api/v1/tasks/{task_id}/download` with the API key.

The Worker saves the provider name and country code with each local task. Existing CheckNumber tasks continue to use the old CheckNumber endpoints. Zelnum result downloads are fetched directly from the documented API origin; the returned URL is checked against the configured Zelnum API origin before use.

## Billing and operational safeguards

- Provider submission is admin-triggered. No provider task is submitted by importing the catalogue or checking the balance.
- Existing customer wallet charging, deposit records, ledger entries, referral rewards and refunds are unchanged.
- Customer pricing must be configured separately from Zelnum's provider cost.
- Zelnum's bulk API pre-deducts estimated cost and refunds rows it does not process. The current customer order charge is not automatically recalculated from provider refunds; review the provider's final counts and billing before enabling customer-facing orders.
- The Worker does not retry uncertain submissions, to avoid duplicate provider charges.
- Result files are downloaded and sent to Telegram immediately after Zelnum marks the result available. Zelnum's documented default retention is seven days.
- Do not run paid live tests without an explicit test budget and approval.

## Current scope and limitations

This PR supports admin-triggered bulk TXT/CSV tasks, polling, result download, and Telegram delivery. It does not add realtime checks, automatic provider failover, or automatic product price synchronization. The imported catalogue is intentionally limited to the initial supported service set; other documented Zelnum products can be added after their use case and account availability are confirmed.

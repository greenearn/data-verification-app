# CheckNumber.ai marketplace integration

This document describes the Data Verification Mini App adapter. Provider credentials remain in Cloudflare Worker secrets/environment variables and must never be committed to this repository.

## API transport

- Base origin: use the account-confirmed value in `CN_BASE_URL`. The adapter accepts either an origin such as `https://api.checknumber.ai` or the same origin ending in `/v1`.
- Authentication: `X-API-Key: <CN_API_KEY>`.
- Submit: `POST /v1/tasks`, multipart form fields `file` and `task_type`.
- Poll: `POST /v1/gettasks`, multipart field `task_id`.
- Download: fetch the provider-returned `result_url` only after the task is exported.
- Balance: the current public API reference documents `GET /v1/balance`.
- Status lifecycle: `pending` → `processing` → `exported`; `failed` is terminal. The adapter also normalizes a gateway's `completed` status to `exported`.

The API is asynchronous. A task ID is saved before polling. The result file is sent to the customer's Telegram chat after the provider reports `exported`. The app does not automatically retry task creation after an uncertain network outcome, to avoid duplicate provider charges.

## Product catalogue

Prices below are the provider-cost reference values supplied for this integration, in USD per 10,000 entries. Admin pricing stores them as cents per 10,000 and uses USDT for customer checkout. These are not customer-facing prices until the configured markup is applied.

| Category | Product | API task code | Input | Provider reference / 10K |
|---|---|---|---|---:|
| WhatsApp | Real-time Checker | `ws_advanced` | Phone | $1.00 |
| WhatsApp | Number Checker | `ws` | Phone | $0.70 |
| WhatsApp | Business Checker | `ws_business` | Phone | $1.20 |
| WhatsApp | Number Activity | `ws_active` | Phone | $1.20 |
| WhatsApp | Number Profile | `ws_avatar` | Phone | $3.80 |
| Telegram | Number Checker | `tg` | Phone | $0.90 |
| Telegram | Number Activity | `tg_active` | Phone | $2.90 |
| Telegram | Number Profile | `tg_avatar` | Phone | $3.90 |
| Number Checker | Number Validation | `phoneCheck` | Phone | $1.50 |
| Number Checker | Number Activity | `active_check` | Phone | $4.50 |
| Number Checker | High-Value Number | `high_value_users` | Phone | $5.50 |
| Viber | Number Checker | `viber` | Phone | $0.25 |
| Viber | Number Activity | `viber_active` | Phone | $2.50 |
| Viber | Number Profile | `viber_senior` | Phone | $9.00 |
| iMessage | Number Checker | `imessage` | Phone | $2.00 |
| RCS | Number Checker | `rcs` | Phone | $1.50 |
| Facebook | Number Checker | `facebook` | Phone | $0.30 |
| Apple ID | Number Checker | `apple` | Phone | $1.50 |
| Apple ID | Email Checker | `apple_email` | Email | $1.50 |
| Amazon | Number Checker | `amazon` | Phone | $1.50 |
| Amazon | Email Checker | `amazon_email` | Email | $1.50 |
| Instagram | Number Checker | `instagram` | Phone | $1.00 |
| Instagram | Email Checker | `instagram_email` | Email | $0.30 |
| MAX | Number Checker | `max` | Phone | $10.00 |
| MAX | Number Profile | `max_full` | Phone | $20.00 |
| Netflix | Number Checker | `netflix` | Phone | $7.00 |
| Netflix | Email Checker | `netflix_email` | Email | $7.00 |
| PayPal | Email Checker | `paypal_email` | Email | $10.00 |
| PayPal | Number Checker | `paypal_number` | Phone | $15.00 |
| Line | Number Checker | `line` | Phone | $1.50 |
| Line | Number Profile | `line_senior` | Phone | $6.00 |
| Zalo | Number Checker | `zalo` | Phone | $2.00 |
| Zalo | Number Profile | `zalo_gender` | Phone | $6.00 |
| LinkedIn | Number Checker | `linkedin_phone` | Phone | $4.00 |
| LinkedIn | Email Checker | `linkedin` | Email | $0.30 |
| LinkedIn | Email Profile | `linkedin_profile` | Email | $3.00 |
| X (Twitter) | Number Checker | `twitter` | Phone | $0.90 |
| X (Twitter) | Email Checker | `twitter_email` | Email | $7.00 |
| Carrier Checker | Number Carrier | `globalCarrier` | Phone | $1.50 |
| Carrier Checker | US Carrier Advanced | `us_carrier_premium` | Phone | $15.00 |
| Airbnb | Number Checker | `airbnb` | Phone | $2.00 |
| TikTok | Number Checker | `tiktok` | Phone | $9.00 |
| Signal | Number Checker | `signal` | Phone | $1.50 |
| Microsoft | Number Checker | `microsoft` | Phone | $0.90 |
| Snapchat | Number Checker | `snapchat` | Phone | $8.00 |
| Binance | Number Checker | `Binance` | Phone | $6.50 |
| KuCoin | Number Checker | `Kucoin` | Phone | $7.00 |
| Email Deliverability | Deliverability Checker | `email_check` | Email | $5.00 |

Note: the provider documentation describes X/Twitter's `twitter_email` as an email checker; it does not document profile-enrichment fields for that task. The UI therefore calls it Email Checker.

## Quantity and pricing controls

- Default minimum: 500 entries per product, configurable in Admin.
- Netflix number and email checkers: 1,000 minimum based on the current product integration reference.
- Maximum app-side batch: 1,000,000 entries (the app's upload-size limit may impose a lower practical ceiling).
- Pricing unit: 10,000 entries.
- Admin can set a global percentage markup across all products. Applying it clears per-product final-price overrides; individual product pricing can then be edited separately.
- New catalogue products are imported as listed but pricing-disabled. Admin must enable a product after confirming that the API product is available on this CheckNumber account.

## Order lifecycle

1. Customer chooses a product and uploads a TXT/CSV file with one phone number or email per row.
2. The app validates format, removes duplicates, and enforces that product's minimum and the maximum batch size.
3. Customer confirms they are authorized to submit the list.
4. Server recalculates the price from D1 pricing and atomically creates the order, debits the existing USDT wallet, and writes the wallet ledger entry.
5. Admin submits the staged upload. The Worker sends the configured product task code to CheckNumber.
6. Scheduled/admin polling checks the provider task. When exported, the result file is downloaded from the allowlisted provider result host and sent to the customer's Telegram chat.
7. Provider failures are marked failed; refunds remain an explicit admin action using the existing refund workflow.

## Safety and test status

- Deposits, withdrawals, wallet top-ups, and the existing manual deposit proof workflow are not part of this integration change.
- Provider task creation is billable. Static validation and code checks do not create provider tasks.
- Do not run live product tests without an explicit test budget and approval. Start with the provider balance endpoint, then test each enabled product using authorized synthetic/test data where the provider permits it.
- A public task code does not guarantee that the product is enabled for a specific provider account. A provider `403 product_not_available` response means keep that product disabled and contact CheckNumber support.


const ALLOWED_ORIGINS = new Set(["https://greenearn.github.io","https://data-verification-app-git-manual-a72ddf-shrestharaj980888-6433.vercel.app"]);
const DEFAULT_ALLOWED_ORIGIN = "https://greenearn.github.io";
const WORKER_ORIGIN = "https://manual-customer-orders-launch-data-verification-api.shrestharaj980888.workers.dev";
const SESSION_DAYS = 7;
const MAX_INIT_DATA_AGE = 3600;
const MAX_BODY_SIZE = 20000;
let adminAccessSchemaReady = false;
let customerOrderSchemaReady = false;

async function ensureCustomerOrderSchema(env) {
  if (customerOrderSchemaReady) return;
  await env.DB.batch([
    env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS orders_unique_phonecheck_upload
      ON orders(result_reference)
      WHERE resource_code='phoneCheck' AND substr(result_reference,1,7)='upload:'
    `),
    env.DB.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_unique_order_refund
      ON wallet_ledger(reference_id)
      WHERE transaction_type='order_refund'
    `)
  ]);
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS orders_unique_upload_reference ON orders(result_reference) WHERE substr(result_reference,1,7)='upload:'`).run();
  customerOrderSchemaReady = true;
}
// --------------------------------------------------
// CHECKNUMBER.AI AUTOMATIC CATALOGUE
// --------------------------------------------------

const CHECKNUMBER_CATALOGUE = [
  // Prices below are provider-cost reference values supplied for this catalogue,
  // in USD cents per 10,000 entries. Every product starts disabled until the
  // account-specific task code and availability are confirmed by an administrator.
  {category:"WhatsApp",category_order:1,resource_code:"whatsapp_realtime",name:"WhatsApp Real-time Checker",description:"Higher-accuracy real-time WhatsApp registration check",input_type:"phone",task_type:"ws_advanced",provider_cost_cents:100,display_order:1},
  {category:"WhatsApp",category_order:1,resource_code:"whatsapp_checker",name:"WhatsApp Number Checker",description:"Check WhatsApp registration status",input_type:"phone",task_type:"ws",provider_cost_cents:70,display_order:2},
  {category:"WhatsApp",category_order:1,resource_code:"whatsapp_business",name:"WhatsApp Business Checker",description:"Identify WhatsApp Business registrations",input_type:"phone",task_type:"ws_business",provider_cost_cents:120,display_order:3},
  {category:"WhatsApp",category_order:1,resource_code:"whatsapp_activity",name:"WhatsApp Number Activity",description:"Check activity signals for WhatsApp numbers",input_type:"phone",task_type:"ws_active",provider_cost_cents:120,display_order:4},
  {category:"WhatsApp",category_order:1,resource_code:"whatsapp_profile",name:"WhatsApp Number Profile",description:"Profile-related signals where permitted by provider",input_type:"phone",task_type:"ws_avatar",provider_cost_cents:380,display_order:5},
  {category:"Telegram",category_order:2,resource_code:"telegram_checker",name:"Telegram Number Checker",description:"Check Telegram registration status",input_type:"phone",task_type:"tg",provider_cost_cents:90,display_order:1},
  {category:"Telegram",category_order:2,resource_code:"telegram_activity",name:"Telegram Number Activity",description:"Check Telegram activity signals",input_type:"phone",task_type:"tg_active",provider_cost_cents:290,display_order:2},
  {category:"Telegram",category_order:2,resource_code:"telegram_profile",name:"Telegram Number Profile",description:"Profile-related signals where permitted by provider",input_type:"phone",task_type:"tg_avatar",provider_cost_cents:390,display_order:3},
  {category:"Number Checker",category_order:3,resource_code:"phoneCheck",name:"Number Validation",description:"Validate phone numbers and check carrier-related data",input_type:"phone",task_type:"phoneCheck",provider_cost_cents:150,display_order:1},
  {category:"Number Checker",category_order:3,resource_code:"number_activity",name:"Number Activity",description:"Check phone-number activity signals",input_type:"phone",task_type:"active_check",provider_cost_cents:450,display_order:2},
  {category:"Number Checker",category_order:3,resource_code:"high_value_number",name:"High-Value Number",description:"High-value number classification",input_type:"phone",task_type:"high_value_users",provider_cost_cents:550,display_order:3},
  {category:"Viber",category_order:4,resource_code:"viber_checker",name:"Viber Number Checker",description:"Check Viber registration status",input_type:"phone",task_type:"viber",provider_cost_cents:25,display_order:1},
  {category:"Viber",category_order:4,resource_code:"viber_activity",name:"Viber Number Activity",description:"Check Viber activity signals",input_type:"phone",task_type:"viber_active",provider_cost_cents:250,display_order:2},
  {category:"Viber",category_order:4,resource_code:"viber_profile",name:"Viber Number Profile",description:"Profile-related signals where permitted by provider",input_type:"phone",task_type:"viber_senior",provider_cost_cents:900,display_order:3},
  {category:"iMessage",category_order:5,resource_code:"imessage_checker",name:"iMessage Number Checker",description:"Check iMessage availability",input_type:"phone",task_type:"imessage",provider_cost_cents:200,display_order:1},
  {category:"RCS",category_order:6,resource_code:"rcs_checker",name:"RCS Number Checker",description:"Check RCS availability",input_type:"phone",task_type:"rcs",provider_cost_cents:150,display_order:1},
  {category:"Facebook",category_order:7,resource_code:"facebook_checker",name:"Facebook Number Checker",description:"Check phone-number registration on Facebook",input_type:"phone",task_type:"facebook",provider_cost_cents:30,display_order:1},
  {category:"Apple ID",category_order:8,resource_code:"apple_id_checker",name:"Apple ID Number Checker",description:"Check Apple ID registration by phone number",input_type:"phone",task_type:"apple",provider_cost_cents:150,display_order:1},
  {category:"Apple ID",category_order:8,resource_code:"apple_id_email",name:"Apple ID Email Checker",description:"Check Apple ID registration by email",input_type:"email",task_type:"apple_email",provider_cost_cents:150,display_order:2},
  {category:"Amazon",category_order:9,resource_code:"amazon_checker",name:"Amazon Number Checker",description:"Check Amazon registration by phone number",input_type:"phone",task_type:"amazon",provider_cost_cents:150,display_order:1},
  {category:"Amazon",category_order:9,resource_code:"amazon_email",name:"Amazon Email Checker",description:"Check Amazon registration by email",input_type:"email",task_type:"amazon_email",provider_cost_cents:150,display_order:2},
  {category:"Instagram",category_order:10,resource_code:"instagram_checker",name:"Instagram Number Checker",description:"Check Instagram registration by phone number",input_type:"phone",task_type:"instagram",provider_cost_cents:100,display_order:1},
  {category:"Instagram",category_order:10,resource_code:"instagram_email",name:"Instagram Email Checker",description:"Check Instagram registration by email",input_type:"email",task_type:"instagram_email",provider_cost_cents:30,display_order:2},
  {category:"MAX",category_order:11,resource_code:"max_checker",name:"MAX Number Checker",description:"MAX number checker; confirm task code in provider dashboard",input_type:"phone",task_type:"max",provider_cost_cents:1000,display_order:1},
  {category:"MAX",category_order:11,resource_code:"max_profile",name:"MAX Number Profile",description:"MAX profile checker; confirm task code in provider dashboard",input_type:"phone",task_type:"max_full",provider_cost_cents:2000,display_order:2},
  {category:"Netflix",category_order:12,resource_code:"netflix_checker",name:"Netflix Number Checker",description:"Check Netflix registration by phone number",input_type:"phone",task_type:"netflix",provider_cost_cents:700,minimum_order_quantity:1000,display_order:1},
  {category:"Netflix",category_order:12,resource_code:"netflix_email",name:"Netflix Email Checker",description:"Check Netflix registration by email",input_type:"email",task_type:"netflix_email",provider_cost_cents:700,minimum_order_quantity:1000,display_order:2},
  {category:"PayPal",category_order:13,resource_code:"paypal_email",name:"PayPal Email Checker",description:"PayPal email checker; confirm task code in provider dashboard",input_type:"email",task_type:"paypal_email",provider_cost_cents:1000,display_order:1},
  {category:"PayPal",category_order:13,resource_code:"paypal_phone",name:"PayPal Number Checker",description:"PayPal number checker; confirm task code in provider dashboard",input_type:"phone",task_type:"paypal_number",provider_cost_cents:1500,display_order:2},
  {category:"Line",category_order:14,resource_code:"line_checker",name:"Line Number Checker",description:"Check Line registration status",input_type:"phone",task_type:"line",provider_cost_cents:150,display_order:1},
  {category:"Line",category_order:14,resource_code:"line_profile",name:"Line Number Profile",description:"Line profile checker",input_type:"phone",task_type:"line_senior",provider_cost_cents:600,display_order:2},
  {category:"Zalo",category_order:15,resource_code:"zalo_checker",name:"Zalo Number Checker",description:"Check Zalo registration status",input_type:"phone",task_type:"zalo",provider_cost_cents:200,display_order:1},
  {category:"Zalo",category_order:15,resource_code:"zalo_profile",name:"Zalo Number Profile",description:"Zalo profile checker",input_type:"phone",task_type:"zalo_gender",provider_cost_cents:600,display_order:2},
  {category:"LinkedIn",category_order:16,resource_code:"linkedin_phone",name:"LinkedIn Number Checker",description:"Check LinkedIn registration by phone number",input_type:"phone",task_type:"linkedin_phone",provider_cost_cents:400,display_order:1},
  {category:"LinkedIn",category_order:16,resource_code:"linkedin_email",name:"LinkedIn Email Checker",description:"Check LinkedIn registration by email",input_type:"email",task_type:"linkedin",provider_cost_cents:30,display_order:2},
  {category:"LinkedIn",category_order:16,resource_code:"linkedin_email_profile",name:"LinkedIn Email Profile",description:"Email profile signals; use only with appropriate authorization",input_type:"email",task_type:"linkedin_profile",provider_cost_cents:300,display_order:3},
  {category:"X (Twitter)",category_order:17,resource_code:"twitter_phone",name:"X (Twitter) Number Checker",description:"Check X registration by phone number",input_type:"phone",task_type:"twitter",provider_cost_cents:90,display_order:1},
  {category:"X (Twitter)",category_order:17,resource_code:"twitter_email_profile",name:"X (Twitter) Email Checker",description:"Check X registration by email address",input_type:"email",task_type:"twitter_email",provider_cost_cents:700,display_order:2},
  {category:"Carrier Checker",category_order:18,resource_code:"global_carrier",name:"Number Carrier",description:"Global carrier and number-type lookup",input_type:"phone",task_type:"globalCarrier",provider_cost_cents:150,display_order:1},
  {category:"Carrier Checker",category_order:18,resource_code:"us_carrier_advanced",name:"US Carrier Advanced",description:"Advanced US carrier lookup",input_type:"phone",task_type:"us_carrier_premium",provider_cost_cents:1500,display_order:2},
  {category:"Airbnb",category_order:19,resource_code:"airbnb_checker",name:"Airbnb Number Checker",description:"Check Airbnb registration by phone number",input_type:"phone",task_type:"airbnb",provider_cost_cents:200,display_order:1},
  {category:"TikTok",category_order:20,resource_code:"tiktok_checker",name:"TikTok Number Checker",description:"Check TikTok registration by phone number",input_type:"phone",task_type:"tiktok",provider_cost_cents:900,display_order:1},
  {category:"Signal",category_order:21,resource_code:"signal_checker",name:"Signal Number Checker",description:"Check Signal registration status",input_type:"phone",task_type:"signal",provider_cost_cents:150,display_order:1},
  {category:"Microsoft",category_order:22,resource_code:"microsoft_checker",name:"Microsoft Number Checker",description:"Check Microsoft registration by phone number",input_type:"phone",task_type:"microsoft",provider_cost_cents:90,display_order:1},
  {category:"Snapchat",category_order:23,resource_code:"snapchat_checker",name:"Snapchat Number Checker",description:"Check Snapchat registration by phone number",input_type:"phone",task_type:"snapchat",provider_cost_cents:800,display_order:1},
  {category:"Exchange Account Checkers",category_order:24,resource_code:"binance_checker",name:"Binance Number Checker",description:"Check Binance registration by phone number",input_type:"phone",task_type:"Binance",provider_cost_cents:650,display_order:1},
  {category:"Exchange Account Checkers",category_order:24,resource_code:"kucoin_checker",name:"KuCoin Number Checker",description:"Check KuCoin registration by phone number",input_type:"phone",task_type:"Kucoin",provider_cost_cents:700,display_order:2},
  {category:"Email Deliverability Checker",category_order:25,resource_code:"email_deliverability",name:"Email Deliverability Checker",description:"Email deliverability/validation; confirm task code in provider dashboard",input_type:"email",task_type:"email_check",provider_cost_cents:500,display_order:1}
];
// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || DEFAULT_ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
      "Cache-Control": "no-store"
    }
  });
}

function hex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value) {
  return hex(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  ));
}

async function hmac(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      new TextEncoder().encode(message)
    )
  );
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

async function readBody(request) {
  const length = Number(request.headers.get("Content-Length") || 0);

  if (length > MAX_BODY_SIZE) {
    throw new Error("request_too_large");
  }

  const text = await request.text();

  if (text.length > MAX_BODY_SIZE) {
    throw new Error("request_too_large");
  }

  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("invalid_json");
    }
    return body;
  } catch {
    throw new Error("invalid_json");
  }
}

function cleanText(value, maxLength = 120) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function validResourceCode(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_-]{2,80}$/.test(value);
}

function validTaskType(value) {
  return typeof value === "string" &&
    /^[a-zA-Z0-9_-]{2,80}$/.test(value);
}

function validInputType(value) {
  return ["phone", "email", "username"].includes(value);
}

function validCurrency(value) {
  return typeof value === "string" &&
    /^[A-Z]{3,8}$/.test(value);
}

function validFlag(value) {
  return value === 0 || value === 1 ||
    value === true || value === false;
}

function flagNumber(value) {
  return value === true || value === 1 ? 1 : 0;
}

// --------------------------------------------------
// TELEGRAM LOGIN VERIFICATION
// --------------------------------------------------

async function verifyTelegram(initData, botToken) {
  if (typeof initData !== "string" || initData.length > 16000) {
    throw new Error("invalid_init_data");
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  const userText = params.get("user");

  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error("invalid_telegram_hash");
  }

  const now = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(authDate) ||
    authDate > now + 30 ||
    now - authDate > MAX_INIT_DATA_AGE
  ) {
    throw new Error("telegram_login_expired");
  }

  if (!userText) {
    throw new Error("telegram_user_missing");
  }

  const fields = [];

  for (const [key, value] of params.entries()) {
    if (key !== "hash") fields.push([key, value]);
  }

  fields.sort((a, b) => a[0].localeCompare(b[0]));

  const checkString = fields
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = await hmac(
    new TextEncoder().encode("WebAppData"),
    botToken
  );

  const calculatedHash = hex(
    await hmac(secretKey, checkString)
  );

  if (!safeEqual(calculatedHash, receivedHash.toLowerCase())) {
    throw new Error("telegram_signature_invalid");
  }

  const user = JSON.parse(userText);

  if (!user || !user.id) {
    throw new Error("invalid_telegram_user");
  }

  return user;
}

// --------------------------------------------------
// USER SESSIONS
// --------------------------------------------------

async function createSession(env, telegramUser) {
  const telegramId = String(telegramUser.id);

  await env.DB.prepare(`
    INSERT OR IGNORE INTO users
      (telegram_id, username, first_name)
    VALUES (?, ?, ?)
  `).bind(
    telegramId,
    telegramUser.username || null,
    telegramUser.first_name || null
  ).run();

  await env.DB.prepare(`
    UPDATE users
    SET username = ?, first_name = ?
    WHERE telegram_id = ?
  `).bind(
    telegramUser.username || null,
    telegramUser.first_name || null,
    telegramId
  ).run();

  const user = await env.DB.prepare(`
    SELECT id, telegram_id, username, first_name,
           wallet_balance_cents, status
    FROM users
    WHERE telegram_id = ?
  `).bind(telegramId).first();

  if (!user || user.status !== "active") {
    throw new Error("account_unavailable");
  }

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 86400000
  ).toISOString();

  await env.DB.prepare(`
    INSERT INTO sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).bind(user.id, tokenHash, expiresAt).run();

  return {
    token,
    expires_at: expiresAt,
    user: {
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      wallet_balance_cents: user.wallet_balance_cents
    }
  };
}

async function getSessionUser(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer ([a-f0-9]{64})$/i);

  if (!match) throw new Error("unauthorized");

  const tokenHash = await sha256(match[1]);

  const user = await env.DB.prepare(`
    SELECT
      u.id,
      u.telegram_id,
      u.username,
      u.first_name,
      u.wallet_balance_cents,
      u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.expires_at > ?
      AND u.status = 'active'
    LIMIT 1
  `).bind(
    tokenHash,
    new Date().toISOString()
  ).first();

  if (!user) throw new Error("unauthorized");

  return user;
}

const ADMIN_PERMISSION_LABELS = {
  wallet_deposits: "Wallet deposits and customer order refunds",
  catalogue_manage: "Catalogue, categories, services and pricing",
  checknumber_validate: "CheckNumber validation and provider task processing",
  uploads_manage: "Customer upload review",
  number_requests: "Manual number-file requests",
  provider_balance: "Provider balance",
  storage_test: "Telegram storage test"
};

const ADMIN_ROUTE_PERMISSIONS = {
  "GET /api/admin/wallet/deposits": "wallet_deposits",
  "POST /api/admin/wallet/deposits/review": "wallet_deposits",
  "GET /api/admin/orders": "wallet_deposits",
  "POST /api/admin/orders/refund": "wallet_deposits",
  "GET /api/admin/catalogue": "catalogue_manage",
  "POST /api/admin/catalogue/import": "catalogue_manage",
  "POST /api/admin/checknumber/validate-upload": "checknumber_validate",
  "POST /api/uploads": "checknumber_validate",
  "GET /api/admin/uploads": "uploads_manage",
  "POST /api/admin/uploads/status": "uploads_manage",
  "POST /api/admin/categories": "catalogue_manage",
  "POST /api/admin/services": "catalogue_manage",
  "POST /api/admin/services/visibility": "catalogue_manage",
  "POST /api/admin/pricing": "catalogue_manage",
  "POST /api/admin/pricing/global": "catalogue_manage",
  "GET /api/admin/provider-balance": "provider_balance",
  "GET /api/admin/provider-tasks": "checknumber_validate",
  "POST /api/admin/provider-tasks/submit": "checknumber_validate",
  "POST /api/admin/provider-tasks/poll": "checknumber_validate",
  "POST /api/admin/provider-tasks/delivery-review": "checknumber_validate",
  "POST /api/admin/storage-test": "storage_test",
  "POST /api/admin/storage-file-test": "storage_test",
  "GET /api/admin/number-file-requests": "number_requests",
  "POST /api/admin/number-file-requests/upload": "number_requests",
  "POST /api/admin/number-file-requests/reject": "number_requests"
};

async function ensureAdminAccessSchema(env) {
  if (adminAccessSchemaReady) return;

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_access (
      telegram_id TEXT PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'sub_admin',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_telegram_id TEXT NOT NULL,
      target_telegram_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // Preserve existing administrators. The earliest registered admin becomes
  // the protected Main Admin; any other legacy admins become Full Admins.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO admin_access (
      telegram_id, role, permissions_json, is_active, created_by
    )
    SELECT
      telegram_id,
      CASE
        WHEN telegram_id = (
          SELECT telegram_id
          FROM admin_users
          WHERE role = 'admin'
          ORDER BY created_at ASC, telegram_id ASC
          LIMIT 1
        ) THEN 'main_admin'
        ELSE 'full_admin'
      END,
      '[]',
      1,
      telegram_id
    FROM admin_users
    WHERE role = 'admin'
  `).run();

  adminAccessSchemaReady = true;
}

async function getAdminAccess(user, env) {
  await ensureAdminAccessSchema(env);
  return await env.DB.prepare(`
    SELECT telegram_id, role, permissions_json, is_active,
           created_by, created_at, updated_at
    FROM admin_access
    WHERE telegram_id = ?
    LIMIT 1
  `).bind(String(user.telegram_id)).first();
}

async function isAdmin(user, env) {
  const admin = await getAdminAccess(user, env);
  return !!admin &&
    Number(admin.is_active) === 1 &&
    ["main_admin", "full_admin", "sub_admin"].includes(admin.role);
}

async function requireAdmin(request, env) {
  const user = await getSessionUser(request, env);
  const admin = await getAdminAccess(user, env);

  if (
    !admin ||
    Number(admin.is_active) !== 1 ||
    !["main_admin", "full_admin", "sub_admin"].includes(admin.role)
  ) {
    throw new Error("admin_access_required");
  }

  const routeKey = request.method.toUpperCase() + " " +
    new URL(request.url).pathname;
  const permission = ADMIN_ROUTE_PERMISSIONS[routeKey];

  if (admin.role === "sub_admin") {
    let permissions = [];
    try {
      permissions = JSON.parse(admin.permissions_json || "[]");
    } catch {
      permissions = [];
    }

    if (!permission || !Array.isArray(permissions) ||
        !permissions.includes(permission)) {
      throw new Error("admin_access_required");
    }
  }

  return {
    ...user,
    admin_role: admin.role,
    admin_permissions: admin.role === "sub_admin"
      ? JSON.parse(admin.permissions_json || "[]")
      : Object.keys(ADMIN_PERMISSION_LABELS)
  };
}

async function requireAdminManager(request, env) {
  const user = await requireAdmin(request, env);
  if (user.admin_role !== "main_admin") {
    throw new Error("admin_management_required");
  }
  return user;
}

async function writeAdminAudit(env, actorId, targetId, action, details = {}) {
  await env.DB.prepare(`
    INSERT INTO admin_audit_log (
      actor_telegram_id, target_telegram_id, action, details_json
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    String(actorId),
    String(targetId),
    String(action),
    JSON.stringify(details)
  ).run();
}

// --------------------------------------------------
// PRICING CALCULATION
// --------------------------------------------------

function calculatePrice(pricing, quantity) {
  const unitQuantity = Number(pricing.pricing_unit_quantity);
  const minimum = Number(pricing.minimum_order_quantity);
  const providerCost = Number(pricing.provider_cost_cents);
  const markupValue = Number(pricing.markup_value);

  if (
    !Number.isSafeInteger(unitQuantity) ||
    unitQuantity <= 0 ||
    !Number.isSafeInteger(minimum) ||
    minimum <= 0 ||
    quantity < minimum ||
    !Number.isSafeInteger(providerCost) ||
    providerCost < 0 ||
    !Number.isSafeInteger(markupValue) ||
    markupValue < 0
  ) {
    throw new Error("invalid_pricing_configuration");
  }

  let unitPriceCents;

  if (pricing.final_price_cents !== null &&
      pricing.final_price_cents !== undefined) {
    unitPriceCents = Number(pricing.final_price_cents);
  } else if (pricing.markup_type === "percentage") {
    unitPriceCents = Math.ceil(
      providerCost * (1 + markupValue / 100)
    );
  } else if (pricing.markup_type === "fixed") {
    unitPriceCents = providerCost + markupValue;
  } else {
    throw new Error("unsupported_pricing_type");
  }

  if (
    !Number.isSafeInteger(unitPriceCents) ||
    unitPriceCents <= 0
  ) {
    throw new Error("invalid_pricing_configuration");
  }

  const totalCents = Math.ceil(
    unitPriceCents * quantity / unitQuantity
  );

  const estimatedCostCents = Math.ceil(
    providerCost * quantity / unitQuantity
  );

  if (
    !Number.isSafeInteger(totalCents) ||
    totalCents <= 0 ||
    !Number.isSafeInteger(estimatedCostCents)
  ) {
    throw new Error("invalid_order_amount");
  }

  return {
    unitQuantity,
    minimum,
    unitPriceCents,
    totalCents,
    estimatedCostCents
  };
}
// --------------------------------------------------
// AUTOMATIC CHECKNUMBER CATALOGUE IMPORT
// --------------------------------------------------


let platformSettingsSchemaReady=false;
async function ensurePlatformSettingsSchema(env){
  if(platformSettingsSchemaReady)return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_settings(
      setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`INSERT OR IGNORE INTO platform_settings(setting_key,setting_value) VALUES('global_markup_percentage','10')`)
  ]);
  platformSettingsSchemaReady=true;
}

async function importCheckNumberCatalogue(env) {
  await ensurePlatformSettingsSchema(env);
  const globalMarkupRow=await env.DB.prepare("SELECT setting_value FROM platform_settings WHERE setting_key='global_markup_percentage' LIMIT 1").first();
  const defaultMarkup=Math.max(0,Math.min(10000,Number(globalMarkupRow?.setting_value??10)));
  const categories = new Map();
  for (const service of CHECKNUMBER_CATALOGUE) categories.set(service.category, service.category_order);
  const statements = [];
  for (const [category, displayOrder] of categories) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO service_categories (category,display_order,is_listed)
      VALUES (?, ?, 1)
    `).bind(category,displayOrder));
  }
  for (const service of CHECKNUMBER_CATALOGUE) {
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO service_catalogue
        (resource_code,name,description,category,input_type,task_type,display_order,is_listed)
      VALUES (?,?,?,?,?,?,?,1)
    `).bind(service.resource_code,service.name,service.description,service.category,
      service.input_type,service.task_type,service.display_order));
    statements.push(env.DB.prepare(`
      INSERT OR IGNORE INTO resource_pricing
        (resource_code,provider_cost_cents,markup_type,markup_value,final_price_cents,
         enabled,pricing_unit_quantity,minimum_order_quantity,currency,updated_at)
      VALUES (?,?,'percentage',?,NULL,0,10000,?,'USDT',CURRENT_TIMESTAMP)
    `).bind(service.resource_code,service.provider_cost_cents,defaultMarkup,
      Number(service.minimum_order_quantity||500)));
  }
  // Keep the legacy phoneCheck resource code and its existing pricing,
  // but group its customer-facing label with the new Number Checker products.
  statements.push(env.DB.prepare(`
    UPDATE service_catalogue
    SET name='Number Validation',description='Validate phone numbers and check carrier-related data',
        category='Number Checker',updated_at=CURRENT_TIMESTAMP
    WHERE resource_code='phoneCheck'
  `));
  const results=await env.DB.batch(statements);
  return {
    imported_categories:categories.size,
    catalogue_entries_processed:CHECKNUMBER_CATALOGUE.length,
    database_operations:results.length,
    ordering_enabled:false,
    message:"catalogue_imported_preserving_existing_services_and_prices",
    note:"Products are listed but disabled until each provider task code and account availability are verified in Admin."
  };
}

// --------------------------------------------------
// ADMIN CATALOGUE DATA
// --------------------------------------------------

async function getAdminCatalogue(env) {
  await ensurePlatformSettingsSchema(env);
  const globalMarkupRow=await env.DB.prepare("SELECT setting_value FROM platform_settings WHERE setting_key='global_markup_percentage' LIMIT 1").first();
  const categoriesResult = await env.DB.prepare(`
    SELECT
      category,
      display_order,
      is_listed,
      created_at,
      updated_at
    FROM service_categories
    ORDER BY display_order ASC, category ASC
  `).all();

  const servicesResult = await env.DB.prepare(`
    SELECT
      c.resource_code,
      c.name,
      c.description,
      c.category,
      c.input_type,
      c.task_type,
      c.display_order,
      c.is_listed,
      c.created_at,
      c.updated_at,
      p.provider_cost_cents,
      p.markup_type,
      p.markup_value,
      p.final_price_cents,
      p.pricing_unit_quantity,
      p.minimum_order_quantity,
      p.currency,
      p.enabled AS pricing_enabled
    FROM service_catalogue c
    LEFT JOIN resource_pricing p
      ON p.resource_code = c.resource_code
    ORDER BY c.display_order ASC, c.name ASC
  `).all();

  return {
    categories: categoriesResult.results || [],
    services: servicesResult.results || [],
    global_markup_percentage:Number(globalMarkupRow?.setting_value??10)
  };
}

// --------------------------------------------------
// ADMIN CATEGORY MANAGEMENT
// --------------------------------------------------

async function manageCategories(body, env) {
  const action = body.action;

  if (action === "create") {
    const category = cleanText(body.category, 80);
    const displayOrder = body.display_order === undefined
      ? 100
      : Number(body.display_order);

    if (
      category.length < 2 ||
      !Number.isSafeInteger(displayOrder)
    ) {
      throw new Error("invalid_category");
    }

    await env.DB.prepare(`
      INSERT INTO service_categories
        (category, display_order, is_listed)
      VALUES (?, ?, 1)
    `).bind(category, displayOrder).run();

    return { message: "category_created" };
  }

  if (action === "rename") {
    const oldCategory = cleanText(body.old_category, 80);
    const newCategory = cleanText(body.new_category, 80);

    if (
      oldCategory.length < 2 ||
      newCategory.length < 2 ||
      oldCategory.toLowerCase() === newCategory.toLowerCase()
    ) {
      throw new Error("invalid_category");
    }

    const existing = await env.DB.prepare(`
      SELECT category
      FROM service_categories
      WHERE category = ? COLLATE NOCASE
      LIMIT 1
    `).bind(oldCategory).first();

    if (!existing) throw new Error("category_not_found");

    const collision = await env.DB.prepare(`
      SELECT category
      FROM service_categories
      WHERE category = ? COLLATE NOCASE
        AND category != ? COLLATE NOCASE
      LIMIT 1
    `).bind(newCategory, oldCategory).first();

    if (collision) throw new Error("category_already_exists");

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE service_catalogue
        SET category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = ? COLLATE NOCASE
      `).bind(newCategory, oldCategory),

      env.DB.prepare(`
        UPDATE service_categories
        SET category = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = ? COLLATE NOCASE
      `).bind(newCategory, oldCategory)
    ]);

    return { message: "category_renamed" };
  }

  if (action === "visibility") {
    const category = cleanText(body.category, 80);

    if (!validFlag(body.is_listed)) {
      throw new Error("invalid_visibility");
    }

    const result = await env.DB.prepare(`
      UPDATE service_categories
      SET is_listed = ?, updated_at = CURRENT_TIMESTAMP
      WHERE category = ? COLLATE NOCASE
    `).bind(
      flagNumber(body.is_listed),
      category
    ).run();

    if (!result.meta?.changes) {
      throw new Error("category_not_found");
    }

    return { message: "category_visibility_updated" };
  }

  if (action === "reorder") {
    if (
      !Array.isArray(body.categories) ||
      body.categories.length < 1 ||
      body.categories.length > 100
    ) {
      throw new Error("invalid_category_order");
    }

    const names = body.categories.map(
      item => cleanText(item, 80)
    );

    if (
      names.some(name => name.length < 2) ||
      new Set(names.map(name => name.toLowerCase())).size !== names.length
    ) {
      throw new Error("invalid_category_order");
    }

    const statements = names.map((name, index) =>
      env.DB.prepare(`
        UPDATE service_categories
        SET display_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = ? COLLATE NOCASE
      `).bind((index + 1) * 10, name)
    );

    await env.DB.batch(statements);

    return { message: "categories_reordered" };
  }

  throw new Error("invalid_category_action");
}

// --------------------------------------------------
// ADMIN SERVICE MANAGEMENT
// --------------------------------------------------

async function saveService(body, env) {
  const resourceCode = body.resource_code;
  const name = cleanText(body.name, 100);
  const description = cleanText(body.description || "", 500);
  const category = cleanText(body.category, 80);
  const inputType = body.input_type;
  const taskType = body.task_type;
  const displayOrder = body.display_order === undefined
    ? 100
    : Number(body.display_order);

  if (
    !validResourceCode(resourceCode) ||
    name.length < 2 ||
    category.length < 2 ||
    !validInputType(inputType) ||
    !validTaskType(taskType) ||
    !Number.isSafeInteger(displayOrder)
  ) {
    throw new Error("invalid_service");
  }

  const categoryExists = await env.DB.prepare(`
    SELECT category
    FROM service_categories
    WHERE category = ? COLLATE NOCASE
    LIMIT 1
  `).bind(category).first();

  if (!categoryExists) {
    throw new Error("category_not_found");
  }

  await env.DB.prepare(`
    INSERT INTO service_catalogue (
      resource_code,
      name,
      description,
      category,
      input_type,
      task_type,
      display_order,
      is_listed
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(resource_code) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      category = excluded.category,
      input_type = excluded.input_type,
      task_type = excluded.task_type,
      display_order = excluded.display_order,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    resourceCode,
    name,
    description,
    categoryExists.category,
    inputType,
    taskType,
    displayOrder
  ).run();

  return { message: "service_saved" };
}

// --------------------------------------------------
// ADMIN SERVICE VISIBILITY
// --------------------------------------------------

async function updateServiceVisibility(body, env) {
  if (
    !validResourceCode(body.resource_code) ||
    !validFlag(body.is_listed)
  ) {
    throw new Error("invalid_service_visibility");
  }

  const result = await env.DB.prepare(`
    UPDATE service_catalogue
    SET is_listed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE resource_code = ?
  `).bind(
    flagNumber(body.is_listed),
    body.resource_code
  ).run();

  if (!result.meta?.changes) {
    throw new Error("service_not_found");
  }

  return { message: "service_visibility_updated" };
}

// --------------------------------------------------
// ADMIN PRICING MANAGEMENT
// --------------------------------------------------

async function saveServicePricing(body, env) {
  const resourceCode = body.resource_code;
  const providerCost = Number(body.provider_cost_cents);
  const markupType = body.markup_type;
  const markupValue = Number(body.markup_value);
  const finalPrice = body.final_price_cents === null ||
    body.final_price_cents === "" ||
    body.final_price_cents === undefined
      ? null
      : Number(body.final_price_cents);

  const unitQuantity = Number(body.pricing_unit_quantity);
  const minimumQuantity = Number(body.minimum_order_quantity);
  const currency = body.currency;
  const enabled = body.enabled;

  if (
    !validResourceCode(resourceCode) ||
    !Number.isSafeInteger(providerCost) ||
    providerCost < 0 ||
    !["percentage", "fixed"].includes(markupType) ||
    !Number.isSafeInteger(markupValue) ||
    markupValue < 0 ||
    (finalPrice !== null &&
      (!Number.isSafeInteger(finalPrice) || finalPrice <= 0)) ||
    !Number.isSafeInteger(unitQuantity) ||
    unitQuantity <= 0 ||
    !Number.isSafeInteger(minimumQuantity) ||
    minimumQuantity <= 0 ||
    !validCurrency(currency) ||
    !validFlag(enabled)
  ) {
    throw new Error("invalid_pricing");
  }

  const service = await env.DB.prepare(`
    SELECT resource_code
    FROM service_catalogue
    WHERE resource_code = ?
    LIMIT 1
  `).bind(resourceCode).first();

  if (!service) throw new Error("service_not_found");

  await env.DB.prepare(`
    INSERT INTO resource_pricing (
      resource_code,
      provider_cost_cents,
      markup_type,
      markup_value,
      final_price_cents,
      enabled,
      pricing_unit_quantity,
      minimum_order_quantity,
      currency,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(resource_code) DO UPDATE SET
      provider_cost_cents = excluded.provider_cost_cents,
      markup_type = excluded.markup_type,
      markup_value = excluded.markup_value,
      final_price_cents = excluded.final_price_cents,
      enabled = excluded.enabled,
      pricing_unit_quantity = excluded.pricing_unit_quantity,
      minimum_order_quantity = excluded.minimum_order_quantity,
      currency = excluded.currency,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    resourceCode,
    providerCost,
    markupType,
    markupValue,
    finalPrice,
    flagNumber(enabled),
    unitQuantity,
    minimumQuantity,
    currency
  ).run();

  return {
    message: "pricing_saved",
    note: "Pricing configuration does not enable customer ordering."
  };
}


// --------------------------------------------------
// CHECKNUMBER PROVIDER TASK LIFECYCLE
// Admin-triggered only. Customer ordering/wallet charging remain disabled.
// --------------------------------------------------

async function ensureProviderTasksSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS provider_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id INTEGER NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      resource_code TEXT NOT NULL,
      task_type TEXT NOT NULL,
      provider_task_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'submitting',
      provider_status TEXT,
      total INTEGER,
      success INTEGER,
      failure INTEGER,
      result_url TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    )
  `).run();
}

function safeProviderResultUrl(value, env) {
  try {
    const url = new URL(String(value || ""));
    const base = new URL(String(env.CN_BASE_URL || ""));
    if (url.protocol !== "https:" || url.username || url.password ||
        url.port || url.hash || !base.hostname) return null;
    const allowedHosts = new Set([
      base.hostname.toLowerCase(),
      "api.checknumber.ai",
      "api.nchk.cc",
      "wapic.s3.ap-southeast-1.amazonaws.com",
      ...String(env.CN_RESULT_HOSTS || "").split(",")
        .map(host => host.trim().toLowerCase())
        .filter(Boolean)
    ]);
    if (!allowedHosts.has(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch { return null; }
}

async function fetchProviderResult(value, env) {
  let current = safeProviderResultUrl(value, env);
  if (!current) throw new Error("provider_result_url_not_allowlisted");
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(current, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location || redirects === 3) throw new Error("provider_result_redirect_blocked");
      const next = new URL(location, current).toString();
      current = safeProviderResultUrl(next, env);
      if (!current) throw new Error("provider_result_redirect_not_allowlisted");
      continue;
    }
    if (!response.ok) throw new Error("provider_result_download_failed");
    return response;
  }
  throw new Error("provider_result_redirect_limit");
}

function parseCsvFields(line) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      fields.push(value.trim());
      value = "";
    } else {
      value += ch;
    }
  }
  if (quoted) throw new Error("invalid_csv_quotes");
  fields.push(value.trim());
  return fields;
}

function parseProviderPhoneEntries(content, extension) {
  const lines = String(content || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  const csv = extension === "csv";
  let phoneColumn = -1;
  const entries = [];
  let firstNonEmpty = true;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields = csv ? parseCsvFields(line) : [line.replace(/^["']|["']$/g, "")];
    if (firstNonEmpty && csv) {
      firstNonEmpty = false;
      phoneColumn = fields.findIndex(field =>
        ["phone", "phone_number", "number", "mobile", "mobile_number"]
          .includes(field.toLowerCase().replace(/[\s-]+/g, "_"))
      );
      if (phoneColumn >= 0) continue;
    } else {
      firstNonEmpty = false;
    }
    let candidate;
    if (phoneColumn >= 0) {
      candidate = (fields[phoneColumn] || "").trim().replace(/^["']|["']$/g, "");
    } else {
      const matches = fields.map(field => field.trim().replace(/^["']|["']$/g, ""))
        .filter(field => /^\+?[1-9]\d{7,14}$/.test(field));
      if (matches.length !== 1) throw new Error("ambiguous_or_invalid_csv_row");
      candidate = matches[0];
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(candidate)) {
      throw new Error("invalid_phone_numbers");
    }
    entries.push(candidate);
  }
  return [...new Set(entries)];
}

function parseProviderEntries(content, extension, inputType) {
  if(inputType==="phone")return parseProviderPhoneEntries(content,extension);
  const lines=String(content||"").replace(/^\uFEFF/,"").split(/\r?\n/);
  const values=[];const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const username=/^@?[A-Za-z][A-Za-z0-9_]{3,63}$/;
  const pattern=inputType==="email"?email:username;let first=true;
  for(const raw of lines){
    const line=raw.trim();if(!line)continue;
    const fields=extension==="csv"?parseCsvFields(line):[line.replace(/^["']|["']$/g,"")];
    const cleaned=fields.map(v=>String(v||"").trim().replace(/^["']|["']$/g,""));
    if(first){first=false;if(cleaned.some(v=>["email","email_address","username","user_name","value","identifier"].includes(v.toLowerCase())))continue;}
    const value=cleaned.find(v=>pattern.test(v));
    if(!value)throw new Error(inputType==="email"?"invalid_email_entries":"invalid_username_entries");
    values.push(inputType==="email"?value.toLowerCase():value.replace(/^@/,""));
  }
  return [...new Set(values)];
}

async function providerApi(env, path, options = {}) {
  if (!env.CN_API_KEY || !env.CN_BASE_URL) throw new Error("provider_configuration_missing");
  let base = String(env.CN_BASE_URL).replace(/\/+$/, "");
  // Accept either the API origin or an origin ending in /v1.
  if (base.toLowerCase().endsWith("/v1")) base = base.slice(0, -3);
  const response = await fetch(base + path, {
    ...options,
    headers: { ...(options.headers || {}), "X-API-Key": env.CN_API_KEY }
  });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error("provider_request_failed");
    error.providerStatus = response.status;
    throw error;
  }
  // Some account gateways wrap the task payload in a "data" object.
  if (data && data.data && typeof data.data === "object" && !Array.isArray(data.data)) {
    data = { ...data, ...data.data };
  }
  if (data.total == null && data.total_count != null) data.total = data.total_count;
  if (data.success == null && data.valid_count != null) data.success = data.valid_count;
  if (data.failure == null && data.invalid_count != null) data.failure = data.invalid_count;
  if (String(data.status||"").toLowerCase() === "completed") data.status = "exported";
  return data;
}

async function submitStagedProviderTask(env, uploadId) {
  await ensureProviderTasksSchema(env);
  const upload=await env.DB.prepare(`
    SELECT s.id,s.user_id,s.telegram_file_id,s.file_name,s.file_size,s.resource_code,s.status,
      u.telegram_id,c.task_type,c.input_type
    FROM upload_staging s JOIN users u ON u.id=s.user_id
    JOIN service_catalogue c ON c.resource_code=s.resource_code WHERE s.id=? LIMIT 1
  `).bind(uploadId).first();
  if(!upload)throw new Error("upload_not_found");
  if(!["uploaded","reviewed"].includes(upload.status))throw new Error("upload_not_ready");
  const taskType=String(upload.task_type||"");
  if(!taskType||taskType==="VERIFY_IN_DASHBOARD"||!validTaskType(taskType))
    throw new Error("service_task_code_not_verified");
  const existing=await env.DB.prepare("SELECT id FROM provider_tasks WHERE upload_id=? LIMIT 1").bind(uploadId).first();
  if(existing)throw new Error("provider_task_already_created");
  const claim=await env.DB.prepare(`
    INSERT INTO provider_tasks(upload_id,user_id,telegram_id,resource_code,task_type,status)
    VALUES(?,?,?,?,?,'submitting')
  `).bind(upload.id,upload.user_id,String(upload.telegram_id),upload.resource_code,taskType).run();
  const localId=Number(claim.meta.last_row_id);let providerSubmissionStarted=false;
  try{
    if(!env.TELEGRAM_BOT_TOKEN)throw new Error("telegram_storage_configuration_missing");
    const infoResponse=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(upload.telegram_file_id)}`);
    const info=await infoResponse.json();const filePath=info?.result?.file_path;
    if(!infoResponse.ok||!info.ok||!filePath||filePath.includes(".."))throw new Error("telegram_source_file_unavailable");
    const source=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
    if(!source.ok)throw new Error("telegram_source_download_failed");
    const bytes=await source.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw new Error("provider_file_size_invalid");
    const content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    const extension=String(upload.file_name||"").toLowerCase().split(".").pop();
    if(!["csv","txt"].includes(extension))throw new Error("unsupported_file_type");
    const entries=parseProviderEntries(content,extension,upload.input_type||"phone");
    const paidOrder=await env.DB.prepare(`
      SELECT id,quantity,estimated_provider_cost_cents,status FROM orders
      WHERE result_reference=? AND resource_code=? LIMIT 1
    `).bind("upload:"+uploadId,upload.resource_code).first();
    const pricing=await env.DB.prepare(`
      SELECT provider_cost_cents,pricing_unit_quantity,minimum_order_quantity
      FROM resource_pricing WHERE resource_code=? LIMIT 1
    `).bind(upload.resource_code).first();
    const minimum=Number(pricing?.minimum_order_quantity);
    if(!Number.isSafeInteger(minimum)||minimum<1||entries.length<minimum||entries.length>1000000)
      throw new Error("provider_quantity_out_of_range");
    if(paidOrder&&(paidOrder.status!=="pending"||Number(paidOrder.quantity)!==entries.length))
      throw new Error("paid_order_not_ready_or_quantity_mismatch");
    if(!paidOrder&&(upload.resource_code!=="phoneCheck"||entries.length!==2000))
      throw new Error("provider_test_requires_paid_order");
    const providerCost=Number(pricing?.provider_cost_cents),unitQuantity=Number(pricing?.pricing_unit_quantity);
    if(!Number.isSafeInteger(providerCost)||providerCost<0||!Number.isSafeInteger(unitQuantity)||unitQuantity<=0)
      throw new Error("provider_cost_estimate_unavailable");
    const estimatedProviderCostCents=Math.ceil(providerCost*entries.length/unitQuantity);
    if(paidOrder&&estimatedProviderCostCents>Number(paidOrder.estimated_provider_cost_cents))
      throw new Error("provider_cost_now_exceeds_paid_order_estimate");
    if(!paidOrder&&estimatedProviderCostCents>30)throw new Error("provider_cost_exceeds_approved_30_cent_limit");
    const form=new FormData();form.append("file",new Blob([entries.join("\n")+"\n"],{type:"text/plain"}),
      String(upload.file_name||"input.txt").replace(/\.(csv|txt)$/i,"")+".txt");
    form.append("task_type",taskType);
    providerSubmissionStarted=true;
    const providerResult=await providerApi(env,"/v1/tasks",{method:"POST",body:form});
    const providerTaskId=String(providerResult.task_id||"");
    if(!providerTaskId||providerTaskId.length>200)throw new Error("provider_task_id_missing");
    await env.DB.prepare(`
      UPDATE provider_tasks SET provider_task_id=?,status='submitted',provider_status=?,total=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='submitting'
    `).bind(providerTaskId,String(providerResult.status||"pending"),
      Number.isSafeInteger(Number(providerResult.total))?Number(providerResult.total):entries.length,localId).run();
    await env.DB.prepare(`
      UPDATE upload_staging SET status='reviewed',admin_note='Submitted to CheckNumber provider task '||?,
        reviewed_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(providerTaskId,uploadId).run();
    if(paidOrder)await env.DB.prepare(`
      UPDATE orders SET provider_task_id=?,status='processing'
      WHERE id=? AND status='pending' AND result_reference=?
    `).bind(providerTaskId,paidOrder.id,"upload:"+uploadId).run();
    return {id:localId,provider_task_id:providerTaskId,status:"submitted",quantity:entries.length,
      resource_code:upload.resource_code,task_type:taskType,paid_order_id:paidOrder?.id||null};
  }catch(error){
    const rejected=[400,401,402,403,404,413].includes(Number(error.providerStatus));
    const finalStatus=providerSubmissionStarted&&!rejected?"submission_unknown":"failed";
    await env.DB.prepare("UPDATE provider_tasks SET status=?,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(finalStatus,String(error.message||"submission_failed").slice(0,200),localId).run();
    if(finalStatus==="failed")await env.DB.prepare("UPDATE orders SET status='failed' WHERE result_reference=? AND status='pending'")
      .bind("upload:"+uploadId).run();
    throw error;
  }
}

async function sendProviderTaskNotice(env, telegramId, message) {
  if (!env.TELEGRAM_BOT_TOKEN || !telegramId) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(telegramId), text: message })
  });
}

async function processProviderTask(env, task) {
  const statusForm = new FormData();
  statusForm.append("task_id", task.provider_task_id);
  const provider = await providerApi(env, "/v1/gettasks", { method: "POST", body: statusForm });
  const status = String(provider.status || "").toLowerCase();

  if (status === "failed") {
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE provider_tasks SET status='failed', provider_status=?, total=?, success=?, failure=?,
          last_error='provider_task_failed', updated_at=CURRENT_TIMESTAMP WHERE id=?
      `).bind(status, Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id),
      env.DB.prepare(`
        UPDATE orders SET status='failed'
        WHERE result_reference=? AND provider_task_id=? AND status='processing'
      `).bind("upload:" + task.upload_id, task.provider_task_id)
    ]);
    await sendProviderTaskNotice(env, task.telegram_id, "Your verification task #" + task.id + " failed at the provider. Please contact support before resubmitting.");
    return "failed";
  }

  if (status !== "exported") {
    await env.DB.prepare(`
      UPDATE provider_tasks SET status='processing', provider_status=?, total=?, success=?, failure=?,
        updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(status || "unknown", Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id).run();
    return "processing";
  }

  const resultUrl = safeProviderResultUrl(provider.result_url, env);
  if (!resultUrl) {
    let resultHost = "missing_or_invalid";
    try {
      resultHost = new URL(String(provider.result_url || "")).hostname.toLowerCase() || resultHost;
    } catch {}
    throw new Error("provider_result_url_not_allowlisted:" + resultHost);
  }
  const resultResponse = await fetchProviderResult(resultUrl, env);
  const resultBytes = await resultResponse.arrayBuffer();
  if (!resultBytes.byteLength || resultBytes.byteLength > 20 * 1024 * 1024) throw new Error("provider_result_size_invalid");
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("telegram_storage_configuration_missing");

  // Claim delivery before calling Telegram. If the network outcome is uncertain,
  // leave the task in delivery_sending for manual review rather than auto-sending
  // a duplicate result file on the next cron run.
  const deliveryClaim = await env.DB.prepare(`
    UPDATE provider_tasks SET status='delivery_sending', result_url=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND status IN ('submitted','processing','delivery_pending')
  `).bind(resultUrl, task.id).run();
  if (!deliveryClaim.meta?.changes) throw new Error("provider_delivery_already_claimed");

  const deliveryForm = new FormData();
  deliveryForm.append("chat_id", String(task.telegram_id));
  deliveryForm.append("document", new Blob([resultBytes], { type: "application/zip" }), "verification-result-" + task.id + ".zip");
  deliveryForm.append("caption", "Your CheckNumber verification result is ready. Task #" + task.id);
  const deliveryResponse = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
    { method: "POST", body: deliveryForm }
  );
  const delivery = await deliveryResponse.json();
  if (!deliveryResponse.ok || !delivery.ok) {
    await env.DB.prepare(`
      UPDATE provider_tasks SET status='delivery_pending', provider_status='exported',
        result_url=?, total=?, success=?, failure=?, last_error='telegram_delivery_failed',
        updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(resultUrl, Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id).run();
    throw new Error("telegram_result_delivery_failed");
  }

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE provider_tasks SET status='completed', provider_status='exported',
        result_url=NULL, total=?, success=?, failure=?, last_error=NULL,
        completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id),
    env.DB.prepare(`
      UPDATE orders SET status='completed'
      WHERE result_reference=? AND provider_task_id=? AND status='processing'
    `).bind("upload:" + task.upload_id, task.provider_task_id)
  ]);
  await sendProviderTaskNotice(env, task.telegram_id, "Your verification result for task #" + task.id + " has been delivered in this Telegram chat.");
  return "completed";
}

async function pollProviderTasks(env, onlyId = null) {
  await ensureProviderTasksSchema(env);
  const result = onlyId
    ? await env.DB.prepare(`
        SELECT * FROM provider_tasks WHERE id=?
          AND status IN ('submitted','processing','delivery_pending') LIMIT 1
      `).bind(onlyId).all()
    : await env.DB.prepare(`
        SELECT * FROM provider_tasks WHERE status IN ('submitted','processing','delivery_pending')
        ORDER BY updated_at ASC LIMIT 10
      `).all();
  const outcomes = [];
  for (const task of (result.results || [])) {
    try {
      outcomes.push({ id: task.id, status: await processProviderTask(env, task) });
    } catch (error) {
      await env.DB.prepare(
        "UPDATE provider_tasks SET last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(String(error.message || "poll_failed").slice(0, 200), task.id).run();
      outcomes.push({ id: task.id, status: "retry_pending", error: error.message });
    }
  }
  return outcomes;
}

// --------------------------------------------------
// WORKER REQUEST HANDLER
let walletDepositSchemaReady=false;
async function ensureWalletDepositSchema(env){
 if(walletDepositSchemaReady)return;
 for(const [c,t] of [["screenshot_file_id","TEXT"],["screenshot_file_name","TEXT"]]){
  try{await env.DB.prepare(`ALTER TABLE wallet_deposit_requests ADD COLUMN ${c} ${t}`).run();}
  catch(e){if(!String(e.message||"").toLowerCase().includes("duplicate column"))throw e;}
 }
 walletDepositSchemaReady=true;
}
// --------------------------------------------------

async function telegramStoreDocument(env, file) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_STORAGE_CHAT_ID) {
    throw new Error("telegram_storage_configuration_missing");
  }

  const form = new FormData();

  form.append("chat_id", env.TELEGRAM_STORAGE_CHAT_ID);
  form.append("document", file, file.name || "customer-upload.txt");

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
    {
      method: "POST",
      body: form
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok || !result.result?.document?.file_id) {
    throw new Error(
      result.description || "telegram_file_upload_failed"
    );
  }

  return {
    file_id: result.result.document.file_id,
    file_size: result.result.document.file_size || file.size,
    file_name: file.name || "customer-upload.txt",
    mime_type: file.type || "application/octet-stream"
  };
}

async function notifyAdmins(env, message) {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("telegram_bot_configuration_missing");
  }

  await ensureAdminAccessSchema(env);
  const result = await env.DB.prepare(`
    SELECT telegram_id
    FROM admin_access
    WHERE is_active = 1
  `).all();

  const admins = result.results || [];

  if (!admins.length) {
    throw new Error("no_admins_found");
  }

  for (const admin of admins) {
    const response = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: String(admin.telegram_id),
          text: message
        })
      }
    );

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(
        data.description || "admin_notification_failed"
      );
    }
  }
}
// --------------------------------------------------
// IN-APP NOTIFICATION HELPERS
// --------------------------------------------------

async function createUserNotification(
  env,
  userId,
  title,
  message,
  type = "general",
  requestId = null
) {
  await env.DB.prepare(`
    INSERT INTO user_notifications (
      user_id,
      title,
      message,
      notification_type,
      related_request_id
    )
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    userId,
    title,
    message,
    type,
    requestId
  ).run();
}

async function createAdminNotifications(
  env,
  title,
  message,
  type = "general",
  requestId = null
) {
  await ensureAdminAccessSchema(env);
  const result = await env.DB.prepare(`
    SELECT u.id
    FROM admin_access a
    JOIN users u ON u.telegram_id = a.telegram_id
    WHERE a.is_active = 1
  `).all();

  const admins = result.results || [];

  if (!admins.length) return;

  const statements = admins.map(admin =>
    env.DB.prepare(`
      INSERT INTO user_notifications (
        user_id,
        title,
        message,
        notification_type,
        related_request_id
      )
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      admin.id,
      title,
      message,
      type,
      requestId
    )
  );

  await env.DB.batch(statements);
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (
      origin &&
      !ALLOWED_ORIGINS.has(origin) &&
      origin !== WORKER_ORIGIN
    ) {
      return new Response("Origin not allowed", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || DEFAULT_ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Vary": "Origin"
        }
      });
    }

    // ------------------------------------------------
    // HEALTH CHECK
    // ------------------------------------------------
if (request.method === "GET" && url.pathname === "/health") {
  try {
    const result = await env.DB.prepare(
      "SELECT 1 AS connected"
    ).first();

    return json({
      ok: true,
      service: "data-verification-api",
      status: "running",
      database: result?.connected === 1 ? "connected" : "error",
      telegram_secret: !!env.TELEGRAM_BOT_TOKEN,
      checknumber_secret: !!env.CN_API_KEY
    }, 200, origin);

  } catch (error) {
    return json({
      ok: false,
      error: "health_check_failed",
      details: String(error?.message || error).slice(0, 300)
    }, 500, origin);
  }
}

    // ------------------------------------------------
    // TELEGRAM BOT CHECK
    // ------------------------------------------------

    if (request.method === "GET" && url.pathname === "/bot-check") {
      try {
        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`
        );

        const result = await response.json();

        return json({
          ok: result.ok,
          bot_username: result.result?.username || null,
          error: result.ok ? null : result.description
        }, 200, origin);
      } catch {
        return json({
          ok: false,
          error: "telegram_connection_failed"
        }, 500, origin);
      }
    }

    // ------------------------------------------------
    // TELEGRAM LOGIN TEST PAGE
    // ------------------------------------------------

    if (request.method === "GET" && url.pathname === "/login-test") {
      const html = `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Data Verification Login Test</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
body{font-family:Arial;background:#10141d;color:white;padding:25px}
button{padding:14px;width:100%;background:#2688eb;color:white;border:0;border-radius:9px;font-size:16px;margin-top:12px}
#result{margin-top:20px;word-break:break-word;line-height:1.6;white-space:pre-line}
</style>
</head>
<body>
<h2>Data Verification</h2>
<p>Secure Telegram Login Test</p>
<button id="login">Test Secure Login</button>
<div id="result">Waiting for Telegram...</div>
<div id="tests" style="display:none">
<button id="storageTest">Test Telegram Storage</button>
<button id="providerTest">Test Provider Balance</button>
<button id="quoteTest">Test Price Quote</button>
<button id="orderTest">Test Order Rejection</button>
<button id="servicesTest">Test Service Catalogue</button>
<button id="adminTest">Test Admin Catalogue Access</button>
<button id="importCatalogue">Import CheckNumber Catalogue</button>
</div>
<script>
const tg = window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}
let token = "";

async function call(path, options={}) {
  const response = await fetch(path,{
    ...options,
    headers:{
      ...(options.headers||{}),
      Authorization:"Bearer "+token
    }
  });
  return {status:response.status,data:await response.json()};
}

document.getElementById("login").onclick = async () => {
  const result=document.getElementById("result");
  const initData=tg?.initData||"";
  if(!initData){result.textContent="Open this page inside Telegram using your bot.";return;}
  result.textContent="Checking Telegram login...";
  try{
    const response=await fetch("/api/auth",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({initData})
    });
    const data=await response.json();
    if(!data.ok||!data.token){result.textContent="Login failed: "+(data.error||"Unknown error");return;}
    token=data.token;
    const me=await call("/api/me");
    if(!me.data.ok){result.textContent="Session test failed.";return;}
    document.getElementById("tests").style.display="block";
    result.textContent="SUCCESS: Telegram login verified.\\nSession valid.\\nCustomer: "+(me.data.user.first_name||"Customer");
  }catch(e){result.textContent="Connection error. Please try again.";}
};

document.getElementById("providerTest").onclick=async()=>{
  const r=await call("/api/admin/provider-balance");
  document.getElementById("result").textContent=JSON.stringify(r,null,2);
};

// --------------------------------------------------


document.getElementById("quoteTest").onclick=async()=>{
  const r=await call("/api/phone-check/quote",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({quantity:500})
  });
  document.getElementById("result").textContent=JSON.stringify(r,null,2);
};
document.getElementById("orderTest").onclick=async()=>{
  const r=await call("/api/phone-check/order",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({quantity:500})
  });
  document.getElementById("result").textContent=JSON.stringify({
    http_status:r.status,response:r.data,
    route_ready:r.status===400&&r.data.error==="invalid_order_request"
  },null,2);
};
document.getElementById("servicesTest").onclick=async()=>{
  const r=await call("/api/services");
  document.getElementById("result").textContent=JSON.stringify(r,null,2);
};
document.getElementById("adminTest").onclick=async()=>{
  const r=await call("/api/admin/catalogue");
  document.getElementById("result").textContent=JSON.stringify(r,null,2);
};
document.getElementById("storageTest").onclick = async () => {
  const r = await call("/api/admin/storage-test", {
    method: "POST"
  });

  document.getElementById("result").textContent =
    JSON.stringify(r, null, 2);
};
document.getElementById("importCatalogue").onclick=async()=>{
  if (!confirm("Import the safe CheckNumber catalogue? Existing services and pricing will be preserved.")) return;

  const r=await call("/api/admin/catalogue/import", {
    method: "POST"
  });

  document.getElementById("result").textContent=JSON.stringify(r,null,2);
};
</script>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // ------------------------------------------------
    // CUSTOMER LOGIN
    // ------------------------------------------------

    if (request.method === "POST" && url.pathname === "/api/auth") {
      try {
        if (!env.TELEGRAM_BOT_TOKEN || !env.DB) {
          return json({
            ok: false,
            error: "server_configuration_missing"
          }, 500, origin);
        }

        const body = await readBody(request);
        const telegramUser = await verifyTelegram(
          body.initData,
          env.TELEGRAM_BOT_TOKEN
        );

        const session = await createSession(env, telegramUser);

        return json({
          ok: true,
          ...session
        }, 200, origin);
      } catch (error) {
        const knownErrors = [
          "invalid_init_data",
          "invalid_telegram_hash",
          "telegram_login_expired",
          "telegram_user_missing",
          "telegram_signature_invalid",
          "invalid_telegram_user",
          "account_unavailable",
          "invalid_json",
          "request_too_large"
        ];

        const message = knownErrors.includes(error.message)
          ? error.message
          : "request_failed";

        const status = message === "account_unavailable" ? 403 : 400;

        return json({
          ok: false,
          error: message
        }, status, origin);
      }
    }

// --------------------------------------------------
// CUSTOMER: CREATE WALLET DEPOSIT REQUEST
// --------------------------------------------------

if (
  request.method === "POST" &&
  url.pathname === "/api/wallet/deposits"
) {
  try {
    const user = await getSessionUser(request, env);
    await ensureWalletDepositSchema(env);
    if (!(request.headers.get("Content-Type") || "").toLowerCase().includes("multipart/form-data")) {
      return json({ok:false,error:"payment_screenshot_required"},400,origin);
    }
    const form = await request.formData();
    const file = form.get("screenshot");
    if (!(file instanceof File) || !file.size || file.size > 5*1024*1024 || !["image/jpeg","image/png","image/webp"].includes(String(file.type||"").toLowerCase())) {
      return json({ok:false,error:"invalid_screenshot",message:"Attach JPG, PNG or WEBP up to 5 MB."},400,origin);
    }
    const body = {
      amount_cents:Number(form.get("amount_cents")),
      payment_method:String(form.get("payment_method")||""),
      payment_reference:String(form.get("payment_reference")||"")
    };

    const amountCents = Number(body.amount_cents);
    const paymentMethod = String(
      body.payment_method || ""
    ).trim().toLowerCase();

    const paymentReference = String(
      body.payment_reference || ""
    ).trim();

    if (
      !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 ||
      amountCents > 100000000
    ) {
      return json({
        ok: false,
        error: "invalid_deposit_amount"
      }, 400, origin);
    }

    if (
      paymentMethod.length < 2 ||
      paymentMethod.length > 40 ||
      !/^[a-zA-Z0-9 _-]+$/.test(paymentMethod)
    ) {
      return json({
        ok: false,
        error: "invalid_payment_method"
      }, 400, origin);
    }

    if (
      paymentReference.length < 3 ||
      paymentReference.length > 200 ||
      !/^[a-zA-Z0-9._:/-]+$/.test(paymentReference)
    ) {
      return json({
        ok: false,
        error: "invalid_payment_reference"
      }, 400, origin);
    }

    const stored=await telegramStoreDocument(env,new File([file],file.name||"deposit-proof",{type:file.type}));
    const result=await env.DB.prepare(`
      INSERT INTO wallet_deposit_requests (user_id,amount_cents,currency,payment_method,payment_reference,status,screenshot_file_id,screenshot_file_name)
      VALUES (?,?,'USDT',?,?,'pending',?,?)
    `).bind(user.id,amountCents,paymentMethod,paymentReference,stored.file_id,stored.file_name).run();

    return json({
      ok: true,
      deposit_id: result.meta.last_row_id,
      amount_cents: amountCents,
      currency: "USDT",
      status: "pending",
      message: "Deposit request submitted. Awaiting admin verification."
    }, 201, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (
      error.message === "invalid_json" ||
      error.message === "request_too_large"
    ) {
      return json({
        ok: false,
        error: error.message
      }, error.message === "request_too_large" ? 413 : 400, origin);
    }

    if (
      error.message &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      return json({
        ok: false,
        error: "payment_reference_already_submitted"
      }, 409, origin);
    }

    console.error("Wallet deposit request failed:", error);

    return json({
      ok: false,
      error: "deposit_request_failed"
    }, 500, origin);
  }
}

// --------------------------------------------------
// ADMIN: LIST WALLET DEPOSIT REQUESTS
// --------------------------------------------------

if (
  request.method === "GET" &&
  url.pathname === "/api/admin/wallet/deposits"
) {
  try {
    await requireAdmin(request, env);
    await ensureWalletDepositSchema(env);

    const result = await env.DB.prepare(`
      SELECT
        d.id,
        d.user_id,
        u.telegram_id,
        u.username,
        u.first_name,
        d.amount_cents,
        d.currency,
        d.payment_method,
        d.payment_reference,
        d.screenshot_file_id,
        d.screenshot_file_name,
        d.status,
        d.admin_note,
        d.created_at
      FROM wallet_deposit_requests d
      JOIN users u ON u.id = d.user_id
      ORDER BY
        CASE WHEN d.status = 'pending' THEN 0 ELSE 1 END,
        d.created_at DESC
      LIMIT 100
    `).all();

    return json({
      ok: true,
      deposits: result.results || []
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (error.message === "admin_access_required") {
      return json({
        ok: false,
        error: "admin_access_required"
      }, 403, origin);
    }

    console.error("Admin deposit list failed:", error);

    return json({
      ok: false,
      error: "deposit_list_failed"
    }, 500, origin);
  }
}

// --------------------------------------------------
// Admin-only screenshot retrieval. Return the actual image MIME type because
// Telegram may label uploaded documents as application/octet-stream.
if(request.method==="GET"&&url.pathname==="/api/admin/wallet/deposits/screenshot"){
 try{
  await requireAdmin(request,env);
  await ensureWalletDepositSchema(env);
  const id=Number(url.searchParams.get("deposit_id"));
  if(!Number.isSafeInteger(id)||id<=0)return json({ok:false,error:"invalid_deposit_id"},400,origin);
  const row=await env.DB.prepare("SELECT screenshot_file_id FROM wallet_deposit_requests WHERE id=?").bind(id).first();
  if(!row?.screenshot_file_id)return json({ok:false,error:"screenshot_not_found"},404,origin);
  const metaResponse=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(row.screenshot_file_id)}`);
  const meta=await metaResponse.json();
  if(!metaResponse.ok||!meta.ok||!meta.result?.file_path||meta.result.file_path.includes(".."))throw Error("telegram_file_lookup_failed");
  const fileResponse=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`);
  if(!fileResponse.ok)throw Error("telegram_file_download_failed");
  const bytes=await fileResponse.arrayBuffer();
  const view=new Uint8Array(bytes);
  let contentType="";
  if(view.length>=3&&view[0]===0xff&&view[1]===0xd8&&view[2]===0xff)contentType="image/jpeg";
  else if(view.length>=8&&view[0]===0x89&&view[1]===0x50&&view[2]===0x4e&&view[3]===0x47&&view[4]===0x0d&&view[5]===0x0a&&view[6]===0x1a&&view[7]===0x0a)contentType="image/png";
  else if(view.length>=12&&String.fromCharCode(...view.slice(0,4))==="RIFF"&&String.fromCharCode(...view.slice(8,12))==="WEBP")contentType="image/webp";
  if(!contentType)throw Error("stored_screenshot_format_not_supported");
  return new Response(bytes,{headers:{"Content-Type":contentType,"Content-Length":String(view.length),"X-Content-Type-Options":"nosniff","Cache-Control":"private, no-store","Access-Control-Allow-Origin":origin||DEFAULT_ALLOWED_ORIGIN,"Vary":"Origin"}});
 }catch(e){
  if(e.message==="unauthorized")return json({ok:false,error:"unauthorized"},401,origin);
  if(e.message==="admin_access_required")return json({ok:false,error:"admin_access_required"},403,origin);
  console.error("Deposit screenshot retrieval failed:",e);
  return json({ok:false,error:"screenshot_fetch_failed"},500,origin);
 }
}

// ADMIN: APPROVE OR REJECT WALLET DEPOSIT
// --------------------------------------------------


if (
  request.method === "POST" &&
  url.pathname === "/api/admin/wallet/deposits/review"
) {
  try {
    const admin = await requireAdmin(request, env);
    const body = await readBody(request);

    const depositId = Number(body.deposit_id);
    const creditedAmountCents=Number(body.credited_amount_cents);
    const action = String(body.action || "").trim().toLowerCase();
    const adminNote = String(body.admin_note || "").trim();

    if (
      !Number.isSafeInteger(depositId) ||
      depositId <= 0
    ) {
      return json({
        ok: false,
        error: "invalid_deposit_id"
      }, 400, origin);
    }

    if (!["approve", "reject"].includes(action)) {
      return json({
        ok: false,
        error: "invalid_action"
      }, 400, origin);
    }

    if(action==="approve"&&(!Number.isSafeInteger(creditedAmountCents)||creditedAmountCents<=0||creditedAmountCents>100000000))return json({ok:false,error:"invalid_actual_received_amount"},400,origin);

    if (adminNote.length > 500) {
      return json({
        ok: false,
        error: "admin_note_too_long"
      }, 400, origin);
    }

    const actionToken = new Date().toISOString();

    if (action === "approve") {

      // Check that the deposit is still pending.
      const pending = await env.DB.prepare(`
        SELECT id
        FROM wallet_deposit_requests
        WHERE id = ?
          AND status = 'pending'
        LIMIT 1
      `).bind(depositId).first();

      if (!pending) {
        return json({
          ok: false,
          error: "deposit_not_pending_or_already_reviewed"
        }, 409, origin);
      }

      // Execute approval as one atomic transaction.
      await env.DB.batch([

        // 1. Claim the pending deposit.
        env.DB.prepare(`
          UPDATE wallet_deposit_requests
          SET
            status = 'approved',
            amount_cents = ?,
            admin_note = ?,
            reviewed_by = (
              SELECT id
              FROM users
              WHERE telegram_id = ?
            ),
            reviewed_at = ?
          WHERE id = ?
            AND status = 'pending'
        `).bind(
          creditedAmountCents,
          adminNote || null,
          admin.telegram_id,
          actionToken,
          depositId
        ),

        // 2. Insert exactly one deposit ledger entry.
        env.DB.prepare(`
          INSERT INTO wallet_ledger (
            user_id,
            amount_cents,
            transaction_type,
            reference_id,
            description
          )
          SELECT
            user_id,
            amount_cents,
            'deposit',
            'deposit:' || ?,
            'Approved wallet deposit'
          FROM wallet_deposit_requests
          WHERE id = ?
            AND status = 'approved'
            AND reviewed_at = ?
        `).bind(
          String(depositId),
          depositId,
          actionToken
        ),

        // 3. Credit only the actual owner of this deposit.
        // Require the matching ledger entry for that same user.
        env.DB.prepare(`
          UPDATE users
          SET wallet_balance_cents =
            wallet_balance_cents + (
              SELECT amount_cents
              FROM wallet_deposit_requests
              WHERE id = ?
                AND status = 'approved'
                AND reviewed_at = ?
                AND user_id = users.id
            )
          WHERE id = (
            SELECT user_id
            FROM wallet_deposit_requests
            WHERE id = ?
              AND status = 'approved'
              AND reviewed_at = ?
          )
          AND EXISTS (
            SELECT 1
            FROM wallet_ledger l
            WHERE l.user_id = users.id
              AND l.transaction_type = 'deposit'
              AND l.reference_id = 'deposit:' || ?
          )
        `).bind(
          depositId,
          actionToken,
          depositId,
          actionToken,
          String(depositId)
        ),

        // 4. Force the entire batch to roll back if
        // the wallet update affected zero rows.
        env.DB.prepare(`
          INSERT INTO wallet_ledger (
            user_id,
            amount_cents,
            transaction_type,
            reference_id,
            description
          )
          SELECT
            NULL,
            NULL,
            'approval_guard',
            NULL,
            'Wallet approval guard failed'
          WHERE changes() = 0
        `)

      ]);

      return json({
        ok: true,
        message: "Deposit approved and wallet credited.",
        deposit_id: depositId,
        status: "approved"
      }, 200, origin);
    }

    // Reject deposits without changing wallet balances.
    const rejected = await env.DB.prepare(`
      UPDATE wallet_deposit_requests
      SET
        status = 'rejected',
        admin_note = ?,
        reviewed_by = (
          SELECT id
          FROM users
          WHERE telegram_id = ?
        ),
        reviewed_at = ?
      WHERE id = ?
        AND status = 'pending'
    `).bind(
      adminNote || null,
      admin.telegram_id,
      actionToken,
      depositId
    ).run();

    if (!rejected.meta.changes) {
      return json({
        ok: false,
        error: "deposit_not_pending_or_already_reviewed"
      }, 409, origin);
    }

    return json({
      ok: true,
      message: "Deposit rejected.",
      deposit_id: depositId,
      status: "rejected"
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (error.message === "admin_access_required") {
      return json({
        ok: false,
        error: "admin_access_required"
      }, 403, origin);
    }

    if (
      error.message === "invalid_json" ||
      error.message === "request_too_large"
    ) {
      return json({
        ok: false,
        error: error.message
      }, error.message === "request_too_large" ? 413 : 400, origin);
    }

    console.error("Deposit review failed:", error);

    return json({
      ok: false,
      error: "deposit_review_failed"
    }, 500, origin);
  }
}


// --------------------------------------------------
// CUSTOMER: VIEW WALLET DEPOSIT HISTORY
// --------------------------------------------------

if (
  request.method === "GET" &&
  url.pathname === "/api/wallet/deposits"
) {
  try {
    const user = await getSessionUser(request, env);

    const result = await env.DB.prepare(`
      SELECT
        id,
        amount_cents,
        currency,
        payment_method,
        payment_reference,
        status,
        admin_note,
        created_at,
        reviewed_at
      FROM wallet_deposit_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(user.id).all();

    return json({
      ok: true,
      deposits: result.results || []
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    console.error("Customer deposit history failed:", error);

    return json({
      ok: false,
      error: "deposit_history_failed"
    }, 500, origin);
  }
}

    // ------------------------------------------------
    // CUSTOMER SESSION
    // ------------------------------------------------

    if (request.method === "GET" && url.pathname === "/api/me") {
      try {
        const user = await getSessionUser(request, env);
        const admin = await getAdminAccess(user, env);
        let adminPermissions = [];
        if (admin?.role === "sub_admin") {
          try {
            adminPermissions = JSON.parse(admin.permissions_json || "[]");
          } catch {
            adminPermissions = [];
          }
        }

        return json({
          ok: true,
          user: {
            telegram_id: user.telegram_id,
            username: user.username,
            first_name: user.first_name,
            wallet_balance_cents: user.wallet_balance_cents,
            is_admin: !!admin && Number(admin.is_active) === 1,
            admin_role: admin && Number(admin.is_active) === 1
              ? admin.role
              : null,
            admin_permissions: adminPermissions
          }
        }, 200, origin);
      } catch {
        return json({
          ok: false,
          error: "unauthorized"
        }, 401, origin);
      }
    }

    // ------------------------------------------------
    // CUSTOMER SERVICE CATALOGUE
    // Hidden categories and hidden services are excluded.
    // ------------------------------------------------

    if (request.method === "GET" && url.pathname === "/api/services") {
      try {
        await getSessionUser(request, env);

        const result = await env.DB.prepare(`
          SELECT
            c.resource_code,
            c.name,
            c.description,
            c.category,
            c.input_type,
            c.task_type,
            c.display_order,
            p.provider_cost_cents,
            p.markup_type,
            p.markup_value,
            p.final_price_cents,
            p.pricing_unit_quantity,
            p.minimum_order_quantity,
            p.currency,
            p.enabled
          FROM service_catalogue c
          JOIN service_categories sc
            ON sc.category = c.category COLLATE NOCASE
          LEFT JOIN resource_pricing p
            ON p.resource_code = c.resource_code
          WHERE c.is_listed = 1
            AND sc.is_listed = 1
          ORDER BY sc.display_order ASC,
                   c.display_order ASC,
                   c.name ASC
        `).all();

        const rows = result.results || [];

        const services = rows.map(row => {
          let unitPriceCents = null;
          let configured = row.pricing_unit_quantity !== null;

          if (configured) {
            try {
              const quote = calculatePrice(
                row,
                Number(row.minimum_order_quantity)
              );
              unitPriceCents = quote.unitPriceCents;
            } catch {
              configured = false;
            }
          }

          return {
            resource_code: row.resource_code,
            name: row.name,
            description: row.description,
            category: row.category,
            input_type: row.input_type,
            task_type: row.task_type,
            display_order: Number(row.display_order),
            configured,
            enabled: configured && Number(row.enabled) === 1,
            can_order: String(row.task_type||"") !== "VERIFY_IN_DASHBOARD" &&
              configured && Number(row.enabled) === 1 && row.currency === "USDT",
            minimum_order_quantity:
              configured ? Number(row.minimum_order_quantity) : null,
            pricing_unit_quantity:
              configured ? Number(row.pricing_unit_quantity) : null,
            currency: configured ? row.currency : null,
            unit_price_cents: unitPriceCents
          };
        });

        const categories = [
          ...new Set(services.map(service => service.category))
        ];

        return json({
          ok: true,
          categories,
          services,
          ordering_enabled: services.some(service => service.can_order),
          message: "Services are available when their provider task code and pricing are verified and enabled by an administrator."
        }, 200, origin);
      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : "service_catalogue_failed"
        }, error.message === "unauthorized" ? 401 : 500, origin);
      }
    }

    // --------------------------------------------------
    // CUSTOMER: UPLOAD FILE TO TELEGRAM STORAGE
    // --------------------------------------------------

    
    // --------------------------------------------------
    // CUSTOMER: UPLOAD FILE TO TELEGRAM STORAGE
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/uploads"
    ) {
      try {
        const user = await getSessionUser(request, env);

        const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

        if (
          !(request.headers.get("Content-Type") || "")
            .toLowerCase().includes("multipart/form-data")
        ) {
          return json({
            ok: false,
            error: "multipart_form_data_required"
          }, 400, origin);
        }

        const contentLength = Number(
          request.headers.get("Content-Length") || 0
        );

        if (contentLength > MAX_UPLOAD_SIZE + 100000) {
          return json({
            ok: false,
            error: "file_too_large",
            maximum_size_mb: 20
          }, 413, origin);
        }

        const form = await request.formData();

        const file = form.get("file");
        const resourceCode = String(
          form.get("resource_code") || ""
        ).trim();
const consentConfirmed = String(
  form.get("consent_confirmed") || ""
);

const consentVersion = String(
  form.get("consent_version") || ""
);

if (
  consentConfirmed !== "yes" ||
  (resourceCode === "phoneCheck"
    ? consentVersion !== "phone-validation-v1"
    : consentVersion !== "authorized-list-v1")
) {
  return json({
    ok: false,
    error: "phone_consent_required",
    message: "Explicit authorization is required."
  }, 400, origin);
}
        if (!resourceCode || resourceCode.length > 128) {
          return json({
            ok: false,
            error: "service_selection_required"
          }, 400, origin);
        }

        // Normal customer uploads require a listed service and enabled pricing.
        let service = await env.DB.prepare(`
          SELECT c.resource_code,c.input_type,c.task_type,p.minimum_order_quantity
          FROM service_catalogue c
          JOIN service_categories sc ON sc.category = c.category COLLATE NOCASE
          JOIN resource_pricing p ON p.resource_code = c.resource_code
          WHERE c.resource_code = ? AND c.is_listed = 1 AND sc.is_listed = 1
            AND p.enabled = 1 AND c.task_type <> 'VERIFY_IN_DASHBOARD'
          LIMIT 1
        `).bind(resourceCode).first();

        // Main/full admins (or explicitly permitted sub-admins) may stage
        // phoneCheck files while the service remains hidden and pricing off.
        // This is storage/validation preparation only; it never submits a
        // provider task or enables customer ordering.
        if (!service && resourceCode === "phoneCheck") {
          await requireAdmin(request, env);
          service = await env.DB.prepare(`
            SELECT resource_code,input_type,task_type,500 AS minimum_order_quantity
            FROM service_catalogue
            WHERE resource_code = 'phoneCheck' AND task_type = 'phoneCheck'
            LIMIT 1
          `).first();
        }

        if (!service) {
          return json({
            ok: false,
            error: "service_unavailable"
          }, 400, origin);
        }

        if (!file || typeof file.arrayBuffer !== "function") {
          return json({
            ok: false,
            error: "file_missing"
          }, 400, origin);
        }

        const fileName = String(file.name || "");
        const extension = fileName.split(".").pop().toLowerCase();

        if (!["txt", "csv"].includes(extension)) {
          return json({
            ok: false,
            error: "only_txt_and_csv_allowed"
          }, 400, origin);
        }

        if (file.size < 1 || file.size > MAX_UPLOAD_SIZE) {
          return json({
            ok: false,
            error: "invalid_file_size",
            maximum_size_mb: 20
          }, 400, origin);
        }

        // Validate that the file contains UTF-8 text.
        try {
          const bytes = await file.arrayBuffer();

          const decoded = new TextDecoder("utf-8", {
            fatal: true
          }).decode(bytes);

          if (decoded.includes("\u0000")) {
            throw new Error("binary_file");
          }
        } catch {
          return json({
            ok: false,
            error: "invalid_text_file"
          }, 400, origin);
        }
        let consentNumbers = [];

        const uploadContent=await file.text();
        let parsedEntries;
        try{parsedEntries=parseProviderEntries(uploadContent,extension,service.input_type||"phone");}
        catch(parseError){return json({ok:false,error:parseError.message||"invalid_input_entries"},400,origin);}
        const minimumQuantity=Number(service.minimum_order_quantity||500);
        if(!Number.isSafeInteger(minimumQuantity)||minimumQuantity<1||
           parsedEntries.length<minimumQuantity||parsedEntries.length>1000000){
          return json({ok:false,error:"invalid_entry_count",minimum:minimumQuantity,maximum:1000000,received:parsedEntries.length},400,origin);
        }
        if(service.input_type==="phone")consentNumbers=parsedEntries;
        // Store the file in the private Telegram channel.
        const stored = await telegramStoreDocument(env, file);

        const expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString();

        // Save upload details and selected service in D1.
        const inserted = await env.DB.prepare(`
          INSERT INTO upload_staging (
            user_id,
            telegram_file_id,
            file_name,
            mime_type,
            file_size,
            status,
            expires_at,
            resource_code
          )
          VALUES (?, ?, ?, ?, ?, 'uploaded', ?, ?)
        `).bind(
          user.id,
          stored.file_id,
          stored.file_name,
          stored.mime_type,
          stored.file_size,
          expiresAt,
          service.resource_code
        ).run();
       try {
  if (resourceCode === "phoneCheck") {
    const consentText =
      "I confirm that I own these phone numbers or have obtained permission from their owners to submit them for phone-number validation. I authorize processing of these numbers for this stated purpose.";

    for (let i = 0; i < consentNumbers.length; i += 100) {
      const chunk = consentNumbers.slice(i, i + 100);

      const statements = chunk.map(phoneNumber =>
        env.DB.prepare(`
          INSERT INTO consent_records (
            user_id,
            phone_number,
            consent_text,
            consent_version,
            consented,
            consented_at,
            consent_source,
            upload_id
          )
          VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?, ?)
        `).bind(
          user.id,
          phoneNumber,
          consentText,
          consentVersion,
          "telegram_mini_app",
          inserted.meta.last_row_id
        )
      );

      await env.DB.batch(statements);
    }
  }
} catch (consentError) {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM consent_records
      WHERE upload_id = ? AND user_id = ?
    `).bind(inserted.meta.last_row_id, user.id),

    env.DB.prepare(`
      DELETE FROM upload_staging
      WHERE id = ? AND user_id = ?
    `).bind(inserted.meta.last_row_id, user.id)
  ]);

  throw consentError;
}
return json({
          ok: true,
          message: "file_uploaded_successfully",
          upload_id: inserted.meta.last_row_id,
          resource_code: service.resource_code,
          file_name: stored.file_name,
          file_size: stored.file_size,
          expires_at: expiresAt
        }, 200, origin);

      } catch (error) {
        if (error.message === "unauthorized") {
          return json({
            ok: false,
            error: "unauthorized"
          }, 401, origin);
        }

        if (error.message === "admin_access_required") {
          return json({
            ok: false,
            error: "admin_access_required"
          }, 403, origin);
        }

        return json({
          ok: false,
          error: "file_upload_failed"
        }, 500, origin);
      }
    }


    // ------------------------------------------------
    // CUSTOMER ORDER HISTORY
    // ------------------------------------------------

    if (request.method === "GET" && url.pathname === "/api/orders") {
      try {
        const user = await getSessionUser(request, env);

        const limit = Number(url.searchParams.get("limit") || 20);
        const offset = Number(url.searchParams.get("offset") || 0);

        if (
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50 ||
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > 1000000
        ) {
          return json({
            ok: false,
            error: "invalid_pagination",
            maximum_limit: 50
          }, 400, origin);
        }

        const count = await env.DB.prepare(`
          SELECT COUNT(*) AS total
          FROM orders
          WHERE user_id = ?
        `).bind(user.id).first();

        const result = await env.DB.prepare(`
          SELECT
            id,
            resource_code,
            quantity,
            customer_charge_cents,
            currency,
            status,
            result_reference,
            created_at,
            EXISTS(SELECT 1 FROM wallet_ledger l
              WHERE l.reference_id='order_refund:' || orders.id
                AND l.transaction_type='order_refund') AS refunded
          FROM orders
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).bind(user.id, limit, offset).all();

        const orders = result.results || [];
        const total = Number(count?.total || 0);

        return json({
          ok: true,
          orders,
          pagination: {
            total,
            limit,
            offset,
            has_more: offset + orders.length < total
          }
        }, 200, origin);
      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : "order_history_failed"
        }, error.message === "unauthorized" ? 401 : 500, origin);
      }
    }

// --------------------------------------------------
// ADMIN: GET UPLOAD MANAGEMENT
// Read-only upload history
// --------------------------------------------------

if (
  request.method === "GET" &&
  url.pathname === "/api/admin/uploads"
) {
  try {
    await requireAdmin(request, env);
    await ensureProviderTasksSchema(env);

    const limit = Number(
      url.searchParams.get("limit") || 20
    );

    const offset = Number(
      url.searchParams.get("offset") || 0
    );

    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 1000000
    ) {
      return json({
        ok: false,
        error: "invalid_pagination",
        maximum_limit: 50
      }, 400, origin);
    }

    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS total
      FROM upload_staging
    `).first();

    const result = await env.DB.prepare(`
     SELECT
  id,
  user_id,
  file_name,
  mime_type,
  file_size,
  status,
  created_at,
  expires_at,
  resource_code,
  admin_note,
  reviewed_at,
  reviewed_by,
  CASE WHEN EXISTS (
    SELECT 1 FROM provider_tasks pt WHERE pt.upload_id = upload_staging.id
  ) THEN 1 ELSE 0 END AS provider_task_exists,
  (SELECT o.id FROM orders o WHERE
    o.result_reference = 'upload:' || upload_staging.id OR
    o.result_reference LIKE 'upload:' || upload_staging.id || '|%' LIMIT 1) AS paid_order_id,
  (SELECT o.customer_charge_cents FROM orders o WHERE
    o.result_reference = 'upload:' || upload_staging.id OR
    o.result_reference LIKE 'upload:' || upload_staging.id || '|%' LIMIT 1) AS paid_order_charge_cents,
  (SELECT o.status FROM orders o WHERE
    o.result_reference = 'upload:' || upload_staging.id OR
    o.result_reference LIKE 'upload:' || upload_staging.id || '|%' LIMIT 1) AS paid_order_status
FROM upload_staging
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `).bind(limit, offset).all();

    const uploads = result.results || [];
    const total = Number(count?.total || 0);

    return json({
      ok: true,
      uploads,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + uploads.length < total
      }
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (error.message === "admin_access_required") {
      return json({
        ok: false,
        error: "admin_access_required"
      }, 403, origin);
    }

    return json({
      ok: false,
      error: "admin_uploads_failed"
    }, 500, origin);
  }
}

// --------------------------------------------------
// ADMIN: UPDATE UPLOAD STATUS
// --------------------------------------------------

if (
  request.method === "POST" &&
  url.pathname === "/api/admin/uploads/status"
) {
  try {
    const admin = await requireAdmin(request, env);

    const body = await request.json();

    const uploadId = Number(body.upload_id);
    const status = String(body.status || "").trim();
    const adminNote = String(body.admin_note || "").trim();

    const allowedStatuses = [
      "uploaded",
      "reviewed",
      "rejected",
      "expired"
    ];

    if (
      !Number.isSafeInteger(uploadId) ||
      uploadId < 1
    ) {
      return json({
        ok: false,
        error: "invalid_upload_id"
      }, 400, origin);
    }

    if (!allowedStatuses.includes(status)) {
      return json({
        ok: false,
        error: "invalid_upload_status"
      }, 400, origin);
    }

    if (adminNote.length > 1000) {
      return json({
        ok: false,
        error: "admin_note_too_long",
        maximum_length: 1000
      }, 400, origin);
    }

    const reviewedAt = status === "uploaded"
      ? null
      : new Date().toISOString();

    const reviewedBy = status === "uploaded"
      ? null
      : admin.id;

    const result = await env.DB.prepare(`
      UPDATE upload_staging
      SET
        status = ?,
        admin_note = ?,
        reviewed_at = ?,
        reviewed_by = ?
      WHERE id = ?
    `).bind(
      status,
      adminNote || null,
      reviewedAt,
      reviewedBy,
      uploadId
    ).run();

    if (!result.meta || result.meta.changes === 0) {
      return json({
        ok: false,
        error: "upload_not_found"
      }, 404, origin);
    }

    return json({
      ok: true,
      message: "upload_status_updated",
      upload_id: uploadId,
      status,
      reviewed_at: reviewedAt
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (error.message === "admin_access_required") {
      return json({
        ok: false,
        error: "admin_access_required"
      }, 403, origin);
    }

        console.error(
      "UPLOAD STATUS UPDATE ERROR:",
      error?.stack || error?.message || String(error)
    );

    return json({
      ok: false,
      error: "upload_status_update_failed",
      details: String(error?.message || error).slice(0, 300)
    }, 500, origin);
  }
}

    // ------------------------------------------------
    // ADMIN: GET COMPLETE CATALOGUE
    // ------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/catalogue"
    ) {
      try {
        await requireAdmin(request, env);
        const catalogue = await getAdminCatalogue(env);

        return json({
          ok: true,
          ...catalogue,
          ordering_enabled: false
        }, 200, origin);
      } catch (error) {
        const unauthorized = error.message === "unauthorized";
        return json({
          ok: false,
          error: unauthorized
            ? "unauthorized"
            : "admin_access_required"
        }, unauthorized ? 401 : 403, origin);
      }
    }
// --------------------------------------------------
// ADMIN: IMPORT CHECKNUMBER CATALOGUE
// --------------------------------------------------

if (
  request.method === "POST" &&
  url.pathname === "/api/admin/catalogue/import"
) {
  try {
    await requireAdmin(request, env);

    const result = await importCheckNumberCatalogue(env);

    return json({
      ok: true,
      ...result
    }, 200, origin);

  } catch (error) {
    const statusMap = {
      unauthorized: 401,
      admin_access_required: 403
    };

    return json({
      ok: false,
      error: error.message || "catalogue_import_failed"
    }, statusMap[error.message] || 500, origin);
  }
}

  // --------------------------------------------------
  // ADMIN: VALIDATE CHECKNUMBER FILE UPLOAD
  // DRY RUN ONLY - NO PROVIDER SUBMISSION
  // --------------------------------------------------

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/checknumber/validate-upload"
  ) {
    try {
      await requireAdmin(request, env);

   const contentLength = Number(
  request.headers.get("Content-Length") || 0
);

if (contentLength > 2 * 1024 * 1024 + 65536) {
  return json({
    ok: false,
    error: "file_too_large",
    maximum_file_bytes: 2097152
  }, 413, origin);
}

const form = await request.formData();
      const file = form.get("file");
      const taskType = String(form.get("task_type") || "");

      const allowedTypes = [
        "phoneCheck",
        "email_check",
        "tg_username"
      ];

      if (!allowedTypes.includes(taskType)) {
        return json({
          ok: false,
          error: "unsupported_task_type"
        }, 400, origin);
      }

      if (
        !file ||
        typeof file.text !== "function" ||
        typeof file.name !== "string"
      ) {
        return json({
          ok: false,
          error: "file_required"
        }, 400, origin);
      }

      const extension = file.name.toLowerCase().split(".").pop();

      if (!["txt", "csv"].includes(extension)) {
        return json({
          ok: false,
          error: "only_txt_and_csv_allowed"
        }, 400, origin);
      }

      if (file.size > 2 * 1024 * 1024) {
        return json({
          ok: false,
          error: "file_too_large",
          maximum_bytes: 2097152
        }, 413, origin);
      }

      const content = await file.text();

      if (!content.trim()) {
        return json({
          ok: false,
          error: "empty_file"
        }, 400, origin);
      }

      const lines = content
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);

      const entries = lines.map(line => {
        if (extension === "csv") {
          return line.split(",")[0]
            .trim()
            .replace(/^["']|["']$/g, "");
        }
        return line;
      });

      const valid = [];
      const invalid = [];

      for (let i = 0; i < entries.length; i++) {
        const value = entries[i];

        if (
          i === 0 &&
          ["phone", "phone_number", "number", "email", "username", "value"]
            .includes(value.toLowerCase())
        ) {
          continue;
        }

        let isValid = false;

        if (taskType === "phoneCheck") {
          isValid = /^\+?[1-9]\d{7,14}$/.test(value);
        }

        if (taskType === "email_check") {
          isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        }

        if (taskType === "tg_username") {
          isValid = /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value);
        }

        if (isValid) {
          valid.push(value);
        } else {
          invalid.push({
            row: i + 1,
            reason: "invalid_entry"
          });
        }
      }

      const uniqueValid = taskType === "phoneCheck"
        ? [...new Set(valid)]
        : valid;
      const duplicateEntries = taskType === "phoneCheck"
        ? valid.length - uniqueValid.length
        : 0;

      return json({
        ok: true,
        mode: "dry_run",
        provider_submission: false,
        file_name: file.name,
        file_type: extension,
        task_type: taskType,
        non_empty_lines: lines.length,
        total_entries: valid.length + invalid.length,
        valid_entries: valid.length,
        unique_valid_numbers: taskType === "phoneCheck"
          ? uniqueValid.length
          : null,
        duplicate_entries: duplicateEntries,
        invalid_entries: invalid.length,
        invalid_rows: invalid.slice(0, 50),
        message: "File validated. Nothing was submitted to CheckNumber.ai."
      }, 200, origin);

    } catch (error) {
      const status =
        error.message === "unauthorized" ? 401 :
        error.message === "admin_access_required" ? 403 :
        500;

      return json({
        ok: false,
        error:
          error.message === "unauthorized" ||
          error.message === "admin_access_required"
            ? error.message
            : "upload_validation_failed"
      }, status, origin);
    }
  }

    // ------------------------------------------------
    // ADMIN: CREATE / RENAME / HIDE / REORDER CATEGORIES
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/categories"
    ) {
      try {
        await requireAdmin(request, env);
        const body = await readBody(request);
        const result = await manageCategories(body, env);

        return json({
          ok: true,
          ...result
        }, 200, origin);
      } catch (error) {
        const statusMap = {
          unauthorized: 401,
          admin_access_required: 403,
          invalid_json: 400,
          request_too_large: 413,
          invalid_category: 400,
          invalid_visibility: 400,
          invalid_category_order: 400,
          invalid_category_action: 400,
          category_not_found: 404,
          category_already_exists: 409
        };

        return json({
          ok: false,
          error: statusMap[error.message]
            ? error.message
            : "category_operation_failed"
        }, statusMap[error.message] || 400, origin);
      }
    }

    // ------------------------------------------------
    // ADMIN: ADD OR EDIT SERVICE
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/services"
    ) {
      try {
        await requireAdmin(request, env);
        const body = await readBody(request);
        const result = await saveService(body, env);

        return json({
          ok: true,
          ...result
        }, 200, origin);
      } catch (error) {
        const statusMap = {
          unauthorized: 401,
          admin_access_required: 403,
          invalid_json: 400,
          request_too_large: 413,
          invalid_service: 400,
          category_not_found: 404
        };

        return json({
          ok: false,
          error: statusMap[error.message]
            ? error.message
            : "service_save_failed"
        }, statusMap[error.message] || 400, origin);
      }
    }

    // ------------------------------------------------
    // ADMIN: HIDE OR PUBLISH SERVICE
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/services/visibility"
    ) {
      try {
        await requireAdmin(request, env);
        const body = await readBody(request);
        const result = await updateServiceVisibility(body, env);

        return json({
          ok: true,
          ...result
        }, 200, origin);
      } catch (error) {
        const statusMap = {
          unauthorized: 401,
          admin_access_required: 403,
          invalid_json: 400,
          request_too_large: 413,
          invalid_service_visibility: 400,
          service_not_found: 404
        };

        return json({
          ok: false,
          error: statusMap[error.message]
            ? error.message
            : "service_visibility_update_failed"
        }, statusMap[error.message] || 400, origin);
      }
    }

    // ------------------------------------------------
    // ADMIN: SAVE SERVICE PRICING
    // ------------------------------------------------

// ADMIN: APPLY GLOBAL MARKUP TO ALL CATALOGUE PRODUCTS
if(request.method==="POST"&&url.pathname==="/api/admin/pricing/global"){
  try{
    await requireAdmin(request,env);
    await ensurePlatformSettingsSchema(env);
    const body=await readBody(request);
    const percentage=Number(body.markup_percentage);
    if(!Number.isSafeInteger(percentage)||percentage<0||percentage>10000)
      return json({ok:false,error:"invalid_global_markup"},400,origin);
    await env.DB.batch([
      env.DB.prepare(`UPDATE platform_settings SET setting_value=?,updated_at=CURRENT_TIMESTAMP
        WHERE setting_key='global_markup_percentage'`).bind(String(percentage)),
      env.DB.prepare(`UPDATE resource_pricing SET markup_type='percentage',markup_value=?,
        final_price_cents=NULL,updated_at=CURRENT_TIMESTAMP`).bind(percentage)
    ]);
    const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM resource_pricing").first();
    return json({ok:true,markup_percentage:percentage,updated_products:Number(count?.total||0),
      message:"global_markup_applied"},200,origin);
  }catch(error){
    const status=error.message==="unauthorized"?401:error.message==="admin_access_required"?403:400;
    return json({ok:false,error:error.message||"global_markup_update_failed"},status,origin);
  }
}

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/pricing"
    ) {
      try {
        await requireAdmin(request, env);
        const body = await readBody(request);
        const result = await saveServicePricing(body, env);

        return json({
          ok: true,
          ...result
        }, 200, origin);
      } catch (error) {
        const statusMap = {
          unauthorized: 401,
          admin_access_required: 403,
          invalid_json: 400,
          request_too_large: 413,
          invalid_pricing: 400,
          service_not_found: 404
        };

        return json({
          ok: false,
          error: statusMap[error.message]
            ? error.message
            : "pricing_save_failed"
        }, statusMap[error.message] || 400, origin);
      }
    }

    // ------------------------------------------------
    // ADMIN: CHECK CHECKNUMBER PROVIDER BALANCE
    // ------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/provider-balance"
    ) {
      try {
        await requireAdmin(request, env);

        if (!env.CN_API_KEY || !env.CN_BASE_URL) {
          return json({
            ok: false,
            error: "provider_configuration_missing"
          }, 500, origin);
        }

        const response = await fetch(
          `${env.CN_BASE_URL.replace(/\/+$/, "")}/v1/balance`,
          {
            method: "GET",
            headers: {
              "X-API-Key": env.CN_API_KEY
            }
          }
        );

        const text = await response.text();
        let data;

        try {
          data = JSON.parse(text);
        } catch {
          data = { message: "Invalid provider response" };
        }

        if (!response.ok) {
          return json({
            ok: false,
            error: "provider_request_failed",
            provider_status: response.status
          }, 502, origin);
        }

        return json({
          ok: true,
          provider: "CheckNumber.ai",
          balance: data.balance ?? data
        }, 200, origin);
      } catch (error) {
        const unauthorized = error.message === "unauthorized";
        return json({
          ok: false,
          error: unauthorized
            ? "unauthorized"
            : error.message === "admin_access_required"
              ? "admin_access_required"
              : "provider_balance_check_failed"
        }, unauthorized ? 401 : error.message === "admin_access_required" ? 403 : 500, origin);
      }
    }

        // ------------------------------------------------
    // --------------------------------------------------
// ADMIN: PROVIDER TASK MANAGEMENT
// --------------------------------------------------

if (request.method === "GET" && url.pathname === "/api/admin/provider-tasks") {
  try {
    await requireAdmin(request, env);
    await ensureProviderTasksSchema(env);
    const result = await env.DB.prepare(`
      SELECT id, upload_id, user_id, resource_code, task_type, provider_task_id,
        status, provider_status, total, success, failure, last_error,
        created_at, updated_at, completed_at
      FROM provider_tasks ORDER BY id DESC LIMIT 50
    `).all();
    return json({ ok: true, tasks: result.results || [] }, 200, origin);
  } catch (error) {
    const status = error.message === "unauthorized" ? 401 :
      error.message === "admin_access_required" ? 403 : 500;
    return json({ ok: false, error: error.message || "provider_tasks_failed" }, status, origin);
  }
}

if (request.method === "POST" && url.pathname === "/api/admin/provider-tasks/submit") {
  try {
    await requireAdmin(request, env);
    const body = await readBody(request);
    const uploadId = Number(body.upload_id);
    if (!Number.isSafeInteger(uploadId) || uploadId < 1) {
      return json({ ok: false, error: "invalid_upload_id" }, 400, origin);
    }
    const task = await submitStagedProviderTask(env, uploadId);
    return json({ ok: true, task, customer_charging: false }, 201, origin);
  } catch (error) {
    const status = error.message === "unauthorized" ? 401 :
      error.message === "admin_access_required" ? 403 :
      error.message === "upload_not_found" ? 404 :
      ["upload_not_ready","provider_task_already_created"].includes(error.message) ? 409 :
      ["invalid_json","invalid_upload_id","invalid_phone_numbers","provider_quantity_out_of_range","ambiguous_or_invalid_csv_row","invalid_csv_quotes","unsupported_file_type"].includes(error.message) ? 400 :
      error.message === "service_not_enabled_for_provider_submission" ? 403 : 502;
    return json({
      ok: false,
      error: error.message === "provider_request_failed" ? "provider_submission_outcome_uncertain" : error.message || "provider_submission_failed",
      provider_status: error.providerStatus || null
    }, status, origin);
  }
}

if (request.method === "POST" && url.pathname === "/api/admin/provider-tasks/poll") {
  try {
    await requireAdmin(request, env);
    const body = await readBody(request);
    const taskId = Number(body.task_id);
    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return json({ ok: false, error: "invalid_task_id" }, 400, origin);
    }
    return json({ ok: true, outcomes: await pollProviderTasks(env, taskId) }, 200, origin);
  } catch (error) {
    const status = error.message === "unauthorized" ? 401 :
      error.message === "admin_access_required" ? 403 : 502;
    return json({ ok: false, error: error.message || "provider_poll_failed" }, status, origin);
  }
}

// ADMIN: MANUAL REVIEW FOR UNCERTAIN TELEGRAM RESULT DELIVERY
if (request.method === "POST" && url.pathname === "/api/admin/provider-tasks/delivery-review") {
  try {
    const admin = await requireAdminManager(request, env);
    const body = await readBody(request);
    const taskId = Number(body.task_id);
    const action = String(body.action || "");
    const note = String(body.note || "").trim();

    if (!Number.isSafeInteger(taskId) || taskId < 1) {
      return json({ ok: false, error: "invalid_task_id" }, 400, origin);
    }
    if (!["confirm_delivered", "retry_delivery"].includes(action)) {
      return json({ ok: false, error: "invalid_delivery_review_action" }, 400, origin);
    }
    if (note.length < 8 || note.length > 500) {
      return json({ ok: false, error: "delivery_review_note_required" }, 400, origin);
    }

    await ensureProviderTasksSchema(env);
    const task = await env.DB.prepare(
      "SELECT id, upload_id, telegram_id, status, result_url, provider_task_id FROM provider_tasks WHERE id=? LIMIT 1"
    ).bind(taskId).first();
    if (!task) return json({ ok: false, error: "provider_task_not_found" }, 404, origin);
    if (task.status !== "delivery_sending") {
      return json({ ok: false, error: "task_not_awaiting_delivery_review", current_status: task.status }, 409, origin);
    }

    if (action === "confirm_delivered") {
      const update = await env.DB.prepare(`
        UPDATE provider_tasks SET status='completed', result_url=NULL, last_error=NULL,
          completed_at=COALESCE(completed_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND status='delivery_sending'
      `).bind(taskId).run();
      if (!update.meta?.changes) {
        return json({ ok: false, error: "task_delivery_review_conflict" }, 409, origin);
      }
      await env.DB.prepare(`
        UPDATE orders SET status='completed'
        WHERE result_reference=? AND provider_task_id=? AND status='processing'
      `).bind("upload:" + task.upload_id, task.provider_task_id).run();
      await writeAdminAudit(env, admin.telegram_id, task.telegram_id,
        "provider_delivery_confirmed_delivered", { task_id: taskId, note });
      return json({ ok: true, task_id: taskId, status: "completed" }, 200, origin);
    }

    if (!task.result_url || !task.provider_task_id) {
      return json({ ok: false, error: "delivery_retry_data_missing" }, 409, origin);
    }
    const update = await env.DB.prepare(`
      UPDATE provider_tasks SET status='delivery_pending',
        last_error='admin_authorized_delivery_retry', updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND status='delivery_sending'
    `).bind(taskId).run();
    if (!update.meta?.changes) {
      return json({ ok: false, error: "task_delivery_review_conflict" }, 409, origin);
    }
    await writeAdminAudit(env, admin.telegram_id, task.telegram_id,
      "provider_delivery_retry_authorized", { task_id: taskId, note });
    const outcomes = await pollProviderTasks(env, taskId);
    return json({ ok: true, task_id: taskId, outcomes }, 200, origin);
  } catch (error) {
    const status = error.message === "unauthorized" ? 401 :
      ["admin_access_required", "admin_management_required"].includes(error.message) ? 403 :
      error.message === "invalid_json" ? 400 : 500;
    return json({ ok: false, error: error.message || "provider_delivery_review_failed" }, status, origin);
  }
}

// PHONE CHECK: CUSTOMER PRICE QUOTE
    // The final order is recalculated server-side from the uploaded file.
    // ------------------------------------------------

    
// Generic catalogue quote.
if(request.method==="POST"&&url.pathname==="/api/services/quote"){
  try{
    const user=await getSessionUser(request,env),body=await readBody(request);
    const code=String(body.resource_code||""),quantity=Number(body.quantity);
    if(!validResourceCode(code)||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)
      return json({ok:false,error:"invalid_quote_request"},400,origin);
    const pricing=await env.DB.prepare(`
      SELECT c.task_type,p.provider_cost_cents,p.markup_type,p.markup_value,p.final_price_cents,
        p.pricing_unit_quantity,p.minimum_order_quantity,p.currency,p.enabled
      FROM service_catalogue c JOIN resource_pricing p ON p.resource_code=c.resource_code
      WHERE c.resource_code=? AND c.is_listed=1 LIMIT 1
    `).bind(code).first();
    if(!pricing||pricing.task_type==="VERIFY_IN_DASHBOARD"||Number(pricing.enabled)!==1||pricing.currency!=="USDT")
      return json({ok:false,error:"service_unavailable"},403,origin);
    const quote=calculatePrice(pricing,quantity);
    return json({ok:true,service:code,customer:user.first_name||"Customer",quantity,
      minimum_quantity:quote.minimum,pricing_unit_quantity:quote.unitQuantity,
      unit_price_cents:quote.unitPriceCents,total_price_cents:quote.totalCents,
      currency:pricing.currency,can_order:true},200,origin);
  }catch(error){
    const status=error.message==="unauthorized"?401:
      ["invalid_pricing_configuration","unsupported_pricing_type","invalid_order_amount"].includes(error.message)?500:400;
    return json({ok:false,error:error.message||"quote_request_failed"},status,origin);
  }
}

// Generic catalogue checkout. Uses the existing wallet, orders, and ledger tables.
if(request.method==="POST"&&url.pathname==="/api/services/order"){
  try{
    const user=await getSessionUser(request,env),body=await readBody(request);
    const uploadId=Number(body.upload_id),code=String(body.resource_code||""),key=String(body.idempotency_key||"");
    if(!Number.isSafeInteger(uploadId)||uploadId<1||!validResourceCode(code)||!/^[A-Za-z0-9_-]{12,100}$/.test(key))
      return json({ok:false,error:"invalid_order_request"},400,origin);
    await ensureCustomerOrderSchema(env);
    const upload=await env.DB.prepare(`
      SELECT s.id,s.telegram_file_id,s.file_name,s.status,s.expires_at,c.input_type,c.task_type
      FROM upload_staging s
      JOIN service_catalogue c ON c.resource_code=s.resource_code
      JOIN service_categories sc ON sc.category=c.category COLLATE NOCASE
      WHERE s.id=? AND s.user_id=? AND s.resource_code=? AND c.is_listed=1 AND sc.is_listed=1 LIMIT 1
    `).bind(uploadId,user.id,code).first();
    if(!upload||!["uploaded","reviewed"].includes(upload.status)||!upload.expires_at||
       new Date(upload.expires_at).getTime()<=Date.now()||upload.task_type==="VERIFY_IN_DASHBOARD")
      return json({ok:false,error:"upload_not_orderable"},409,origin);
    const prior=await env.DB.prepare("SELECT id,status FROM orders WHERE user_id=? AND result_reference=? LIMIT 1")
      .bind(user.id,"upload:"+uploadId).first();
    if(prior)return json({ok:false,error:"upload_already_ordered",order_id:prior.id,status:prior.status},409,origin);
    const pricing=await env.DB.prepare(`
      SELECT provider_cost_cents,markup_type,markup_value,final_price_cents,
        pricing_unit_quantity,minimum_order_quantity,currency,enabled
      FROM resource_pricing WHERE resource_code=? LIMIT 1
    `).bind(code).first();
    if(!pricing||Number(pricing.enabled)!==1||pricing.currency!=="USDT")
      return json({ok:false,error:"service_unavailable"},403,origin);
    if(!env.TELEGRAM_BOT_TOKEN)throw new Error("telegram_storage_configuration_missing");
    const infoResponse=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(upload.telegram_file_id)}`);
    const info=await infoResponse.json(),filePath=info?.result?.file_path;
    if(!infoResponse.ok||!info.ok||!filePath||filePath.includes(".."))throw new Error("uploaded_file_unavailable");
    const fileResponse=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
    if(!fileResponse.ok)throw new Error("uploaded_file_unavailable");
    const bytes=await fileResponse.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>20*1024*1024)throw new Error("invalid_uploaded_file_size");
    const content=new TextDecoder("utf-8",{fatal:true}).decode(bytes),extension=String(upload.file_name||"").toLowerCase().split(".").pop();
    if(!["txt","csv"].includes(extension))return json({ok:false,error:"unsupported_file_type"},400,origin);
    const entries=parseProviderEntries(content,extension,upload.input_type||"phone"),minimum=Number(pricing.minimum_order_quantity);
    if(entries.length<minimum||entries.length>1000000)
      return json({ok:false,error:"invalid_entry_count",minimum,maximum:1000000,received:entries.length},400,origin);
    const quote=calculatePrice(pricing,entries.length);
    const results=await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO orders(user_id,resource_code,idempotency_key,customer_charge_cents,
          estimated_provider_cost_cents,status,result_reference,quantity,unit_price_cents,
          pricing_unit_quantity,currency,markup_type,markup_value,minimum_order_quantity,provider_currency)
        SELECT ?,?,?,?,?, 'pending',?,?,?,?, 'USDT',?,?,?,'USD'
        WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND wallet_balance_cents>=?)
      `).bind(user.id,code,key,quote.totalCents,quote.estimatedCostCents,"upload:"+uploadId,
        entries.length,quote.unitPriceCents,quote.unitQuantity,pricing.markup_type,
        Number(pricing.markup_value),quote.minimum,user.id,quote.totalCents),
      env.DB.prepare(`
        UPDATE users SET wallet_balance_cents=wallet_balance_cents-
          (SELECT customer_charge_cents FROM orders WHERE idempotency_key=?)
        WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE idempotency_key=?)
      `).bind(key,user.id,key),
      env.DB.prepare(`
        INSERT INTO wallet_ledger(user_id,amount_cents,transaction_type,reference_id,description)
        SELECT user_id,-customer_charge_cents,'order_charge','order:'||id,?
        FROM orders WHERE idempotency_key=? AND NOT EXISTS(
          SELECT 1 FROM wallet_ledger WHERE reference_id='order:'||orders.id AND transaction_type='order_charge')
      `).bind(code+" order charge",key)
    ]);
    if(!results[0]?.meta?.changes){
      const dup=await env.DB.prepare("SELECT id FROM orders WHERE idempotency_key=? LIMIT 1").bind(key).first();
      if(dup)return json({ok:false,error:"idempotency_key_already_used",order_id:dup.id},409,origin);
      return json({ok:false,error:"insufficient_wallet_balance"},402,origin);
    }
    const order=await env.DB.prepare("SELECT id,customer_charge_cents,quantity,status FROM orders WHERE idempotency_key=? LIMIT 1").bind(key).first();
    return json({ok:true,order,wallet_debited:true,message:"Order received and queued for provider processing."},201,origin);
  }catch(error){
    if(String(error.message||"").includes("UNIQUE constraint failed"))return json({ok:false,error:"upload_already_ordered"},409,origin);
    const status=error.message==="unauthorized"?401:
      ["invalid_json","unsupported_file_type","invalid_phone_numbers","invalid_email_entries","invalid_username_entries","ambiguous_or_invalid_csv_row"].includes(error.message)?400:
      ["invalid_pricing_configuration","unsupported_pricing_type","invalid_order_amount"].includes(error.message)?500:502;
    return json({ok:false,error:status===502?"order_creation_failed":error.message},status,origin);
  }
}

if (
  request.method === "POST" &&
  url.pathname === "/api/phone-check/quote"
) {
  try {
    const user = await getSessionUser(request, env);
    const body = await readBody(request);
    const quantity = Number(body.quantity);

    if (
      !Number.isSafeInteger(quantity) ||
      quantity <= 0 ||
      quantity > 100000
    ) {
      return json({
        ok: false,
        error: "invalid_quantity",
        maximum: 100000
      }, 400, origin);
    }

    const pricing = await env.DB.prepare(`
      SELECT
        resource_code,
        provider_cost_cents,
        markup_type,
        markup_value,
        final_price_cents,
        pricing_unit_quantity,
        minimum_order_quantity,
        currency,
        enabled
      FROM resource_pricing
      WHERE resource_code = 'phoneCheck'
      LIMIT 1
    `).first();

    if (!pricing) {
      return json({
        ok: false,
        error: "pricing_not_configured"
      }, 404, origin);
    }

    if (Number(pricing.enabled) !== 1) {
      return json({
        ok: false,
        error: "service_disabled",
        can_order: false
      }, 403, origin);
    }

    const minimum = Number(pricing.minimum_order_quantity);

    if (
      !Number.isSafeInteger(minimum) ||
      minimum <= 0
    ) {
      return json({
        ok: false,
        error: "invalid_pricing_configuration"
      }, 500, origin);
    }

    if (quantity < minimum) {
      return json({
        ok: false,
        error: "quantity_below_minimum",
        minimum,
        requested_quantity: quantity
      }, 400, origin);
    }

    const quote = calculatePrice(pricing, quantity);

    return json({
      ok: true,
      service: "phoneCheck",
      customer: user.first_name || "Customer",
      quantity,
      minimum_quantity: quote.minimum,
      pricing_unit_quantity: quote.unitQuantity,
      unit_price_cents: quote.unitPriceCents,
      total_price_cents: quote.totalCents,
      currency: pricing.currency,
      service_enabled: Number(pricing.enabled) === 1,
      can_order: true,
      message: "Quote calculated from current USDT pricing. Upload an authorised file to place an order."
    }, 200, origin);

  } catch (error) {
    if (error.message === "unauthorized") {
      return json({
        ok: false,
        error: "unauthorized"
      }, 401, origin);
    }

    if (
      error.message === "invalid_json" ||
      error.message === "request_too_large"
    ) {
      return json({
        ok: false,
        error: error.message
      }, error.message === "request_too_large" ? 413 : 400, origin);
    }

    if (
      error.message === "invalid_pricing_configuration" ||
      error.message === "unsupported_pricing_type" ||
      error.message === "invalid_order_amount"
    ) {
      return json({
        ok: false,
        error: error.message
      }, 500, origin);
    }

    return json({
      ok: false,
      error: "quote_request_failed"
    }, 500, origin);
  }


    }

    // ------------------------------------------------
    // CUSTOMER: PAID PHONE-CHECK ORDER (MANUAL ADMIN FULFILMENT)
    if (request.method === "POST" && url.pathname === "/api/phone-check/order") {
      try {
        const user = await getSessionUser(request, env);
        const body = await readBody(request);
        const uploadId = Number(body.upload_id);
        const key = String(body.idempotency_key || "");
        if (!Number.isSafeInteger(uploadId) || uploadId < 1 || !/^[A-Za-z0-9_-]{12,100}$/.test(key)) {
          return json({ ok: false, error: "invalid_order_request" }, 400, origin);
        }
        await ensureCustomerOrderSchema(env);
        const upload = await env.DB.prepare(`
          SELECT id,user_id,telegram_file_id,file_name,resource_code,status,expires_at
          FROM upload_staging WHERE id=? AND user_id=? LIMIT 1
        `).bind(uploadId,user.id).first();
        if (!upload || upload.resource_code!=="phoneCheck" ||
            !["uploaded","reviewed"].includes(upload.status) ||
            !upload.expires_at || new Date(upload.expires_at).getTime()<=Date.now()) {
          return json({ ok:false,error:"upload_not_orderable" },409,origin);
        }
        const prior = await env.DB.prepare(`
          SELECT id,status FROM orders WHERE user_id=? AND
            (result_reference=? OR result_reference LIKE ?) LIMIT 1
        `).bind(user.id,"upload:"+uploadId,"upload:"+uploadId+"|%").first();
        if(prior) return json({ok:false,error:"upload_already_ordered",order_id:prior.id,status:prior.status},409,origin);

        const pricing = await env.DB.prepare(`
          SELECT provider_cost_cents,markup_type,markup_value,final_price_cents,
                 pricing_unit_quantity,minimum_order_quantity,currency,enabled
          FROM resource_pricing WHERE resource_code='phoneCheck' LIMIT 1
        `).first();
        if(!pricing || Number(pricing.enabled)!==1 || pricing.currency!=="USDT") {
          return json({ok:false,error:"service_unavailable"},403,origin);
        }
        if(!env.TELEGRAM_BOT_TOKEN) throw new Error("telegram_storage_configuration_missing");
        const fileInfoResponse=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(upload.telegram_file_id)}`);
        const fileInfo=await fileInfoResponse.json();
        const filePath=fileInfo?.result?.file_path;
        if(!fileInfoResponse.ok || !fileInfo.ok || !filePath || filePath.includes("..")) throw new Error("uploaded_file_unavailable");
        const fileResponse=await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
        if(!fileResponse.ok) throw new Error("uploaded_file_unavailable");
        const bytes=await fileResponse.arrayBuffer();
        if(!bytes.byteLength || bytes.byteLength>20*1024*1024) throw new Error("invalid_uploaded_file_size");
        const content=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
        const extension=String(upload.file_name||"").toLowerCase().split(".").pop();
        if(!["txt","csv"].includes(extension)) return json({ok:false,error:"unsupported_file_type"},400,origin);
        const entries=parseProviderPhoneEntries(content,extension);
        if(entries.length<500 || entries.length>10000) return json({
          ok:false,error:"invalid_phone_number_count",minimum:500,maximum:10000,unique_valid_numbers:entries.length
        },400,origin);
        const quote=calculatePrice(pricing,entries.length);
        const results=await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO orders (
              user_id,resource_code,idempotency_key,customer_charge_cents,
              estimated_provider_cost_cents,status,result_reference,quantity,
              unit_price_cents,pricing_unit_quantity,currency,markup_type,
              markup_value,minimum_order_quantity,provider_currency
            )
            SELECT ?,'phoneCheck',?,?,?,'pending',?,?,?,?,'USDT',?,?,?,'USD'
            WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND wallet_balance_cents>=?)
          `).bind(user.id,key,quote.totalCents,quote.estimatedCostCents,"upload:"+uploadId,
            entries.length,quote.unitPriceCents,quote.unitQuantity,pricing.markup_type,
            Number(pricing.markup_value),quote.minimum,user.id,quote.totalCents),
          env.DB.prepare(`
            UPDATE users SET wallet_balance_cents=wallet_balance_cents-
              (SELECT customer_charge_cents FROM orders WHERE idempotency_key=?)
            WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE idempotency_key=?)
          `).bind(key,user.id,key),
          env.DB.prepare(`
            INSERT INTO wallet_ledger(user_id,amount_cents,transaction_type,reference_id,description)
            SELECT user_id,-customer_charge_cents,'order_charge','order:'||id,
              'Phone Number Validation order charge'
            FROM orders WHERE idempotency_key=?
              AND NOT EXISTS(SELECT 1 FROM wallet_ledger
                WHERE reference_id='order:'||orders.id AND transaction_type='order_charge')
          `).bind(key)
        ]);
        if(!results[0]?.meta?.changes) {
          const dup=await env.DB.prepare("SELECT id FROM orders WHERE idempotency_key=? LIMIT 1").bind(key).first();
          if(dup)return json({ok:false,error:"idempotency_key_already_used",order_id:dup.id},409,origin);
          return json({ok:false,error:"insufficient_wallet_balance"},402,origin);
        }
        const order=await env.DB.prepare("SELECT id,customer_charge_cents,quantity,status FROM orders WHERE idempotency_key=? LIMIT 1").bind(key).first();
        return json({ok:true,order,wallet_debited:true,message:"Order received. Our admin team will review and process it."},201,origin);
      } catch(error) {
        if (String(error.message||"").includes("UNIQUE constraint failed")) {
          return json({ok:false,error:"upload_already_ordered"},409,origin);
        }
        const status=error.message==="unauthorized"?401:
          ["invalid_json","unsupported_file_type","invalid_phone_numbers","ambiguous_or_invalid_csv_row"].includes(error.message)?400:
          ["invalid_pricing_configuration","unsupported_pricing_type","invalid_order_amount"].includes(error.message)?500:502;
        return json({ok:false,error:status===502?"order_creation_failed":error.message},status,origin);
      }
    }

    // ADMIN: PAID CUSTOMER ORDER QUEUE
    if(request.method==="GET" && url.pathname==="/api/admin/orders") {
      try {
        await requireAdmin(request,env);
        await ensureCustomerOrderSchema(env);
        await ensureProviderTasksSchema(env);
        const result=await env.DB.prepare(`
          SELECT o.id,o.user_id,u.telegram_id,u.username,u.first_name,o.resource_code,
            o.quantity,o.customer_charge_cents,o.currency,o.status,o.result_reference,
            o.provider_task_id,o.created_at,
            CAST(substr(o.result_reference,8) AS INTEGER) AS upload_id,
            (SELECT pt.status FROM provider_tasks pt
              WHERE pt.upload_id=CAST(substr(o.result_reference,8) AS INTEGER) LIMIT 1) AS provider_task_status,
            EXISTS(SELECT 1 FROM provider_tasks pt
              WHERE pt.upload_id=CAST(substr(o.result_reference,8) AS INTEGER)) AS provider_task_exists,
            EXISTS(SELECT 1 FROM wallet_ledger l WHERE l.reference_id='order_refund:'||o.id
              AND l.transaction_type='order_refund') AS refunded
          FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 100
        `).all();
        return json({ok:true,orders:result.results||[]},200,origin);
      } catch(error) {
        const status=error.message==="unauthorized"?401:error.message==="admin_access_required"?403:500;
        return json({ok:false,error:error.message||"admin_orders_failed"},status,origin);
      }
    }

    // ADMIN: ONE-TIME MANUAL REFUND FOR FAILED ORDERS
    if(request.method==="POST" && url.pathname==="/api/admin/orders/refund") {
      try {
        const admin=await requireAdmin(request,env);
        await ensureCustomerOrderSchema(env);
        const body=await readBody(request);
        const orderId=Number(body.order_id);
        const reason=String(body.reason||"").trim();
        if(!Number.isSafeInteger(orderId)||orderId<1||reason.length<8||reason.length>500) {
          return json({ok:false,error:"valid_order_id_and_refund_reason_required"},400,origin);
        }
        const order=await env.DB.prepare(`
          SELECT o.id,o.user_id,o.status,o.customer_charge_cents,u.telegram_id
          FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=? LIMIT 1
        `).bind(orderId).first();
        if(!order)return json({ok:false,error:"order_not_found"},404,origin);
        if(order.status!=="failed")return json({ok:false,error:"only_failed_orders_can_be_refunded"},409,origin);
        const ref="order_refund:"+orderId;
        const already=await env.DB.prepare(
          "SELECT id FROM wallet_ledger WHERE reference_id=? AND transaction_type='order_refund' LIMIT 1"
        ).bind(ref).first();
        if(already)return json({ok:false,error:"order_already_refunded"},409,origin);
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO wallet_ledger(user_id,amount_cents,transaction_type,reference_id,description)
            SELECT user_id,customer_charge_cents,'order_refund',?,?
            FROM orders WHERE id=? AND status='failed'
              AND NOT EXISTS(SELECT 1 FROM wallet_ledger WHERE reference_id=? AND transaction_type='order_refund')
          `).bind(ref,"Manual refund: "+reason,orderId,ref),
          env.DB.prepare(`
            UPDATE users SET wallet_balance_cents=wallet_balance_cents+
              (SELECT amount_cents FROM wallet_ledger WHERE reference_id=? AND transaction_type='order_refund')
            WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status='failed'
              AND result_reference NOT LIKE '%|refunded')
              AND EXISTS(SELECT 1 FROM wallet_ledger WHERE reference_id=? AND transaction_type='order_refund')
          `).bind(ref,order.user_id,orderId,ref),
          env.DB.prepare(`
            UPDATE orders SET result_reference=COALESCE(result_reference,'')||'|refunded'
            WHERE id=? AND status='failed' AND result_reference NOT LIKE '%|refunded'
          `).bind(orderId)
        ]);
        await writeAdminAudit(env,admin.telegram_id,String(order.user_id),
          "customer_order_manual_refund",{order_id:orderId,amount_cents:order.customer_charge_cents,reason});
        try {
          await sendProviderTaskNotice(env, order.telegram_id,
            "Your refund for order #" + orderId + " has been credited to your Data Verification wallet: " +
            (Number(order.customer_charge_cents)/100).toFixed(2) + " USDT. Reason: " + reason);
        } catch {}
        return json({ok:true,order_id:orderId,refunded_cents:order.customer_charge_cents},200,origin);
      } catch(error) {
        if (String(error.message||"").includes("UNIQUE constraint failed")) {
          return json({ok:false,error:"order_already_refunded"},409,origin);
        }
        const status=error.message==="unauthorized"?401:
          error.message==="admin_access_required"?403:error.message==="invalid_json"?400:500;
        return json({ok:false,error:error.message||"manual_refund_failed"},status,origin);
      }
    }

    // Customer order processing is implemented above.

    // ADMIN: TEST TELEGRAM STORAGE CONNECTION
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/storage-test"
    ) {
      try {
        await requireAdmin(request, env);

        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_STORAGE_CHAT_ID) {
          return json({
            ok: false,
            error: "telegram_storage_configuration_missing"
          }, 500, origin);
        }

        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_STORAGE_CHAT_ID,
              text: "✅ Data Verification storage connection successful."
            })
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          return json({
            ok: false,
            error: "telegram_storage_test_failed",
            telegram_error: result.description || "Unknown Telegram error"
          }, 502, origin);
        }

        return json({
          ok: true,
          message: "telegram_storage_connection_successful",
          channel_message_id: result.result.message_id
        }, 200, origin);

            } catch (error) {
        const unauthorized = error.message === "unauthorized";
        const forbidden = error.message === "admin_access_required";

        return json({
          ok: false,
          error: unauthorized
            ? "unauthorized"
            : forbidden
              ? "admin_access_required"
              : "storage_test_failed"
        }, unauthorized ? 401 : forbidden ? 403 : 500, origin);
      }
    }
    // ------------------------------------------------
    // ADMIN: ROUND-TRIP TELEGRAM DOCUMENT STORAGE TEST
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/storage-file-test"
    ) {
      try {
        await requireAdmin(request, env);

        if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_STORAGE_CHAT_ID) {
          return json({
            ok: false,
            error: "telegram_storage_configuration_missing"
          }, 500, origin);
        }

        // Fixed synthetic content only: no customer data, D1 writes, or provider calls.
        const testContent = "DATA VERIFICATION STORAGE TEST\\nSynthetic file only. No customer data.\\n";
        const testName = "data-verification-storage-test.txt";
        const testBlob = new Blob([testContent], { type: "text/plain" });
        const uploadForm = new FormData();
        uploadForm.append("chat_id", env.TELEGRAM_STORAGE_CHAT_ID);
        uploadForm.append("document", testBlob, testName);

        const uploadResponse = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
          { method: "POST", body: uploadForm }
        );
        const uploadResult = await uploadResponse.json();

        if (!uploadResponse.ok || !uploadResult.ok || !uploadResult.result?.document?.file_id) {
          return json({
            ok: false,
            error: "telegram_test_file_upload_failed",
            telegram_error: uploadResult.description || "Telegram document upload failed"
          }, 502, origin);
        }

        const fileId = uploadResult.result.document.file_id;
        const getFileResponse = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`
        );
        const getFileResult = await getFileResponse.json();

        if (!getFileResponse.ok || !getFileResult.ok || !getFileResult.result?.file_path) {
          return json({
            ok: false,
            error: "telegram_test_file_retrieval_failed",
            telegram_error: getFileResult.description || "Telegram getFile failed"
          }, 502, origin);
        }

        const filePath = String(getFileResult.result.file_path);
        if (filePath.startsWith("/") || filePath.includes("..") || filePath.includes("://")) {
          return json({ ok: false, error: "telegram_test_file_path_invalid" }, 502, origin);
        }

        const downloadResponse = await fetch(
          `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`
        );
        if (!downloadResponse.ok) {
          return json({ ok: false, error: "telegram_test_file_download_failed" }, 502, origin);
        }

        const downloadedText = await downloadResponse.text();
        if (downloadedText !== testContent) {
          return json({ ok: false, error: "telegram_test_file_content_mismatch" }, 502, origin);
        }

        return json({
          ok: true,
          message: "telegram_storage_file_round_trip_successful",
          file_name: testName,
          file_size: uploadResult.result.document.file_size || testBlob.size,
          upload_verified: true,
          retrieval_verified: true,
          content_verified: true
        }, 200, origin);
      } catch (error) {
        const unauthorized = error.message === "unauthorized";
        const forbidden = error.message === "admin_access_required";
        return json({
          ok: false,
          error: unauthorized ? "unauthorized" :
            forbidden ? "admin_access_required" : "telegram_storage_file_test_failed"
        }, unauthorized ? 401 : forbidden ? 403 : 500, origin);
      }
    }

    // --------------------------------------------------
    // TOOLBOX: SEND GENERATED TEST FILE TO TELEGRAM USER
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/toolbox/send-file"
    ) {
      try {
        const user = await getSessionUser(request, env);

        if (!env.TELEGRAM_BOT_TOKEN) {
          return json({
            ok: false,
            error: "telegram_bot_configuration_missing"
          }, 500, origin);
        }

        const body = await readBody(request);
        const fileName = String(body.file_name || "");
        const content = body.content;

        if (
          !["test-phone-numbers.txt", "test-phone-numbers.csv"].includes(fileName) ||
          typeof content !== "string" ||
          !content.length ||
          content.length > 1500000
        ) {
          return json({
            ok: false,
            error: "invalid_file"
          }, 400, origin);
        }

        const mimeType = fileName.endsWith(".csv")
          ? "text/csv"
          : "text/plain";

        const form = new FormData();
        form.append("chat_id", String(user.telegram_id));
        form.append(
          "document",
          new Blob([content], { type: mimeType }),
          fileName
        );

        const response = await fetch(
          `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
          {
            method: "POST",
            body: form
          }
        );

        const result = await response.json();

        if (!response.ok || !result.ok) {
          return json({
            ok: false,
            error: "telegram_file_delivery_failed",
            details: result.description || "Telegram rejected the file."
          }, 502, origin);
        }

        return json({
          ok: true,
          message: "file_sent_to_telegram",
          file_name: fileName
        }, 200, origin);

      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : "file_delivery_failed"
        }, error.message === "unauthorized" ? 401 : 500, origin);
      }
    }

    // --------------------------------------------------
    // TOOLBOX: REQUEST A NUMBER FILE FROM ADMIN
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/toolbox/number-file-request"
    ) {
      try {
        const user = await getSessionUser(request, env);
        const body = await readBody(request);

        const countries = {
          NP: "Nepal",
          IN: "India",
          US: "United States",
          GB: "United Kingdom",
          AU: "Australia",
          TH: "Thailand",
          CN: "China",
          MY: "Malaysia",
          SG: "Singapore",
          AE: "United Arab Emirates",
          BD: "Bangladesh",
          PK: "Pakistan",
          PH: "Philippines",
          ID: "Indonesia",
          JP: "Japan",
          KR: "South Korea",
          DE: "Germany",
          FR: "France",
          BR: "Brazil",
          CA: "Canada"
        };

        const countryCode = String(body.country_code || "").toUpperCase();
        const quantity = Number(body.quantity);
        const numberType = String(body.number_type || "mobile").toLowerCase();

        if (
          !countries[countryCode] ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > 10000 ||
          !["mobile", "landline", "both"].includes(numberType)
        ) {
          return json({
            ok: false,
            error: "invalid_request"
          }, 400, origin);
        }

        const pending = await env.DB.prepare(`
          SELECT id
          FROM number_file_requests
          WHERE user_id = ?
            AND status = 'pending'
          LIMIT 1
        `).bind(user.id).first();

        if (pending) {
          return json({
            ok: false,
            error: "pending_request_exists",
            request_id: pending.id
          }, 409, origin);
        }

        const inserted = await env.DB.prepare(`
          INSERT INTO number_file_requests (
            user_id,
            telegram_id,
            username,
            country_code,
            country_name,
            quantity,
            number_type
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          user.id,
          String(user.telegram_id),
          user.username || null,
          countryCode,
          countries[countryCode],
          quantity,
          numberType
        ).run();
// Save individual customer consent records.

        const requestId = inserted.meta.last_row_id;

        try {
          await notifyAdmins(
            env,
            "📥 NEW NUMBER FILE REQUEST\n\n" +
            "Request ID: #" + requestId + "\n" +
            "User: " + (user.first_name || "Unknown") + "\n" +
            "Username: @" + (user.username || "Not set") + "\n" +
            "Telegram ID: " + user.telegram_id + "\n" +
            "Country: " + countries[countryCode] + " (+" + countryCode + ")\n" +
            "Quantity: " + quantity + "\n" +
            "Type: " + numberType + "\n\n" +
            "Please review this request in the admin panel."
          );
        } catch (notificationError) {
          console.error(
            "Admin notification failed:",
            notificationError.message
          );
        }
        try {
          await createUserNotification(
            env,
            user.id,
            "Request submitted",
            `Your file request #${requestId} for ${countries[countryCode]} has been submitted successfully.`,
            "request_submitted",
            requestId
          );

          await createAdminNotifications(
            env,
            "New file request",
            `Request #${requestId}: ${countries[countryCode]}, quantity ${quantity}.`,
            "request_submitted",
            requestId
          );
        } catch (inAppError) {
          console.error("In-app notification failed:", inAppError.message);
        }
        return json({
          ok: true,
          request_id: requestId,
          status: "pending",
          message: "Your request was sent to the admin."
        }, 200, origin);

      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : "number_file_request_failed"
        }, error.message === "unauthorized" ? 401 : 500, origin);
      }
    }

    // --------------------------------------------------
    // ADMIN: VIEW NUMBER FILE REQUESTS
    // --------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/number-file-requests"
    ) {
      try {
        await requireAdmin(request, env);

        const result = await env.DB.prepare(`
          SELECT
            id,
            telegram_id,
            username,
            country_code,
            country_name,
            quantity,
            number_type,
            status,
            admin_file_name,
            admin_note,
            created_at,
            completed_at,
rejected_at
FROM number_file_requests
          ORDER BY
            CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
            created_at DESC
          LIMIT 100
        `).all();

        return json({
          ok: true,
          requests: result.results || []
        }, 200, origin);

      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : error.message === "admin_access_required"
              ? "admin_access_required"
              : "request_list_failed"
        }, error.message === "unauthorized" ? 401 :
           error.message === "admin_access_required" ? 403 : 500, origin);
      }
    }

    // --------------------------------------------------
    // ADMIN: UPLOAD AND DELIVER A NUMBER FILE
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/number-file-requests/upload"
    ) {
      let claimedRequestId = null;
      let deliverySucceeded = false;
      try {
        const admin = await requireAdmin(request, env);
        const form = await request.formData();

        const requestId = Number(form.get("request_id"));
        const file = form.get("file");
        const adminNote = String(form.get("admin_note") || "").slice(0, 500);

        if (
          !Number.isInteger(requestId) ||
          requestId < 1 ||
          !file ||
          typeof file.size !== "number" ||
          file.size < 1 ||
          file.size > 20 * 1024 * 1024 ||
          !["txt", "csv"].includes(
            String(file.name || "").split(".").pop().toLowerCase()
          )
        ) {
          return json({
            ok: false,
            error: "invalid_file_or_request"
          }, 400, origin);
        }

        const numberRequest = await env.DB.prepare(`
          SELECT id, telegram_id, status
          FROM number_file_requests
          WHERE id = ?
          LIMIT 1
        `).bind(requestId).first();

        if (!numberRequest || numberRequest.status !== "pending") {
          return json({
            ok: false,
            error: "request_not_found_or_already_completed"
          }, 404, origin);
        }
const claim = await env.DB.prepare(`
  UPDATE number_file_requests
  SET status = 'processing'
  WHERE id = ? AND status = 'pending'
`).bind(requestId).run();

if (!claim.meta?.changes) {
  return json({
    ok: false,
    error: "request_not_pending"
  }, 409, origin);
}

claimedRequestId = requestId;
        // Store the admin-provided file in the Telegram storage channel.
        const stored = await telegramStoreDocument(env, file);

        // Deliver the same file to the requesting user's private chat.
        const response = await fetch(
         `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              chat_id: String(numberRequest.telegram_id),
              document: stored.file_id,
              caption: "Your requested file is ready. Request #" + requestId
            })
          }
        );

        const delivery = await response.json();

        if (!response.ok || !delivery.ok) {
  await env.DB.prepare(`
    UPDATE number_file_requests
    SET status = 'pending'
    WHERE id = ? AND status = 'processing'
  `).bind(requestId).run();

  claimedRequestId = null;

  return json({
    ok: false,
    error: "user_file_delivery_failed",
    details: delivery.description || "Telegram delivery failed."
  }, 502, origin);
}
deliverySucceeded = true;
       const completed = await env.DB.prepare(`
  UPDATE number_file_requests
  SET
    status = 'completed',
    admin_file_id = ?,
    admin_file_name = ?,
    admin_note = ?,
    completed_at = ?
  WHERE id = ? AND status = 'processing'
`).bind(
  stored.file_id,
  stored.file_name,
  adminNote || null,
  new Date().toISOString(),
  requestId
).run();

if (!completed.meta?.changes) {
  return json({
    ok: false,
    error: "request_not_pending"
  }, 409, origin);
}

claimedRequestId = null;
        try {
          const recipient = await env.DB.prepare(`
            SELECT user_id, country_name, quantity
            FROM number_file_requests
            WHERE id = ?
          `).bind(requestId).first();

          if (recipient) {
            await createUserNotification(
              env,
              recipient.user_id,
              "Your file is ready",
              `Your request #${requestId} has been completed. File: ${stored.file_name}`,
              "request_completed",
              requestId
            );

            await createAdminNotifications(
              env,
              "File delivered",
              `Request #${requestId} for ${recipient.country_name} has been completed.`,
              "request_completed",
              requestId
            );
          }
        } catch (inAppError) {
          console.error("Delivery notification failed:", inAppError.message);
        }
        return json({
          ok: true,
          message: "File delivered to the user.",
          request_id: requestId,
          file_name: stored.file_name
        }, 200, origin);

           } catch (error) {
        if (claimedRequestId !== null && !deliverySucceeded) {
          try {
            await env.DB.prepare(`
              UPDATE number_file_requests
              SET status = 'pending'
              WHERE id = ?
                AND status = 'processing'
            `).bind(claimedRequestId).run();
          } catch (releaseError) {
            console.error(
              "Could not release request claim:",
              releaseError.message
            );
          }
        }

        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : error.message === "admin_access_required"
              ? "admin_access_required"
              : "number_file_upload_failed"
        }, error.message === "unauthorized" ? 401 :
           error.message === "admin_access_required" ? 403 : 500, origin);
      }
    }
// --------------------------------------------------
// NOTIFICATIONS API
// --------------------------------------------------

if (url.pathname === "/api/notifications" && request.method === "GET") {
  const user = await getSessionUser(request, env);

  const result = await env.DB.prepare(`
    SELECT
      id,
      title,
      message,
      notification_type,
      related_request_id,
      created_at,
      read_at
    FROM user_notifications
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).bind(user.id).all();

  const unread = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM user_notifications
    WHERE user_id = ? AND read_at IS NULL
  `).bind(user.id).first();

  return json({
    ok: true,
    notifications: result.results || [],
    unread_count: unread?.total || 0
  }, 200, origin);
}

if (url.pathname === "/api/notifications/read" && request.method === "POST") {
  const user = await getSessionUser(request, env);
  const body = await request.json();
  const notificationId = Number(body.notification_id);

  if (!Number.isInteger(notificationId) || notificationId < 1) {
    return json({ ok: false, error: "invalid_notification_id" }, 400, origin);
  }

  await env.DB.prepare(`
    UPDATE user_notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).bind(notificationId, user.id).run();

  return json({ ok: true }, 200, origin);
}
// --------------------------------------------------
// USER REQUEST HISTORY
// --------------------------------------------------

if (
  url.pathname === "/api/toolbox/number-file-requests/history" &&
  request.method === "GET"
) {
  const user = await getSessionUser(request, env);

  const status = url.searchParams.get("status") || "all";
  const allowedStatuses = ["all", "pending", "completed", "rejected"];

  if (!allowedStatuses.includes(status)) {
    return json({ ok: false, error: "invalid_status" }, 400, origin);
  }

  let query = `
    SELECT
      id,
      country_code,
      country_name,
      quantity,
      number_type,
      status,
      admin_file_name,
      admin_note,
      created_at,
      completed_at,
      rejected_at
    FROM number_file_requests
    WHERE user_id = ?
  `;

  if (status !== "all") {
    query += ` AND status = ?`;
  }

  query += ` ORDER BY id DESC LIMIT 100`;

  const statement = status === "all"
    ? env.DB.prepare(query).bind(user.id)
    : env.DB.prepare(query).bind(user.id, status);

  const result = await statement.all();

  return json({
    ok: true,
    requests: result.results || []
  }, 200, origin);
}
// --------------------------------------------------
// ADMIN REJECT NUMBER FILE REQUEST
// --------------------------------------------------

if (
  url.pathname === "/api/admin/number-file-requests/reject" &&
  request.method === "POST"
) {
  let admin;
  try {
    admin = await requireAdmin(request, env);
  } catch (error) {
    const unauthorized = error.message === "unauthorized";
    return json({
      ok: false,
      error: unauthorized ? "unauthorized" : "admin_access_required"
    }, unauthorized ? 401 : 403, origin);
  }
  const body = await request.json();

  const requestId = Number(body.request_id);
  const reason = String(body.reason || "").trim();

  if (!Number.isInteger(requestId) || requestId < 1) {
    return json({ ok: false, error: "invalid_request_id" }, 400, origin);
  }

  if (!reason || reason.length > 500) {
    return json({ ok: false, error: "rejection_reason_required" }, 400, origin);
  }

  const fileRequest = await env.DB.prepare(`
    SELECT id, user_id, country_name, quantity, status
    FROM number_file_requests
    WHERE id = ?
  `).bind(requestId).first();

  if (!fileRequest) {
    return json({ ok: false, error: "request_not_found" }, 404, origin);
  }

  if (fileRequest.status !== "pending") {
    return json({ ok: false, error: "request_not_pending" }, 409, origin);
  }

  const update = await env.DB.prepare(`
    UPDATE number_file_requests
    SET
      status = 'rejected',
      admin_note = ?,
      rejected_at = CURRENT_TIMESTAMP,
      rejected_by = ?
    WHERE id = ? AND status = 'pending'
  `).bind(reason, admin.id, requestId).run();

  if (!update.meta?.changes) {
    return json({ ok: false, error: "request_not_pending" }, 409, origin);
  }

  await createUserNotification(
    env,
    fileRequest.user_id,
    "File request rejected",
    `Your request #${requestId} for ${fileRequest.country_name} (${fileRequest.quantity}) was rejected. Reason: ${reason}`,
    "request_rejected",
    requestId
  );

  const user = await env.DB.prepare(`
    SELECT telegram_id
    FROM users
    WHERE id = ?
  `).bind(fileRequest.user_id).first();

  if (user?.telegram_id && env.TELEGRAM_BOT_TOKEN) {
    await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: user.telegram_id,
          text: `Your file request #${requestId} was rejected.\nReason: ${reason}`
        })
      }
    );
  }

  await createAdminNotifications(
    env,
    "Request rejected",
    `Request #${requestId} was rejected by an admin.`,
    "request_rejected",
    requestId
  );

  return json({ ok: true, request_id: requestId, status: "rejected" }, 200, origin);
}

    // --------------------------------------------------
    // ADMIN MANAGEMENT: LIST AND CONTROL ADMIN ACCESS
    // --------------------------------------------------

    if (
      request.method === "GET" &&
      url.pathname === "/api/admin/management"
    ) {
      try {
        await requireAdminManager(request, env);
        const result = await env.DB.prepare(`
          SELECT
            a.telegram_id,
            u.username,
            u.first_name,
            a.role,
            a.permissions_json,
            a.is_active,
            a.created_by,
            a.created_at,
            a.updated_at
          FROM admin_access a
          LEFT JOIN users u ON u.telegram_id = a.telegram_id
          ORDER BY
            CASE a.role
              WHEN 'main_admin' THEN 0
              WHEN 'full_admin' THEN 1
              ELSE 2
            END,
            a.created_at ASC
        `).all();

        const admins = (result.results || []).map(item => {
          let permissions = [];
          try {
            permissions = JSON.parse(item.permissions_json || "[]");
          } catch {
            permissions = [];
          }
          return { ...item, permissions };
        });

        return json({
          ok: true,
          admins,
          permission_options: ADMIN_PERMISSION_LABELS
        }, 200, origin);
      } catch (error) {
        const status = error.message === "unauthorized" ? 401 :
          ["admin_access_required", "admin_management_required"].includes(error.message) ? 403 : 500;
        return json({ ok: false, error: error.message || "admin_management_failed" }, status, origin);
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/management"
    ) {
      try {
        const actor = await requireAdminManager(request, env);
        const body = await readBody(request);
        const action = String(body.action || "").trim().toLowerCase();
        const targetId = String(body.telegram_id || "").trim();

        if (!/^\d{5,20}$/.test(targetId)) {
          return json({ ok: false, error: "invalid_telegram_id" }, 400, origin);
        }

        if (targetId === String(actor.telegram_id)) {
          return json({ ok: false, error: "cannot_change_own_admin_access" }, 400, origin);
        }

        const existing = await env.DB.prepare(`
          SELECT telegram_id, role, is_active
          FROM admin_access
          WHERE telegram_id = ?
          LIMIT 1
        `).bind(targetId).first();

        if (existing?.role === "main_admin") {
          return json({ ok: false, error: "main_admin_is_protected" }, 403, origin);
        }

        if (action === "grant" || action === "update") {
          const role = String(body.role || "").trim().toLowerCase();
          if (!["full_admin", "sub_admin"].includes(role)) {
            return json({ ok: false, error: "invalid_admin_role" }, 400, origin);
          }

          let permissions = [];
          if (role === "sub_admin") {
            if (!Array.isArray(body.permissions) || body.permissions.length > 20) {
              return json({ ok: false, error: "invalid_admin_permissions" }, 400, origin);
            }
            permissions = [...new Set(body.permissions)];
            if (permissions.some(permission =>
              !Object.prototype.hasOwnProperty.call(ADMIN_PERMISSION_LABELS, permission)
            )) {
              return json({ ok: false, error: "invalid_admin_permissions" }, 400, origin);
            }
          }

          if (action === "grant" && existing && Number(existing.is_active) === 1) {
            return json({ ok: false, error: "admin_already_active" }, 409, origin);
          }

          await env.DB.prepare(`
            INSERT INTO admin_access (
              telegram_id, role, permissions_json, is_active, created_by
            )
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(telegram_id) DO UPDATE SET
              role = excluded.role,
              permissions_json = excluded.permissions_json,
              is_active = 1,
              created_by = excluded.created_by,
              updated_at = CURRENT_TIMESTAMP
          `).bind(
            targetId,
            role,
            JSON.stringify(permissions),
            String(actor.telegram_id)
          ).run();

          await writeAdminAudit(
            env, actor.telegram_id, targetId,
            action === "grant" ? "admin_granted" : "admin_updated",
            { role, permissions }
          );

          return json({ ok: true, message: action === "grant" ? "admin_access_granted" : "admin_access_updated" }, 200, origin);
        }

        if (action === "revoke" || action === "restore") {
          if (!existing) {
            return json({ ok: false, error: "admin_not_found" }, 404, origin);
          }

          const active = action === "restore" ? 1 : 0;
          await env.DB.prepare(`
            UPDATE admin_access
            SET is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ? AND role != 'main_admin'
          `).bind(active, targetId).run();

          if (action === "revoke") {
            await env.DB.prepare(`
              DELETE FROM sessions
              WHERE user_id IN (
                SELECT id FROM users WHERE telegram_id = ?
              )
            `).bind(targetId).run();
          }

          await writeAdminAudit(
            env, actor.telegram_id, targetId,
            action === "revoke" ? "admin_access_revoked" : "admin_access_restored"
          );

          return json({ ok: true, message: action === "revoke" ? "admin_access_revoked" : "admin_access_restored" }, 200, origin);
        }

        return json({ ok: false, error: "invalid_admin_management_action" }, 400, origin);
      } catch (error) {
        const status = error.message === "unauthorized" ? 401 :
          ["admin_access_required", "admin_management_required", "admin_permission_denied"].includes(error.message) ? 403 :
          error.message === "invalid_json" ? 400 : 500;
        return json({ ok: false, error: error.message || "admin_management_failed" }, status, origin);
      }
    }

    // --------------------------------------------------
    // ADMIN: FIRST-TIME REGISTRATION
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/admin/signup"
    ) {
      try {
        const user = await getSessionUser(request, env);

        if (!env.ADMIN_SETUP_CODE) {
          return json({
            ok: false,
            error: "admin_setup_not_configured"
          }, 503, origin);
        }

        const body = await readBody(request);
        const setupCode = String(body.setup_code || "");

        if (
          !setupCode ||
          setupCode.length > 256 ||
          !safeEqual(setupCode, env.ADMIN_SETUP_CODE)
        ) {
          return json({
            ok: false,
            error: "invalid_setup_code"
          }, 403, origin);
        }

        const result = await env.DB.prepare(`
          INSERT OR IGNORE INTO admin_users (
            telegram_id,
            role
          )
          SELECT ?, 'admin'
          WHERE NOT EXISTS (
            SELECT 1 FROM admin_users
          )
        `).bind(String(user.telegram_id)).run();

        if (!result.meta || result.meta.changes !== 1) {
          return json({
            ok: false,
            error: "admin_already_registered"
          }, 409, origin);
        }

        await ensureAdminAccessSchema(env);
        await env.DB.prepare(`
          INSERT OR IGNORE INTO admin_access (
            telegram_id, role, permissions_json, is_active, created_by
          )
          VALUES (?, 'main_admin', '[]', 1, ?)
        `).bind(String(user.telegram_id), String(user.telegram_id)).run();

        return json({
          ok: true,
          message: "admin_registered_successfully"
        }, 200, origin);

      } catch (error) {
        return json({
          ok: false,
          error: error.message === "unauthorized"
            ? "unauthorized"
            : "admin_signup_failed"
        }, error.message === "unauthorized" ? 401 : 500, origin);
      }
    }

    // --------------------------------------------------
    // AUTH: LOGOUT AND REVOKE CURRENT SESSION
    // --------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/auth/logout"
    ) {
      try {
        const authorization =
          request.headers.get("Authorization") || "";

        const match = authorization.match(
          /^Bearer ([a-f0-9]{64})$/i
        );

        if (!match) {
          return json({
            ok: false,
            error: "unauthorized"
          }, 401, origin);
        }

        const tokenHash = await sha256(match[1]);

        await env.DB.prepare(`
          DELETE FROM sessions
          WHERE token_hash = ?
        `).bind(tokenHash).run();

        return json({
          ok: true,
          message: "session_revoked"
        }, 200, origin);

      } catch (error) {
        return json({
          ok: false,
          error: "logout_failed"
        }, 500, origin);
      }
    }

    // ------------------------------------------------
    // UNKNOWN ROUTE
    // ------------------------------------------------

    return json({
      ok: false,
      error: "not_found"
    }, 404, origin);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(pollProviderTasks(env));
  }
};

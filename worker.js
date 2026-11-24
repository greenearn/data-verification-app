
const ALLOWED_ORIGIN = "https://greenearn.github.io";
const WORKER_ORIGIN = "https://data-verification-api.shrestharaj980888.workers.dev";
const SESSION_DAYS = 7;
const MAX_INIT_DATA_AGE = 3600;
const MAX_BODY_SIZE = 20000;
let adminAccessSchemaReady = false;
// --------------------------------------------------
// CHECKNUMBER.AI AUTOMATIC CATALOGUE
// --------------------------------------------------

const CHECKNUMBER_CATALOGUE = [
  {
    category: "Phone Validation",
    category_order: 1,
    resource_code: "phoneCheck",
    name: "Phone Number Validation",
    description: "Validate phone numbers and check carrier-related data",
    input_type: "phone",
    task_type: "phoneCheck",
    display_order: 1
  },
  {
    category: "Email Validation",
    category_order: 2,
    resource_code: "email_check",
    name: "Email Deliverability",
    description: "Check email address deliverability",
    input_type: "email",
    task_type: "email_check",
    display_order: 1
  },
  {
    category: "TELEGRAM SERVICES",
    category_order: 3,
    resource_code: "tg_username_check",
    name: "Telegram Username Availability",
    description: "Check a public Telegram username",
    input_type: "username",
    task_type: "tg_username",
    display_order: 1
  }
];
// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
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
  wallet_deposits: "Wallet deposit review",
  catalogue_manage: "Catalogue, categories, services and pricing",
  checknumber_validate: "CheckNumber file validation",
  uploads_manage: "Customer upload review",
  number_requests: "Manual number-file requests",
  provider_balance: "Provider balance",
  storage_test: "Telegram storage test"
};

const ADMIN_ROUTE_PERMISSIONS = {
  "GET /api/admin/wallet/deposits": "wallet_deposits",
  "POST /api/admin/wallet/deposits/review": "wallet_deposits",
  "GET /api/admin/catalogue": "catalogue_manage",
  "POST /api/admin/catalogue/import": "catalogue_manage",
  "POST /api/admin/checknumber/validate-upload": "checknumber_validate",
  "GET /api/admin/uploads": "uploads_manage",
  "POST /api/admin/uploads/status": "uploads_manage",
  "POST /api/admin/categories": "catalogue_manage",
  "POST /api/admin/services": "catalogue_manage",
  "POST /api/admin/services/visibility": "catalogue_manage",
  "POST /api/admin/pricing": "catalogue_manage",
  "GET /api/admin/provider-balance": "provider_balance",
  "GET /api/admin/provider-tasks": "checknumber_validate",
  "POST /api/admin/provider-tasks/submit": "checknumber_validate",
  "POST /api/admin/provider-tasks/poll": "checknumber_validate",
  "POST /api/admin/storage-test": "storage_test",
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


async function importCheckNumberCatalogue(env) {
  const categories = new Map();

  for (const service of CHECKNUMBER_CATALOGUE) {
    categories.set(service.category, service.category_order);
  }

  const statements = [];

  for (const [category, displayOrder] of categories) {
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO service_categories (
          category,
          display_order,
          is_listed
        )
        VALUES (?, ?, 1)
      `).bind(category, displayOrder)
    );
  }

  for (const service of CHECKNUMBER_CATALOGUE) {
    statements.push(
      env.DB.prepare(`
        INSERT OR IGNORE INTO service_catalogue (
          resource_code,
          name,
          description,
          category,
          input_type,
          task_type,
          display_order,
          is_listed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `).bind(
        service.resource_code,
        service.name,
        service.description,
        service.category,
        service.input_type,
        service.task_type,
        service.display_order
      )
    );
  }

  const results = await env.DB.batch(statements);

  return {
    imported_categories: categories.size,
    catalogue_entries_processed: CHECKNUMBER_CATALOGUE.length,
    database_operations: results.length,
    ordering_enabled: false,
    message: "safe_catalogue_import_completed"
  };
}

// --------------------------------------------------
// ADMIN CATALOGUE DATA
// --------------------------------------------------

async function getAdminCatalogue(env) {
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
    services: servicesResult.results || []
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

function safeProviderResultUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") ||
        host.endsWith(".local") || /^127\./.test(host) ||
        /^10\./.test(host) || /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    return url.toString();
  } catch { return null; }
}

async function providerApi(env, path, options = {}) {
  if (!env.CN_API_KEY || !env.CN_BASE_URL) throw new Error("provider_configuration_missing");
  const base = String(env.CN_BASE_URL).replace(/\/+$/, "");
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
  return data;
}

async function submitStagedProviderTask(env, uploadId) {
  await ensureProviderTasksSchema(env);
  const upload = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.telegram_file_id, s.file_name,
           s.file_size, s.resource_code, s.status, u.telegram_id
    FROM upload_staging s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? LIMIT 1
  `).bind(uploadId).first();
  if (!upload) throw new Error("upload_not_found");
  if (!["uploaded", "reviewed"].includes(upload.status)) throw new Error("upload_not_ready");
  // The first live adapter is phoneCheck only: its upload flow already records
  // explicit consent for each submitted phone number.
  if (upload.resource_code !== "phoneCheck") throw new Error("service_not_enabled_for_provider_submission");

  const existing = await env.DB.prepare(
    "SELECT id FROM provider_tasks WHERE upload_id = ? LIMIT 1"
  ).bind(uploadId).first();
  if (existing) throw new Error("provider_task_already_created");

  const claim = await env.DB.prepare(`
    INSERT INTO provider_tasks (upload_id,user_id,telegram_id,resource_code,task_type,status)
    VALUES (?,?,?,'phoneCheck','phoneCheck','submitting')
  `).bind(upload.id, upload.user_id, String(upload.telegram_id)).run();
  const localId = Number(claim.meta.last_row_id);

  let providerSubmissionStarted = false;
  try {
    if (!env.TELEGRAM_BOT_TOKEN) throw new Error("telegram_storage_configuration_missing");
    const infoResponse = await fetch(
      `https://api.telegram.org/bot\${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=\${encodeURIComponent(upload.telegram_file_id)}`
    );
    const info = await infoResponse.json();
    const filePath = info?.result?.file_path;
    if (!infoResponse.ok || !info.ok || !filePath || filePath.includes("..")) {
      throw new Error("telegram_source_file_unavailable");
    }
    const source = await fetch(`https://api.telegram.org/file/bot\${env.TELEGRAM_BOT_TOKEN}/\${filePath}`);
    if (!source.ok) throw new Error("telegram_source_download_failed");
    const bytes = await source.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error("provider_file_size_invalid");
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const extension = String(upload.file_name || "").toLowerCase().split(".").pop();
    const entries = content.split(/\r?\n/).map(line => {
      const value = extension === "csv" ? line.split(",")[0] : line;
      return value.trim().replace(/^["']|["']$/g, "");
    }).filter(Boolean);
    if (entries[0] && ["phone","phone_number","number"].includes(entries[0].toLowerCase())) {
      entries.shift();
    }
    if (!entries.length || entries.length > 1000000) throw new Error("provider_quantity_out_of_range");
    if (entries.some(x => !/^\+?[1-9]\d{7,14}$/.test(x))) throw new Error("invalid_phone_numbers");

    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "text/plain" }), upload.file_name || "numbers.txt");
    form.append("task_type", "phoneCheck");

    // Never auto-retry task creation: a timeout may happen after provider acceptance.
    providerSubmissionStarted = true;
    const providerResult = await providerApi(env, "/v1/tasks", { method: "POST", body: form });
    const providerTaskId = String(providerResult.task_id || "");
    if (!providerTaskId || providerTaskId.length > 200) throw new Error("provider_task_id_missing");

    await env.DB.prepare(`
      UPDATE provider_tasks SET provider_task_id=?, status='submitted',
        provider_status=?, total=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='submitting'
    `).bind(
      providerTaskId, String(providerResult.status || "pending"),
      Number.isSafeInteger(Number(providerResult.total)) ? Number(providerResult.total) : entries.length,
      localId
    ).run();
    await env.DB.prepare(`
      UPDATE upload_staging SET status='reviewed',
        admin_note='Submitted to CheckNumber provider task ' || ?,
        reviewed_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(providerTaskId, uploadId).run();
    return { id: localId, provider_task_id: providerTaskId, status: "submitted", quantity: entries.length };
  } catch (error) {
    await env.DB.prepare(`
      UPDATE provider_tasks SET status=?, last_error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(
      providerSubmissionStarted ? "submission_unknown" : "failed",
      String(error.message || "submission_failed").slice(0, 200), localId
    ).run();
    throw error;
  }
}

async function sendProviderTaskNotice(env, telegramId, message) {
  if (!env.TELEGRAM_BOT_TOKEN || !telegramId) return;
  await fetch(`https://api.telegram.org/bot\${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
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
    await env.DB.prepare(`
      UPDATE provider_tasks SET status='failed', provider_status=?, total=?, success=?, failure=?,
        last_error='provider_task_failed', updated_at=CURRENT_TIMESTAMP WHERE id=?
    `).bind(status, Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id).run();
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

  const resultUrl = safeProviderResultUrl(provider.result_url);
  if (!resultUrl) throw new Error("provider_result_url_invalid");
  const resultResponse = await fetch(resultUrl);
  if (!resultResponse.ok) throw new Error("provider_result_download_failed");
  const resultBytes = await resultResponse.arrayBuffer();
  if (!resultBytes.byteLength || resultBytes.byteLength > 20 * 1024 * 1024) throw new Error("provider_result_size_invalid");
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error("telegram_storage_configuration_missing");

  const deliveryForm = new FormData();
  deliveryForm.append("chat_id", String(task.telegram_id));
  deliveryForm.append("document", new Blob([resultBytes], { type: "application/zip" }), "verification-result-" + task.id + ".zip");
  deliveryForm.append("caption", "Your CheckNumber verification result is ready. Task #" + task.id);
  const deliveryResponse = await fetch(
    `https://api.telegram.org/bot\${env.TELEGRAM_BOT_TOKEN}/sendDocument`,
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

  await env.DB.prepare(`
    UPDATE provider_tasks SET status='completed', provider_status='exported',
      result_url=NULL, total=?, success=?, failure=?, last_error=NULL,
      completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).bind(Number(provider.total || 0), Number(provider.success || 0), Number(provider.failure || 0), task.id).run();
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
      origin !== ALLOWED_ORIGIN &&
      origin !== WORKER_ORIGIN
    ) {
      return new Response("Origin not allowed", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
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
    safe_rejection:r.status===403&&r.data.error==="service_disabled"
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
    const body = await readBody(request);

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

    const result = await env.DB.prepare(`
      INSERT INTO wallet_deposit_requests (
        user_id,
        amount_cents,
        currency,
        payment_method,
        payment_reference,
        status
      )
      VALUES (?, ?, 'USDT', ?, ?, 'pending')
    `).bind(
      user.id,
      amountCents,
      paymentMethod,
      paymentReference
    ).run();

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
            can_order: false,
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
          ordering_enabled: false,
          message: "Catalogue loaded. Customer ordering is disabled."
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
  resourceCode === "phoneCheck" &&
  (
    consentConfirmed !== "yes" ||
    consentVersion !== "phone-validation-v1"
  )
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

        // Confirm that the selected service is listed and enabled.
        const service = await env.DB.prepare(`
          SELECT c.resource_code
          FROM service_catalogue c
          JOIN service_categories sc
            ON sc.category = c.category COLLATE NOCASE
          JOIN resource_pricing p
            ON p.resource_code = c.resource_code
          WHERE c.resource_code = ?
            AND c.is_listed = 1
            AND sc.is_listed = 1
            AND p.enabled = 1
          LIMIT 1
        `).bind(resourceCode).first();

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

        if (resourceCode === "phoneCheck") {
          const content = await file.text();
          const lines = content.split(/\r?\n/);
          const uniqueNumbers = new Set();
          let invalidCount = 0;

          for (let i = 0; i < lines.length; i++) {
            let value = lines[i].trim();

            if (!value) continue;

            if (extension === "csv") {
              value = value
                .split(",")[0]
                .replace(/^["']|["']$/g, "")
                .trim();
            }

            if (
              i === 0 &&
              ["phone", "phone_number", "number"].includes(
                value.toLowerCase()
              )
            ) {
              continue;
            }

          if (!/^\+?[1-9]\d{7,14}$/.test(value)) {
              invalidCount++;
              continue;
            }

            uniqueNumbers.add(value);
          }

          consentNumbers = [...uniqueNumbers];

          if (invalidCount > 0) {
            return json({
              ok: false,
              error: "invalid_phone_numbers",
              invalid_count: invalidCount
            }, 400, origin);
          }

          if (
            consentNumbers.length === 0 ||
            consentNumbers.length > 1000
          ) {
            return json({
              ok: false,
              error: "invalid_phone_number_count",
              maximum: 1000,
              received: consentNumbers.length
            }, 400, origin);
          }
        }
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
            created_at
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
  reviewed_by
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

      return json({
        ok: true,
        mode: "dry_run",
        provider_submission: false,
        file_name: file.name,
        file_type: extension,
        task_type: taskType,
        total_entries: valid.length + invalid.length,
        valid_entries: valid.length,
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
      ["invalid_json","invalid_upload_id","invalid_phone_numbers","provider_quantity_out_of_range"].includes(error.message) ? 400 :
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

// PHONE CHECK: PRICE QUOTE ONLY
    // Minimum quantity is read from saved pricing.
    // No order is created and no wallet is deducted.
    // ------------------------------------------------

    
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
      can_order: false,
      message: "Price estimate only. Customer ordering is disabled."
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
    // SAFE ORDER REJECTION
    // No order creation. No wallet deduction.
    // ------------------------------------------------

    if (
      request.method === "POST" &&
      url.pathname === "/api/phone-check/order"
    ) {
      try {
        await getSessionUser(request, env);

        return json({
          ok: false,
          error: "service_disabled",
          can_order: false,
          message: "Order processing is not enabled yet."
        }, 403, origin);
      } catch {
        return json({
          ok: false,
          error: "unauthorized"
        }, 401, origin);
      }
    }

    // ------------------------------------------------
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

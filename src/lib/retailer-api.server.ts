import { z } from "zod";
import { retailerOrderSchema } from "./retailer-contract";
import {
  DatabaseConfigurationError,
  digest,
  getRetailerCollections,
  hashPassword,
  initializeDatabase,
  isDuplicateKeyError,
  randomToken,
  verifyPassword,
  type OrderDocument,
  type ProductDocument,
  type UserDocument,
} from "./retailer-db.server";

const SESSION_COOKIE = "qartuno_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
let dummyPasswordHashPromise: Promise<string> | undefined;

const loginSchema = z.object({
  action: z.literal("login"),
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

const createRetailerSchema = z.object({
  action: z.literal("createRetailer"),
  storeName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(200),
});

const productSchema = z.object({
  action: z.literal("saveProduct"),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  barcode: z.string().trim().min(4).max(64),
  category: z.string().trim().min(1).max(50),
  price: z.number().finite().min(0).max(1_000_000),
  stock: z.number().int().min(0).max(10_000_000),
  active: z.boolean(),
});

const deleteProductSchema = z.object({
  action: z.literal("deleteProduct"),
  id: z.string().uuid(),
});

const demoOrderSchema = z.object({
  action: z.literal("createDemoOrder"),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (lines) => new Set(lines.map((line) => line.productId)).size === lines.length,
      "An order cannot contain duplicate product lines.",
    ),
});

const changePasswordSchema = z.object({
  action: z.literal("changePassword"),
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

const actionSchema = z.discriminatedUnion("action", [
  loginSchema,
  z.object({ action: z.literal("load") }),
  z.object({ action: z.literal("logout") }),
  changePasswordSchema,
  createRetailerSchema,
  productSchema,
  deleteProductSchema,
  demoOrderSchema,
]);

type UserRow = UserDocument;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(error: string, status: number, headers: HeadersInit = {}): Response {
  return jsonResponse({ ok: false, error }, status, headers);
}

function readSessionCookie(request: Request): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  const pair = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (!pair) return undefined;
  try {
    return decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1));
  } catch {
    return undefined;
  }
}

function sessionCookie(request: Request, value: string, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new ApiError("This request could not be verified. Reload the page and try again.", 403);
  }
  let isSameOrigin = false;
  try {
    isSameOrigin = new URL(origin).origin === new URL(request.url).origin;
  } catch {
    isSameOrigin = false;
  }
  if (!isSameOrigin) {
    throw new ApiError("This request could not be verified. Reload the page and try again.", 403);
  }
}

async function readAction(request: Request): Promise<z.infer<typeof actionSchema>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768) throw new ApiError("The request is too large.", 413);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    throw new ApiError("Content-Type must be application/json.", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("Request body must be valid JSON.", 400);
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalLength += value.byteLength;
    if (totalLength > 32_768) {
      await reader.cancel();
      throw new ApiError("The request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("Request body must be valid JSON.", 400);
  }
  const result = actionSchema.safeParse(value);
  if (!result.success) throw new ApiError("Some submitted information is missing or invalid.", 400);
  return result.data;
}

async function currentUser(request: Request): Promise<UserRow | undefined> {
  const token = readSessionCookie(request);
  if (!token) return undefined;
  const { sessions, users } = await getRetailerCollections();
  const tokenHash = await digest(token);
  const session = await sessions.findOne({
    token_hash: tokenHash,
    expires_at: { $gt: new Date() },
  });
  if (!session) {
    await sessions.deleteOne({ token_hash: tokenHash });
    return undefined;
  }
  const user = await users.findOne({
    id: session.user_id,
    active: true,
    password_hash: session.password_hash,
  });
  if (!user) {
    await sessions.deleteOne({ token_hash: tokenHash });
    return undefined;
  }
  return user;
}

function requireOwner(user: UserRow | undefined): UserRow & { retailer_id: string } {
  if (!user) throw new ApiError("Sign in to continue.", 401);
  if (user.must_change_password) {
    throw new ApiError("Change your temporary password before using the retailer portal.", 403);
  }
  if (user.role !== "owner" || !user.retailer_id) {
    throw new ApiError("This action is only available to a retailer account.", 403);
  }
  return { ...user, retailer_id: user.retailer_id };
}

function requireAdmin(user: UserRow | undefined): UserRow {
  if (!user) throw new ApiError("Sign in to continue.", 401);
  if (user.role !== "admin")
    throw new ApiError("This action requires an administrator account.", 403);
  return user;
}

function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    storeName: user.store_name,
    mustChangePassword: user.must_change_password,
  };
}

function mapProduct(product: ProductDocument) {
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    category: product.category,
    pricePaise: product.price_paise,
    stock: product.stock,
    active: product.active,
    updatedAt: product.updated_at,
  };
}

function mapOrder(order: OrderDocument) {
  return retailerOrderSchema.parse({
    id: order.id,
    totalPaise: order.total_paise,
    itemCount: order.item_count,
    state: order.state,
    createdAt: order.created_at,
    items: order.items,
  });
}

async function loadPortal(user: UserRow | undefined): Promise<Response> {
  if (!user) return jsonResponse({ ok: true, user: null });

  const {
    products: productCollection,
    orders: orderCollection,
    users: userCollection,
  } = await getRetailerCollections();
  if (user.role === "admin") {
    const owners = await userCollection
      .find({ role: "owner", active: true })
      .sort({ created_at: -1 })
      .toArray();
    const retailers = await Promise.all(
      owners.map(async (owner) => {
        if (!owner.retailer_id)
          throw new Error(`Retailer account ${owner.id} is missing its store ID.`);
        const [productCount, orderCount] = await Promise.all([
          productCollection.countDocuments({ retailer_id: owner.retailer_id }),
          orderCollection.countDocuments({ retailer_id: owner.retailer_id }),
        ]);
        return {
          id: owner.id,
          email: owner.email,
          storeName: owner.store_name ?? "",
          createdAt: owner.created_at,
          productCount,
          orderCount,
        };
      }),
    );
    return jsonResponse({ ok: true, user: publicUser(user), retailers });
  }

  if (user.must_change_password) {
    return jsonResponse({ ok: true, user: publicUser(user), products: [], orders: [] });
  }

  const owner = requireOwner(user);
  const [products, orders, orderCount, verifiedSales] = await Promise.all([
    productCollection
      .find({ retailer_id: owner.retailer_id })
      .collation({ locale: "en", strength: 2 })
      .sort({ name: 1 })
      .toArray(),
    orderCollection
      .find({ retailer_id: owner.retailer_id })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray(),
    orderCollection.countDocuments({ retailer_id: owner.retailer_id }),
    orderCollection
      .aggregate<{ total: number }>([
        { $match: { retailer_id: owner.retailer_id, state: { $in: ["paid", "verified"] } } },
        { $group: { _id: null, total: { $sum: "$total_paise" } } },
      ])
      .next(),
  ]);

  return jsonResponse({
    ok: true,
    user: publicUser(owner),
    products: products.map(mapProduct),
    orders: orders.map(mapOrder),
    orderCount,
    verifiedSalesPaise: verifiedSales?.total ?? 0,
  });
}

async function handleAction(
  request: Request,
  action: z.infer<typeof actionSchema>,
): Promise<Response> {
  if (action.action === "load") {
    await initializeDatabase();
    return loadPortal(await currentUser(request));
  }

  if (action.action === "login") {
    await initializeDatabase();
    const { loginAttempts, sessions, users } = await getRetailerCollections();
    const email = action.email.toLowerCase();
    const emailHash = await digest(email);
    const now = new Date();
    const nowIso = now.toISOString();
    const attemptWindow = new Date(now.getTime() - LOGIN_WINDOW_MS).toISOString();
    await loginAttempts.deleteMany({ window_started_at: { $lt: attemptWindow } });
    await sessions.deleteMany({ expires_at: { $lte: now } });

    const attempt = await loginAttempts.findOne({ email_hash: emailHash });
    if (
      attempt?.window_started_at &&
      attempt.window_started_at >= attemptWindow &&
      attempt.attempts >= MAX_LOGIN_ATTEMPTS
    ) {
      throw new ApiError("Too many sign-in attempts. Wait 15 minutes and try again.", 429);
    }

    const user = await users.findOne({ email });
    const passwordHash = user?.password_hash;
    const hashToCheck =
      passwordHash ?? (await (dummyPasswordHashPromise ??= hashPassword(randomToken())));
    const validPassword = await verifyPassword(action.password, hashToCheck);
    if (!user || !user.active || !passwordHash || !validPassword) {
      const resetWindow = {
        $or: [
          { $eq: [{ $type: "$window_started_at" }, "missing"] },
          { $lt: ["$window_started_at", attemptWindow] },
        ],
      };
      await loginAttempts.updateOne(
        { email_hash: emailHash },
        [
          {
            $set: {
              attempts: { $cond: [resetWindow, 1, { $add: ["$attempts", 1] }] },
              window_started_at: { $cond: [resetWindow, nowIso, "$window_started_at"] },
            },
          },
        ],
        { upsert: true },
      );
      throw new ApiError("Email or password is incorrect.", 401);
    }

    await loginAttempts.deleteOne({ email_hash: emailHash });
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000);
    await sessions.insertOne({
      token_hash: await digest(token),
      user_id: user.id,
      password_hash: passwordHash,
      expires_at: expiresAt,
      created_at: nowIso,
    });
    return jsonResponse({ ok: true, user: publicUser(user) }, 200, {
      "set-cookie": sessionCookie(request, token, SESSION_SECONDS),
    });
  }

  await initializeDatabase();
  const user = await currentUser(request);
  const { orders, products, sessions, users } = await getRetailerCollections();

  if (action.action === "logout") {
    const token = readSessionCookie(request);
    if (token) await sessions.deleteOne({ token_hash: await digest(token) });
    return jsonResponse({ ok: true, user: null }, 200, {
      "set-cookie": sessionCookie(request, "", 0),
    });
  }

  if (action.action === "changePassword") {
    if (!user) throw new ApiError("Sign in to continue.", 401);
    const activeUser = await users.findOne({ id: user.id, active: true });
    if (!activeUser || !(await verifyPassword(action.currentPassword, activeUser.password_hash))) {
      throw new ApiError("Current password is incorrect.", 400);
    }
    await users.updateOne(
      { id: user.id, active: true },
      {
        $set: {
          password_hash: await hashPassword(action.newPassword),
          must_change_password: false,
        },
      },
    );
    await sessions.deleteMany({ user_id: user.id });
    return jsonResponse({ ok: true, user: null }, 200, {
      "set-cookie": sessionCookie(request, "", 0),
    });
  }

  if (action.action === "createRetailer") {
    requireAdmin(user);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await users.insertOne({
        id,
        retailer_id: id,
        email: action.email.toLowerCase(),
        password_hash: await hashPassword(action.password),
        role: "owner",
        store_name: action.storeName,
        active: true,
        must_change_password: true,
        created_at: now,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ApiError("An account already exists for that email address.", 409);
      }
      throw error;
    }
    return jsonResponse({ ok: true });
  }

  const owner = requireOwner(user);
  if (action.action === "saveProduct") {
    const now = new Date().toISOString();
    const productId = action.id ?? crypto.randomUUID();
    const product = {
      name: action.name,
      barcode: action.barcode,
      category: action.category,
      price_paise: Math.round(action.price * 100),
      stock: action.stock,
      active: action.active,
      updated_at: now,
    };
    try {
      if (action.id) {
        const result = await products.updateOne(
          { id: action.id, retailer_id: owner.retailer_id },
          { $set: product },
        );
        if (result.matchedCount === 0) throw new ApiError("Product not found.", 404);
      } else {
        await products.insertOne({
          id: productId,
          retailer_id: owner.retailer_id,
          ...product,
          created_at: now,
        });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (isDuplicateKeyError(error)) {
        throw new ApiError("That barcode is already in this store's catalogue.", 409);
      }
      throw error;
    }
    return jsonResponse({ ok: true });
  }

  if (action.action === "deleteProduct") {
    const result = await products.deleteOne({ id: action.id, retailer_id: owner.retailer_id });
    if (result.deletedCount === 0) throw new ApiError("Product not found.", 404);
    return jsonResponse({ ok: true });
  }

  if (action.action === "createDemoOrder") {
    const productIds = action.lines.map((line) => line.productId);
    const productRows = await products
      .find({ id: { $in: productIds }, retailer_id: owner.retailer_id, active: true })
      .toArray();
    if (productRows.length !== productIds.length) {
      throw new ApiError("An order item is no longer available.", 400);
    }
    const productById = new Map(productRows.map((product) => [product.id, product]));
    const items = action.lines.map((line) => {
      const product = productById.get(line.productId);
      if (!product) throw new ApiError("An order item is no longer available.", 400);
      if (product.stock < line.quantity) {
        throw new ApiError(`${product.name} does not have enough stock.`, 409);
      }
      return {
        name: product.name,
        barcode: product.barcode,
        quantity: line.quantity,
        pricePaise: product.price_paise,
      };
    });
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalPaise = items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
    if (!Number.isSafeInteger(totalPaise)) {
      throw new ApiError("The order total is out of range.", 400);
    }
    await orders.insertOne({
      id: crypto.randomUUID(),
      retailer_id: owner.retailer_id,
      total_paise: totalPaise,
      item_count: itemCount,
      state: "demo",
      items,
      created_at: new Date().toISOString(),
    });
    return jsonResponse({ ok: true });
  }

  throw new ApiError("Unsupported action.", 400);
}

export async function handleRetailerPost(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store" };
  try {
    requireSameOrigin(request);
    const action = await readAction(request);
    return await handleAction(request, action);
  } catch (error) {
    if (error instanceof ApiError) return errorResponse(error.message, error.status, headers);
    if (error instanceof DatabaseConfigurationError) {
      return errorResponse(
        "Retailer database is not configured. Set MONGODB_URI; optionally set MONGODB_DB_NAME. Set QARTUNO_ADMIN_EMAIL and QARTUNO_ADMIN_PASSWORD to create the first administrator.",
        503,
        headers,
      );
    }
    console.error("Retailer portal request failed:", error);
    return errorResponse(
      "The retailer portal could not complete this request. Please try again.",
      500,
      headers,
    );
  }
}

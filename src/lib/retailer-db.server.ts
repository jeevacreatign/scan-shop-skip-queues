import { MongoClient, type Document } from "mongodb";

type RuntimeEnvironment = {
  MONGODB_URI?: string;
  MONGODB_DB_NAME?: string;
  QARTUNO_ADMIN_EMAIL?: string;
  QARTUNO_ADMIN_PASSWORD?: string;
};

export type UserDocument = Document & {
  id: string;
  retailer_id: string | null;
  email: string;
  password_hash: string;
  role: "admin" | "owner";
  store_name: string | null;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
};

export type SessionDocument = Document & {
  token_hash: string;
  user_id: string;
  password_hash: string;
  expires_at: Date;
  created_at: string;
};

export type ProductDocument = Document & {
  id: string;
  retailer_id: string;
  name: string;
  barcode: string;
  category: string;
  price_paise: number;
  stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderItemDocument = {
  name: string;
  barcode: string;
  quantity: number;
  pricePaise: number;
};

export type OrderDocument = Document & {
  id: string;
  retailer_id: string;
  total_paise: number;
  item_count: number;
  state: "demo" | "paid" | "verified";
  items: OrderItemDocument[];
  created_at: string;
};

export type LoginAttemptDocument = Document & {
  email_hash: string;
  window_started_at: string;
  attempts: number;
};

export type ContactInquiryDocument = Document & {
  name: string;
  business?: string;
  email: string;
  phone?: string;
  store_type: string;
  locations: string;
  message: string;
  consented_at: string;
  privacy_policy_version: string;
  created_at: string;
};

export class DatabaseConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigurationError";
  }
}

function runtimeEnvironment(): RuntimeEnvironment {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: RuntimeEnvironment };
  };
  return runtime.process?.env ?? {};
}

function requiredEnv(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new DatabaseConfigurationError(`${name} is not configured.`);
  }
  return value.trim();
}

function databaseName(uri: string, configuredName: string | undefined): string {
  if (configuredName?.trim()) return configuredName.trim();
  try {
    const pathname = new URL(uri).pathname.replace(/^\/+/, "");
    return pathname.split("/")[0] || "qartuno";
  } catch {
    return "qartuno";
  }
}

let cachedClient: MongoClient | undefined;
let cachedClientKey: string | undefined;
let clientConnection: Promise<MongoClient> | undefined;

export async function getDatabase() {
  const environment = runtimeEnvironment();
  const uri = requiredEnv(environment.MONGODB_URI, "MONGODB_URI");
  const name = databaseName(uri, environment.MONGODB_DB_NAME);
  const key = `${uri}\n${name}`;

  if (!cachedClient || cachedClientKey !== key) {
    const client = new MongoClient(uri, {
      appName: "qartuno-retailer-portal",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });
    cachedClient = client;
    cachedClientKey = key;
    clientConnection = client.connect().then(
      () => client,
      (error: unknown) => {
        if (cachedClient === client) {
          cachedClient = undefined;
          cachedClientKey = undefined;
          clientConnection = undefined;
        }
        throw error;
      },
    );
  }

  const connection = clientConnection;
  if (!connection) throw new Error("MongoDB connection was not initialized.");
  const client = await connection;
  return client.db(name);
}

export async function getRetailerCollections() {
  const database = await getDatabase();
  return {
    users: database.collection<UserDocument>("retailer_users"),
    sessions: database.collection<SessionDocument>("retailer_sessions"),
    products: database.collection<ProductDocument>("retailer_products"),
    orders: database.collection<OrderDocument>("retailer_orders"),
    loginAttempts: database.collection<LoginAttemptDocument>("retailer_login_attempts"),
    contactInquiries: database.collection<ContactInquiryDocument>("contact_inquiries"),
  };
}

let initializedDatabaseKey: string | undefined;
let initialization: Promise<void> | undefined;
let initializingDatabaseKey: string | undefined;

export async function initializeDatabase(): Promise<void> {
  const environment = runtimeEnvironment();
  const uri = requiredEnv(environment.MONGODB_URI, "MONGODB_URI");
  const name = databaseName(uri, environment.MONGODB_DB_NAME);
  const key = `${uri}\n${name}`;

  if (initializedDatabaseKey !== key && (!initialization || initializingDatabaseKey !== key)) {
    initializingDatabaseKey = key;
    initialization = (async () => {
      const { users, sessions, products, orders, loginAttempts, contactInquiries } =
        await getRetailerCollections();
      await Promise.all([
        users.createIndex({ id: 1 }, { unique: true }),
        users.createIndex({ email: 1 }, { unique: true }),
        users.createIndex({ role: 1, active: 1, created_at: -1 }),
        sessions.createIndex({ token_hash: 1 }, { unique: true }),
        sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
        sessions.createIndex({ user_id: 1 }),
        products.createIndex({ id: 1 }, { unique: true }),
        products.createIndex({ retailer_id: 1, barcode: 1 }, { unique: true }),
        products.createIndex({ retailer_id: 1, active: 1, name: 1 }),
        orders.createIndex({ id: 1 }, { unique: true }),
        orders.createIndex({ retailer_id: 1, created_at: -1 }),
        loginAttempts.createIndex({ email_hash: 1 }, { unique: true }),
        loginAttempts.createIndex({ window_started_at: 1 }),
        contactInquiries.createIndex({ created_at: -1 }),
      ]);
      initializedDatabaseKey = key;
    })().catch((error: unknown) => {
      initialization = undefined;
      initializingDatabaseKey = undefined;
      throw error;
    });
  }

  if (initializedDatabaseKey !== key) await initialization;

  const adminEmail = environment.QARTUNO_ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = environment.QARTUNO_ADMIN_PASSWORD;
  if (adminEmail || adminPassword) {
    const { users } = await getRetailerCollections();
    const existing = await users.findOne(
      { id: "qartuno-platform-admin" },
      { projection: { _id: 1 } },
    );
    if (!existing) {
      if (!adminEmail || !adminPassword) {
        throw new DatabaseConfigurationError(
          "Set both QARTUNO_ADMIN_EMAIL and QARTUNO_ADMIN_PASSWORD to bootstrap the retailer administrator.",
        );
      }
      if (adminPassword.length < 12 || adminPassword.length > 200) {
        throw new DatabaseConfigurationError(
          "QARTUNO_ADMIN_PASSWORD must be between 12 and 200 characters.",
        );
      }
      await users.insertOne({
        id: "qartuno-platform-admin",
        retailer_id: null,
        email: adminEmail,
        password_hash: await hashPassword(adminPassword),
        role: "admin",
        store_name: null,
        active: true,
        must_change_password: false,
        created_at: new Date().toISOString(),
      });
    }
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$600000$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationText);
  if (
    algorithm !== "pbkdf2" ||
    !Number.isInteger(iterations) ||
    iterations < 600_000 ||
    iterations > 2_000_000 ||
    !saltText ||
    !expectedText
  ) {
    throw new Error("The stored password hash is invalid.");
  }
  const saltBytes = fromBase64(saltText);
  const salt = new Uint8Array(new ArrayBuffer(saltBytes.byteLength));
  salt.set(saltBytes);
  const expected = fromBase64(expectedText);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256),
  );
  if (bits.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < bits.length; index += 1) {
    const left = bits[index];
    const right = expected[index];
    if (left === undefined || right === undefined) return false;
    difference |= left ^ right;
  }
  return difference === 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function digest(value: string): Promise<string> {
  const hash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function isDuplicateKeyError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === 11000;
}

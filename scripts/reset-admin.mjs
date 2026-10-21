import { MongoClient } from "mongodb";
import { createHash, webcrypto } from "node:crypto";

const uri = process.env.MONGODB_URI?.trim();
const configuredDatabase = process.env.MONGODB_DB_NAME?.trim();
const email = process.env.QARTUNO_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.QARTUNO_ADMIN_PASSWORD;

if (!uri || !email || !password) {
  console.error(
    "Set MONGODB_URI, QARTUNO_ADMIN_EMAIL, and QARTUNO_ADMIN_PASSWORD in .env before resetting the admin.",
  );
  process.exitCode = 1;
} else if (password.length < 12 || password.length > 200) {
  console.error("QARTUNO_ADMIN_PASSWORD must be between 12 and 200 characters.");
  process.exitCode = 1;
} else {
  let databaseName = configuredDatabase;
  if (!databaseName) {
    try {
      databaseName = new URL(uri).pathname.replace(/^\/+/, "").split("/")[0] || "qartuno";
    } catch {
      console.error("MONGODB_URI is invalid.");
      process.exitCode = 1;
    }
  }

  if (databaseName) {
    const client = new MongoClient(uri, {
      appName: "qartuno-admin-reset",
      serverSelectionTimeoutMS: 10_000,
    });
    try {
      await client.connect();
      const users = client.db(databaseName).collection("retailer_users");
      const existingAdmin = await users.findOne({ id: "qartuno-platform-admin" });
      const emailOwner = await users.findOne({ email }, { projection: { id: 1, role: 1 } });
      if (emailOwner && emailOwner.id !== "qartuno-platform-admin") {
        throw new Error(
          "That email is already assigned to another account. Choose the existing admin email.",
        );
      }

      const salt = webcrypto.getRandomValues(new Uint8Array(16));
      const key = await webcrypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"],
      );
      const derived = await webcrypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 600_000, hash: "SHA-256" },
        key,
        256,
      );
      const passwordHash = `pbkdf2$600000$${Buffer.from(salt).toString("base64")}$${Buffer.from(derived).toString("base64")}`;

      await users.updateOne(
        { id: "qartuno-platform-admin" },
        {
          $set: {
            email,
            password_hash: passwordHash,
            role: "admin",
            retailer_id: null,
            store_name: null,
            active: true,
            must_change_password: false,
          },
          $setOnInsert: { id: "qartuno-platform-admin", created_at: new Date().toISOString() },
        },
        { upsert: true },
      );
      await client.db(databaseName).collection("retailer_sessions").deleteMany({
        user_id: "qartuno-platform-admin",
      });
      const emailHash = createHash("sha256").update(email).digest("hex");
      await client.db(databaseName).collection("retailer_login_attempts").deleteOne({
        email_hash: emailHash,
      });
      console.log(
        existingAdmin
          ? "Platform admin credentials reset. Sign in with QARTUNO_ADMIN_EMAIL and QARTUNO_ADMIN_PASSWORD from .env."
          : "Platform admin created. Sign in with QARTUNO_ADMIN_EMAIL and QARTUNO_ADMIN_PASSWORD from .env.",
      );
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Admin credentials could not be reset.",
      );
      process.exitCode = 1;
    } finally {
      await client.close();
    }
  }
}

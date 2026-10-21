import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseConfigurationError,
  getDatabase,
  hashPassword,
  isDuplicateKeyError,
  verifyPassword,
} from "@/lib/retailer-db.server";

describe("MongoDB retailer database", () => {
  beforeEach(() => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    vi.stubEnv("MONGODB_DB_NAME", "qartuno_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires a MongoDB connection string", async () => {
    vi.stubEnv("MONGODB_URI", "");

    await expect(getDatabase()).rejects.toThrow(
      new DatabaseConfigurationError("MONGODB_URI is not configured."),
    );
  });

  it("stores password hashes and verifies the original password", async () => {
    const hash = await hashPassword("a-long-example-password");

    expect(hash).not.toBe("a-long-example-password");
    await expect(verifyPassword("a-long-example-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("recognizes MongoDB duplicate-key errors", () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: 8 })).toBe(false);
    expect(isDuplicateKeyError(new Error("duplicate"))).toBe(false);
  });
});

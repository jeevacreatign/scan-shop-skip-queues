import { afterEach, describe, expect, it, vi } from "vitest";
import { handleContactPost } from "@/lib/contact-api.server";

const { insertOne } = vi.hoisted(() => ({ insertOne: vi.fn() }));

vi.mock("@/lib/retailer-db.server", () => {
  class DatabaseConfigurationError extends Error {}
  return {
    DatabaseConfigurationError,
    getRetailerCollections: vi.fn(async () => ({ contactInquiries: { insertOne } })),
    initializeDatabase: vi.fn(async () => {
      if (!process.env["MONGODB_URI"]) {
        throw new DatabaseConfigurationError("MONGODB_URI is not configured.");
      }
    }),
  };
});

const validEnquiry = {
  name: "Sample Contact",
  business: "Sample Store",
  email: "contact@example.com",
  phone: "",
  storeType: "Supermarket",
  locations: "1",
  message: "I would like to learn about the demo.",
  consent: "on",
};

function request(body: unknown, origin = "http://localhost:8080") {
  return new Request("http://localhost:8080/contact", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("contact enquiry API", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    insertOne.mockReset();
  });

  it("rejects cross-origin submissions", async () => {
    const response = await handleContactPost(request(validEnquiry, "https://attacker.example"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("rejects invalid enquiry data without connecting to MongoDB", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const response = await handleContactPost(request({ ...validEnquiry, consent: "off" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("reports missing database configuration instead of claiming to save", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const response = await handleContactPost(request(validEnquiry));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("saves the submitted enquiry and its consent without exposing a delivery claim", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://example.test/qartuno");
    insertOne.mockResolvedValue({ acknowledged: true });
    const response = await handleContactPost(request(validEnquiry));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        name: validEnquiry.name,
        email: validEnquiry.email,
        store_type: validEnquiry.storeType,
        consented_at: expect.any(String),
        privacy_policy_version: "2026-10-21",
      }),
    );
  });
});

import { z } from "zod";
import {
  DatabaseConfigurationError,
  getRetailerCollections,
  initializeDatabase,
} from "./retailer-db.server";

const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  business: z.string().trim().max(120).optional().default(""),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?\d[\d\s-]{7,15})?$/)
    .optional()
    .default(""),
  storeType: z.enum([
    "Supermarket",
    "Local grocery store",
    "Supermarket chain",
    "Convenience store",
    "Other",
  ]),
  locations: z.enum(["1", "2–5", "6–20", "More than 20"]),
  message: z.string().trim().min(1).max(1000),
  consent: z.literal("on"),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function requestIsSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing-body");
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalLength += value.byteLength;
    if (totalLength > 16_384) {
      await reader.cancel();
      throw new RangeError("body-too-large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export async function handleContactPost(request: Request): Promise<Response> {
  try {
    if (!requestIsSameOrigin(request)) {
      return jsonResponse(
        { ok: false, error: "This request could not be verified. Reload the page and try again." },
        403,
      );
    }
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return jsonResponse({ ok: false, error: "Content-Type must be application/json." }, 415);
    }
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_384) {
      return jsonResponse({ ok: false, error: "The submitted enquiry is too large." }, 413);
    }

    let payload: unknown;
    try {
      payload = await readJson(request);
    } catch (error) {
      if (error instanceof RangeError) {
        return jsonResponse({ ok: false, error: "The submitted enquiry is too large." }, 413);
      }
      return jsonResponse({ ok: false, error: "The submitted enquiry must be valid JSON." }, 400);
    }
    const parsed = contactSchema.safeParse(payload);
    if (!parsed.success) {
      return jsonResponse(
        { ok: false, error: "Some submitted information is missing or invalid." },
        400,
      );
    }

    await initializeDatabase();
    const { contactInquiries } = await getRetailerCollections();
    const submittedAt = new Date().toISOString();
    const { name, business, email, phone, storeType, locations, message } = parsed.data;
    await contactInquiries.insertOne({
      name,
      ...(business ? { business } : {}),
      email: email.toLowerCase(),
      ...(phone ? { phone } : {}),
      store_type: storeType,
      locations,
      message,
      consented_at: submittedAt,
      privacy_policy_version: "2026-10-21",
      created_at: submittedAt,
    });

    return jsonResponse({ ok: true }, 201);
  } catch (error) {
    if (error instanceof DatabaseConfigurationError) {
      return jsonResponse(
        { ok: false, error: "Enquiry storage is not configured. Please contact QARTUNO directly." },
        503,
      );
    }
    console.error("Contact enquiry could not be saved:", error);
    return jsonResponse(
      { ok: false, error: "Your enquiry could not be saved. Please try again later." },
      500,
    );
  }
}

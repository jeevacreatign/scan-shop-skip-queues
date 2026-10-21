import { Link } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "./ui-kit";

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your full name").max(100),
  business: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Please enter a valid work email").max(255),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?\d[\d\s-]{7,15})?$/, "Please enter a valid phone number")
    .optional(),
  storeType: z.string().min(1, "Please choose a store type"),
  locations: z.string().min(1, "Please choose the number of locations"),
  message: z.string().trim().min(1, "Please add a short message").max(1000),
  consent: z.literal("on", {
    errorMap: () => ({ message: "Please accept the privacy terms to continue" }),
  }),
});
type Errors = Partial<Record<keyof z.infer<typeof schema>, string>>;

const field =
  "mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm aria-[invalid=true]:border-destructive";

export function ContactForm() {
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState("");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const res = schema.safeParse(data);
    if (!res.success) {
      const errs: Errors = {};
      for (const i of res.error.issues) errs[i.path[0] as keyof Errors] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitError("");
    setState("sending");
    try {
      const response = await fetch("/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(res.data),
      });
      let result: { ok?: boolean; error?: string };
      try {
        result = (await response.json()) as { ok?: boolean; error?: string };
      } catch {
        throw new Error("The server returned an unreadable response.");
      }
      if (!response.ok || result.ok !== true) {
        throw new Error(result.error ?? "Your enquiry could not be saved. Please try again.");
      }
      form.reset();
      setState("success");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Your enquiry could not be saved. Please try again.",
      );
      setState("error");
    }
  };

  const err = (k: keyof Errors) =>
    errors[k] ? (
      <p id={`${k}-err`} className="mt-1 flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="size-3.5" />
        {errors[k]}
      </p>
    ) : null;
  const a = (k: keyof Errors) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-err` : undefined,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="text-sm font-medium">
            Full name *
          </label>
          <input id="name" name="name" autoComplete="name" className={field} {...a("name")} />
          {err("name")}
        </div>
        <div>
          <label htmlFor="business" className="text-sm font-medium">
            Business name
          </label>
          <input id="business" name="business" autoComplete="organization" className={field} />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Work email *
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className={field}
            {...a("email")}
          />
          {err("email")}
        </div>
        <div>
          <label htmlFor="phone" className="text-sm font-medium">
            Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className={field}
            {...a("phone")}
          />
          {err("phone")}
        </div>
        <div>
          <label htmlFor="storeType" className="text-sm font-medium">
            Store type *
          </label>
          <select
            id="storeType"
            name="storeType"
            defaultValue=""
            className={field}
            {...a("storeType")}
          >
            <option value="" disabled>
              Select…
            </option>
            <option>Supermarket</option>
            <option>Local grocery store</option>
            <option>Supermarket chain</option>
            <option>Convenience store</option>
            <option>Other</option>
          </select>
          {err("storeType")}
        </div>
        <div>
          <label htmlFor="locations" className="text-sm font-medium">
            Number of store locations *
          </label>
          <select
            id="locations"
            name="locations"
            defaultValue=""
            className={field}
            {...a("locations")}
          >
            <option value="" disabled>
              Select…
            </option>
            <option>1</option>
            <option>2–5</option>
            <option>6–20</option>
            <option>More than 20</option>
          </select>
          {err("locations")}
        </div>
      </div>
      <div>
        <label htmlFor="message" className="text-sm font-medium">
          Message *
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          maxLength={1000}
          className={field}
          {...a("message")}
        />
        {err("message")}
      </div>
      <div>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="consent" className="mt-1 accent-primary" {...a("consent")} />
          <span>
            I agree to the processing of my details as described in the{" "}
            <Link to="/privacy" className="text-primary underline">
              Privacy Policy
            </Link>
            . *
          </span>
        </label>
        {err("consent")}
      </div>
      <Button type="submit" size="lg" disabled={state === "sending"} className="w-full sm:w-auto">
        {state === "sending" && <Loader2 className="size-4 animate-spin" />} Book a Demo
      </Button>
      {state === "success" && (
        <div
          role="status"
          className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p>
            Your demo enquiry was saved successfully. Email notifications are not configured, so no
            email confirmation was sent.
          </p>
        </div>
      )}
      {state === "error" && (
        <div
          role="alert"
          className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>{submitError}</p>
        </div>
      )}
    </form>
  );
}

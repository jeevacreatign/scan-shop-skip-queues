import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import mascot from "@/assets/qartuno-mascot.png.asset.json";
import { ContactForm } from "@/components/contact-form";
import { Card, PageHero, pageMeta } from "@/components/ui-kit";

export const Route = createFileRoute("/contact")({
  head: () =>
    pageMeta(
      "Book a QARTUNO Demo | Contact",
      "Request a demo of QARTUNO's smartphone self-checkout platform for your supermarket or grocery store.",
    ),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleContactPost } = await import("@/lib/contact-api.server");
        return handleContactPost(request);
      },
    },
  },
  component: Page,
});

function Page() {
  return (
    <>
      <PageHero
        eyebrow="Contact / Book a Demo"
        title="Let's talk about your store."
        intro="Tell us a little about your business and we'll walk you through how QARTUNO could work for your shoppers."
      />
      <section className="container-site grid gap-10 py-16 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6 md:p-8">
          <ContactForm />
        </Card>
        <div className="space-y-6">
          <img
            src={mascot.url}
            alt="QARTUNO mascot cart"
            className="w-full max-w-xs rounded-2xl"
            loading="lazy"
          />
          <div>
            <h2 className="font-semibold">In a demo we'll cover</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {[
                "The shopper scan-and-pay flow",
                "Your POS, payment and verification setup",
                "Retailer dashboard capabilities",
                "Current plan details and onboarding",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}

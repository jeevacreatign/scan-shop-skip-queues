import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal";
import { pageMeta } from "@/components/ui-kit";

export const Route = createFileRoute("/privacy")({
  head: () =>
    pageMeta("Privacy Policy | QARTUNO", "How QARTUNO handles personal and business information."),
  component: () => (
    <LegalPage title="Privacy Policy">
      <h2>Information we collect</h2>
      <p>
        When you submit a demo enquiry, we collect the details you provide: name, business name,
        work email, optional phone number, store type, number of locations, message and your consent
        to this processing. These details are stored in QARTUNO's MongoDB database so the enquiry
        can be reviewed. Shopper app data (cart contents, orders, payment confirmations) would be
        collected only at participating stores once the service is live.
      </p>
      <h2>How we use it</h2>
      <p>
        Enquiry details are used to review and respond to your demo request and meet legal
        obligations. Submission stores your enquiry but does not currently send an email
        notification or confirmation. We do not sell personal data.
      </p>
      <h2>Payments</h2>
      <p>
        Card and payment credentials are handled by regulated payment providers. QARTUNO does not
        store raw card details.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Enquiry data is retained only as long as needed to handle the request or as required by law.
        You may request access, correction or deletion of your data through the Contact page.
      </p>
      <h2>Security</h2>
      <p>
        We apply access controls, encryption in transit and store-specific data separation for
        retailer information.
      </p>
      <h2>Contact</h2>
      <p>Official privacy contact details will be published here.</p>
    </LegalPage>
  ),
});

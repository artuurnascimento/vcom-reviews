import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Vertix Reviews" },
  { name: "robots", content: "noindex" },
];

const APP_NAME = "Vertix Reviews";

export default function PrivacyPolicy() {
  const contactEmail =
    process.env.PRIVACY_CONTACT_EMAIL?.trim() || "privacy@vcomglobal.com";
  const updated = "June 1, 2026";

  return (
    <main
      style={{
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: 1.6,
        maxWidth: 720,
        margin: "0 auto",
        padding: "2rem 1.25rem 3rem",
        color: "#1a1a1a",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
        Privacy Policy
      </h1>
      <p style={{ color: "#555", marginTop: 0 }}>Last updated: {updated}</p>

      <p>
        This policy describes how {APP_NAME} (&quot;we&quot;, &quot;the app&quot;)
        handles information when merchants install and use the app on their online
        store.
      </p>

      <h2>Information we access</h2>
      <ul>
        <li>Store and staff account details needed to authenticate the app.</li>
        <li>Product and theme data required to display and configure reviews.</li>
        <li>Files and metaobjects used to store review content (text, ratings, images).</li>
        <li>Customer-submitted reviews when the optional storefront form is enabled.</li>
      </ul>

      <h2>How we use information</h2>
      <ul>
        <li>Provide review management, storefront widgets, and app configuration.</li>
        <li>Sync review data between the admin and the merchant&apos;s storefront.</li>
        <li>Operate, secure, and improve the app (including error monitoring).</li>
      </ul>

      <h2>Storage and retention</h2>
      <p>
        Review content is stored in the merchant&apos;s store (metaobjects and related
        store data). Session data for app authentication may be stored on our
        hosting provider while the app is installed. When the app is uninstalled,
        we delete app-specific session data according to our retention practices.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not sell merchant or customer data. We use infrastructure providers
        (such as hosting and monitoring services) only to run the app. We may
        disclose information if required by law.
      </p>

      <h2>Merchant responsibilities</h2>
      <p>
        Merchants are responsible for their own privacy notices to customers and for
        obtaining any consent required before collecting reviews on the storefront.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy:{" "}
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>
    </main>
  );
}

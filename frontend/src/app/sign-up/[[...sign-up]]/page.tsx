import Link from "next/link";

export default function SignUpPage() {
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: 48, textAlign: "center" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Sign-up paused</h1>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
        New accounts are not available until authentication is re-enabled after deploy.
      </p>
      <Link href="/" style={{ color: "var(--color-teal)", fontWeight: 600, fontSize: 14 }}>
        ← Back to dashboard
      </Link>
    </div>
  );
}

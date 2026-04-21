import Link from "next/link";

export default function SignInPage() {
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", paddingTop: 48, textAlign: "center" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Sign-in paused</h1>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
        Authentication is turned off while we prioritize deployment. You can use the app in preview mode.
      </p>
      <Link href="/" style={{ color: "var(--color-gold)", fontWeight: 600, fontSize: 14 }}>
        ← Back to dashboard
      </Link>
    </div>
  );
}

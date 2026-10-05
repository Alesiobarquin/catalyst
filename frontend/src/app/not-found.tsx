import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found-page">
      <p className="not-found-code">404</p>
      <h1>Page not found</h1>
      <p>The address may be incorrect, or the page may have moved.</p>
      <Link href="/">Return to Dashboard</Link>
    </section>
  );
}

export function DashboardHeader() {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.01em",
          marginBottom: 4,
          lineHeight: 1.25,
        }}
      >
        Signal Dashboard
      </h1>
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Multi-factor confluence analysis · Engine: Gemini · Half-Kelly · VIX regime
      </p>
    </div>
  );
}

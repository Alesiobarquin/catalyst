// Signals page skeleton

export default function SignalsLoading() {
  return (
    <>
      {/* Page header skeleton */}
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 340 }} />
      </div>

      {/* Table skeleton */}
      <div className="glass-card" style={{ overflow: "hidden", marginBottom: 24 }}>
        {/* Header row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "80px 110px 80px 120px 1fr 100px",
            gap: 0,
            padding: "10px 20px",
            borderBottom: "1px solid var(--color-border)",
            background: "var(--color-bg-elevated)",
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 10, width: i === 4 ? "60%" : "70%" }} />
          ))}
        </div>

        {/* Row skeletons */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 110px 80px 120px 1fr 100px",
              gap: 0,
              padding: "14px 20px",
              borderBottom: i < 5 ? "1px solid var(--color-border-subtle)" : "none",
              alignItems: "center",
            }}
          >
            <div className="skeleton" style={{ height: 16, width: 48 }} />
            <div className="skeleton" style={{ height: 12, width: 80 }} />
            <div className="skeleton" style={{ height: 16, width: 32 }} />
            <div className="skeleton" style={{ height: 12, width: 90 }} />
            <div className="skeleton" style={{ height: 12, width: "85%", marginRight: 16 }} />
            <div style={{ display: "flex", gap: 4 }}>
              <div className="skeleton" style={{ height: 18, width: 50, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 18, width: 50, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

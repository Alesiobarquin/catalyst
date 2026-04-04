// Dashboard skeleton — shown by Next.js during server-side data fetch

export default function DashboardLoading() {
  return (
    <>
      {/* Page header skeleton */}
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 28, width: 240, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 380 }} />
      </div>

      {/* Stats bar — 4 cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass-card"
            style={{ padding: "20px 22px" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 10, width: 80, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 28, width: 60, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 12, width: 100 }} />
              </div>
              <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar skeleton */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 30, width: i === 0 ? 40 : 80, borderRadius: 6 }} />
        ))}
      </div>

      {/* Trade card skeletons */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-card" style={{ marginBottom: 12, padding: "18px 20px" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Ticker + strategy */}
            <div style={{ minWidth: 72 }}>
              <div className="skeleton" style={{ height: 22, width: 60, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 20, width: 80, borderRadius: 5 }} />
            </div>
            {/* Price boxes */}
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="skeleton" style={{ height: 52, borderRadius: 8 }} />
              ))}
            </div>
            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 140, alignItems: "flex-end" }}>
              <div className="skeleton" style={{ height: 22, width: 80, borderRadius: 5 }} />
              <div className="skeleton" style={{ height: 18, width: 60 }} />
            </div>
          </div>
          {/* Conviction bar */}
          <div style={{ marginTop: 14 }}>
            <div className="skeleton" style={{ height: 5, borderRadius: 3 }} />
          </div>
          {/* Pills */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="skeleton" style={{ height: 22, width: 90, borderRadius: 5 }} />
            ))}
          </div>
          {/* Rationale */}
          <div style={{ marginTop: 12 }}>
            <div className="skeleton" style={{ height: 14, width: "95%", marginBottom: 6 }} />
            <div className="skeleton" style={{ height: 14, width: "80%" }} />
          </div>
        </div>
      ))}
    </>
  );
}

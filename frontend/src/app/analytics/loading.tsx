// Analytics page skeleton

export default function AnalyticsLoading() {
  return (
    <>
      {/* Page header skeleton */}
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 28, width: 160, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 320 }} />
      </div>

      {/* 2×2 chart grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card" style={{ padding: "20px 22px" }}>
            {/* Chart card header */}
            <div className="skeleton" style={{ height: 12, width: 140, marginBottom: 18 }} />
            {/* Chart body placeholder */}
            <div className="skeleton" style={{ height: 100, borderRadius: 8 }} />
          </div>
        ))}
      </div>

      {/* Catalyst breakdown skeleton */}
      <div className="glass-card" style={{ padding: "20px 22px" }}>
        <div className="skeleton" style={{ height: 12, width: 180, marginBottom: 18 }} />
        <div style={{ display: "flex", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ flex: "1 1 150px", height: 80, borderRadius: 10 }} />
          ))}
        </div>
      </div>
    </>
  );
}

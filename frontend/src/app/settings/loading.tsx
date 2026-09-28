// Settings page skeleton

export default function SettingsLoading() {
  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: 340 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="glass-card" style={{ padding: "24px" }}>
          <div className="skeleton" style={{ height: 16, width: 160, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 40, width: "100%", marginBottom: 12, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 40, width: "100%", marginBottom: 16, borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 36, width: 120, borderRadius: 6 }} />
        </div>

        <div className="glass-card" style={{ padding: "24px" }}>
          <div className="skeleton" style={{ height: 16, width: 220, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 80, width: "100%", borderRadius: 6 }} />
        </div>
      </div>
    </>
  );
}

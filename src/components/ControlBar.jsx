const FONT = "Georgia, serif";

const COMMUNITY_COLORS = [
  "#78B4D4", "#D4A878", "#A878D4", "#78D4A8",
  "#D47878", "#D4D478", "#78D4D4", "#D478A8",
  "#88B478", "#B49878", "#A8B4D4", "#D4B8A8",
  "#78A8D4", "#D478D4", "#A8D478",
];

function communityColor(c) {
  return COMMUNITY_COLORS[c % COMMUNITY_COLORS.length];
}

export default function ControlBar({
  communities,
  communityLabels,
  normCentrality,
  filters,
  onFiltersChange,
  totalNodes,
  visibleCount,
}) {
  const uniqueCommunities = [...new Set(Object.values(communities || {}))].sort(
    (a, b) => a - b
  );

  const hasActiveFilters =
    filters.searchQuery ||
    filters.communityFilter !== null ||
    filters.minCentrality > 0;

  const update = (key, value) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAll = () => {
    onFiltersChange({ searchQuery: "", communityFilter: null, minCentrality: 0 });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 44,
        borderBottom: "1px solid #1E2330",
        background: "#0D0F14",
        flexShrink: 0,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderRight: "1px solid #1A1E2A",
          height: "100%",
          gap: 8,
        }}
      >
        <span style={{ fontSize: 11, color: "#3A4460", flexShrink: 0 }}>Search</span>
        <input
          type="text"
          placeholder="Filter articles…"
          value={filters.searchQuery}
          onChange={(e) => update("searchQuery", e.target.value)}
          style={{
            background: "none",
            border: "none",
            outline: "none",
            color: "#C8CEDD",
            fontSize: 12,
            fontFamily: FONT,
            width: "100%",
            caretColor: "#78B4D4",
          }}
        />
      </div>

      {/* Community filter */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderRight: "1px solid #1A1E2A",
          height: "100%",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#3A4460", flexShrink: 0 }}>Community</span>
        <div style={{ position: "relative" }}>
          <select
            value={filters.communityFilter === null ? "" : String(filters.communityFilter)}
            onChange={(e) =>
              update(
                "communityFilter",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            style={{
              background: "#0F1119",
              border: "1px solid #2E3448",
              borderRadius: 3,
              color: "#C8CEDD",
              fontSize: 11,
              fontFamily: FONT,
              padding: "3px 22px 3px 8px",
              cursor: "pointer",
              appearance: "none",
              minWidth: 120,
            }}
          >
            <option value="">All</option>
            {uniqueCommunities.map((c) => (
              <option key={c} value={String(c)}>
                {communityLabels?.[c]?.label
                  ? communityLabels[c].label
                  : `Cluster ${c}`}
              </option>
            ))}
          </select>
          <span
            style={{
              position: "absolute",
              right: 7,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#3A4460",
              fontSize: 9,
              pointerEvents: "none",
            }}
          >
            ▼
          </span>
          {filters.communityFilter !== null && (
            <span
              style={{
                position: "absolute",
                left: -8,
                top: "50%",
                transform: "translateY(-50%)",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: communityColor(filters.communityFilter),
              }}
            />
          )}
        </div>
      </div>

      {/* Centrality slider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          borderRight: "1px solid #1A1E2A",
          height: "100%",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "#3A4460", flexShrink: 0 }}>
          Min centrality
        </span>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={filters.minCentrality}
          onChange={(e) => update("minCentrality", Number(e.target.value))}
          style={{ width: 90, accentColor: "#78B4D4", cursor: "pointer" }}
        />
        <span
          style={{
            fontSize: 10,
            color: filters.minCentrality > 0 ? "#78B4D4" : "#3A4460",
            width: 24,
            textAlign: "right",
            flexShrink: 0,
          }}
        >
          {filters.minCentrality}%
        </span>
      </div>

      {/* Clear + count */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          height: "100%",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            style={{
              background: "none",
              border: "1px solid #2E3448",
              borderRadius: 3,
              color: "#6878A0",
              cursor: "pointer",
              fontSize: 10,
              padding: "3px 8px",
              fontFamily: FONT,
              flexShrink: 0,
            }}
          >
            Clear
          </button>
        )}
        <span
          style={{
            fontSize: 10,
            color: hasActiveFilters ? "#78B4D4" : "#3A4460",
            fontStyle: "italic",
            flexShrink: 0,
          }}
        >
          {visibleCount} / {totalNodes}
        </span>
      </div>
    </div>
  );
}

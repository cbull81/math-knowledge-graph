import { getDomainBreakdown, domainColor } from "../utils/graphFilters.js";

const S = {
  panel: {
    width: 300,
    borderLeft: "1px solid #1E2330",
    background: "#0F1119",
    padding: "18px 16px",
    overflowY: "auto",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 18,
    fontFamily: "Georgia, serif",
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  heading: {
    fontSize: 10,
    color: "#4A5470",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    borderBottom: "1px solid #1A1E2A",
    paddingBottom: 6,
  },
  nodeCard: {
    padding: "12px 13px",
    borderRadius: 6,
    background: "#0C0E15",
    border: "1px solid #2A3050",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  nodeTitle: { fontSize: 14, fontWeight: "bold", color: "#E8EAF0" },
  nodeMeta: { fontSize: 10, color: "#4A5878" },
  nodeExtract: { fontSize: 11, color: "#6878A0", lineHeight: 1.75 },
  wikiLink: {
    fontSize: 10,
    color: "#3A5070",
    textDecoration: "none",
    borderBottom: "1px solid #2A3848",
    alignSelf: "flex-start",
  },
  domainBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  domainLabel: { fontSize: 10, color: "#7888A8", width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  domainBarTrack: { flex: 1, height: 3, background: "#1A1E2A", borderRadius: 2 },
};

export default function InfoPanel({
  selectedNode,
  edges,
  nodes,
  normCentrality,
  onNodeClick,
}) {
  const nodeMap = Object.fromEntries((nodes || []).map((n) => [n.id, n]));

  const connectedIds = selectedNode
    ? [...new Set(
        edges
          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
          .flatMap((e) => [e.source, e.target])
          .filter((id) => id !== selectedNode.id)
      )]
    : [];

  // Sort connections by centrality descending
  const sortedConnections = [...connectedIds].sort(
    (a, b) => (normCentrality[b] || 0) - (normCentrality[a] || 0)
  );

  const centralityPct = selectedNode
    ? Math.round((normCentrality[selectedNode.id] || 0) * 100)
    : null;

  const domainBreakdown = getDomainBreakdown(nodes || []);
  const maxDomainCount = domainBreakdown[0]?.[1] || 1;

  return (
    <div style={S.panel}>
      {/* Selected node detail */}
      {selectedNode && (
        <div style={S.section}>
          <div style={S.heading}>Selected</div>
          <div style={S.nodeCard}>
            <div style={S.nodeTitle}>{selectedNode.title}</div>
            <div style={S.nodeMeta}>
              {selectedNode.mathDomain && (
                <span
                  style={{
                    display: "inline-block",
                    background: "#1A1E2A",
                    borderRadius: 3,
                    padding: "1px 6px",
                    marginRight: 6,
                    color: domainColor(selectedNode.mathDomain),
                    fontSize: 9,
                    letterSpacing: "0.05em",
                  }}
                >
                  {selectedNode.mathDomain}
                </span>
              )}
              Centrality {centralityPct}%
            </div>
            {selectedNode.categories?.length > 0 && (
              <div style={{ ...S.nodeMeta, fontStyle: "italic" }}>
                {selectedNode.categories.slice(0, 3).join(" · ")}
              </div>
            )}
            {selectedNode.extract && (
              <div style={S.nodeExtract}>
                {selectedNode.extract.slice(0, 300)}
                {selectedNode.extract.length > 300 ? "…" : ""}
              </div>
            )}
            <a
              href={selectedNode.url}
              target="_blank"
              rel="noopener noreferrer"
              style={S.wikiLink}
            >
              Read on Wikipedia ↗
            </a>
          </div>

          {/* Connections list */}
          {sortedConnections.length > 0 && (
            <div style={S.section}>
              <div style={S.heading}>
                {sortedConnections.length} Connection{sortedConnections.length !== 1 ? "s" : ""}
              </div>
              {sortedConnections.map((id) => {
                const n = nodeMap[id];
                if (!n) return null;
                const color = domainColor(n.mathDomain);
                return (
                  <button
                    key={id}
                    onClick={() => onNodeClick(id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      width: "100%",
                      padding: "2px 0",
                      textAlign: "left",
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ fontSize: 11, color: "#7888A8", transition: "color 0.1s" }}
                      onMouseEnter={(e) => (e.target.style.color = "#A8C4DC")}
                      onMouseLeave={(e) => (e.target.style.color = "#7888A8")}
                    >
                      {n.title}
                    </span>
                    <span style={{ fontSize: 9, color: "#2A3450", marginLeft: "auto", flexShrink: 0 }}>
                      {Math.round((normCentrality[id] || 0) * 100)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Domain breakdown (always shown) */}
      {nodes?.length > 0 && (
        <div style={S.section}>
          <div style={S.heading}>Domain Breakdown</div>
          {domainBreakdown.slice(0, 15).map(([domain, count]) => (
            <div key={domain} style={S.domainBar}>
              <span style={{ ...S.domainLabel, color: domainColor(domain) }} title={domain}>
                {domain}
              </span>
              <div style={S.domainBarTrack}>
                <div
                  style={{
                    height: "100%",
                    width: `${(count / maxDomainCount) * 100}%`,
                    background: domainColor(domain),
                    borderRadius: 2,
                    opacity: 0.5,
                  }}
                />
              </div>
              <span style={{ fontSize: 9, color: "#3A4460", flexShrink: 0, width: 20, textAlign: "right" }}>
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

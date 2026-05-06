import { getDomainBreakdown } from "../utils/graphFilters.js";

const COMMUNITY_COLORS = [
  "#78B4D4", "#D4A878", "#A878D4", "#78D4A8",
  "#D47878", "#D4D478", "#78D4D4", "#D478A8",
  "#88B478", "#B49878", "#A8B4D4", "#D4B8A8",
  "#78A8D4", "#D478D4", "#A8D478",
];

function communityColor(c) {
  return COMMUNITY_COLORS[c % COMMUNITY_COLORS.length];
}

const S = {
  panel: {
    width: 340,
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
  communityCard: (c) => ({
    padding: "10px 11px",
    borderRadius: 5,
    background: "#0C0E15",
    borderLeft: `3px solid ${communityColor(c)}`,
  }),
  communityLabel: (c) => ({
    fontSize: 12,
    fontWeight: "bold",
    color: communityColor(c),
    marginBottom: 4,
  }),
  communityExpl: {
    fontSize: 11,
    color: "#6878A0",
    lineHeight: 1.7,
  },
  bridgeCard: {
    padding: "10px 11px",
    borderRadius: 5,
    background: "#0C0E15",
    border: "1px solid #2A3050",
  },
  bridgeTitle: { fontSize: 12, color: "#CDD0E5", fontWeight: "bold", marginBottom: 4 },
  bridgeExpl: { fontSize: 11, color: "#6878A0", lineHeight: 1.7 },
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
  spinner: {
    fontSize: 11,
    color: "#5A6890",
    fontStyle: "italic",
    lineHeight: 1.7,
    padding: "10px 0",
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
  communities,
  normCentrality,
  communityLabels,
  insights,
  insightsLoading,
  insightsError,
  onNodeClick,
}) {
  const nodeMap = Object.fromEntries((nodes || []).map((n) => [n.id, n]));

  const connectedIds = selectedNode
    ? new Set(
        edges
          .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
          .flatMap((e) => [e.source, e.target])
          .filter((id) => id !== selectedNode.id)
      )
    : null;

  const communityIndex = selectedNode ? communities[selectedNode.id] : null;
  const centralityPct = selectedNode
    ? Math.round((normCentrality[selectedNode.id] || 0) * 100)
    : null;

  const domainBreakdown = getDomainBreakdown(nodes || []);
  const maxDomainCount = domainBreakdown[0]?.[1] || 1;

  // Group connections by community, sorted by group size desc; within each group sort by centrality desc
  const connectionsByComm = {};
  if (connectedIds) {
    for (const id of connectedIds) {
      const c = communities[id] ?? 0;
      if (!connectionsByComm[c]) connectionsByComm[c] = [];
      connectionsByComm[c].push(id);
    }
    for (const group of Object.values(connectionsByComm)) {
      group.sort((a, b) => (normCentrality[b] || 0) - (normCentrality[a] || 0));
    }
  }
  const sortedComms = Object.keys(connectionsByComm)
    .map(Number)
    .sort((a, b) => connectionsByComm[b].length - connectionsByComm[a].length);

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
                    color: "#78B4D4",
                    fontSize: 9,
                    letterSpacing: "0.05em",
                  }}
                >
                  {selectedNode.mathDomain}
                </span>
              )}
              Community {communityIndex} · Centrality {centralityPct}%
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

          {/* Connections grouped by community */}
          {connectedIds && connectedIds.size > 0 && (
            <div style={S.section}>
              <div style={S.heading}>
                {connectedIds.size} Connection{connectedIds.size !== 1 ? "s" : ""}
              </div>
              {sortedComms.map((c) => (
                <div key={c} style={{ marginBottom: 6 }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: communityColor(c),
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 3,
                      paddingLeft: 2,
                    }}
                  >
                    {communityLabels?.[c]?.label || `Cluster ${c}`}
                    <span style={{ color: "#3A4460", marginLeft: 5 }}>
                      ({connectionsByComm[c].length})
                    </span>
                  </div>
                  {connectionsByComm[c].map((id) => {
                    const n = nodeMap[id];
                    if (!n) return null;
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
                            background: communityColor(c),
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 11,
                            color: "#7888A8",
                            transition: "color 0.1s",
                          }}
                          onMouseEnter={(e) => (e.target.style.color = "#A8C4DC")}
                          onMouseLeave={(e) => (e.target.style.color = "#7888A8")}
                        >
                          {n.title}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            color: "#2A3450",
                            marginLeft: "auto",
                            flexShrink: 0,
                          }}
                        >
                          {Math.round((normCentrality[id] || 0) * 100)}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Claude annotations */}
      {insightsLoading && (
        <div style={S.spinner}>Asking Claude to annotate community structure…</div>
      )}

      {insightsError && (
        <div
          style={{
            fontSize: 11,
            color: "#E07070",
            background: "#1A0E0E",
            border: "1px solid #E0707030",
            borderRadius: 5,
            padding: "10px 12px",
            lineHeight: 1.6,
          }}
        >
          Claude error: {insightsError}
        </div>
      )}

      {insights && (
        <>
          {/* Communities */}
          <div style={S.section}>
            <div style={S.heading}>Mathematical Communities</div>
            {Object.entries(insights.communities || {}).map(([c, info]) => (
              <div key={c} style={S.communityCard(Number(c))}>
                <div style={S.communityLabel(Number(c))}>{info.label}</div>
                <div style={S.communityExpl}>{info.explanation}</div>
              </div>
            ))}
          </div>

          {/* Bridges */}
          {insights.bridges?.length > 0 && (
            <div style={S.section}>
              <div style={S.heading}>Bridge Concepts</div>
              {insights.bridges.map((b, i) => (
                <div key={i} style={S.bridgeCard}>
                  <div style={S.bridgeTitle}>{b.title}</div>
                  <div style={S.bridgeExpl}>{b.explanation}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Domain breakdown (always shown) */}
      {nodes?.length > 0 && (
        <div style={S.section}>
          <div style={S.heading}>Domain Breakdown</div>
          {domainBreakdown.slice(0, 12).map(([domain, count]) => (
            <div key={domain} style={S.domainBar}>
              <span style={S.domainLabel} title={domain}>
                {domain}
              </span>
              <div style={S.domainBarTrack}>
                <div
                  style={{
                    height: "100%",
                    width: `${(count / maxDomainCount) * 100}%`,
                    background: "#78B4D4",
                    borderRadius: 2,
                    opacity: 0.6,
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

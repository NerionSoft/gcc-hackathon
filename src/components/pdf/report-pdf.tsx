import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Report, Verdict } from "@/types";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#1c2224" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 10, color: "#5b6467", marginBottom: 16 },
  scoreRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  scoreBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "#234a4d",
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: 20, fontWeight: 700 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#d7e6e6",
    paddingBottom: 3,
  },
  card: { marginBottom: 8, padding: 8, backgroundColor: "#faf9f7", borderRadius: 4 },
  cardTitle: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  badge: { fontSize: 8, fontWeight: 700, marginBottom: 3 },
  detail: { fontSize: 9, color: "#3a4245", lineHeight: 1.4 },
  sourceLine: { fontSize: 7, color: "#5b6467", marginTop: 3 },
  actionRow: { flexDirection: "row", marginBottom: 4 },
  actionBullet: { width: 10, fontSize: 9 },
  actionText: { fontSize: 9, flex: 1 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    fontSize: 7,
    color: "#5b6467",
    borderTopWidth: 1,
    borderTopColor: "#d7e6e6",
    paddingTop: 6,
  },
});

const VERDICT_LABEL: Record<Verdict, string> = {
  favorable: "FAVORABLE",
  vigilance: "VIGILANCE",
  alerte: "ALERT",
  indisponible: "DATA UNAVAILABLE",
};

const VERDICT_COLOR: Record<Verdict, string> = {
  favorable: "#2f7a4f",
  vigilance: "#a86a15",
  alerte: "#a13f3f",
  indisponible: "#6b7280",
};

export function ReportPdf({ report }: { report: Report }) {
  const generated = new Date(report.generatedAt).toLocaleString("en-GB");

  return (
    <Document title={`TerraVista — ${report.address.label}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>TerraVista — Property report</Text>
        <Text style={styles.subtitle}>
          {report.address.label} — generated on {generated}
        </Text>

        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreValue}>{report.globalScore}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 9 }}>{report.scoreExplanation}</Text>
        </View>

        {report.redFlags.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Priority red flags</Text>
            {report.redFlags.map((f) => (
              <View key={f.id} style={styles.card}>
                <Text style={styles.cardTitle}>{f.title}</Text>
                <Text style={styles.detail}>{f.explanation}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Analysis by domain</Text>
        {report.sections.map((s) => (
          <View key={s.domain} style={styles.card} wrap={false}>
            <Text style={[styles.badge, { color: VERDICT_COLOR[s.verdict] }]}>
              {VERDICT_LABEL[s.verdict]}
            </Text>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.detail}>{s.detail}</Text>
            <Text style={styles.sourceLine}>
              Source: {s.sources.map((src) => src.name).join(", ")}
            </Text>
          </View>
        ))}

        {report.actions.length > 0 && (
          <View break>
            <Text style={styles.sectionTitle}>Before you sign</Text>
            {report.actions.map((a, i) => (
              <View key={i} style={styles.actionRow}>
                <Text style={styles.actionBullet}>—</Text>
                <Text style={styles.actionText}>
                  {a.title} ({a.reason})
                </Text>
              </View>
            ))}
          </View>
        )}

        {report.warnings.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Limitations and missing data</Text>
            {report.warnings.map((w, i) => (
              <Text key={i} style={styles.detail}>
                • {w}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          TerraVista — a free, neutral citizen tool, public data only. See the &quot;Sources &amp;
          methodology&quot; page for details on each source and its limitations. This document does
          not replace the officially required diagnostics.
        </Text>
      </Page>
    </Document>
  );
}

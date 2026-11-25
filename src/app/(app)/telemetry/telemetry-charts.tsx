import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent } from "@/lib/utils";
import type { BanditArmStatRow, PerformanceTelemetryRow } from "@/types/domain";

type TelemetryChartRow = Pick<
  PerformanceTelemetryRow,
  "id" | "channel_label" | "impressions" | "views_3s" | "hook_rate" | "saves_or_clicks" | "ai_citations_count" | "recorded_at"
>;

type ArmChartRow = Pick<BanditArmStatRow, "arm_key" | "alpha" | "beta" | "pulls">;

const ARM_LABELS: Record<string, string> = {
  vace_pattern_interrupt: "Quebra de padrão",
  contrarian_frame: "Mito vs. Verdade",
  outcome_anchored: "Foco em resultado",
  negative_constraint: "Erro a evitar",
};

function humanArmLabel(armKey: string): string {
  const [angle = "", fw = ""] = armKey.split(":");
  return `${ARM_LABELS[angle] ?? angle}${fw ? ` (${fw.toUpperCase()})` : ""}`;
}

export function TelemetryCharts({
  rows,
  arms,
}: {
  rows: TelemetryChartRow[];
  arms: ArmChartRow[];
}) {
  if (rows.length === 0 && arms.length === 0) return null;

  const totalImpressions = rows.reduce((acc, r) => acc + Number(r.impressions || 0), 0);
  const totalSaves = rows.reduce((acc, r) => acc + Number(r.saves_or_clicks || 0), 0);
  const totalCitations = rows.reduce((acc, r) => acc + Number(r.ai_citations_count || 0), 0);
  const validHooks = rows.filter((r) => Number(r.impressions) > 0);
  const avgHookRate =
    validHooks.length > 0
      ? validHooks.reduce((acc, r) => acc + Number(r.hook_rate || 0), 0) / validHooks.length
      : 0;

  // Série cronológica (últimos 14 registros em ordem crescente)
  const timeline = [...rows]
    .slice(0, 14)
    .reverse()
    .map((r, idx) => ({
      idx,
      label: new Date(r.recorded_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      channel: r.channel_label,
      rate: Math.max(0, Math.min(1, Number(r.hook_rate || 0))),
    }));

  // Agrupamento por canal
  const byChannelMap = new Map<string, { impressions: number; saves: number; hookSum: number; count: number }>();
  for (const r of rows) {
    const key = r.channel_label || "Outro";
    const prev = byChannelMap.get(key) ?? { impressions: 0, saves: 0, hookSum: 0, count: 0 };
    prev.impressions += Number(r.impressions || 0);
    prev.saves += Number(r.saves_or_clicks || 0);
    prev.hookSum += Number(r.hook_rate || 0);
    prev.count += 1;
    byChannelMap.set(key, prev);
  }
  const channelBars = [...byChannelMap.entries()]
    .map(([channel, stats]) => ({
      channel,
      impressions: stats.impressions,
      avgHook: stats.count > 0 ? stats.hookSum / stats.count : 0,
      count: stats.count,
    }))
    .sort((a, b) => b.avgHook - a.avgHook)
    .slice(0, 6);

  // Coordenadas SVG do gráfico de linha/área (560x180)
  const chartW = 560;
  const chartH = 180;
  const padX = 28;
  const padY = 20;
  const plotW = chartW - padX * 2;
  const plotH = chartH - padY * 2;
  const maxRate = Math.max(0.5, ...timeline.map((p) => p.rate));

  const points = timeline.map((pt, i) => {
    const x = timeline.length === 1 ? padX + plotW / 2 : padX + (i / (timeline.length - 1)) * plotW;
    const y = padY + plotH - (pt.rate / maxRate) * plotH;
    return { ...pt, x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L${points[points.length - 1]!.x.toFixed(1)},${(padY + plotH).toFixed(1)} L${points[0]!.x.toFixed(1)},${(padY + plotH).toFixed(1)} Z`
      : "";
  const benchmarkY = padY + plotH - (0.3 / maxRate) * plotH;

  return (
    <div className="space-y-4">
      {/* KPIs resumidos */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="text-xs">Retenção média (3s)</CardDescription>
            <CardTitle className="font-mono text-2xl">{formatPercent(avgHookRate)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="text-xs">Impressões registradas</CardDescription>
            <CardTitle className="font-mono text-2xl">{totalImpressions.toLocaleString("pt-BR")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="text-xs">Salvamentos / cliques</CardDescription>
            <CardTitle className="font-mono text-2xl">{totalSaves.toLocaleString("pt-BR")}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-1.5">
            <CardDescription className="text-xs">Citações em IAs (GEO)</CardDescription>
            <CardTitle className="font-mono text-2xl">{totalCitations.toLocaleString("pt-BR")}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Gráfico de evolução de Hook Rate */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Evolução da Retenção nos 3s (Hook Rate)</CardTitle>
            <CardDescription className="text-xs">
              Últimos {timeline.length} registro(s). Linha tracejada indica a meta de 30%.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {points.length > 0 ? (
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="h-48 w-full overflow-visible"
                role="img"
                aria-label="Gráfico de evolução da taxa de retenção nos 3 primeiros segundos"
              >
                <defs>
                  <linearGradient id="hookAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FD3E01" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#FD3E01" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Linha base e meta 30% */}
                <line
                  x1={padX}
                  y1={padY + plotH}
                  x2={chartW - padX}
                  y2={padY + plotH}
                  stroke="currentColor"
                  strokeOpacity="0.15"
                />
                <line
                  x1={padX}
                  y1={benchmarkY}
                  x2={chartW - padX}
                  y2={benchmarkY}
                  stroke="#181331"
                  strokeOpacity="0.3"
                  strokeDasharray="4 4"
                />
                <text
                  x={chartW - padX}
                  y={benchmarkY - 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="currentColor"
                  opacity="0.6"
                >
                  Meta 30%
                </text>

                {areaPath ? <path d={areaPath} fill="url(#hookAreaGrad)" /> : null}
                {linePath ? (
                  <path d={linePath} fill="none" stroke="#FD3E01" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                ) : null}

                {points.map((p) => (
                  <g key={p.idx}>
                    <circle cx={p.x} cy={p.y} r="4.5" fill="#181331" stroke="#FFFFFF" strokeWidth="1.5">
                      <title>{`${p.label} (${p.channel}): ${formatPercent(p.rate)}`}</title>
                    </circle>
                    <text
                      x={p.x}
                      y={chartH - 3}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill="currentColor"
                      opacity="0.6"
                    >
                      {p.label}
                    </text>
                  </g>
                ))}
              </svg>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Registre o primeiro resultado abaixo para visualizar a curva de retenção.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gráfico de barras por canal + estilos vencedores */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Desempenho por Canal &amp; Estilos Vencedores</CardTitle>
            <CardDescription className="text-xs">
              Retenção média por canal e taxa estimada dos estilos aprendidos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {channelBars.length > 0 ? (
              <div className="space-y-2.5">
                {channelBars.map((item) => {
                  const pct = Math.min(100, Math.round(item.avgHook * 100));
                  return (
                    <div key={item.channel} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {item.channel} <span className="text-muted-foreground">({item.count})</span>
                        </span>
                        <span className="font-mono text-muted-foreground">{formatPercent(item.avgHook)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-navy transition-all"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {arms.length > 0 ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Top estilos de abertura
                </p>
                {arms.slice(0, 4).map((arm) => {
                  const score = arm.alpha / Math.max(1, arm.alpha + arm.beta);
                  const pct = Math.min(100, Math.round(score * 100));
                  return (
                    <div key={arm.arm_key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate text-foreground">{humanArmLabel(arm.arm_key)}</span>
                        <span className="font-mono text-muted-foreground">{pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-signal"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

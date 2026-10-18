import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  PieController,
  Title,
  Tooltip,
  type ChartData,
  type ChartOptions,
  type ChartType,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { useMemo } from "react";
import { Chart } from "react-chartjs-2";
import { PT, chartPalette, gridColor, resolveColor, type ChartElement, type Theme } from "../../model/deck";

ChartJS.register(
  // Generic <Chart type={...}> does not register controllers. Register them here
  // explicitly: production tree-shaking removes react-chartjs-2's unused typed charts.
  BarController, LineController, PieController, DoughnutController,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement,
  Title, Tooltip, Legend, Filler, ChartDataLabels,
);

/** グラフは Chart.js でネイティブに描く(画面上で動く)。pptx 書き出し時は別途ネイティブ化する */
export function ChartEl({ el, theme, isStatic }: { el: ChartElement; theme: Theme; isStatic: boolean }) {
  const spec = el.chart;
  const opt = spec.options ?? {};
  const isPie = spec.kind === "pie" || spec.kind === "doughnut";
  const textColor = resolveColor("dk1", theme, "#000000");
  const titleColor = resolveColor("dk2", theme, "#000000");
  const fontFamily = `"${theme.fonts.body}", sans-serif`;
  const grid = gridColor(theme);

  const { type, data, options } = useMemo(() => {
    const palette = chartPalette(theme, isPie ? spec.labels.length : spec.series.length, opt.colors);
    const type: ChartType = spec.kind === "hbar" ? "bar" : spec.kind === "area" ? "line" : spec.kind;
    const data: ChartData = {
      labels: spec.labels,
      datasets: spec.series.map((s, i) => ({
        label: s.name,
        data: s.values,
        backgroundColor: isPie ? palette : spec.kind === "area" ? palette[i] + "55" : palette[i],
        borderColor: isPie ? resolveColor("lt1", theme, "#FFFFFF") : palette[i],
        borderWidth: isPie ? 2 : spec.kind === "line" || spec.kind === "area" ? 2.5 : 0,
        fill: spec.kind === "area" ? "origin" : false,
        tension: 0.25,
        pointRadius: spec.kind === "line" || spec.kind === "area" ? 3 : 0,
      })),
    };
    const legendPos = opt.legend ?? (isPie || spec.series.length > 1 ? "bottom" : "none");
    const options: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: isStatic ? false : undefined,
      indexAxis: spec.kind === "hbar" ? "y" : "x",
      font: { family: fontFamily },
      plugins: {
        title: {
          display: !!spec.title,
          text: spec.title ?? "",
          color: titleColor,
          font: { family: fontFamily, size: 14 * PT, weight: "bold" },
          padding: { bottom: 12 },
        },
        legend: {
          display: legendPos !== "none",
          position: legendPos === "none" ? "bottom" : legendPos,
          labels: { color: textColor, font: { family: fontFamily, size: 11 * PT }, boxWidth: 12 },
        },
        tooltip: { enabled: !isStatic },
        datalabels: {
          display: opt.showValues ?? true,
          color: isPie ? "#FFFFFF" : textColor,
          anchor: isPie ? "center" : opt.stacked ? "center" : "end",
          align: isPie ? "center" : opt.stacked ? "center" : spec.kind === "hbar" ? "right" : "top",
          offset: 2,
          font: { family: fontFamily, size: 11 * PT },
          formatter: (v: number, ctx) => {
            if (!isPie) return v;
            const ds = ctx.dataset.data as number[];
            const total = ds.reduce((a, b) => a + (b || 0), 0);
            return total ? `${Math.round((v / total) * 100)}%` : "";
          },
        },
      },
      scales: isPie
        ? {}
        : {
            x: {
              stacked: !!opt.stacked,
              grid: { display: spec.kind === "hbar", color: grid },
              ticks: { color: textColor, font: { family: fontFamily, size: 11 * PT } },
              border: { display: false },
              // 値軸の上端に余白を取り、最大値のデータラベルがタイトルや枠に食い込まないようにする
              grace: spec.kind === "hbar" ? "12%" : undefined,
              beginAtZero: spec.kind === "hbar",
            },
            y: {
              stacked: !!opt.stacked,
              grid: { display: spec.kind !== "hbar", color: grid },
              ticks: { color: textColor, font: { family: fontFamily, size: 11 * PT } },
              border: { display: false },
              grace: spec.kind === "hbar" ? undefined : "12%",
              beginAtZero: true,
            },
          },
      layout: { padding: { top: 4, right: spec.kind === "hbar" ? 8 : 0 } },
    };
    if (spec.kind === "doughnut") (options as ChartOptions<"doughnut">).cutout = "55%";
    return { type, data, options };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opt は spec.options から導出
  }, [spec, theme, isPie, isStatic, textColor, titleColor, fontFamily, grid]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Chart type={type} data={data} options={options} />
    </div>
  );
}

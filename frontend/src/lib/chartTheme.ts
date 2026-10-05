const CHART_COLOR_TOKENS = {
  background: "--color-bg-card",
  primary: "--color-text-primary",
  grid: "--color-chart-grid",
  axis: "--color-chart-axis",
  border: "--color-border",
  crosshair: "--color-chart-crosshair",
  price: "--color-chart-price",
  entry: "--color-chart-entry",
  stop: "--color-chart-stop",
  target: "--color-chart-target",
} as const;

export type ChartTheme = Record<keyof typeof CHART_COLOR_TOKENS, string> & {
  entrySoft: string;
  stopSoft: string;
  targetSoft: string;
};

function withAlpha(color: string, alpha: number): string {
  const hex6 = color.match(/^#([\da-f]{6})$/i);
  if (hex6) {
    const value = hex6[1];
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  const hex3 = color.match(/^#([\da-f]{3})$/i);
  if (hex3) {
    const [r, g, b] = hex3[1].split("");
    const red = Number.parseInt(`${r}${r}`, 16);
    const green = Number.parseInt(`${g}${g}`, 16);
    const blue = Number.parseInt(`${b}${b}`, 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }
  throw new Error(`Expected a valid hex or rgb chart color, received: ${color}`);
}

export function getChartTheme(): ChartTheme {
  const style = window.getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(
    Object.entries(CHART_COLOR_TOKENS).map(([name, token]) => [name, style.getPropertyValue(token).trim()])
  ) as Record<keyof typeof CHART_COLOR_TOKENS, string>;

  const missing = Object.entries(colors).find(([, value]) => !value);
  if (missing) throw new Error(`Missing CSS color token for chart: ${missing[0]}`);

  return {
    ...colors,
    entrySoft: withAlpha(colors.entry, 0.56),
    stopSoft: withAlpha(colors.stop, 0.64),
    targetSoft: withAlpha(colors.target, 0.64),
  };
}

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getChartTheme } from "@/lib/chartTheme";

const LIGHT_TOKENS: Record<string, string> = {
  "--color-bg-card": "#FFFFFF",
  "--color-text-primary": "#17212E",
  "--color-chart-grid": "#E7EBF0",
  "--color-chart-axis": "#5D6878",
  "--color-border": "#D7DDE5",
  "--color-chart-crosshair": "#66768A",
  "--color-chart-price": "#354A65",
  "--color-chart-entry": "#245B96",
  "--color-chart-stop": "#89551F",
  "--color-chart-target": "#226644",
};

describe("getChartTheme", () => {
  beforeEach(() => {
    Object.entries(LIGHT_TOKENS).forEach(([token, value]) => {
      document.documentElement.style.setProperty(token, value);
    });
  });

  afterEach(() => {
    Object.keys(LIGHT_TOKENS).forEach((token) => {
      document.documentElement.style.removeProperty(token);
    });
  });

  it("resolves concrete chart colors from CSS variables", () => {
    const theme = getChartTheme();
    expect(theme.background).toBe("#FFFFFF");
    expect(theme.price).toBe("#354A65");
    expect(theme.entry).toBe("#245B96");
    expect(theme.entrySoft).toBe("rgba(36, 91, 150, 0.56)");
    expect(theme.stopSoft).toBe("rgba(137, 85, 31, 0.64)");
    expect(theme.targetSoft).toBe("rgba(34, 102, 68, 0.64)");
  });

  it("resolves 3-digit hex and rgb chart colors correctly", () => {
    document.documentElement.style.setProperty("--color-chart-target", "#264");
    document.documentElement.style.setProperty("--color-chart-stop", "rgb(137, 85, 31)");
    const theme = getChartTheme();
    expect(theme.targetSoft).toBe("rgba(34, 102, 68, 0.64)");
    expect(theme.stopSoft).toBe("rgba(137, 85, 31, 0.64)");
  });

  it("throws when a required chart token is missing", () => {
    document.documentElement.style.removeProperty("--color-chart-price");
    expect(() => getChartTheme()).toThrow(/Missing CSS color token for chart: price/);
  });
});

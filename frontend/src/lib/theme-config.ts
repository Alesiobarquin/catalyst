export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "catalyst-theme";
export const THEME_CHANGE_EVENT = "catalyst-theme-change";
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export const THEME_BOOTSTRAP_SCRIPT = `try {
  var savedTheme = window.localStorage.getItem("${THEME_STORAGE_KEY}");
  if (savedTheme === "light" || savedTheme === "dark") {
    document.documentElement.dataset.theme = savedTheme;
  }
} catch (_) {}`;

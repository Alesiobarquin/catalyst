import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  document.documentElement.dataset.theme = "light";
  window.localStorage.removeItem("catalyst-theme");
});

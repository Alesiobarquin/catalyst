import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NavClock } from "@/components/layout/NavClock";

describe("NavClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders formatted time string after mounting", () => {
    const fixedDate = new Date("2026-09-28T18:30:45Z");
    vi.setSystemTime(fixedDate);

    render(<NavClock />);

    expect(screen.getByText("Data as of 14:30:45 ET")).toBeInTheDocument();
  });

  it("updates clock display every second", () => {
    const fixedDate = new Date("2026-09-28T13:15:00Z");
    vi.setSystemTime(fixedDate);

    render(<NavClock />);

    expect(screen.getByText("Data as of 09:15:00 ET")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Data as of 09:15:05 ET")).toBeInTheDocument();
  });
});

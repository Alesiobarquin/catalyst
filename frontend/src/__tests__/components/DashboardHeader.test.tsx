import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

describe("DashboardHeader", () => {
  it("renders heading and subtitle", () => {
    render(<DashboardHeader />);

    expect(
      screen.getByRole("heading", { name: "Overview" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Recommendations below come from the connected pipeline/i)
    ).toBeInTheDocument();
  });
});

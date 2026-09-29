import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "@/app/not-found";

describe("NotFound Page", () => {
  it("renders 404 header and return dashboard link", () => {
    render(<NotFound />);

    expect(screen.getByText(/404 \/\/ Route Not Found/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Terminal Node Offline" })).toBeInTheDocument();
    expect(screen.getByText(/The requested path does not map to an active signal stream/i)).toBeInTheDocument();

    const returnLink = screen.getByRole("link", { name: /Return to Dashboard/i });
    expect(returnLink).toBeInTheDocument();
    expect(returnLink).toHaveAttribute("href", "/");
  });
});

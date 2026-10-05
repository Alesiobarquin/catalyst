import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NotFound from "@/app/not-found";

describe("NotFound Page", () => {
  it("renders plain 404 copy and a return dashboard link", () => {
    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText(/The address may be incorrect/i)).toBeInTheDocument();

    const returnLink = screen.getByRole("link", { name: /Return to Dashboard/i });
    expect(returnLink).toBeInTheDocument();
    expect(returnLink).toHaveAttribute("href", "/");
  });
});

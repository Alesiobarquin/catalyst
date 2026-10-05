import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Pagination } from "@/components/ui/Pagination";

// Mock next/link
vi.mock("next/link", () => {
  return {
    default: ({ children, href, style, ...props }: any) => {
      return (
        <a href={href} style={style} data-testid="next-link" {...props}>
          {children}
        </a>
      );
    },
  };
});

describe("Pagination", () => {
  it("renders null when total pages <= 1", () => {
    const { container } = render(
      <Pagination page={1} total={10} perPage={10} basePath="/signals" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders correctly with multiple pages", () => {
    render(<Pagination page={1} total={50} perPage={10} basePath="/signals" />);
    
    expect(screen.getByText(/Page 1 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/\(50 total\)/)).toBeInTheDocument();
  });

  it("renders previous as non-interactive text on the first page", () => {
    render(<Pagination page={1} total={50} perPage={10} basePath="/signals" />);
    
    expect(screen.getByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
    const previous = screen.getByText("← Previous");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "← Previous" })).not.toBeInTheDocument();
    
    expect(screen.getByRole("link", { name: "Next →" })).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 5/)).toHaveAttribute("aria-current", "page");
  });

  it("renders next as non-interactive text on the last page", () => {
    render(<Pagination page={5} total={50} perPage={10} basePath="/signals" />);
    
    expect(screen.getByRole("link", { name: "← Previous" })).toBeInTheDocument();
    
    const next = screen.getByText("Next →");
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("link", { name: "Next →" })).not.toBeInTheDocument();
  });

  it("constructs correct hrefs with query params", () => {
    render(
      <Pagination 
        page={2} 
        total={50} 
        perPage={10} 
        basePath="/signals" 
        query={{ status: "ACTIVE", ticker: "AAPL" }} 
      />
    );
    
    const prevLink = screen.getByRole("link", { name: "← Previous" });
    expect(prevLink).toHaveAttribute("href", "/signals?status=ACTIVE&ticker=AAPL");
    
    const nextLink = screen.getByRole("link", { name: "Next →" });
    expect(nextLink).toHaveAttribute("href", "/signals?status=ACTIVE&ticker=AAPL&page=3");
  });

  it("replaces the current page query while retaining other filters", () => {
    render(
      <Pagination
        page={2}
        total={50}
        perPage={10}
        basePath="/signals"
        query={{ ticker: "NVDA", strategy: "Supernova", page: "2" }}
      />
    );

    expect(screen.getByRole("link", { name: "← Previous" })).toHaveAttribute(
      "href",
      "/signals?ticker=NVDA&strategy=Supernova"
    );
    expect(screen.getByRole("link", { name: "Next →" })).toHaveAttribute(
      "href",
      "/signals?ticker=NVDA&strategy=Supernova&page=3"
    );
  });

  it("omits empty query parameters", () => {
    render(
      <Pagination 
        page={2} 
        total={50} 
        perPage={10} 
        basePath="/signals" 
        query={{ status: "ACTIVE", strategy: "" }} 
      />
    );
    
    const nextLink = screen.getByRole("link", { name: "Next →" });
    expect(nextLink).toHaveAttribute("href", "/signals?status=ACTIVE&page=3");
  });
});

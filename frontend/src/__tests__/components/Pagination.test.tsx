import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Pagination } from "@/components/ui/Pagination";

// Mock next/link
vi.mock("next/link", () => {
  return {
    default: ({ children, href, style }: any) => {
      return (
        <a href={href} style={style} data-testid="next-link">
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

  it("disables previous link on first page", () => {
    render(<Pagination page={1} total={50} perPage={10} basePath="/signals" />);
    
    const prevLink = screen.getByText("← Previous");
    expect(prevLink).toHaveStyle({ pointerEvents: "none" });
    
    const nextLink = screen.getByText("Next →");
    expect(nextLink).not.toHaveStyle({ pointerEvents: "none" });
  });

  it("disables next link on last page", () => {
    render(<Pagination page={5} total={50} perPage={10} basePath="/signals" />);
    
    const prevLink = screen.getByText("← Previous");
    expect(prevLink).not.toHaveStyle({ pointerEvents: "none" });
    
    const nextLink = screen.getByText("Next →");
    expect(nextLink).toHaveStyle({ pointerEvents: "none" });
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
    
    const prevLink = screen.getByText("← Previous");
    expect(prevLink).toHaveAttribute("href", "/signals?status=ACTIVE&ticker=AAPL");
    
    const nextLink = screen.getByText("Next →");
    expect(nextLink).toHaveAttribute("href", "/signals?status=ACTIVE&ticker=AAPL&page=3");
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
    
    const nextLink = screen.getByText("Next →");
    expect(nextLink).toHaveAttribute("href", "/signals?status=ACTIVE&page=3");
  });
});

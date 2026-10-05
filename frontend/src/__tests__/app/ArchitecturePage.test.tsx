import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import ArchitecturePage from "@/app/architecture/page";

describe("ArchitecturePage", () => {
  it("renders the page header with title and subtitle", () => {
    render(<ArchitecturePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "How It Works" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/engineering behind Catalyst/i)
    ).toBeInTheDocument();
  });

  it("renders the three problem cards in the hero section", () => {
    render(<ArchitecturePage />);

    expect(screen.getByText("The Noise Problem")).toBeInTheDocument();
    expect(screen.getByText("The Cost Problem")).toBeInTheDocument();
    expect(screen.getByText("The Math Problem")).toBeInTheDocument();
  });

  it("renders all 5 pipeline stages", () => {
    render(<ArchitecturePage />);

    expect(screen.getByText("1. Ingestion")).toBeInTheDocument();
    expect(screen.getByText("2. Confluence Filter")).toBeInTheDocument();
    expect(screen.getByText("3. AI Validation")).toBeInTheDocument();
    expect(screen.getByText("4. Quantitative Sizing")).toBeInTheDocument();
    expect(screen.getByText("5. Execution & Resolution")).toBeInTheDocument();
  });

  it("renders tech badges for pipeline stages", () => {
    render(<ArchitecturePage />);

    // These appear in both pipeline stages and tech stack grid, so use getAllByText
    expect(screen.getAllByText("Python 3.12").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Playwright").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Redis 7").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Google GenAI SDK")).toBeInTheDocument();
    expect(screen.getAllByText("Java 21").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Spring Boot 3.4").length).toBeGreaterThanOrEqual(1);
  });

  it("renders the architectural decision questions", () => {
    render(<ArchitecturePage />);

    expect(
      screen.getByText(/Why three languages/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Why Apache Kafka over Redis/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Why Redis Sorted Sets/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Why Half-Kelly/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Why scheduled EC2/i)
    ).toBeInTheDocument();
  });

  it("expands an ADR card on click to reveal its content", async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);

    const kafkaButton = screen.getByText(/Why Apache Kafka over Redis/i);

    // Content should not be visible initially
    expect(screen.queryByText(/Durable event replay/i)).not.toBeInTheDocument();

    // Click to expand
    await user.click(kafkaButton);

    // Content should now be visible
    expect(screen.getByText(/Durable event replay/i)).toBeInTheDocument();
  });

  it("renders the engineering quality section with test count", () => {
    render(<ArchitecturePage />);

    expect(screen.getByText("511")).toBeInTheDocument();
    expect(screen.getByText("Automated Tests")).toBeInTheDocument();
    expect(screen.getByText("301 Python · 36 Java · 174 Vitest")).toBeInTheDocument();
  });

  it("renders the resilience pattern tags", () => {
    render(<ArchitecturePage />);

    expect(screen.getByText("Alpaca execution circuit breaker")).toBeInTheDocument();
    expect(screen.getByText("Gemini model fallback chain")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions 3-job CI matrix")).toBeInTheDocument();
  });

  it("renders the What I Learned section with all four lessons", () => {
    render(<ArchitecturePage />);

    expect(screen.getByText(/Event-driven complexity vs. monolith simplicity/i)).toBeInTheDocument();
    expect(screen.getByText(/Confluence filtering as AI cost control/i)).toBeInTheDocument();
    expect(screen.getByText(/Deterministic math belongs in a typed language/i)).toBeInTheDocument();
    expect(screen.getByText(/Closed-loop validation changes everything/i)).toBeInTheDocument();
  });

  it("renders the tech stack grid with key technologies", () => {
    render(<ArchitecturePage />);

    // Some tech names appear in both pipeline stages and grid, use getAllByText
    expect(screen.getAllByText("Next.js 16").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("React 19").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Apache Kafka").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("TimescaleDB").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Google Gemini 2.5").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("AWS CDK").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Docker").length).toBeGreaterThanOrEqual(1);
  });
});

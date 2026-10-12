import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import ArchitecturePage from "@/app/architecture/page";

describe("ArchitecturePage", () => {
  it("explains the project and provides routes to the source and current scan", () => {
    render(<ArchitecturePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Engineering notebook" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse the repository/ })).toHaveAttribute("href", "https://github.com/Alesiobarquin/catalyst");
    expect(screen.getByRole("link", { name: /Read the latest scan/ })).toHaveAttribute("href", "/");
    expect(screen.getByText(/local application retains an API-backed dashboard/i)).toBeInTheDocument();
  });

  it("connects the five processing stages to inspectable implementations", () => {
    render(<ArchitecturePage />);
    const pipeline = screen.getByRole("region", { name: "Five stages, one published snapshot" });
    for (const name of ["Collect", "Find confluence", "Validate evidence", "Size a recommendation", "Publish and observe"]) {
      expect(within(pipeline).getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(within(pipeline).getByRole("link", { name: /Confluence filter/ })).toHaveAttribute("href", expect.stringContaining("gatekeeper/gatekeeper.py"));
    expect(within(pipeline).getByText(/public profile requires two sources/i)).toBeInTheDocument();
    expect(within(pipeline).getByText(/Missing or stale regime data halts sizing/i)).toBeInTheDocument();
    expect(within(pipeline).getByText(/public brokerage execution is disabled/i)).toBeInTheDocument();
  });

  it("provides working in-page section destinations", () => {
    render(<ArchitecturePage />);
    const contents = screen.getByRole("navigation", { name: "Engineering sections" });
    for (const link of within(contents).getAllByRole("link")) {
      const target = link.getAttribute("href")?.slice(1);
      expect(target).toBeTruthy();
      expect(document.getElementById(target!)).toBeInTheDocument();
    }
  });

  it("opens and closes an ADR with keyboard input and accessible disclosure state", async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    const trigger = screen.getByRole("button", { name: /Why Apache Kafka over Redis/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const panel = document.getElementById(trigger.getAttribute("aria-controls")!);
    expect(panel).toHaveAttribute("hidden");
    expect(panel).toHaveAttribute("aria-labelledby", trigger.id);
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(within(panel!).getByText(/Durable event replay/)).toBeVisible();
    expect(within(panel!).getByRole("link", { name: /Persistence consumer/ })).toHaveAttribute("href", expect.stringContaining("persistence/consumer.py"));
    await user.keyboard(" ");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });

  it("keeps sizing assumptions and absent risk controls explicit", async () => {
    const user = userEvent.setup();
    render(<ArchitecturePage />);
    await user.click(screen.getByRole("button", { name: /Why Half-Kelly/ }));
    expect(screen.getByText(/not a calibrated win probability/i)).toBeVisible();
    expect(screen.getByText(/no aggregate per-ticker exposure limit/i)).toBeVisible();
  });

  it("links observed changes to regression evidence", () => {
    render(<ArchitecturePage />);
    const observations = screen.getByRole("region", { name: "Changes supported by checks" });
    expect(within(observations).getByText(/double-encoded VIX URL/i)).toBeInTheDocument();
    expect(within(observations).getByRole("link", { name: /HTTP regression test/ })).toHaveAttribute("href", expect.stringContaining("MarketDataServiceTest.java"));
    expect(within(observations).getByText(/did not establish an organic validated catalyst/i)).toBeInTheDocument();
    expect(within(observations).getByText(/uploads an immutable dataset and private backup before promoting/i)).toBeInTheDocument();
  });

  it("dates the test count and distinguishes controlled checks from investment performance", () => {
    render(<ArchitecturePage />);
    expect(screen.getByText(/October 5, 2026 release recorded/i)).toHaveTextContent("524 automated tests");
    expect(screen.getByRole("table", { name: "Different checks answer different questions" })).toBeInTheDocument();
    expect(screen.getByText(/Daily sampling can miss intraday crossings/i)).toBeInTheDocument();
    expect(screen.getByText(/no measured live 50–100 events\/minute artifact/i)).toBeInTheDocument();
    expect(screen.getByText(/Zero results alone do not identify which check rejected an event/i)).toBeInTheDocument();
  });
});

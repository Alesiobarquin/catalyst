import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveStreamBanner } from "@/components/signals/LiveStreamBanner";

const mockRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  listeners: Record<string, ((e: any) => void)[]> = {};
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(event: string, cb: (e: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  removeEventListener(event: string, cb: (e: any) => void) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter((l) => l !== cb);
  }

  emit(event: string, data: any) {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) {
      h({ data: typeof data === "string" ? data : JSON.stringify(data) });
    }
  }

  close() {
    this.closed = true;
  }
}

describe("LiveStreamBanner", () => {
  const originalEventSource = global.EventSource;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    MockEventSource.instances = [];
    // @ts-expect-error Mocking global EventSource
    global.EventSource = MockEventSource;

    // Mock AudioContext
    const mockOscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const mockGain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
    window.AudioContext = vi.fn().mockImplementation(() => ({
      state: "running",
      currentTime: 0,
      destination: {},
      createOscillator: () => mockOscillator,
      createGain: () => mockGain,
      resume: vi.fn().mockResolvedValue(undefined),
    })) as unknown as typeof AudioContext;
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
  });

  it("renders connecting state and SSE endpoint label initially", () => {
    render(<LiveStreamBanner />);

    expect(screen.getByText("CONNECTING...")).toBeInTheDocument();
    expect(screen.getByText("SSE /signals/stream")).toBeInTheDocument();
    expect(screen.getByText("Listening for live engine triggers...")).toBeInTheDocument();
  });

  it("transitions to STREAM LIVE when SSE connection opens", () => {
    render(<LiveStreamBanner />);

    expect(MockEventSource.instances.length).toBe(1);
    const es = MockEventSource.instances[0];

    act(() => {
      es.onopen?.();
    });

    expect(screen.getByText("STREAM LIVE")).toBeInTheDocument();
  });

  it("updates alert badge and ticker info on receiving signal event", () => {
    render(<LiveStreamBanner />);

    const es = MockEventSource.instances[0];

    act(() => {
      es.onopen?.();
      es.emit("signal", {
        ticker: "TSLA",
        conviction_score: 88,
        catalyst_type: "SUPERNOVA",
      });
    });

    expect(screen.getByText("1 new signal")).toBeInTheDocument();
    expect(screen.getByText("TSLA")).toBeInTheDocument();
    expect(screen.getByText("88% conv.")).toBeInTheDocument();
    expect(screen.getByText("Load Now")).toBeInTheDocument();

    // Second signal increments count
    act(() => {
      es.emit("signal", {
        ticker: "NVDA",
        conviction_score: 95,
        catalyst_type: "SUPERNOVA",
      });
    });

    expect(screen.getByText("2 new signals")).toBeInTheDocument();
    expect(screen.getByText("NVDA")).toBeInTheDocument();
  });

  it("clicking Load Now triggers router refresh and resets new count", () => {
    render(<LiveStreamBanner />);

    const es = MockEventSource.instances[0];

    act(() => {
      es.onopen?.();
      es.emit("signal", {
        ticker: "AAPL",
        conviction_score: 85,
      });
    });

    const loadBtn = screen.getByText("Load Now");
    fireEvent.click(loadBtn);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Listening for live engine triggers...")).toBeInTheDocument();
    expect(screen.queryByText("1 new signal")).not.toBeInTheDocument();
  });

  it("toggles auto-sync and persists preference in localStorage", () => {
    render(<LiveStreamBanner />);

    const autoSyncBtn = screen.getByText("Auto-sync");
    expect(localStorage.getItem("catalyst_stream_autoreload")).toBeNull();

    fireEvent.click(autoSyncBtn);
    expect(localStorage.getItem("catalyst_stream_autoreload")).toBe("true");

    fireEvent.click(autoSyncBtn);
    expect(localStorage.getItem("catalyst_stream_autoreload")).toBe("false");
  });

  it("toggles audio chime and persists preference in localStorage", () => {
    render(<LiveStreamBanner />);

    const chimeBtn = screen.getByText("Chime Off");
    expect(chimeBtn).toBeInTheDocument();

    fireEvent.click(chimeBtn);
    expect(screen.getByText("Chime On")).toBeInTheDocument();
    expect(localStorage.getItem("catalyst_stream_sound")).toBe("true");

    fireEvent.click(screen.getByText("Chime On"));
    expect(screen.getByText("Chime Off")).toBeInTheDocument();
    expect(localStorage.getItem("catalyst_stream_sound")).toBe("false");
  });

  it("transitions to DISCONNECTED on SSE connection error", () => {
    render(<LiveStreamBanner />);

    const es = MockEventSource.instances[0];

    act(() => {
      es.onerror?.();
    });

    expect(screen.getByText("DISCONNECTED")).toBeInTheDocument();
    expect(es.closed).toBe(true);
  });
});

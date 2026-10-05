"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { searchTickers } from "@/lib/api";

interface TickerSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  width?: number | string;
}

export function TickerSearchInput({
  value,
  onChange,
  onSubmit,
  onClear,
  placeholder = "Search ticker...",
  width = 160,
}: TickerSearchInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    const query = value.trim();
    const timer = setTimeout(async () => {
      if (!query) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }
      setIsLoading(true);
      try {
        const results = await searchTickers(query);
        const tickers = results.map((r) => r.ticker);
        setSuggestions(tickers);
        setIsOpen(tickers.length > 0);
        setHighlightIndex(-1);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [value]);


  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(ticker: string) {
    onChange(ticker);
    setIsOpen(false);
    setSuggestions([]);
    startTransition(() => {
      onSubmit(ticker);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        onSubmit(value);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        handleSelect(suggestions[highlightIndex]);
      } else {
        onSubmit(value);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-block",
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
            handleSelect(suggestions[highlightIndex]);
          } else {
            onSubmit(value);
            setIsOpen(false);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--color-bg-row)",
          border: isOpen ? "1px solid var(--color-link)" : "1px solid var(--color-border)",
          borderRadius: 4,
          padding: "4px 8px",
          transition: "border-color 150ms ease",
        }}
      >
        {isLoading ? (
          <Loader2 size={14} color="var(--color-text-muted)" className="animate-spin" />
        ) : (
          <Search size={14} color="var(--color-text-muted)" />
        )}
        <input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck="false"
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--color-text-primary)",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            width,
          }}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSuggestions([]);
              setIsOpen(false);
              if (onClear) onClear();
              else onSubmit("");
              inputRef.current?.focus();
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              color: "var(--color-text-muted)",
            }}
            title="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </form>

      {/* Autocomplete Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: 180,
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            boxShadow: "0 10px 25px -5px var(--color-scrim), 0 8px 10px -6px var(--color-scrim)",
            zIndex: 60,
            overflow: "hidden",
            padding: "4px 0",
          }}
        >
          <div
            style={{
              padding: "4px 8px 2px 8px",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--color-text-muted)",
              fontWeight: 600,
            }}
          >
            Tracked Assets
          </div>
          {suggestions.map((ticker, idx) => {
            const isHighlighted = idx === highlightIndex;
            return (
              <div
                key={ticker}
                onMouseEnter={() => setHighlightIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevents input blur before selection
                  handleSelect(ticker);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: isHighlighted ? "var(--color-bg-row)" : "transparent",
                  color: isHighlighted ? "var(--color-link)" : "var(--color-text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  fontWeight: 600,
                  transition: "background 100ms ease",
                }}
              >
                <span>{ticker}</span>
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--color-text-muted)",
                    background: "var(--color-bg-row)",
                    padding: "2px 5px",
                    borderRadius: 3,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                  }}
                >
                  SELECT ↵
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

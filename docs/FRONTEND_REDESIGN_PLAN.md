# Catalyst frontend redesign plan

October 11, 2026. Implemented locally and verified; no public deployment changes. This research workspace is saved on `design/research-workspace-20261011` at `96e5af1`. The subsequent trading terminal iteration is recorded in [AGENTS.md](../AGENTS.md#trading-terminal-design-branch-october-11-2026) and developed on `design/trading-terminal`.

## Purpose and audience

Catalyst is a daily market-signal research pipeline and an engineering project. A recruiter should understand its scope and find the source quickly. An engineer should inspect the decisions that affect an output: bounded ingestion, source confluence, grounded analysis, regime-aware sizing, and atomic snapshot publication. Public execution is disabled. Modeled outcomes are not brokerage returns. No processing-throughput claim should be made without a measured artifact.

The defining interface should be a dated scan ledger and evidence-centered recommendation records. The project has meaningful information even when it produces zero recommendations.

## Findings from the current implementation

The CSS already uses a restrained neutral theme, Inter and JetBrains Mono, semantic tokens, accessible theme switching and mobile controls. Cards, glass cards, stat cards and trade cards share a white surface, thin border and 6px radius. Several radius tokens resolve to the same value; shadows are disabled. Headings are approximately 28px, with 17–18px section titles and many 12–14px secondary labels. The main container is 1280px wide. Independent information types largely use the same panel grammar.

PublicDashboard already suppresses empty KPI/chart grids and unused filters. Its sequence is title, snapshot status, results/empty state, and benchmarks. The issue is not an empty KPI grid: useful scan evidence remains secondary or collapsed, while the main body emphasizes the absence of recommendations. This proposal supersedes the existing theme plan's layout and typography grammar while preserving its accessibility, semantic colors, saved theme behavior and chart theming.

README review found presentation inconsistencies: the public deployment section is dated October 5, while another section still describes AWS publication as unimplemented. The production-grade and institutional-grade wording should be replaced with bounded, inspectable claims in the eventual copy pass. Deployment facts should be reverified before updating their dates.

## Industry references

- Koyfin: https://www.koyfin.com/ — research tasks organized around watchlists, dashboards, screeners and graphing. Borrow the coherent research workspace, aligned tables and chart/detail context.
- Quartr Pro: https://quartr.com/products/quartr-pro — research tied to cited source material, transcript context, structured metrics and events. Borrow the connection between a conclusion and the material supporting it.

Official product content and screenshots were inspected. [Koyfin watchlists](https://www.koyfin.com/wp-content/uploads/2023/01/features-watchlists.png) show ruled rows and aligned numeric columns; [Quartr transcripts](https://a.storyblok.com/f/182663/168629/b1478e485f/variant-01-pro-live_transcripts_audio_min.jpg) place a reading surface beside supporting material. These are official promotional assets, not verification of the authenticated apps' exact current appearance. The geometry below is specific to Catalyst.

## Proposed information architecture

Preserve the existing public routes. Label them Overview (/), Signal archive (/signals), Modeled outcomes (/analytics), and Engineering (/architecture). Use a compact header and a narrow desktop navigation rail, with a compact mobile route menu. Keep the GitHub source link visible. Collection time should have greater prominence than the ticking New York clock.

Overview: one factual sentence explaining the project, then a dated scan record. Show publication status, collection time, and the distinction between published data and a newer attempt. Present available raw, triage and validated counters as a single connected strip rather than separate KPI cards. Show a five-hunter ledger: hunter/provider, completion, duration, emitted events and sanitized failure. Recommendations follow as an aligned table. Benchmarks remain supporting context. A small adjacent reading column explains acceptance rules and links to Engineering.

On mobile, show the collection summary and recommendation outcome early; put the full hunter ledger behind a clearly named disclosure. Do not force readers through five tall report cards before reaching results.

Signal archive: one cohesive toolbar, results count and a semantic table. Prioritize ticker, catalyst, source count when supplied, conviction, collection time and entry/stop/target. Use tabular numerals and consistent numeric alignment. Keep badges sparse. Maintain obvious selected-row and keyboard focus states. Mobile rows should retain ticker, catalyst and score first, with clearly labeled secondary fields.

Signal detail: a research record with thesis, source names, rationale, risks and analysis method/model beside an annotated price chart. Keep collection timestamps visible. Display missing history explicitly. Original-source citation links, authentic event timelines and exact per-event rejection reasons are conditional on a verified data contract; they must not be fabricated from a front-end shape or inferred from zero results.

Modeled outcomes: disclose the measurement method next to the results. Where there are no resolved recommendations, lead with the sample size and methodology. Keep the illustrative Kelly calculator as a distinct tool, with probability labeled as an assumption and Java caps described separately.

Engineering: replace repetitive feature panels with a readable project notebook. Use a five-stage pipeline whose decisions link to actual code, tests and verified evidence. Give detailed treatment to confluence, grounding enforcement, missing/stale regime halt and snapshot promotion. Explain what changed after observed failures. Keep unmeasured capacity and daily-sampling limits explicit.

## Visual system

Use an editorial research workspace: strong ink text, subdued neutral page background, white primary reading surfaces, thin rules and one interaction accent. Retain the existing semantic token system. Increasing saturation or adding gradients is not the main change.

Prototype a 56px header, approximately 192–208px desktop rail, and an 8/4 primary/context content split. Use roughly 32–36px page titles, 20–22px section titles and 15–16px reading text. Dense data rows may use 13–14px text; keep long-form explanations larger. These are starting values to validate in rendered views.

Ordinary sections use whitespace and separators. Tables use shared column alignment. Charts use an open plotting region. Operational warnings use a distinct narrow status treatment. The calculator has a genuine task boundary. Avoid applying the same rounded rectangle to all five objects. Numeric cells get tabular figures; monospace is reserved for tickers, timestamps, IDs and code.

A consistent five-source-to-confluence path can provide a Catalyst-specific visual motif, used in the scan strip and engineering diagram. It must communicate the pipeline rather than decorate unrelated controls.

## Data boundary

Available in reviewed snapshot types: hunter success/error/duration/emitted_events, event_counts, commit/run_id/as_of and regime freshness. ValidatedSignal includes source names/count, rationale, risks and analysis_method/model. Grounding citation URLs and exact raw-event rejection reasons were not found. SignalDetail defines timeline/rawFactors shapes, but authentic exporter population was not established.

The first implementation should use available fields. An optional later provenance expansion requires a backend/exporter audit, bounded public fields, sanitized output, schema tests and documentation. A controlled example must be labeled as a fixture and separated from actual public results. Do not substitute sample recommendations into a zero-result organic snapshot.

## Implementation sequence

1. Design two complete overview compositions and a signal-detail composition using the actual empty/partial snapshot plus a clearly labeled populated fixture. Review desktop and mobile renders before writing a broad CSS refactor. Select the scan-ledger direction using legibility and evidence discovery, not visual novelty alone.
2. Rework the shared shell and purpose-specific CSS primitives. Focus on globals.css, public layouts and navigation; preserve theme/store/canvas behavior and local API-backed operation.
3. Recompose PublicDashboard, SnapshotStatus, EmptyResults, the shared signal table and detail view around the scan ledger and recommendation record.
4. Rewrite the architecture and modeled-outcomes pages around code, methods and observed limits. Reconcile README public/local scope and stale deployment wording.
5. Verify both ordinary and public static builds, existing relevant frontend tests and browser behavior. Review empty, partial, populated-fixture, missing-history and long-error states in both themes at 1440px, 390px and 320px. Check keyboard navigation, 200% zoom, overflow, saved theme and chart range preservation.

Acceptance: a first-time reader can explain the project, locate source code, identify the collection date and partial status, inspect hunter outcomes and find the acceptance rules. A selected recommendation's evidence and limits are discoverable without navigating through repeated marketing panels. Empty results remain useful and honest.


## Implementation and review

The shared shell now uses a compact header, desktop research rail and mobile route strip. Public overview uses a dated scan ledger and a distinct acceptance-rules column. Empty desktop runs expand the hunter report; populated runs keep recommendations closer to the top. Unknown per-run counters remain explicitly unexported.

Recommendations use a semantic table with aligned levels and allocation, inline chart expansion and an analysis inspector. Signals expose rationale, risks, supplied method/model and saved quotes. The inspector omits constructed timeline/exchange/engine/scenario fields that the current order-detail endpoint supplies without observed provenance. Missing public history displays an unavailable message.

The How it works page presents the five-stage pipeline with code/test links, preserved accessible disclosures and dated evidence. Local API-backed headings and reading order are consistent with the shared design; README public/local scope is reconciled.

See [browser verification](verification/2026-10-11-research-workspace.json) and [screenshots](verification/screenshots/research-workspace/). Verification used the real October 9 public snapshot and transient, labeled browser fixtures. No fixture records were added to the public export. This work has not been deployed.

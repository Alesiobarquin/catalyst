# Catalyst light/dark theme and visual refresh

Prepared October 5, 2026. This is an execution plan, not an implemented feature. Read the root AGENTS.md and frontend/AGENTS.md before starting.

## 1. Outcome and scope

Implement two complete themes for the public portfolio site and the local application. First-time visitors see light mode, even when their operating system prefers dark mode. A visible, two-position switch changes the theme immediately. A returning visitor sees their explicitly saved choice.

Replace the orange lightning branding with a quiet typographic identity. The result should read as a considered financial research tool: coherent spacing, readable tables, clear hierarchy, and restrained use of color.

Required outcomes:

- Light is the HTML/CSS default, before JavaScript and before hydration.
- Explicit light/dark choices persist across navigation, refreshes, and later visits.
- The navigation, public dashboard, analytics, signals, details, charts, architecture, local settings, loading states, errors, and 404 page all support both themes.
- No orange lightning mark, bolt navigation icon, or bolt alert icon remains.
- The shared implementation works with the existing Next.js static export and ordinary API-backed application.
- Public collection timestamps, source failures, daily cadence, modeled-PnL labels, filters, CSV exports, and calculations retain their behavior.
- No new frontend runtime package, external font service, account, backend endpoint, or hosting resource is needed.

The user's phrase “start in light mode” is interpreted as a first-visit default. Remembering a subsequent explicit dark choice is intentional. There is no System/Auto option and no automatic OS-theme selection.

## 2. Baseline and risks

The current repository uses Next.js 16.3.8, React 19, Tailwind CSS 4, inline React styles, and locally bundled Inter/JetBrains Mono. Read installed Next.js documentation in frontend/node_modules/next/dist/docs before changing the layout.

The public route tree under frontend/public-site/app reuses the root layout and several shared pages/components. Its dashboard, signals, and analytics routes use PublicDashboard rather than the local application page components. Styling only src/app/page.tsx will miss the deployed dashboard.

An inspection found approximately 740 hex/rgb color occurrences across frontend source files, including token definitions. This is a migration of existing styling, not just a new switch. Re-run the inventory at execution time because source can change.

Important traps:

1. The orange logo is a custom inline SVG in Navbar.tsx, not just a Lucide icon. Navbar also uses Zap for Signals; LiveStreamBanner uses Zap for alerts.
2. Many components hard-code white text, white-alpha borders, dark backgrounds, mouse-hover border assignments, and status colors. Global CSS alone cannot override those correctly.
3. utils.ts returns literal colors from getStrategyColors, getConvictionColor, and getStatusConfig. These helpers must become theme-aware without altering calculations or status labels.
4. PriceChart uses Lightweight Charts canvas rendering. CSS variables must be resolved into actual color strings before passing them to the chart library.
5. MarketOverviewBar contains a gradient and a glowing status dot despite global comments prohibiting glow. Inspect actual styles, not just comments.
6. Portaled SignalDetailPanel inherits tokens from html; a theme applied only to a page wrapper would miss it.
7. The shared layout loads local fonts. Preserve them; do not restore next/font/google. A Google font-loader failure was fixed by bundling these fonts.
8. Navbar tests currently assert CATALYST and a hard-coded blue underline. Update them to verify the new wordmark and active-link semantics.
9. Static export cannot read a visitor's localStorage or cookies at build time. A server-side cookie theme would also compromise this deployment's static design.
10. Current public data can contain no recommendations. A screenshot of the empty dashboard alone does not verify populated rows, details, or chart colors.

## 3. Visual specification

### Identity

- Navbar wordmark: **Catalyst**, title case, Inter, 18px, weight 600, normal or minimally negative letter spacing.
- Wordmark color: primary text token in either theme.
- Remove the orange square, custom lightning SVG, and orange wordmark styling. Do not replace them with another decorative icon or abstract AI-style logo.
- Keep the existing subtitle if it fits; use sentence case, 11–12px secondary text. Hide the subtitle at narrow widths before shrinking the main wordmark.
- Navbar navigation can be text-only. If retaining a Signals icon, use ListFilter; replace alert Zap with Bell or BellRing. Icons should convey an action or meaning.
- Replace the existing favicon with one simple, theme-independent “C” SVG: neutral dark square, white letter. Put identical copies at src/app/icon.svg and public-site/app/icon.svg, because these are separate Next.js app roots. Remove the old src/app/favicon.ico and any conflicting metadata references. Verify both builds emit and link the new icon; importing the shared layout alone does not create a file-based icon route in the public app.
- Do not change strategy enums, route names, or backend terminology as part of this refresh.

### Layout and typography

- Keep the useful dashboard structure and approximate 1400px content width.
- Use 24px desktop page gutters and 16px mobile gutters.
- Use a spacing scale of 4, 8, 12, 16, 24, and 32px for touched UI.
- Typical page heading: 26–30px / weight 600; section heading: 16–18px / weight 600; body/table text: 13–14px; secondary labels: 12px.
- Use Inter for titles, navigation, prose, and controls. Reserve JetBrains Mono for tickers, numbers, prices, timestamps, and code.
- Use tabular numbers for financial columns.
- Use 6px card/dialog radii and 4px control radii consistently. The switch track and small status dots are deliberate exceptions.
- Use borders and spacing to separate content. Reserve a very subtle shadow for an elevated menu or dialog, not every card.
- Remove the page graph-paper background, market ribbon gradient, neon dots, decorative glow, exaggerated uppercase tracking, and unnecessary colored icon tiles.
- Remove hover effects that lift or scale cards. Use a border or surface change.
- Preserve useful modal open/close animation, but keep it short and respect reduced motion. Do not add scroll reveals, spring effects, decorative transitions, or animated backgrounds.
- Avoid global “transition: all” or page-wide theme fades. Only the switch thumb needs a brief transform transition.
- Simplify theatrical 404 copy such as “Terminal Node Offline” to “Page not found.” Preserve the return link and useful error information.

### Palette

Use the following as the implementation baseline. Colors are centralized in globals.css; components refer to semantic tokens.

| Existing/new token | Light | Dark | Meaning |
|---|---|---|---|
| --color-bg-page | #F6F7F9 | #151A21 | Page canvas |
| --color-bg-card | #FFFFFF | #1B222B | Cards, header, dialog |
| --color-bg-row | #EEF1F5 | #242D38 | Inset surfaces, row hover, skeleton |
| --color-bg-overlay | #FFFFFF | #1B222B | Menus and floating surfaces |
| --color-text-primary | #17212E | #E8EDF3 | Main text and values |
| --color-text-secondary | #465365 | #B7C1CE | Supporting content |
| --color-text-muted | #5D6878 | #93A0B1 | Metadata and placeholders |
| --color-link | #245B96 | #96B8E3 | Actions, active navigation, entry lines |
| --color-on-accent | #FFFFFF | #151A21 | Text on a filled accent control |
| --color-profit | #226644 | #8EBC9C | Positive outcomes |
| --color-loss | #B13539 | #E3A1A4 | Negative outcomes |
| --color-warning | #89551F | #DCB275 | Warnings and stop levels |
| --color-border | #D7DDE5 | #364150 | Decorative surface separators |
| --color-border-subtle | #E7EBF0 | #2B3542 | Internal dividers |
| --color-control-border | #808A99 | #6A798E | Required control boundaries |
| --color-border-hover | #9CA8B8 | #77869B | Hover emphasis |
| --color-focus | #245B96 | #96B8E3 | Keyboard focus ring |
| --color-chart-grid | #E7EBF0 | #2B3542 | Decorative chart grid |
| --color-chart-price | #354A65 | #C8D2DF | Main price series |
| --color-chart-axis | #5D6878 | #93A0B1 | Chart labels |
| --color-chart-crosshair | #66768A | #9AAAC0 | Crosshair and axis boundary |
| --color-scrim | rgba(18,25,35,0.35) | rgba(0,0,0,0.55) | Modal backdrop |

Use separate semantic foreground/background/border tokens for info, success, warning, loss, and neutral badges. Begin with these quiet tint backgrounds: light info #EDF3FA, success #EDF6F0, warning #FBF3E8, loss #FBEFF0; dark info #233247, success #243A30, warning #3A3022, loss #3D292E. Check each complete foreground/background pair rather than relying on opacity.

Keep categories distinguishable with a small muted palette: Supernova blue, Scalper teal, Follower muted violet, Drifter slate, Fallback gray. These are categorical colors, not profit/loss indicators. Use a modest dot or chart bar plus text label; avoid saturating entire cards. Add theme-specific category tokens for text, background, border, and dot as required by existing helper return types.

Compatibility mappings:

- bg-base -> bg-page; bg-surface -> bg-card; bg-elevated -> bg-row.
- brand, gold, gold-dim -> the action/selection palette, not orange.
- green -> profit; red -> loss; stop/amber -> warning.
- blue/cyan/teal legacy action aliases -> link unless an existing use genuinely represents a separate category.
- Keep legacy glow/shadow aliases at none, or map any actually used tinted background to the correct semantic background token. Do not make an orange glow survive through an alias.

No global replacement of every orange with blue: stop-loss and warning colors still express useful information. The user's objection is to cliché branding and gratuitous decoration.

Normal text must meet 4.5:1 contrast, and required control boundaries/graphical information 3:1 against adjacent colors. Decorative card dividers can be quieter. The proposed core text colors were checked against card/inset surfaces; validate badges, controls, chart labels, and final computed combinations separately. These criteria come from [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## 4. Theme architecture

Prefer a small custom implementation using existing React APIs. Do not add next-themes, a component library, or a second CSS framework.

### Files to add

| File | Responsibility |
|---|---|
| frontend/src/lib/theme-config.ts | Server-safe Theme type, storage key, validation/defaults, constant bootstrap script |
| frontend/src/lib/theme-store.ts | Client-only external store, setTheme, subscriptions, useTheme |
| frontend/src/components/layout/ThemeSwitcher.tsx | Accessible two-position control |
| frontend/src/lib/chartTheme.ts | Resolve concrete CSS colors for the canvas chart |
| frontend/src/app/icon.svg; frontend/public-site/app/icon.svg | Identical small neutral C favicon for the two app roots, replacing conflicting existing icon selection |
| Theme store/switch/chart tests under src/__tests__ | Meaningful new behavior coverage |

theme-config.ts must not import client hooks or access window/document at module initialization. RootLayout imports only this server-safe module. theme-store.ts is a client module.

### HTML and pre-paint bootstrap

1. RootLayout emits html with data-theme="light" and its existing local-font classes.
2. Add a small synchronous inline script in head that reads localStorage key **catalyst-theme**.
3. Accept only exact values "light" or "dark"; otherwise keep light.
4. Wrap storage access in try/catch. Failure keeps the static default and does not throw.
5. Set data-theme only. CSS sets the corresponding color-scheme.
6. Use suppressHydrationWarning only on html for this intentional attribute difference. Do not suppress warnings across the app.
7. Keep script content constant; do not interpolate user data, API keys, or request values.
8. Inspect emitted HTML and verify the script runs before visible content. An afterInteractive script or a first-render useEffect is too late for saved-theme restoration.

This approach follows the installed Next.js guide at frontend/node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md, specifically its Themes section. Inspect existing response headers; if an actual CSP blocks the script, report that concrete blocker rather than silently changing infrastructure or relaxing security.

### CSS implementation

- Make the existing --color-* names the runtime token API.
- Use Tailwind's @theme static for the light color definitions so tokens used from inline styles or chart lookup are emitted.
- Add html[data-theme="dark"] overrides for those same token names outside @theme.
- Leave html without a data-theme attribute readable as light.
- Set color-scheme: light on the default root, and color-scheme: dark on the dark selector.
- Preserve existing spacing/utility names and compatibility aliases until all callers are checked.
- If the local font variables currently conflict with Tailwind's --font-sans/--font-mono definitions, use --font-inter and --font-jetbrains-mono in next/font/local and map them with @theme inline. Verify computed font families; keep local font files/licensing intact.
- Convert shared .card, .glass-card, .stat-card, .trade-card, .filter-pill, .tag, .param-box, divider, skeleton, chart-wrapper, scrollbar, selection, and focus styling.
- Selected controls use --color-on-accent rather than permanently white text.
- Do not maintain separate Tailwind dark: classes alongside a competing media-query theme. The root data attribute is the single theme selector.

Tailwind documents both the [static token option and runtime CSS variables](https://tailwindcss.com/docs/theme). Use the installed version's supported syntax rather than importing a Tailwind 3 configuration pattern.

### Client store

Use useSyncExternalStore with stable module-level subscribe/getSnapshot/getServerSnapshot functions:

- getServerSnapshot returns the primitive "light" for both server rendering and hydration.
- getSnapshot safely reads the currently applied root attribute and returns only "light" or "dark".
- setTheme applies the root attribute, attempts persistence, and emits one application theme-change event for current-tab subscribers.
- Storage write failure must not undo the visible choice. Persistence simply cannot survive reload when storage is blocked.
- Subscribe to the application event and browser storage events for catalyst-theme; return cleanup functions.
- Removing the saved key or clearing storage restores light in other tabs.
- A storage-event handler applies the validated incoming value and notifies subscribers without writing it back to storage; do not call the persistence setter from that handler.
- Keep browser reads inside guarded functions. Do not touch document during SSR module loading.
- A small mount useLayoutEffect may reapply a validated saved preference after React Strict Mode resets root attributes in development. It must not use a synchronous setState initializer effect. Notify the external store if it changes the attribute.
- Do not store theme in each page's independent state, mutate refs during rendering, or remount children with key={theme}.

The [React external-store contract](https://react.dev/reference/react/useSyncExternalStore) requires a stable snapshot and a consistent server/hydration value. A primitive string avoids an unnecessary object-cache implementation. Providers.tsx can remain its existing wrapper; this design does not require introducing a context provider.

## 5. Switch and navbar

Use a real button with type="button", role="switch", a stable accessible name **Dark mode**, and aria-checked reflecting whether dark mode is enabled. Visible labels can be Light / Dark around the track. Keep these labels stable when toggling, as required by the [W3C switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).

- Track approximately 40×22px, thumb approximately 16px, with at least a 44px-high click target.
- Off/left means light; on/right means dark.
- Derive the visual thumb position from the root theme attribute so the saved choice looks correct before hydration.
- Event handling reads the current applied theme rather than depending on a possibly stale initial hydration value.
- Native button activation handles mouse, touch, Space, and Enter. Do not add a second keydown handler that causes a double toggle.
- Add a clearly visible focus-visible ring with offset.
- Use a short thumb transform transition; disable it under prefers-reduced-motion.
- No sun/moon emoji, tooltip-only labeling, text-only hidden control, or settings-page-only placement.
- Keep it visible in the header on all routes, including local settings and the public architecture/404 pages.

Desktop: wordmark left, navigation next, compact theme control and telemetry/clock on the right. Make theme switching easier to discover than the clock.

At widths below approximately 900px, use a two-row header: brand and theme control on row one, navigation on row two. Allow the navigation itself to scroll horizontally if needed; the whole page must not overflow. Hide the clock/subtitle before hiding the theme switch. Retain daily-demo or pipeline status access; public scan freshness remains visible in the page.

Use aria-current="page" for the active navigation link. Replace DOM hover style assignments with CSS hover/focus rules wherever those assignments would reintroduce a fixed color.

## 6. Migration order and file checklist

Implement in the following order. Finish one checkpoint before broadening the change.

### A. Inventory and baseline

- Confirm git status; preserve unrelated edits.
- Read AGENTS.md, frontend/AGENTS.md, the relevant installed Next guide, and this plan.
- Capture baseline screenshots of the four public routes at desktop and mobile widths if browser tooling is available.
- Run the color/bolt audit and group findings by role, not by hex alone.

Useful starting searches:

~~~bash
rg -n 'Zap|Bolt|lightning|D97706|F97316' frontend/src frontend/public-site
rg -n '#[0-9a-fA-F]{3,8}|rgba?\(|linear-gradient|boxShadow' frontend/src frontend/public-site --glob '!**/fonts/**' --glob '!**/__tests__/**'
rg -n 'borderColor|onMouseEnter|onMouseLeave|background|color:' frontend/src/components frontend/src/app
~~~

Do not print .env contents or start the AWS worker for this work.

### B. Tokens, bootstrap, store, and switch

Complete globals.css, theme-config.ts, theme-store.ts, ThemeSwitcher.tsx, and RootLayout wiring. Confirm light first visit, saved dark reload, blocked storage, and keyboard toggling on a simple page before migrating the remaining components.

Update the navbar branding, favicon, navigation responsiveness, active-link semantics, and shared footer at the same checkpoint. Theme mechanics must be stable before bulk color edits.

### C. Shared formatting and status helpers

Convert utils.ts color helpers to return CSS token references while retaining their existing return shapes and all non-color behavior. Ensure SVG attributes that receive those values resolve correctly. If a chart needs concrete colors, resolve them separately in chartTheme.ts.

Do not change Kelly formulas, PnL calculations, conviction thresholds, order status labels, ticker parsing, or API calls during a color migration.

### D. Public dashboard and core data views

| Target | Work |
|---|---|
| components/public/PublicDashboard.tsx | Buttons; partial/stale/error/info borders; collection banner; source outcomes; empty/loading states; table headings |
| dashboard/MarketOverviewBar.tsx | Flat surface; neutral structure; gain/loss tokens; refresh control; remove glow; preserve collection timestamps |
| dashboard/DashboardHeader.tsx, StatsBar.tsx | Typography, hierarchy, number contrast, muted labels |
| dashboard/FilterBar.tsx; signals/SignalFilterBar.tsx | Input surfaces, placeholders, selected states, disabled states, focus |
| ui/TickerSearchInput.tsx, Pagination.tsx | Menus, hover/selection, border contrast, keyboard focus |
| dashboard/TradeCard.tsx, TradeList.tsx | Surfaces, hover rules, badges, PnL, price cells, legends, empty/error views |
| signals/SignalRow.tsx | Table borders/rows, confluence badges, expanded content, risk text, profit/loss tones |
| dashboard/SignalDetailPanel.tsx | Portaled backdrop/dialog, close control, tooltip-like elements, scenario cards, risk/price badges, all fixed colors |

Maintain table minimum widths and horizontal scrolling inside the table wrapper. Do not compress ticker, catalyst, or source text into collisions. Keep tooltips and metadata readable in light mode.

### E. Analytics and chart integration

- analytics/Charts.tsx: all DOM/SVG bars, legend text, tracks, percentages, and zero-state text.
- analytics/KellySimulator.tsx: sliders, readouts, panels, information note, labels, warning states, and keyboard focus. Keep calculations intact.
- charts/PriceChart.tsx: chart background, grid, axis labels, crosshair/labels, price series, entry/stop/target series, and price-line axis labels.

For PriceChart:

1. Add a pure palette-reading helper that resolves root CSS variables with getComputedStyle in the browser. Assert required values are not empty.
2. Read concrete hex/rgb values when creating the chart. Do not pass var(--...) strings to the canvas library.
3. Retain references to the chart, main/auxiliary series, and created price-line objects.
4. In a theme-dependent effect, apply new options to those existing instances. The [price-line interface supports applyOptions](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/IPriceLine); check installed typings for chart/series/axis-label options.
5. Keep theme out of the chart-creation effect's dependencies. Changing theme must not call remove/createChart or fitContent.
6. Preserve time range, zoom, pan, price data, and existing ResizeObserver cleanup.
7. Keep refs mutated only inside effects/events, and clear them safely on teardown.
8. Verify entry/stop/target labels and colors against both chart surfaces; labels plus line styles convey meaning without color alone.
9. Preserve the public distinction between unavailable history and local illustrative history. A UI refresh must not introduce synthetic public price data.

### F. Remaining routes and edge states

Migrate src/app/page.tsx, signals/page.tsx, analytics/page.tsx, architecture/page.tsx, settings/page.tsx, architecture/ExpandableCard.tsx, layout/PipelineStatus.tsx, signals/LiveStreamBanner.tsx, app/not-found.tsx, and every loading/error file.

Public architecture and not-found re-export local pages, so they require the same tokens. The local sign-in/sign-up pages should inherit the shell without adding a new authentication flow.

For settings, inspect credential forms, validation outcomes, test-injection controls, telemetry cards, and disabled buttons. Public settings remain excluded.

Tone down the architecture page's colored chips/icon tiles and repeated showcase cards while retaining its engineering narrative, test evidence, and useful collapsible content. Keep one page heading and clearly separated sections.

### G. Audit leftovers

Re-run searches. Every remaining UI color literal outside centralized tokens needs an explicit reason, such as the theme-independent favicon. Replace fixed colors in component constants, helper maps, SVG fill/stroke props, hover handlers, and warning branches. Do not report “done” merely because the first screen is light.

Check compiled light/dark background/text values at runtime. CSS token names alone do not prove the generated styles work.

## 7. Tests and verification

Add meaningful tests for new behavior. Do not duplicate every CSS declaration in tests or rewrite unrelated test suites.

### Automated component/unit coverage

- No saved value -> light; an invalid value -> light; OS dark preference does not override this.
- Saved dark is applied by the bootstrap; saved light stays light.
- Throwing storage getters/setters do not crash; toggling still works for the current page.
- Switch click, Space, and Enter toggle exactly once, update aria-checked, and persist the selected value.
- Labels stay stable, root data-theme changes, and subscribers update.
- Cross-tab storage changes/removal restore the expected theme.
- Unsubscribing/unmounting removes listeners.
- Server-rendering theme consumers does not access window/document or emit unstable markup.
- Navbar has the new accessible brand/home link, switch, correct navigation, and aria-current active states. Preserve public Settings exclusion.
- A PriceChart test with mocked chart APIs verifies theme changes apply options to existing chart/series/price-line objects without recreating the chart or resetting its range. Teardown still disconnects/removes resources.
- Preserve existing filter, pagination, dialog, CSV, calculator, and snapshot tests.

Reset localStorage and root theme between theme tests. The current frontend/src/test-setup.ts only performs component cleanup; avoid test-order dependence. Test intentional behavior, not every chosen hex code.

Required commands, from the repository root:

~~~bash
npm --prefix frontend run test
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix frontend run build:public
git diff --check
~~~

Both builds are required because the shared layout is used in two route trees. The existing GitHub release workflow runs the complete Python/Java/frontend suite; a UI-only change does not need manual local backend test expansion.

### Real-browser verification

Use available browser automation. If it is unavailable, use the repository's installed Python Playwright with a headless Chromium browser. A browser binary can be installed as a development tool if needed; do not add a runtime UI dependency.

Serve the production static output from a separate temporary preview directory on localhost. Copy public manifest/status/snapshot data into that temporary tree to exercise snapshot loading. For populated rows, details, and charts, use clearly marked local test fixtures in this preview directory only. Never write test data into the public S3 bucket, repository production assets, or deployable output.

Required matrix:

| Scenario | Verification |
|---|---|
| First visit, OS light and OS dark | Light content and switch off before interaction |
| Saved dark, hard reload with slow JavaScript | Dark before first content paint; no light flash |
| All four public routes, both themes | No unreadable text, dark leftover islands, missing borders, or console hydration errors |
| Mobile 390px and 320px, both themes | Switch visible; navigation usable; no page-wide horizontal overflow |
| Desktop 1440px and 200% zoom | Content remains usable; header does not collide |
| Empty/partial/error and populated preview | Data status remains honest; cards, rows, dialogs and menus work |
| Open chart, change theme repeatedly | Palette updates while visible range and data remain intact |
| Keyboard navigation and reduced motion | Visible focus; Space/Enter work; thumb animation disabled under reduced motion |
| Storage blocked | Default light, no crash, in-page choice works |
| Client navigation, refresh, second tab | Preference stays consistent |

Capture at least the four public routes in both themes at desktop size, one mobile view per theme, and an open populated detail/chart in both themes. Save screenshots under a clearly named temporary/output folder and report their paths. Review actual screenshots rather than claiming HTTP 200 proves visual correctness.

Browser automation may need a locally populated preview because the real public dataset can be empty. Do not use fake signals to make the deployed site look active.

## 8. Completion gates

All of the following must be true:

- [ ] Fresh visits default to light independent of OS preference.
- [ ] Visible flipper works, is accessible, persists explicit choices, and appears on mobile.
- [ ] Saved dark loads without a light flash or hydration errors.
- [ ] Orange bolt branding and Zap/Bolt UI icons are gone.
- [ ] Plain wordmark, neutral surfaces, restrained accents, consistent type/spacing replace the decorative terminal aesthetic.
- [ ] No hard-coded dark surfaces or white-only text remain in normal UI paths.
- [ ] Public and local routes, dialogs, filters, errors, skeletons, and empty states work in both themes.
- [ ] Charts update in place and maintain range/zoom.
- [ ] Contrast, focus, mobile, zoom, storage failures, and reduced motion were checked.
- [ ] Existing data behavior and daily snapshot architecture are preserved.
- [ ] Frontend tests, lint, typecheck, both builds, and diff check pass.
- [ ] Visual evidence is available, with any verification limitation stated accurately.
- [ ] AGENTS.md documents the actual implementation, storage key, default behavior, chart strategy, and current test counts.
- [ ] The final change is committed and, when executing the publish prompt below, the existing release workflow succeeds.

Do not declare success with an untested dark page, a mocked-only toggle, missing chart theming, or a failing static build.

## 9. Commit and publish

Prefer one coherent feature commit after local verification. Keep user edits separate. Do not push half-converted UI checkpoints because frontend pushes to main automatically publish.

Use the existing GitHub Actions workflow, .github/workflows/public-demo.yml, to publish. Do not manually upload assets or data to S3, modify CloudFront/CDK, rotate keys, change schedules, start EC2, or redesign deployment for this UI task.

After the final main push:

1. Verify CI, CodeQL, and Release public demo complete successfully.
2. If a failure is relevant to the change, fix it and re-verify. Do not hide it or mark a failing check as optional.
3. Check the live HTTPS pages and their referenced assets.
4. Confirm the data manifest continues to reference an organically published dataset; a static code release must preserve it. A scheduled scan may legitimately advance the run ID during deployment. Check that the code release did not reset the manifest to initial/test data rather than requiring its run ID to remain unchanged.
5. Verify the switch and first-visit default against the deployed site using browser tooling.
6. Report final commit, checks, public URL, screenshot evidence, and any remaining blocker.

An unavailable signed-in GitHub/AWS identity is a genuine publishing blocker. Explain the exact failed command and required setup if that happens. Styling, choosing tokens, ordinary implementation decisions, and running existing checks do not require asking the user.

## 10. Ready-to-use execution prompt

Copy the following into the agent that will implement the work:

> Implement and publish docs/UI_THEME_IMPLEMENTATION_PLAN.md in this repository. Read AGENTS.md and frontend/AGENTS.md first. Follow the plan's light-first behavior, persistent accessible flipper, neutral Catalyst wordmark, complete semantic-token migration, and in-place chart updates. Use the specified design baseline rather than inventing a new aesthetic. Cover the public static site and local application. Preserve data behavior, collection cadence, infrastructure, bundled fonts, and public data provenance. Add focused theme/chart tests, run frontend tests/lint/typecheck and both builds, inspect browser screenshots, and update AGENTS.md with the actual result and test counts. Commit the finished work, push through the existing main-branch GitHub release flow, monitor CI/CodeQL/release, and verify the deployed site. Keep unrelated edits intact. Do not seed public data, start the AWS worker, add UI runtime dependencies, or change hosting. Progress autonomously; ask only for a concrete authentication/access blocker. Report the commit, live URL, checks, and screenshot paths when finished.

# StackPilot dashboard: design spec

This is the source of truth for porting the approved preview into `apps/web`.
`dashboard-preview.html` (same folder) is the preview's source. Read it as a **visual reference only**: copy its markup structure, inline styles, spacing and copy, but **not** its runtime. Ignore `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{holes}}` and `class Component extends DCLogic`. Those belong to the design tool.

## Stack

Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, lucide-react icons, TanStack Query, next/font (Inter for UI, JetBrains Mono for code, ports and logs).

## Theme tokens (CSS variables)

Every colour in the UI is a variable. No hex values inside components.

| Token | Midnight Teal dark (default) | Used for |
|---|---|---|
| `--bg` | `#070B0B` | page background, top bar |
| `--sidebar` | `#0A1010` | sidebar |
| `--card` | `#0E1515` | cards, panels, drawer header |
| `--card2` | `#121B1B` | raised controls, secondary buttons, chips, chat bubbles |
| `--input` | `#0A1111` | text inputs |
| `--border` | `#1C2929` | card borders, dividers |
| `--border2` | `#253535` | control borders |
| `--track` | `#172424` | progress-bar tracks, table row lines, chart grid |
| `--fg` | `#E6F0EF` | primary text |
| `--fg2` | `#C9D8D6` | secondary text, values |
| `--muted` | `#8FA3A1` | labels, captions, sidebar nav labels |
| `--muted2` | `#A7B8B6` | notes |
| `--accent` | `#14B8A6` | primary buttons, CPU line, active ring |
| `--accentFg` | `#042F2E` | text and icons on accent |
| `--accentText` | `#5EEAD4` | accent-coloured text and links |
| `--accentSoft` | `rgba(20,184,166,0.14)` | active nav background, chart area fill, avatar |
| `--accentBorder` | `rgba(20,184,166,0.45)` | avatar border |
| `--series2` | `#A5B4FC` | memory line in the chart, memory bars |

Status colours are fixed per mode and **never** follow the theme:

| Token | Dark | Light |
|---|---|---|
| `--ok` / `--okBg` | `#2DD4BF` / `rgba(45,212,191,0.14)` | `#047857` / `rgba(5,150,105,0.12)` |
| `--warn` / `--warnBg` | `#FBBF24` / `rgba(245,158,11,0.14)` | `#B45309` / `rgba(217,119,6,0.13)` |
| `--bad` / `--badBg` | `#FCA5A5` / `rgba(248,113,113,0.13)` | `#B91C1C` / `rgba(220,38,38,0.10)` |
| `--info` / `--infoBg` | `#93C5FD` / `rgba(96,165,250,0.14)` | `#1D4ED8` / `rgba(37,99,235,0.10)` |
| `--neutralBg` | `rgba(148,163,184,0.12)` | `rgba(100,116,139,0.12)` |
| `--hot` (CPU/memory ≥ 70%) | `#F59E0B` | `#D97706` |
| `--overlay` | `rgba(0,0,0,0.6)` | `rgba(15,23,42,0.35)` |

Status → colour: healthy/success = ok, unhealthy/unstable = warn, stopped/failed = bad, starting/stopping/restarting/running = info (dot pulses), aborted = muted2 on neutralBg.

The log viewer is always dark like a terminal, whatever the theme: background `#060A0A`, timestamps `#6F8583`, text `#D5E3E1`, INFO `#5EEAD4`, WARN `#FBBF24`, ERROR `#F87171`.

SonarQube grade tiles (text `#061010`): A `#2DD4BF`, B `#A3E635`, C `#FBBF24`, D `#FB923C`, E `#F87171`.

## Themes (50, each with light and dark)

The full list and the generator are the `THEMES` array and the `buildTheme(theme, dark)` function in `dashboard-preview.html`. Port them as-is to `lib/themes.ts`. Each theme is `{ n: name, h: hue, s: accentSaturation, t: tintSaturation }`. `buildTheme` returns the token values above. It derives backgrounds from the hue and adjusts `accentText` and `accentFg` until they meet contrast. Midnight Teal dark returns the exact table values above.

## Type and shape

- Base 14px Inter. H1 26px/700, letter-spacing -0.02em. Section titles 16px/600. Labels 13px muted. Captions 12px. Uppercase micro-labels 11px/600, letter-spacing 0.06em.
- Big stat numbers 30px/700 (26px for word values such as "Failed" or "Passed").
- Radii: cards 14px, buttons and inputs 8–10px, badges and chips 999px.
- Card padding 20px (stat cards 18px). Page padding 28px. Gaps 16px between cards, 24px between sections.
- Top-bar controls are 42px tall. Card buttons are 38px tall.

## Layout

- Row with `flex-wrap`: sidebar `flex: 1 1 220px`, content `flex: 999 1 560px; min-width: 0`. On a phone the sidebar stacks on top.
- **Sidebar:** logo tile (34px, accent background, layers icon in accentFg), "StackPilot" / "Custom DevOps stack"; nav (Overview, Services, Jenkins, SonarQube, Ollama, AI Assistant, Settings), 42px rows, active row = accentSoft background; Services shows a red count badge of unhealthy + stopped services; a footer card with the stack root path in mono and "Docker Desktop running".
- **Top bar:** search field (filters service cards, ⌘K hint), Start All (primary), Stop All, Theme button (swatch + name, opens a 10-column grid of 50 swatches with prev/next and a Light/Dark segmented switch), light/dark toggle (sun/moon), notifications bell (unread count; opens a list of the last 4 activities), avatar "SR".
- **Page header:** title + subtitle on the left; "Live · refreshing every 4 s" with a pulsing dot on the right.

## Pages

- **Overview:** 4 stat cards (Services running x/3, Healthy x/3, Last build status #num, Quality gate), then the service-card grid (`repeat(auto-fit, minmax(320px, 1fr))`), then a row with the resource chart (CPU in accent with an area fill, memory in series2, 13 points over 60 min, grid lines in track) and the recent-activity timeline (coloured dots joined by a line).
- **Service card:** icon tile, name, description, status badge; a 3-column `dl` for Port (mono) / Uptime / Memory; CPU and memory bars (6px, hot colour at ≥ 70%); a warning note when unhealthy; buttons Start (primary), Stop, Restart, Open (link, new tab), View Logs (text button, pushed right). Buttons are disabled at 38% opacity when they don't apply.
- **Services:** card grid + a "Compose stacks" table (Service, Folder, Image, Health check, Status).
- **Jenkins:** 4 summary cards (success rate, average duration, running now, failed today) + a recent-builds table (Build, Job, Branch, Status, Duration, Started, Rebuild button).
- **SonarQube:** project pills; a quality-gate panel with 3 grade tiles; 4 metric cards (Bugs, Vulnerabilities, Security hotspots, Code smells); a coverage bar with an 80% target marker.
- **Ollama:** endpoint card (`http://127.0.0.1:11434`, Reachable, loaded model) + an installed-models list with Load/Unload.
- **AI Assistant:** header (model "gpt-oss:20b via Ollama"), messages (user bubbles in accent on the right, assistant bubbles in card2 on the left), suggestion chips, input + send button.
- **Settings:** stack root path, health-check interval select, 3 toggles (notifications, confirm before Stop All, auto-refresh), Save.
- **Logs drawer:** slides in from the right, 600px wide (full width on a phone), over an overlay; header with name, `docker compose logs --tail 100 · folder/` and the status badge; terminal body.

## Behaviour

- Start, Stop and Restart show Starting…/Stopping…/Restarting… until the API confirms, then refresh.
- Poll `/api/services` every 4 s. Activity and notifications come from state changes.
- Accessibility: real `<button>` and `<a>` elements, `aria-label` on icon buttons, `aria-pressed` on toggles and pills, `aria-current="page"` on the active nav item, text contrast 4.5:1.

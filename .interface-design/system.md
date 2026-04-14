# Ensemble — Interface Design System

## Direction

**Patch bay, literally.** Ensemble is a two-sided patch bay for AI tooling: a library of tools on one side, your projects on the other, cables between them. The app is a single split-screen working surface — never modal, never stepwise. You wire tooling to projects the same way you'd patch a cable: pick on one side, attach on the other. Aesthetic is Teenage Engineering — flat, hairline, monospaced, color only as signal. Beautiful in its restraint. Dark mode and light mode are equal citizens.

## Who / What / Feel

- **Human:** A developer working across multiple projects who wants AI tooling dialed in per project. Single user. Technical, impatient with chrome, already lives in terminals. Opens the GUI when the CLI isn't the right shape for the task — when they need to *see* what's wired where.
- **Verb:** *"Set up this project's tools"* (primary) / *"install this tool into the projects that want it"* (equally supported).
- **Feel:** Flat, elegant, technical. TE device — not Yamaha. Closer to a terminal's composure than a SaaS app's cheer.

## Mental model

One relation: `(tool, project) → enabled`. Every view is a navigation or edit of that bipartite graph. Nothing else.

Concepts that are gone — groups, profiles, path rules, client assignments, channel mode, fan-out mode, the picker. They were workarounds for not having this model.

Clients still exist, but as an implicit consequence: toggling a tool on a project writes to that project's clients automatically. The user never picks a client directly in the primary flow.

## Primary surface — the split

The app opens into a **resizable split-screen** with two persistent panels:

```
┌──────────────────────────┬──────────────────────────┐
│ LIBRARY                  │ PROJECTS                 │
│ (tools — left panel)     │ (projects — right panel) │
│                          │                          │
│ list ↔ detail            │ list ↔ detail            │
└──────────────────────────┴──────────────────────────┘
```

- **Hairline divider** between panels. Drag zone: 4px, hit area wider. Minimum 320px per side. State persists across sessions.
- Each panel has two modes: **list** or **detail**. Four combinations, each matching a real flow:

| Left (library) | Right (projects) | Flow |
|---|---|---|
| Tool list | Project list | *Browse* — what do I have, what do I run |
| Tool list | Project detail | *Customize this project* — what should I add |
| Tool detail | Project list | *Wire this tool* — which projects want it |
| Tool detail | Project detail | *Configure this tool for this project* |

Navigation between modes is within each panel independently. There is no "page" in the old sense — the whole app is always the split.

**Wiring is direct.** Pick on one side, toggle on the other. The action is symmetrical: selecting a tool and toggling a project is indistinguishable in effect from selecting a project and toggling a tool. The write is the same edge.

## Secondary surface — the matrix lens

A toggle in the top chrome (`PATCH` / `MATRIX`) switches to a **matrix view**: projects as rows, tools as columns, cells showing enabled/disabled state. Read-only in v1 — all editing happens in the split. Purpose: *"show me all edges at once"*, for the moments you need to audit without picking a side.

The matrix is a lens, not a separate mode. Returning to `PATCH` puts you back where you were in the split.

## Discovery of projects

Projects are discovered by scanning client histories, not from a separate registry or user config:

| Client | Source |
|---|---|
| Claude Code | `~/.claude/projects/{url-encoded-path}/` |
| Cursor / Windsurf | `~/Library/Application Support/{Cursor,Windsurf}/User/workspaceStorage/` |
| VS Code + Copilot | `~/Library/Application Support/Code/User/workspaceStorage/` |
| Codex CLI | `~/.codex/history` |
| JetBrains + Copilot | `~/Library/Application Support/JetBrains/*/options/recentProjects.xml` |
| Claude Desktop / chat-style | none — these appear as a single `GLOBAL` project row |

Aggregated by canonical filesystem path. Each project carries a `seenIn: ClientId[]` list — the clients that have opened it — and a `lastSeenAt` timestamp. Default filter: paths that are git repos. Registry metadata (from `projects.ts`) overlays display name and type when available.

`GLOBAL` is always present as a top row for chat-style clients that have no project dimension. Wiring a tool to `GLOBAL` writes to those clients globally.

## Library organization

The library panel is a flat list of every tool you've collected — **MCP servers, skills, plugins**, unified. Type is a filter along the top (`ALL / SERVERS / SKILLS / PLUGINS`), not a separate page. Future types (subagents, slash commands, hooks, settings — per `spec.md` v2.0.1) slot in as additional filters, same panel.

Tool detail shows: source (manual / registry / marketplace), config, trust tier, and a wired-to list of projects with direct toggles.

## Project organization

The project panel is a list sorted by `lastSeenAt` descending. Filters along the top: `ALL / RECENT / WITH TOOLS / EMPTY`. Search by path substring.

Project detail shows: path, display name (from registry if present), the clients that have seen it, and a ledger of wired tools with direct toggles. Wired-tool rows also show per-client status (which clients received the write).

## Writes are immediate

Single user, single machine. No staging, no diff, no "apply" button. Toggling a cell writes the relevant client config files immediately, behind the scenes. The doctor view and per-row status glyphs communicate the state of those writes — errors surface there, not as modal interruptions.

## Doctor

Doctor remains, but as a cross-cutting view invoked from the top chrome, not a page in a sidebar. It audits the whole relation — broken writes, drift, conflicts, missing configs — and is where errors from the silent-write model surface.

## Registry

Registry (the tool discovery / marketplace surface) becomes a third panel state on the **library side**: `LIBRARY ↔ REGISTRY` toggle above the tool list. Not a separate page. Installing from the registry adds to the library; from there, wire it to projects like any other tool.

## Depth strategy

**Borders-only.** No shadows anywhere. Elevation communicated by hairlines and ≤3% background shifts. Flat, committed. Do not mix in shadows later.

## Light & dark modes — equal citizens

Dark mode is a first-class requirement, not a retrofit. Every design decision made for light mode must have an equivalent dark-mode token and be checked for craft before shipping. The two are equally nice.

Mode switch: system preference by default, manual override in chrome.

### Light tokens (current)

Defined under `.te-scope[data-theme="light"]` (default).

```
--bone:            #f5f4f0   canvas — anodized TE face
--bone-sunk:       #ecebe6   hover / pressed / inset
--graphite:        #1a1a1a   primary ink
--ink-2:           #4a4a48   secondary ink
--ink-3:           #8a8a86   tertiary ink / numbers / metadata

--hairline:        rgba(26,26,26,0.08)   standard divider
--hairline-strong: rgba(26,26,26,0.18)   emphasis / chip border

--signal:          #ff5a1f   TE orange — DRIFT, attention. One job.
--sync:            #2f8f4a   muted green — healthy / in-sync.
--key:             #1f5aff   cold blue — focus ring / active selection.
--tape:            #d93025   red — conflict / destructive only.
```

### Dark tokens (target)

Defined under `.te-scope[data-theme="dark"]`. Drafted — colors TBD in implementation but must match light-mode contrast ratios and feel. Not black-and-off-gray; warm, anodized, like the back of a TE unit.

```
--bone:            #1a1a1a   canvas — dark anodized
--bone-sunk:       #232323   hover / pressed
--graphite:        #f0ede6   primary ink — warm off-white
--ink-2:           #c6c3bc   secondary ink
--ink-3:           #7a7773   tertiary ink / numbers / metadata

--hairline:        rgba(240,237,230,0.10)   standard divider
--hairline-strong: rgba(240,237,230,0.22)   emphasis / chip border

--signal:          #ff7a3f   TE orange — slightly warmed for dark bg
--sync:            #4dac68   muted green — lifted for contrast
--key:             #4d7aff   cold blue — lifted
--tape:            #ff5a4a   red — lifted
```

Dark mode is **not** the old legacy UI. It is the TE direction rendered on dark. Every signal color is tuned for the dark surface, not borrowed from light.

### Parity rules

- Every component must have both modes designed before it's considered shipped.
- Contrast ratios checked against WCAG AA minimum; signal colors verified on actual backgrounds.
- No mode-specific hacks. If a pattern only works in one mode, the pattern is wrong.
- Screenshots of both modes in any design review.

## Typography

One family, all mono: `Commit Mono, SF Mono, ui-monospace, JetBrains Mono, Menlo, Consolas, monospace`. No sans companion. Labels go UPPERCASE with loose tracking — the TE texture.

Feature settings: `"tnum", "ss01"` (tabular numbers always, stylistic set 01).

**Scale:**
- `11px / 0.14–0.18em tracking / uppercase` — labels, metadata, foot notes
- `13px / normal tracking` — row numbers, values, body
- `15px / 0.04em tracking / weight 500` — primary row content

Don't rely on size alone — combine size, tracking, color.

## Spacing

Base unit: **4px**. Scale: 4 / 8 / 12 / 16 / 24 / 40 / 64. Dense by default — this is a technical tool. Negative space comes from *restraint*, not padding.

Row padding: `py-4` (16px vertical). Panel padding: `px-8 py-8`. Panels butt up against the divider — no gutter.

## Border radius

**2px max.** Almost none. TE surfaces meet at crisp edges. Chips: `2px`. Inputs: `2px`. Rows: `0` (only hairlines, no corners). Never round state glyphs — they are squares, not dots.

## Component patterns

### Split panel

Top of each panel: a **panel header** (bone-sunk strip, `py-2 px-4`) with the panel's current mode label on the left (`LIBRARY / TOOLS` or `PROJECTS`) and filter tabs or a back arrow on the right.

### List row

Numbered (`01`, `02`…), single-line, hairline bottom divider, hover `bone-sunk`. Primary content in 15px weight 500 caps, secondary metadata in 11px ink-3 at right. Trailing `→` on hover.

### Detail view

Dense ledger: hairline-separated `LABEL → VALUE` rows. Top of the detail has a `← BACK` link and the item's primary identifier in large caps. Actions (toggles, destructive) are inline with their relevant row, not grouped into a footer bar.

### Wire-toggle row

In a detail view showing the "other side" of the relation (e.g., "projects this tool is wired to"), each row has a square glyph on the left — filled `--sync` if wired, outlined `--ink-3` if not — acting as a click target. No checkboxes, no switches. The glyph is the control.

### Matrix cell

Square, hairline border. Filled with `--sync` if wired, empty otherwise. Drift shows `--signal`; conflict shows `--tape`. Hover darkens the row and column headers. Click in v1 is a no-op (read-only); in v2 toggles the edge.

### State glyphs

Always squares, never dots. Always `--signal` / `--sync` / `--ink-3` / `--tape`. A new state means a new token, not a new color.

### Resizable divider

1px hairline, 8px hit area. Cursor `col-resize` on hover. Drag persists width to local storage. Double-click resets to 50/50.

## Motion

Essentially none. Instant state changes. Permitted:
- `80ms linear` background fade on row hover.
- `120ms linear` opacity on panel transitions between list and detail.
- Divider drag is direct manipulation, no easing.

No spring, no bounce, no ease-out curves on primary actions.

## States checklist

Every interactive element must have: default, hover, active, focus-visible, disabled. Data surfaces must have: loading (skeleton hairlines), empty (caps foot note), error (`--tape` text on hairline).

## What to avoid

- Harsh solid borders (use `--hairline`, not hex grays).
- Shadows. Any shadow. Any depth.
- Rounded pill state badges (squares only).
- Second accent color at a given moment (orange has one job; don't dilute).
- Mixing mono with sans in the same view.
- Size-only hierarchy — pair with tracking and color.
- Decorative icons — if removing loses no meaning, remove it.
- Dark mode as a tint of light mode. It is designed, not derived.
- Modal dialogs for primary actions. Prefer inline toggles.

## Migration order from current code

1. **Data layer** — write `src/discovery/projects.ts` and the project scan. Nothing works without this.
2. **Desktop shell** — strip sidebar, picker, channel chrome, client chip. Replace with the split and a minimal top chrome.
3. **Library panel** — adapt existing Servers/Skills/Plugins pages into a unified library list + tool detail, both inside the left panel.
4. **Projects panel** — new project list + project detail inside the right panel.
5. **Wire-toggle component** — the shared primitive. Used in both tool detail (→ projects) and project detail (→ tools).
6. **Direct write path** — toggling writes client configs immediately, no staging. Old sync page goes away.
7. **Matrix lens** — read-only grid view, chrome toggle to enter/leave.
8. **Registry panel state** — registry becomes a left-panel mode, not a separate page.
9. **Doctor as cross-cut view** — invoked from top chrome, reads the whole relation.
10. **Dark mode** — implemented alongside each surface, not after. Every commit ships both modes.

## Implementation notes

- Tokens scoped under `.te-scope` with `data-theme` attribute switching light/dark.
- Body element carries `data-theme` from system preference or user override; persists to local storage.
- All existing pages that don't fit the split are deleted in the migration, not retrofitted.
- The old picker, channel chrome, client chip, sidebar, sync page, groups page, profiles page, rules page, clients page — **remove** during migration, not preserve.

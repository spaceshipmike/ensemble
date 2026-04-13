# Ensemble — Interface Design System

## Direction

**Patch bay, not dashboard.** Ensemble is a studio rack for MCP infrastructure — one channel (client) at a time, crisp mode switches, fan-out only when explicitly invoked. Aesthetic is Teenage Engineering: flat, hairline, monospaced, color used only as signal. Beautiful in its restraint.

## Who / What / Feel

- **Human:** A developer mid-session, switching between Claude Code / Cursor / Chorus, who opens the GUI when the CLI isn't the right shape for the task (comparison, overview, diff). Technical, impatient with chrome, already lives in terminals.
- **Verb:** Fix one client fast; fan out a change with confidence.
- **Feel:** Flat, elegant, technical. TE device — not Yamaha. Closer to a terminal's composure than a SaaS app's cheer.

## Scope model

1. **Picker** — entry point. Numbered list of detected clients.
2. **Channel mode** — one client, full attention, dense ledger of its state. Default after picking.
3. **Fan-out mode** — entered explicitly via `SYNC ▸`. The only place multiple clients share a screen. Transactional.

The client chip (top-left) is the permanent instrument. Clicking it returns to the picker.

## Depth strategy

**Borders-only.** No shadows anywhere. Elevation communicated by hairlines and ≤3% background shifts. Flat, committed. Do not mix in shadows later.

## Tokens

Defined under `.te-scope` in `globals.css`. Scoped so the legacy dark UI stays isolated during migration.

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

**Color rule:** color means something or it isn't there. Never decorative. Never two accents at once. Gray builds structure; color communicates state.

## Typography

One family, all mono: `Commit Mono, SF Mono, ui-monospace, JetBrains Mono, Menlo, Consolas, monospace`. No sans companion. Labels go UPPERCASE with loose tracking — the TE texture.

Feature settings: `"tnum", "ss01"` (tabular numbers always, stylistic set 01).

**Scale:**
- `11px / 0.14–0.18em tracking / uppercase` — labels, metadata, foot notes
- `13px / normal tracking` — row numbers, values, body
- `15px / 0.04em tracking / weight 500` — primary row content (client name)

Don't rely on size alone — combine size, tracking, color.

## Spacing

Base unit: **4px**. Scale: 4 / 8 / 12 / 16 / 24 / 40 / 64. Dense by default — this is a technical tool. Negative space comes from *restraint*, not padding.

Row padding: `py-4` (16px vertical). Screen padding: `px-12 pt-10 pb-16`.

## Border radius

**2px max.** Almost none. TE surfaces meet at crisp edges. Chips: `2px`. Inputs: `2px`. Rows: `0` (only hairlines, no corners). Never round state glyphs — they are squares, not dots.

## Component patterns

### Channel row (picker)

```
[NUM]   [NAME (CAPS, 15px)]          [GLYPH]  [STATE LABEL]  [→]
 01      CLAUDE CODE                    ■      3 DRIFT         →
```

- Full-width button, `py-4`, bottom hairline only.
- `NUM`: `11px`, tabular, padded to 2 digits, 28px column.
- Name: flex-1, truncates.
- Glyph: `8×8px` square (not circle), one of `--signal` / `--sync` / `--ink-3`.
- State label: 88px right-aligned caps.
- Trailing `→` is `--ink-3`, darkens to `--graphite` on hover.
- Hover: `--bone-sunk` background.
- Focus: `--key` 1px outline, offset -1.

### Client chip

Pill with one-job `⇄` glyph. Shows `● NUM NAME ⇄`, click swaps channels.
- Border: `1px solid --hairline-strong`, `2px` radius, `--bone` background.
- Status square: `6×6`, colored per state.
- Max name width: 140px, truncate.

### State glyphs

Always squares, never dots. Always `--signal` / `--sync` / `--ink-3` / `--tape`. No yellow, no custom hues. A new state means a new token, not a new color.

### Header chrome (post-pick)

Thin bar (`--hairline-strong` bottom border, `--bone` background) carrying the client chip on the left. Height minimal — `py-2`.

## Motion

Essentially none. Instant state changes. Permitted:
- `80ms linear` background fade on row hover.
- `120ms linear` opacity on the (future) inspector rail.

No spring, no bounce, no ease-out curves on primary actions.

## States checklist

Every interactive element must have: default, hover, active, focus-visible, disabled. Data surfaces must have: loading (skeleton hairlines), empty (caps foot note), error (`--tape` text on hairline).

## What to avoid

- Harsh solid borders (use `--hairline`, not hex grays).
- Shadows. Any shadow. Any depth.
- Rounded pill state badges (squares only).
- Second accent color (orange has one job; don't dilute).
- Mixing mono with sans in the same view.
- Size-only hierarchy — pair with tracking and color.
- Decorative icons — if removing loses no meaning, remove it.

## Implementation notes

- Tokens scoped under `.te-scope` — legacy dark UI untouched during migration.
- Picker at `pages/PickerPage.tsx`. Chip at `components/ClientChip.tsx`.
- Detection via `window.ensemble.clients.detect()`. Drift count read from `config.clients[id].drift`.
- Migrate legacy pages screen-by-screen: wrap in `.te-scope`, replace cards/tiles with hairline ledgers, swap status pills for square glyphs.

## Migration order (suggested)

1. Doctor view — smallest, mostly text, validates the dense-ledger pattern.
2. Servers page — the main fleet work, highest impact.
3. Skills / Plugins — inherit from Servers.
4. Sync page → becomes Fan-out mode (the rack).
5. Remove legacy sidebar; navigation becomes tabs inside the channel view.

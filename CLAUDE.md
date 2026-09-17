# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm install
npm run dev      # Vite dev server on :5173
npm run build    # production build to dist/
npm run preview  # serve the built output
```

There is no test runner, linter, or type checker configured. `npm run build` is the
only automated check — it catches syntax and import errors but nothing semantic.

To verify stats logic against real data, run the engines under Node against the
sample export. Node's ESM loader rejects bare Windows paths, so use a file URL:

```powershell
node -e "import('file:///G:/BGS%20Breakdown/src/lib/stats.js').then(async m => { const fs = await import('node:fs'); const raw = JSON.parse(fs.readFileSync('BGStatsExport (1).json','utf8')); console.log(m.buildBreakdown(raw, { year: 2026 }).totals); })"
```

`BGStatsExport (1).json` in the working tree is a real export (72 plays, 7 players,
31 games, Oct 2025 – Sep 2026) and is the de facto fixture. It is **gitignored and
never committed** — it names real people and the houses they play at, and the remote
is public. Don't add it, quote its player or location names in committed files, or
paste its contents into anything that leaves the machine. A fresh clone has no
fixture, so ask for an export before trying to verify numbers.

Both engines are pure functions of the raw JSON, so they run headless without React.

## Architecture

Two layers, strictly separated: **engines** in `src/lib/` that know nothing about
React, and **views** that only render what an engine returned.

### Engines

`prepare(raw)` in `src/lib/stats.js` is the single indexing point. It returns lookup
maps (`games`, `players`, `locations` keyed by `id`), `meId`/`meName`, the cleaned
and date-sorted `allPlays`, the list of `years` with plays, and the `minutesOf(play)`
duration heuristic. Everything else builds on it, so the play-cleaning rules and the
duration estimate are defined exactly once. Add shared derivations here rather than
duplicating them in a caller.

- `buildBreakdown(raw, { year })` — the story deck. One pass over the plays in range
  filling ~20 accumulator maps, then a derived section. Returns one plain object
  (`totals`, `you`, `topGames`, `podium`, `rivals`, `nemesis`, `rhythm`, `places`,
  `records`, …).
- `src/lib/explore.js` — the drill-downs: `buildLineup`, `buildPlayerCards`,
  `buildGameCard`, plus `activePlayers`/`playedGames` for the pickers. Per-player
  accumulation goes through `newRecord` / `addPlayToRecord` / `finishRecord`, so
  every player table in the app computes win rate and average score identically.
  `LINEUP_MODES` is the source of truth for the three lineup filters and their
  wording — the UI renders from it rather than hardcoding labels.
- `src/lib/awards.js` — the awards ceremony. `buildCeremony` turns each game into an
  event with medals, points and a stated reason per point, then a table and novelty
  awards. `AWARD_POINTS` is the default scheme and `opts.points` overrides any of it,
  so don't hardcode point values in slides — read them off the returned `points`.

Each engine re-runs `prepare(raw)` on every call. That is fine at this data size
(a 326 KB export) and keeps them independently callable; views memoise on
`[raw, year, …]` to avoid recomputing on unrelated renders.

### Views

**`src/Deck.jsx` is the only place the slide shell exists** — gradient, progress bar,
and keyboard/click/swipe navigation. Every view that can express itself as an array of
`{ id, theme, render }` goes through it: the main breakdown and each generated
drill-down. Prefer adding a slide array over building a bespoke scrolling layout.

`src/slides.jsx` (`buildSlides`) and `src/exploreSlides.jsx` (`buildLineupSlides`,
`buildPlayerSlides`, `buildGameSlides`) produce those arrays. **They contain falsy
entries on purpose** — a slide guards itself with its own data condition
(`b.nemesis && b.nemesis.losses > 0 && {…}`) and `.filter(Boolean)` drops it. That is
how sparse exports still read well; keep new slides to the same shape. `theme` maps to
a `.theme-*` gradient class in `styles.css`.

`src/App.jsx` owns the loaded export and the selected year, and switches between the
main deck and `Explore`. `src/Explore.jsx` is a chooser that builds a slide array and
hands it to its own `Deck`; it holds no stats logic of its own.

`src/ui.jsx` holds formatters (`fmt`, `pct`, `hoursLabel`, `dateLabel`) and every
visual primitive (`Avatar`, `Donut`, `VsBar`, `PlayerBars`, `ColumnChart`, `Thumb`,
`Bars`, `Stat`). Use these rather than formatting or drawing inline.

Two things to know about them:

- `playerColor(id)` derives a hue from the BG Stats player id, so one person is one
  colour everywhere. A slide using player-coloured bars must pick a dark theme — on
  `mint` a green player's bar vanishes into the gradient.
- `PlayerBars` prefers an explicit `label` over the player's name, which is what lets
  one player's per-game bars share their colour while naming the games.

Anything interactive inside a slide needs `.no-advance` (or to be a real `button`),
or the deck's click-to-advance will fire underneath it.

## BG Stats export schema

Facts that are easy to get wrong and expensive to debug:

- `gameRefId`, `playerRefId`, `locationRefId` point at the `id` field of the
  corresponding entity — **not** an array index and not the `uuid`.
- `metaData` and `scoresheet` are JSON-encoded *strings*, not objects. Always go
  through `safeJson`; they are frequently absent or malformed.
- Timestamps are local `"YYYY-MM-DD HH:mm:ss"` with no zone. `parseDate` builds them
  component-wise; `new Date(str)` would shift them.
- `playerScores[].winner` is authoritative. Do not re-derive winners from `score` or
  `rank` — `rank` is often `0` for every player, and cooperative games have no scores.
- `score` is a **string**, and `""`/`"0"` are both common. Coerce and check
  `Number.isFinite`.
- `game.rating` is 0–100 (divide by 10 to display); `highestWins` and `noPoints`
  decide how scores compare. Games won by condition rather than points (LOTR: Duel)
  log zeroes without setting `noPoints` — use `buildGameCard`'s `scoresMeaningful`,
  not `noPoints`, before showing any average.
- `playerScores[].role` is per player and means wildly different things per game:
  a faction (LOTR: Duel), a player colour (CATAN), or a character/spirit card
  (Critter Kitchen, Harmonies). Don't assume it implies asymmetry.
- `board` is a play-level string, and the variant lives at `scoresheet.variantLabel`
  — which usually just repeats the game's name and has to be filtered.
- The `scoresheet` blob is where win conditions live. `readScoresheet` in `explore.js`
  is the only place that parses it; extend that rather than re-parsing elsewhere. Row
  `type` carries the meaning: `radioOverall` is a way to win the whole game,
  `radio`/`checkbox` are in-game honours (Longest Road), `ignoredForTotal` holds a
  tracked value, and absent means a plain number. **Don't conflate an honour with a
  win condition** — they render as separate slides for that reason.
- Scoresheet rows are keyed by *player score uuid*, not player id. Resolve via each
  `playerScores[].metaData.scoreUuid`, which keeps anonymous players working.
- `durationMin: 0` means untimed, not instant — roughly half of real plays.
- `plays[].ignored` plays are excluded everywhere.

## Conventions these views rely on

Changing any of these silently changes numbers the user has already seen, so change
them deliberately and update the README's "Notes on the data".

- **Duration cascade**: logged `durationMin`, else BG Stats' own `averageDurationMin`
  from `game.metaData`, else the midpoint of BGG's `minPlayTime`/`maxPlayTime`. Any
  screen showing hours also reports how much was actually timed.
- **Year filtering** is by calendar year via `inYear`; `null` means all time.
  `totals.shelfOfShame` deliberately ignores the filter (never played *at all*),
  because "unplayed in 2026" reads as nonsense.
- **`MIN_PLAYS_FOR_RANKING`** (`explore.js`) gates best/worst rankings so one fluke
  can't top a list, for both a player's games and a game's roles. Subjects below it
  get `rankingIsProvisional` / `roleRanking.provisional` rather than a fabricated
  ranking. It gates the *ranking*, never what gets shown: thin rows are still charted,
  sorted below the ranked ones and passed `muted: true` so `Bars` fades them. Don't
  filter data out to tidy a chart — mark it.
- **Head-to-head decides a play only when exactly one side won.** Draws and plays won
  by someone outside the selection surface as `undecided` / `draws` instead of being
  folded into anyone's losses.
- **A tie is never broken silently.** `leadersOf` returns every player level at the
  top plus a `tied` flag, and the UI names them all. Don't reduce it to `ranked[0]`.
  The ceremony follows the same rule: standard competition ranking (1, 1, 3), ties
  share the medal *and* its full points, and no arbitrary tie-break demotes anyone.
- **Every ceremony point is traceable.** Each event line carries `reasons`, and their
  points sum to the line's total. Keep that invariant — it is what makes the final
  table auditable instead of a black box — and never award points without a reason.
- **`entries` vs `playCount`** on a role/board/variant bucket: `entries` counts
  player-slots, `playCount` distinct plays. They match for roles (one player per
  role) but not for boards or variants, where the whole table shares one value — so
  a board gets no win rate, only scoring.
- **Lineup modes** (`LINEUP_MODES`): `subset` allows any two-or-more of the selection
  with no outsiders, `includes` requires all of them but tolerates outsiders, `exactly`
  requires the precise set. Under `subset` a player's `plays` counts only the plays
  they were at, so the plays column legitimately varies by row — don't "fix" that by
  dividing through a single total.

# BGS Breakdown

A Spotify-Wrapped-style breakdown of your board game year, built from a
[BG Stats](https://www.bgstatsapp.com/) JSON export.

Drop your export in, swipe through the slides, then dig into the detail.
Everything is parsed in the browser — no data leaves your machine.

## Run it

```powershell
npm install
npm run dev
```

Then open the URL Vite prints, and drop `BGStatsExport.json` onto the page.
In BG Stats the export lives under **Settings → Backup / Export → JSON**.

## The story deck

| Slide | What it shows |
| --- | --- |
| Plays | Total plays, unique games, days played |
| Time | Hours at the table, as a share of full days |
| Top games | Top 5 by play count, with BGG thumbnails |
| Game of the year | Your #1 and its share of all plays |
| You | Your personal win rate |
| Leaderboard | Wins by player, plus best win rate |
| Nemesis | Whoever beat you most in head-to-head games |
| Your table | How many people played, and who most often |
| Rhythm | Plays per month, peak month, favourite weekday |
| Biggest night | Most plays in a single day, longest daily streak |
| Home turf | Where you played, by location |
| Records | Longest session, highest score, biggest blowout, closest finish |
| Fresh cardboard | New-to-you games, and the shelf of shame |

Slides with no data for the selected range drop out automatically, so a sparse
export still reads well. A year picker switches between each year that has plays
and all-time.

## Dig deeper

The deck is the default view. **Dig deeper** opens a graphical chooser that generates
a themed mini-deck for whatever you pick — same gradients, progress bar and swipe
navigation as the main breakdown. Each mini-deck ends on an "all the numbers" slide,
so the dense table is one swipe from the visuals rather than the only view.

**Head to head** — tap faces to build a group, then pick which plays count:

- *Only these players* — any combination from the group, nobody from outside it.
- *All of them, plus anyone* — every play the whole group was at, outsiders welcome.
- *Exactly this lineup* — only plays with all of them and nobody else.

"Only these players" is the interesting one for a regular gaming group: pick three
regulars and you get all three together **plus** each pairing among them, without any
play where someone outside the group was at the table. Each player's win rate is then
over their own plays within that set, so the plays column varies by row.

The resulting deck covers the group's leader, standings, a versus bar per pair, which
slices of the group actually turn up, what they play, and where.

**Players** — a card each: win-rate ring, strongest and weakest game, most played, and
the per-game table. Best and worst are by win rate across games played at least twice,
so one lucky game can't top the list; anyone below that threshold is flagged as
provisional.

**Games** — everyone's record in one game: champion, wins, average/best/worst scores,
the player-count split, locations, and how often the start player went on to win.

Where a game records **roles**, it also gets a win rate per role and points per role
(Sauron vs The Fellowship at LOTR: Duel comes out 4–5; Owl is the best Harmonies
spirit at 50%). Where plays record a **board** or a **variant**, each gets its average,
highest and lowest score. Games without those fields simply don't show the slides.

Anywhere a leader is named, a level score says so — "Ada & Bo tied on 2" rather than
quietly picking one of them.

## Layout

- `src/lib/stats.js` — the story-deck engine, plus `prepare(raw)`, which indexes an
  export once (lookup maps, cleaned play list, duration heuristic). No React in here.
- `src/lib/explore.js` — the drill-down engines: `buildLineup`, `buildPlayerCards`,
  `buildGameCard`, and `activePlayers`/`playedGames` for the pickers. Built on the same
  `prepare`, so indexing and the duration heuristic are defined once.
- `src/Deck.jsx` — the slide shell: gradients, progress bar, keyboard/click/swipe
  navigation. Anything expressible as slides gets the story treatment through here.
- `src/slides.jsx` — the main breakdown's slides. Each is `{ id, theme, render }`; a
  falsy entry is filtered out when its data is missing.
- `src/exploreSlides.jsx` — the same shape for each drill-down: `buildLineupSlides`,
  `buildPlayerSlides`, `buildGameSlides`.
- `src/Explore.jsx` — the chooser, and the mini-deck it launches.
- `src/App.jsx` — file loading, year selection, deck vs chooser.
- `src/ui.jsx` — formatters and the visual primitives: `Avatar`, `Donut`, `VsBar`,
  `PlayerBars`, `ColumnChart`, `Thumb`, `Bars`, `Stat`.
- `src/styles.css` — slide shell, gradient themes, chart and table styles.

Player colours come from `playerColor(id)` in `ui.jsx`, derived from the BG Stats
player id, so the same person is the same colour on every chart. Slides that use those
colours pick a dark theme, otherwise a green player's bar disappears into a green
gradient.

## Notes on the data

- Plays flagged `ignored` are skipped.
- Untimed plays (`durationMin: 0`) are estimated from BG Stats' own
  `averageDurationMin`, falling back to the BGG published play time. The Time slide
  says how much was actually timed, as does each game's card.
- "You" is whoever `userInfo.meRefId` points at, marked ★ in the player picker.
- Scores are compared using the game's `highestWins` flag when working out margins.
- Head-to-head counts a play as decided only when exactly one side won it. Plays where
  nobody in the selection won — a draw, or an outsider taking it — are reported
  separately rather than folded into anyone's losses.
- Games with a victory condition rather than a score (LOTR: Duel, say) log lots of
  blanks and zeroes while still leaving `noPoints` false. `scoresMeaningful` spots
  this — fewer than half the entries carrying a real score — and score slides and
  columns hide themselves rather than averaging nonsense.
- Roles are per player, so a role's count is outings. A board or variant belongs to
  the whole play, so every player at the table contributes a score to it: those are
  counted in plays, and they get no win rate, since one would only reflect the player
  count.
- Every role is charted, however few times it was played. Best/worst still needs at
  least two outings, for the same reason as a player's best game, so single-outing
  roles are grouped and faded at the bottom of the chart — present and readable, but
  visibly outside the ranking, so a 100% one-off can't look like it beat the leader.
  When no role clears the threshold, the ranking is dropped and all roles read equally.
- `variantLabel` usually just repeats the game's own name, so it's only shown when it
  actually distinguishes something.

## Ideas for next

- Expansion usage and a games-per-weight breakdown
- Shareable image export per slide
- Game-length sweet spot: where your win rate is highest
- Team play support (`usesTeams`) — currently counted but not broken out

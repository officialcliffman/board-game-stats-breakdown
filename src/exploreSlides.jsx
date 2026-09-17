import React from 'react';
import {
  Avatar, Bars, ColumnChart, Donut, PlayerBars, Stat, Thumb, VsBar,
  dateLabel, hoursLabel, pct, playerColor,
} from './ui.jsx';
import { MIN_PLAYS_FOR_RANKING as MIN_PLAYS } from './lib/explore.js';

const joinNames = (people) => {
  const names = people.map((p) => p.name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
};

/**
 * Who leads, naming everyone when it is level rather than silently picking one.
 * `leaders` is every player tied at the top.
 */
function leaderLabel({ leaders, tied }) {
  if (!leaders.length) return 'nobody has won it yet';
  const wins = leaders[0].wins;
  const who = joinNames(leaders.map((l) => l.player));
  if (tied) return `${who} tied on ${wins}`;
  return `${who} leads (${wins})`;
}

/** Reusable "all the numbers" slide, so detail is one swipe from the visuals. */
function TableSlide({ eyebrow, title, columns, rows, footnote }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="title title--compact">{title}</h2>
      <div className="table-wrap no-advance">
        <table className="grid">
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                {r.cells.map((cell, i) => <td key={columns[i]}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote && <p className="footnote">{footnote}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ lineup */

export function buildLineupSlides(r, modeLabel) {
  const people = r.table.map((row) => row.player);
  const leader = r.table[0];
  const decided = r.plays - r.undecided;

  return [
    {
      id: 'lineup-intro',
      theme: 'violet',
      render: () => (
        <>
          <p className="eyebrow">{modeLabel}</p>
          <div className="avatar-row">
            {people.map((p) => <Avatar key={p.id} player={p} size={64} />)}
          </div>
          <h1 className="mega mega--tight">{joinNames(people)}</h1>
          <p className="lede">
            <strong>{r.plays}</strong> {r.plays === 1 ? 'play' : 'plays'} together
            {r.minutes > 0 && <> · <strong>{hoursLabel(r.minutes)}</strong> at the table</>}
          </p>
          {r.firstPlay && (
            <p className="footnote">{dateLabel(r.firstPlay)} → {dateLabel(r.lastPlay)}</p>
          )}
        </>
      ),
    },
    leader && {
      id: 'lineup-leader',
      theme: 'gold',
      render: () => (
        <>
          <p className="eyebrow">Top of the group</p>
          <div className="hero-figure">
            <Avatar player={leader.player} size={110} />
            <Donut
              value={leader.winRate}
              label={pct(leader.winRate)}
              sub="win rate"
              size={132}
              color={playerColor(leader.player.id)}
            />
          </div>
          <h1 className="mega mega--tight">{leader.player.name}</h1>
          <p className="lede">
            <strong>{leader.wins}</strong> wins from <strong>{leader.plays}</strong> plays
            in this group.
          </p>
        </>
      ),
    },
    {
      id: 'lineup-standings',
      // a dark neutral ground, so the per-player bar colours stay legible
      theme: 'deep',
      render: () => (
        <>
          <p className="eyebrow">Standings</p>
          <h2 className="title">Who wins in this group</h2>
          <PlayerBars
            rows={r.table.map((row) => ({
              player: row.player,
              value: row.wins,
              display: `${row.wins} · ${pct(row.winRate)}`,
            }))}
          />
          <p className="footnote">
            {r.undecided > 0
              ? `${decided} of ${r.plays} plays went to someone in the group; the other ${r.undecided} were a draw or won by an outsider.`
              : 'Bar length is wins; the percentage is their win rate across their own plays here.'}
          </p>
        </>
      ),
    },
    r.grid.length > 0 && {
      id: 'lineup-pairs',
      theme: 'crimson',
      render: () => (
        <>
          <p className="eyebrow">Pair by pair</p>
          <h2 className="title title--compact">Head to head</h2>
          <div className="vs-stack">
            {r.grid.map((pair) => (
              <VsBar
                key={`${pair.a.id}-${pair.b.id}`}
                a={pair.a} b={pair.b}
                aWins={pair.aWins} bWins={pair.bWins}
                draws={pair.draws} shared={pair.shared}
              />
            ))}
          </div>
        </>
      ),
    },
    r.combos.length > 1 && {
      id: 'lineup-combos',
      theme: 'indigo',
      render: () => (
        <>
          <p className="eyebrow">Who actually turns up</p>
          <h2 className="title title--compact">
            {r.combos[0].size === people.length
              ? 'Usually the full group'
              : `Most often it is just ${joinNames(r.combos[0].players)}`}
          </h2>
          <div className="combo-list">
            {r.combos.map((c) => (
              <div className="combo" key={c.key}>
                <span className="combo-faces">
                  {c.players.map((p) => <Avatar key={p.id} player={p} size={32} />)}
                </span>
                <span className="combo-body">
                  <strong>{joinNames(c.players)}</strong>
                  <small>
                    {c.plays} {c.plays === 1 ? 'play' : 'plays'}
                    {' · '}
                    <span className={c.tied ? 'tie' : undefined}>{leaderLabel(c)}</span>
                  </small>
                </span>
              </div>
            ))}
          </div>
        </>
      ),
    },
    r.games.length > 0 && {
      id: 'lineup-games',
      theme: 'sunset',
      render: () => (
        <>
          <p className="eyebrow">Their games</p>
          <h2 className="title title--compact">What this group plays</h2>
          <ol className="ranked ranked--tight">
            {r.games.slice(0, 6).map((row, i) => (
              <li key={row.game?.id ?? i}>
                <span className="rank">{i + 1}</span>
                <Thumb game={row.game} size={48} />
                <span className="ranked-body">
                  <strong>{row.game?.name}</strong>
                  <small>
                    {row.plays} {row.plays === 1 ? 'play' : 'plays'}
                    {' · '}
                    <span className={row.tied ? 'tie' : undefined}>{leaderLabel(row)}</span>
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    r.locations.length > 1 && {
      id: 'lineup-where',
      theme: 'forest',
      render: () => (
        <>
          <p className="eyebrow">Where they meet</p>
          <h1 className="mega mega--tight">{r.locations[0].name}</h1>
          <p className="lede">
            hosted <strong>{r.locations[0].plays}</strong> of these {r.plays} plays.
          </p>
          <ColumnChart rows={r.locations.map((l) => ({ label: l.name, value: l.plays }))} />
        </>
      ),
    },
    {
      id: 'lineup-numbers',
      theme: 'slate',
      render: () => (
        <TableSlide
          eyebrow="All the numbers"
          title="Group record"
          columns={['Player', 'Plays', 'Wins', 'Win %', 'Avg score', 'Went first']}
          rows={r.table.map((row) => ({
            key: row.player.id,
            cells: [
              row.player.name, row.plays, row.wins, pct(row.winRate),
              row.avgScore === null ? '—' : row.avgScore.toFixed(1),
              row.startedFirst,
            ],
          }))}
          footnote="Plays differ per player when the selection allows partial lineups."
        />
      ),
    },
  ].filter(Boolean);
}

/* ------------------------------------------------------------------ player */

export function buildPlayerSlides(c) {
  const gameLine = (entry) => (entry
    ? `${entry.wins}/${entry.plays} · ${pct(entry.winRate)}`
    : '—');

  return [
    {
      id: 'player-intro',
      theme: 'ocean',
      render: () => (
        <>
          <p className="eyebrow">Player card</p>
          <Avatar player={c.player} size={120} />
          <h1 className="mega mega--tight">{c.player.name}</h1>
          <p className="lede">
            <strong>{c.plays}</strong> plays · <strong>{c.wins}</strong> wins
            {c.minutes > 0 && <> · <strong>{hoursLabel(c.minutes)}</strong></>}
          </p>
        </>
      ),
    },
    {
      id: 'player-rate',
      theme: 'violet',
      render: () => (
        <>
          <p className="eyebrow">Win rate</p>
          <Donut
            value={c.winRate}
            label={pct(c.winRate)}
            sub={`${c.wins} of ${c.plays}`}
            color={playerColor(c.player.id)}
          />
          <div className="stat-grid stat-grid--loose">
            <Stat label="Outright wins" value={c.soloWins} sub={`of ${c.wins}`} />
            <Stat label="Went first" value={c.startedFirst} sub={`of ${c.plays} plays`} />
            {c.topPartner && (
              <Stat
                label="Usual opponent"
                value={c.topPartner.player.name}
                sub={`${c.topPartner.shared} plays`}
              />
            )}
          </div>
        </>
      ),
    },
    c.bestGame && {
      id: 'player-best',
      theme: 'gold',
      render: () => (
        <>
          <p className="eyebrow">Their strongest game</p>
          <Thumb game={c.bestGame.game} size={150} />
          <h2 className="title title--compact">{c.bestGame.game?.name}</h2>
          <p className="lede">{gameLine(c.bestGame)}</p>
          {c.rankingIsProvisional && (
            <p className="footnote">
              No game played more than once yet, so this is provisional.
            </p>
          )}
        </>
      ),
    },
    c.worstGame && {
      id: 'player-worst',
      theme: 'crimson',
      render: () => (
        <>
          <p className="eyebrow">Their weakest game</p>
          <Thumb game={c.worstGame.game} size={150} />
          <h2 className="title title--compact">{c.worstGame.game?.name}</h2>
          <p className="lede">{gameLine(c.worstGame)}</p>
          <p className="footnote">
            Best and worst are by win rate across games played at least twice.
          </p>
        </>
      ),
    },
    c.perGame.length > 1 && {
      id: 'player-games',
      theme: 'sunset',
      render: () => (
        <>
          <p className="eyebrow">Most played</p>
          <h2 className="title title--compact">{c.player.name}&rsquo;s table</h2>
          <PlayerBars
            rows={c.perGame.slice(0, 7).map((g) => ({
              label: g.game?.name ?? 'Unknown',
              player: c.player,
              value: g.plays,
              display: `${g.plays} · ${pct(g.winRate)}`,
            }))}
          />
          <p className="footnote">Bar length is plays; the percentage is their win rate in it.</p>
        </>
      ),
    },
    {
      id: 'player-numbers',
      theme: 'slate',
      render: () => (
        <TableSlide
          eyebrow="All the numbers"
          title={`${c.player.name}, game by game`}
          columns={['Game', 'Plays', 'Wins', 'Win %', 'Best']}
          rows={c.perGame.map((g) => ({
            key: g.game?.id,
            cells: [
              g.game?.name ?? 'Unknown', g.plays, g.wins, pct(g.winRate),
              g.best === null ? '—' : g.best,
            ],
          }))}
        />
      ),
    },
  ].filter(Boolean);
}

/* -------------------------------------------------------------------- game */

/** Rows of avg / high / low for a board or variant. */
function ScoreBuckets({ buckets, noun }) {
  return (
    <div className="buckets">
      {buckets.map((b) => (
        <div className="bucket" key={b.name}>
          <span className="bucket-head">
            <strong>{b.name}</strong>
            <small>{b.playCount} {b.playCount === 1 ? noun : `${noun}s`}</small>
          </span>
          {b.avgScore === null ? (
            <small className="bucket-empty">no scores recorded</small>
          ) : (
            <span className="bucket-figures">
              <span><em>avg</em>{b.avgScore.toFixed(1)}</span>
              <span><em>high</em>{b.highest.score} <i>{b.highest.player?.name}</i></span>
              <span><em>low</em>{b.lowest.score} <i>{b.lowest.player?.name}</i></span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function buildGameSlides(card) {
  // a scored column is only worth showing when the scores carry information
  const scored = card.scoresMeaningful && card.table.some((r) => r.avgScore !== null);

  const roles = card.roles;
  const rolesScored = card.scoresMeaningful && roles.some((r) => r.avgScore !== null);
  const { best: bestRole, worst: worstRole, provisional } = card.roleRanking;
  const roleCoverageNote = card.coverage.rolePlays < card.plays
    ? `Roles recorded on ${card.coverage.rolePlays} of ${card.plays} plays.`
    : null;

  // Every role is charted, but a 100%-from-one-outing role sorted above the ranked
  // winner would contradict the headline. So rank the ones that qualify, then group
  // the thin ones below them, dimmed.
  const byWinRate = (a, b) => b.winRate - a.winRate || b.entries - a.entries;
  const qualified = provisional ? roles : roles.filter((r) => r.entries >= MIN_PLAYS);
  const thin = provisional ? [] : roles.filter((r) => r.entries < MIN_PLAYS);
  const roleRows = [
    ...[...qualified].sort(byWinRate).map((r) => ({ role: r, muted: false })),
    ...[...thin].sort(byWinRate).map((r) => ({ role: r, muted: true })),
  ].map(({ role, muted }) => ({
    label: role.name,
    value: role.winRate,
    display: `${pct(role.winRate)} (${role.wins}/${role.entries})`,
    muted,
  }));

  const roleSlides = roles.length > 1 ? [
    {
      id: 'game-roles',
      theme: 'violet',
      render: () => (
        <>
          <p className="eyebrow">{roles.length} roles played</p>
          <h2 className="title title--compact">
            {provisional
              ? 'Every role tried once'
              : `${bestRole.name} wins most`}
          </h2>
          {!provisional && (
            <p className="lede">
              <strong>{pct(bestRole.winRate)}</strong> win rate from{' '}
              {bestRole.entries} {bestRole.entries === 1 ? 'outing' : 'outings'}
              {worstRole && worstRole !== bestRole && (
                <> · weakest is <strong>{worstRole.name}</strong> at {pct(worstRole.winRate)}</>
              )}
            </p>
          )}
          <Bars rows={roleRows} />
          <p className="footnote">
            Win rate per role, with wins out of outings.
            {thin.length > 0 && ` The faded ${thin.length} at the bottom were played only once, so they are shown but not ranked.`}
            {roleCoverageNote && ` ${roleCoverageNote}`}
          </p>
        </>
      ),
    },
    rolesScored && {
      id: 'game-role-scores',
      theme: 'ember',
      render: () => {
        const byScore = [...roles]
          .filter((r) => r.avgScore !== null)
          .sort((a, b) => b.avgScore - a.avgScore);
        // the single best score, and whoever actually set it
        const topScore = [...byScore]
          .sort((a, b) => (b.highest?.score ?? -Infinity) - (a.highest?.score ?? -Infinity))[0];
        return (
          <>
            <p className="eyebrow">Points per role</p>
            <h2 className="title title--compact">
              {byScore[0].name} scores highest
            </h2>
            <p className="lede">
              averaging <strong>{byScore[0].avgScore.toFixed(1)}</strong>
              {byScore.length > 1 && (
                <> · lowest is <strong>{byScore[byScore.length - 1].name}</strong> on{' '}
                  {byScore[byScore.length - 1].avgScore.toFixed(1)}
                </>
              )}
            </p>
            <Bars
              rows={byScore.map((r) => ({
                label: r.name,
                value: r.avgScore,
                display: `${r.avgScore.toFixed(1)} · ${r.entries}×`,
              }))}
            />
            <p className="footnote">
              Average score per outing, with the number of outings — several of these
              rest on a single game. Best single score with a role recorded:{' '}
              {topScore.highest.score} by {topScore.highest.player?.name} on {topScore.name}.
            </p>
          </>
        );
      },
    },
    {
      id: 'game-roles-table',
      theme: 'slate',
      render: () => (
        <TableSlide
          eyebrow="All the numbers"
          title="Role by role"
          columns={rolesScored
            ? ['Role', 'Played', 'Wins', 'Win %', 'Avg', 'High', 'Low']
            : ['Role', 'Played', 'Wins', 'Win %', 'Played by']}
          rows={roles.map((r) => ({
            key: r.name,
            cells: rolesScored
              ? [
                r.name, r.entries, r.wins, pct(r.winRate),
                r.avgScore === null ? '—' : r.avgScore.toFixed(1),
                r.highest?.score ?? '—',
                r.lowest?.score ?? '—',
              ]
              : [
                r.name, r.entries, r.wins, pct(r.winRate),
                r.players.map((p) => `${p.player.name} ${p.wins}/${p.plays}`).join(', '),
              ],
          }))}
          footnote={roleCoverageNote}
        />
      ),
    },
  ].filter(Boolean) : [];

  const { conditionTally: ct } = card;
  const topCondition = card.conditions[0];

  const conditionSlides = card.conditions.length > 0 ? [
    {
      id: 'game-conditions',
      theme: 'neon',
      render: () => (
        <>
          <p className="eyebrow">Ways to win</p>
          <h2 className="title title--compact">
            {card.conditions.length === 1
              ? `Always by ${topCondition.name}`
              : `Usually by ${topCondition.name}`}
          </h2>
          <div className="buckets">
            {card.conditions.map((c) => (
              <div className="bucket" key={c.name}>
                <span className="bucket-head">
                  <strong>{c.name}</strong>
                  <small>{c.plays} {c.plays === 1 ? 'win' : 'wins'}</small>
                </span>
                <span className="condition-who">
                  {c.players.map((p) => (
                    <span className="condition-player" key={p.player.id}>
                      <Avatar player={p.player} size={26} />
                      {p.player.name}
                      {p.count > 1 && <em>×{p.count}</em>}
                    </span>
                  ))}
                </span>
                {c.roles.length > 0 && (
                  <small className="condition-roles">
                    as {c.roles.map((r) => `${r.role}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')}
                  </small>
                )}
              </div>
            ))}
            {card.unusedConditions.map((name) => (
              <div className="bucket bucket--unused" key={name}>
                <span className="bucket-head">
                  <strong>{name}</strong>
                  <small>never</small>
                </span>
                <small className="bucket-empty">nobody has won this way yet</small>
              </div>
            ))}
          </div>
          <p className="footnote">
            From the {ct.marked} of {ct.withRows} {ct.withRows === 1 ? 'play' : 'plays'} with a
            winning condition recorded.
            {ct.onPoints > 0 && ` The other ${ct.onPoints} ${ct.onPoints === 1 ? 'was' : 'were'} decided on points.`}
          </p>
        </>
      ),
    },
  ] : [];

  const achievementSlides = card.achievements.length > 0 ? [
    {
      id: 'game-achievements',
      theme: 'sunset',
      render: () => (
        <>
          <p className="eyebrow">Honours</p>
          <h2 className="title title--compact">
            {card.achievements[0].players[0]
              ? `${card.achievements[0].players[0].player.name} owns ${card.achievements[0].name}`
              : 'Claimed along the way'}
          </h2>
          <div className="buckets">
            {card.achievements.map((a) => (
              <div className="bucket" key={a.name}>
                <span className="bucket-head">
                  <strong>{a.name}</strong>
                  <small>{a.claims} {a.claims === 1 ? 'time' : 'times'}</small>
                </span>
                <span className="condition-who">
                  {a.players.map((p) => (
                    <span className="condition-player" key={p.player.id}>
                      <Avatar player={p.player} size={26} />
                      {p.player.name}
                      {p.count > 1 && <em>×{p.count}</em>}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className="footnote">
            In-game honours rather than ways to win — bonuses the scoresheet tracks.
          </p>
        </>
      ),
    },
  ] : [];

  const bucketSlides = [
    card.boards.length > 0 && {
      id: 'game-boards',
      theme: 'forest',
      render: () => (
        <>
          <p className="eyebrow">
            {card.boards.length} {card.boards.length === 1 ? 'board' : 'boards'} used
          </p>
          <h2 className="title title--compact">
            {card.boardRanking.highest
              ? `${card.boardRanking.highest.name} scores best`
              : 'Boards played'}
          </h2>
          <ScoreBuckets buckets={card.boards} noun="play" />
          <p className="footnote">
            Every player&rsquo;s score on that board counts toward its average.
            {card.boardRanking.thin
              && ' Each board has only one play so far, so treat this as trivia.'}
          </p>
        </>
      ),
    },
    card.variants.length > 0 && {
      id: 'game-variants',
      theme: 'candy',
      render: () => (
        <>
          <p className="eyebrow">
            {card.variants.length} {card.variants.length === 1 ? 'variant' : 'variants'}
          </p>
          <h2 className="title title--compact">
            {card.variantRanking.highest
              ? `${card.variantRanking.highest.name} scores highest`
              : 'Variants played'}
          </h2>
          <ScoreBuckets buckets={card.variants} noun="play" />
        </>
      ),
    },
  ].filter(Boolean);

  return [
    {
      id: 'game-intro',
      theme: 'deep',
      render: () => (
        <>
          <p className="eyebrow">Game card</p>
          <Thumb game={card.game} size={168} />
          <h1 className="mega mega--tight">{card.game?.name}</h1>
          <p className="lede">
            <strong>{card.plays}</strong> {card.plays === 1 ? 'play' : 'plays'}
            {card.avgMinutes > 0 && <> · averaging <strong>{hoursLabel(card.avgMinutes)}</strong></>}
          </p>
          <p className="footnote">
            {card.game?.bggYear ? `${card.game.bggYear} · ` : ''}
            {card.game?.designers || 'Unknown designer'}
            {card.timedPlays < card.plays
              && ` · ${card.timedPlays} of ${card.plays} plays timed, the rest estimated`}
          </p>
        </>
      ),
    },
    card.champion && {
      id: 'game-champion',
      theme: 'gold',
      render: () => (
        <>
          <p className="eyebrow">Reigning champion</p>
          <div className="hero-figure">
            <Avatar player={card.champion.player} size={110} />
            <Donut
              value={card.champion.winRate}
              label={pct(card.champion.winRate)}
              sub="win rate"
              size={132}
              color={playerColor(card.champion.player.id)}
            />
          </div>
          <h1 className="mega mega--tight">{card.champion.player.name}</h1>
          <p className="lede">
            <strong>{card.champion.wins}</strong> wins from{' '}
            <strong>{card.champion.plays}</strong> plays of {card.game?.name}.
          </p>
        </>
      ),
    },
    card.table.length > 1 && {
      id: 'game-standings',
      theme: 'ocean',
      render: () => (
        <>
          <p className="eyebrow">Everyone&rsquo;s record</p>
          <h2 className="title title--compact">Wins at {card.game?.name}</h2>
          <PlayerBars
            rows={card.table.map((r) => ({
              player: r.player,
              value: r.wins,
              display: `${r.wins}/${r.plays} · ${pct(r.winRate)}`,
            }))}
          />
        </>
      ),
    },
    scored && card.highest && {
      id: 'game-scores',
      theme: 'ember',
      render: () => (
        <>
          <p className="eyebrow">Scores</p>
          <p className="stat-hero">{card.highest.score}</p>
          <h2 className="stat-caption">
            high score, {card.highest.player?.name}
          </h2>
          <div className="stat-grid stat-grid--loose">
            {card.lowest && (
              <Stat label="Lowest" value={card.lowest.score} sub={card.lowest.player?.name} />
            )}
            <Stat
              label="Table average"
              value={(() => {
                const rows = card.table.filter((r) => r.avgScore !== null);
                if (!rows.length) return '—';
                const total = rows.reduce((a, r) => a + r.scoreTotal, 0);
                const n = rows.reduce((a, r) => a + r.scoredPlays, 0);
                return n ? (total / n).toFixed(1) : '—';
              })()}
            />
          </div>
          <PlayerBars
            rows={card.table
              .filter((r) => r.avgScore !== null)
              .map((r) => ({
                player: r.player,
                value: r.avgScore,
                display: r.avgScore.toFixed(1),
              }))}
          />
          <p className="footnote">Average score per play.</p>
        </>
      ),
    },
    (card.playerCounts.length > 1 || card.firstPlayerAdvantage !== null) && {
      id: 'game-shape',
      theme: 'indigo',
      render: () => (
        <>
          <p className="eyebrow">How it gets played</p>
          <h2 className="title title--compact">
            {card.playerCounts.length > 1
              ? `Usually a ${[...card.playerCounts].sort((a, b) => b.plays - a.plays)[0].count}-player game`
              : `Always a ${card.playerCounts[0]?.count}-player game`}
          </h2>
          {card.playerCounts.length > 1 && (
            <ColumnChart
              rows={card.playerCounts.map((c) => ({ label: `${c.count}p`, value: c.plays }))}
            />
          )}
          {card.firstPlayerAdvantage !== null && (
            <>
              <Donut
                value={card.firstPlayerAdvantage}
                label={pct(card.firstPlayerAdvantage)}
                sub="first player wins"
                size={140}
              />
              <p className="footnote">
                From the {card.firstPlayerKnown} {card.firstPlayerKnown === 1 ? 'play' : 'plays'} with
                a recorded start player.
              </p>
            </>
          )}
        </>
      ),
    },
    ...conditionSlides,
    ...roleSlides,
    ...achievementSlides,
    ...bucketSlides,
    card.locations.length > 1 && {
      id: 'game-where',
      theme: 'mint',
      render: () => (
        <>
          <p className="eyebrow">Where it hits the table</p>
          <h1 className="mega mega--tight">{card.locations[0].name}</h1>
          <ColumnChart rows={card.locations.map((l) => ({ label: l.name, value: l.plays }))} />
        </>
      ),
    },
    {
      id: 'game-numbers',
      theme: 'slate',
      render: () => (
        <TableSlide
          eyebrow="All the numbers"
          title={card.game?.name}
          columns={scored
            ? ['Player', 'Plays', 'Wins', 'Win %', 'Avg', 'Best', 'Worst']
            : ['Player', 'Plays', 'Wins', 'Win %']}
          rows={card.table.map((r) => ({
            key: r.player.id,
            cells: scored
              ? [
                r.player.name, r.plays, r.wins, pct(r.winRate),
                r.avgScore === null ? '—' : r.avgScore.toFixed(1),
                r.bestScore ?? '—', r.worstScore ?? '—',
              ]
              : [r.player.name, r.plays, r.wins, pct(r.winRate)],
          }))}
          footnote={card.firstPlay
            ? `First played ${dateLabel(card.firstPlay)} · last played ${dateLabel(card.lastPlay)}`
            : null}
        />
      ),
    },
  ].filter(Boolean);
}

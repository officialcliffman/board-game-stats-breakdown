import React from 'react';
import { Avatar, Thumb, pct, playerColor } from './ui.jsx';

const MEDAL_ICON = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

const signed = (n) => `${n >= 0 ? '+' : ''}${n}`;

const joinNames = (people) => {
  const names = people.map((p) => p.name);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
};

/** One competitor's line in an event. */
function ResultRow({ line, scored }) {
  const medal = line.medal ? MEDAL_ICON[line.medal] : null;
  return (
    <div className={`result${line.medal ? '' : ' result--unplaced'}`}>
      <span className="result-medal">{medal ?? <em>—</em>}</span>
      <Avatar player={line.player} size={38} />
      <span className="result-body">
        <strong>
          {line.player.name}
          {line.shared && <span className="tie">shared</span>}
        </strong>
        <small>
          {line.wins}/{line.plays} · {pct(line.winRate)}
          {scored && line.best !== null && ` · best ${line.best}`}
        </small>
        {line.reasons.length > 0 && (
          <span className="result-reasons">
            {line.reasons.map((r) => (
              <span className={`chip-reason chip-reason--${r.kind}`} key={r.kind}>
                {r.label} {signed(r.points)}
              </span>
            ))}
          </span>
        )}
        {!line.medal && line.plays < 2 && (
          <small className="result-note">only {line.plays} play, not eligible for a medal</small>
        )}
      </span>
      <span className={`result-points${line.points < 0 ? ' is-negative' : ''}`}>
        {signed(line.points)}
      </span>
    </div>
  );
}

/**
 * The ceremony, as a deck: the rules, then one event per game working up to the
 * most-played, then the novelty awards, the podium, and finally the full table.
 * Running totals are deliberately withheld until the podium.
 */
export function buildCeremonySlides(c) {
  const competitors = c.standings.map((s) => s.player);
  const { points } = c;

  const eventSlides = c.events.map((e, i) => ({
    id: `event-${e.game?.id ?? i}`,
    theme: i === c.events.length - 1 ? 'gold' : ['violet', 'ocean', 'crimson', 'indigo', 'forest'][i % 5],
    render: () => (
      <>
        <p className="eyebrow">
          {i === c.events.length - 1 ? 'Main event' : `Event ${i + 1} of ${c.events.length}`}
        </p>
        <div className="event-head">
          <Thumb game={e.game} size={56} />
          <div>
            <h2 className="title title--compact">{e.game?.name}</h2>
            <small className="event-sub">
              {e.plays} {e.plays === 1 ? 'play' : 'plays'} · {e.contested} in contention
              {!e.scored && ' · no scoring'}
            </small>
          </div>
        </div>
        <div className="results">
          {e.table.map((line) => (
            <ResultRow key={line.player.id} line={line} scored={e.scored} />
          ))}
        </div>
      </>
    ),
  }));

  const specialSlides = c.specials.map((sp) => ({
    id: `special-${sp.id}`,
    theme: sp.id === 'wooden-spoon' ? 'slate' : 'candy',
    render: () => (
      <>
        <p className="eyebrow">Special award</p>
        <h1 className="mega mega--tight">{sp.title}</h1>
        <div className="avatar-row">
          {sp.holders.map((h) => <Avatar key={h.player.id} player={h.player} size={64} />)}
        </div>
        <p className="lede">
          <strong>{joinNames(sp.holders.map((h) => h.player))}</strong>
          {' — '}
          {sp.holders.map((h) => sp.detail(h)).join(', ')}
        </p>
        <p className="footnote">{sp.blurb}</p>
      </>
    ),
  }));

  const top3 = c.standings.slice(0, 3);
  // podium order: silver, gold, bronze, so the winner stands in the middle
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean);

  return [
    {
      id: 'ceremony-intro',
      theme: 'aurora',
      render: () => (
        <>
          <p className="eyebrow">{c.year ?? 'All time'}</p>
          <h1 className="mega">The Awards</h1>
          <div className="avatar-row">
            {competitors.map((p) => <Avatar key={p.id} player={p} size={56} />)}
          </div>
          <p className="lede">
            <strong>{competitors.length}</strong> competitors ·{' '}
            <strong>{c.events.length}</strong> events ·{' '}
            <strong>{c.totalPlays}</strong> plays in evidence
          </p>
          <p className="footnote">
            Medals go on win rate within this group. Least-played game first, the
            most-played last. No running totals until the podium.
          </p>
        </>
      ),
    },
    {
      id: 'ceremony-rules',
      theme: 'slate',
      render: () => (
        <>
          <p className="eyebrow">The rules</p>
          <h2 className="title title--compact">How points work</h2>
          <div className="rules">
            <div className="rule"><span>🥇 Gold</span><strong>{signed(points.gold)}</strong></div>
            <div className="rule"><span>🥈 Silver</span><strong>{signed(points.silver)}</strong></div>
            <div className="rule"><span>🥉 Bronze</span><strong>{signed(points.bronze)}</strong></div>
            <div className="rule"><span>Highest score in a game</span><strong>{signed(points.highScore)}</strong></div>
            <div className="rule is-negative"><span>Lowest score in a game</span><strong>{signed(points.lowScore)}</strong></div>
          </div>
          <p className="footnote">
            A medal needs at least {c.medalMinPlays} plays of that game, so one lucky
            night can&rsquo;t take gold. Score bonuses are open to anyone who played it.
            Level win rates share the medal and its full points.
            {c.skipped.length > 0 && ` ${c.skipped.length} ${c.skipped.length === 1 ? 'game was' : 'games were'} too thinly played to be a contest, so ${c.skipped.length === 1 ? 'it is' : 'they are'} not an event.`}
          </p>
        </>
      ),
    },
    ...eventSlides,
    ...specialSlides,
    c.winner && {
      id: 'ceremony-podium',
      theme: 'gold',
      render: () => (
        <>
          <p className="eyebrow">The podium</p>
          <h1 className="mega mega--tight">{c.winner.player.name} wins</h1>
          <div className="podium">
            {podiumOrder.map((s) => (
              <div
                className={`step step--${s.place}`}
                key={s.player.id}
                style={{ borderColor: playerColor(s.player.id) }}
              >
                <Avatar player={s.player} size={s.place === 1 ? 64 : 48} />
                <strong>{s.player.name}</strong>
                <span className="step-points">{s.points}</span>
                <small>
                  {MEDAL_ICON.gold}{s.gold} {MEDAL_ICON.silver}{s.silver} {MEDAL_ICON.bronze}{s.bronze}
                </small>
                <span className="step-place">{ORDINAL[s.place]}</span>
              </div>
            ))}
          </div>
          <p className="lede">
            <strong>{c.winner.points} points</strong> from {c.winner.gold} golds
            across {c.winner.events} events.
          </p>
        </>
      ),
    },
    {
      id: 'ceremony-table',
      theme: 'deep',
      render: () => (
        <>
          <p className="eyebrow">Final table</p>
          <h2 className="title title--compact">Every point</h2>
          <div className="table-wrap no-advance">
            <table className="grid">
              <thead>
                <tr>
                  <th>#</th><th>Player</th><th>Pts</th>
                  <th>🥇</th><th>🥈</th><th>🥉</th>
                  <th>High</th><th>Low</th><th>Events</th>
                </tr>
              </thead>
              <tbody>
                {c.standings.map((s) => (
                  <tr key={s.player.id}>
                    <td>{s.place}</td>
                    <td>{s.player.name}</td>
                    <td><strong>{s.points}</strong></td>
                    <td>{s.gold}</td>
                    <td>{s.silver}</td>
                    <td>{s.bronze}</td>
                    <td>{s.highScores}</td>
                    <td>{s.lowScores}</td>
                    <td>{s.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.skipped.length > 0 && (
            <p className="footnote">
              Not contested: {c.skipped.map((s) => s.game?.name).join(', ')} — nobody had
              {' '}{c.medalMinPlays} plays, or only one player did.
            </p>
          )}
        </>
      ),
    },
  ].filter(Boolean);
}

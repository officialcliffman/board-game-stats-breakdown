import React from 'react';
import { fmt, pct, hoursLabel, Thumb, Bars } from './ui.jsx';

/**
 * Each slide is { id, theme, render }. Themes map to gradient classes in styles.css.
 * Slides that have no data for a given export return null and get filtered out.
 */
export function buildSlides(b) {
  const { meta, totals, you, rhythm, places, records } = b;
  const rangeLabel = meta.year ? String(meta.year) : 'all time';

  const slides = [
    {
      id: 'intro',
      theme: 'aurora',
      render: () => (
        <>
          <p className="eyebrow">{rangeLabel}</p>
          <h1 className="mega">Your<br />Board Game<br />Breakdown</h1>
          <p className="lede">
            {meta.rangeStart && meta.rangeEnd && (
              <>
                {meta.rangeStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                {' → '}
                {meta.rangeEnd.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </>
            )}
          </p>
          <p className="hint">Tap, swipe or press → to begin</p>
        </>
      ),
    },
    {
      id: 'plays',
      theme: 'ember',
      render: () => (
        <>
          <p className="eyebrow">You sat down to play</p>
          <p className="stat-hero">{fmt(totals.plays)}</p>
          <h2 className="stat-caption">times</h2>
          <p className="lede">
            across <strong>{totals.uniqueGames}</strong> different games,
            on <strong>{totals.daysPlayed}</strong> separate days.
          </p>
        </>
      ),
    },
    {
      id: 'time',
      theme: 'deep',
      render: () => (
        <>
          <p className="eyebrow">Time at the table</p>
          <p className="stat-hero">{fmt(totals.hours)}</p>
          <h2 className="stat-caption">hours</h2>
          <p className="lede">
            That is <strong>{(totals.hours / 24).toFixed(1)} full days</strong> of cardboard.
          </p>
          {totals.estimatedMinutes > 0 && (
            <p className="footnote">
              {hoursLabel(totals.loggedMinutes)} timed, the rest estimated from your average play lengths.
            </p>
          )}
        </>
      ),
    },
    b.topGames.length && {
      id: 'top-games',
      theme: 'sunset',
      render: () => (
        <>
          <p className="eyebrow">Your most played</p>
          <h2 className="title">Top {Math.min(5, b.topGames.length)} games</h2>
          <ol className="ranked">
            {b.topGames.slice(0, 5).map((row, i) => (
              <li key={row.game?.id ?? i}>
                <span className="rank">{i + 1}</span>
                <Thumb game={row.game} />
                <span className="ranked-body">
                  <strong>{row.game?.name ?? 'Unknown game'}</strong>
                  <small>{row.plays} plays · {hoursLabel(row.minutes)}</small>
                </span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    b.topGames[0] && {
      id: 'number-one',
      theme: 'gold',
      render: () => {
        const top = b.topGames[0];
        const share = totals.plays ? top.plays / totals.plays : 0;
        return (
          <>
            <p className="eyebrow">Game of the year</p>
            <Thumb game={top.game} size={180} />
            <h2 className="title">{top.game?.name}</h2>
            <p className="lede">
              <strong>{top.plays} plays</strong> — {pct(share)} of everything you played.
            </p>
            {top.game?.designers && <p className="footnote">by {top.game.designers}</p>}
          </>
        );
      },
    },
    you.plays > 0 && {
      id: 'you',
      theme: 'violet',
      render: () => (
        <>
          <p className="eyebrow">{meta.meName}, at the table</p>
          <p className="stat-hero">{pct(you.winRate)}</p>
          <h2 className="stat-caption">win rate</h2>
          <p className="lede">
            <strong>{you.wins}</strong> wins from <strong>{you.plays}</strong> plays.
          </p>
          <p className="footnote">
            {you.winRate >= 0.5 ? 'Someone has to be the table villain.' : 'Character building, every single time.'}
          </p>
        </>
      ),
    },
    b.podium.length > 1 && {
      id: 'podium',
      theme: 'mint',
      render: () => (
        <>
          <p className="eyebrow">The leaderboard</p>
          <h2 className="title">Who actually wins</h2>
          <Bars
            rows={b.podium.slice(0, 6).map((r) => ({ label: r.player.name, value: r.wins }))}
            accent="rgba(255,255,255,0.9)"
          />
          <p className="footnote">
            Best win rate: <strong>
              {[...b.podium].sort((a, c) => c.winRate - a.winRate)[0].player.name}
            </strong> at {pct([...b.podium].sort((a, c) => c.winRate - a.winRate)[0].winRate)}
          </p>
        </>
      ),
    },
    b.nemesis && b.nemesis.losses > 0 && {
      id: 'nemesis',
      theme: 'crimson',
      render: () => (
        <>
          <p className="eyebrow">Your nemesis</p>
          <h1 className="mega">{b.nemesis.player.name}</h1>
          <p className="lede">
            Beat you <strong>{b.nemesis.losses}</strong> times across{' '}
            <strong>{b.nemesis.headToHead}</strong> shared games.
          </p>
          <p className="footnote">Consider a rematch. Or a different friendship group.</p>
        </>
      ),
    },
    b.rivals.length && {
      id: 'people',
      theme: 'ocean',
      render: () => (
        <>
          <p className="eyebrow">Your table</p>
          <h2 className="title">{totals.people} people played with you</h2>
          <Bars
            rows={b.rivals.slice(0, 6).map((r) => ({ label: r.player.name, value: r.shared }))}
            accent="rgba(255,255,255,0.9)"
          />
          <p className="footnote">Games shared with you</p>
        </>
      ),
    },
    rhythm.monthSeries.length > 1 && {
      id: 'rhythm',
      theme: 'indigo',
      render: () => (
        <>
          <p className="eyebrow">Your rhythm</p>
          <h2 className="title">
            {rhythm.busiestMonth?.label} was your peak
          </h2>
          <div className="spark">
            {rhythm.monthSeries.map((m) => {
              const max = Math.max(...rhythm.monthSeries.map((x) => x.plays), 1);
              return (
                <div className="spark-col" key={m.key} title={`${m.key}: ${m.plays} plays`}>
                  <div className="spark-bar" style={{ height: `${(m.plays / max) * 100}%` }} />
                  <span>{m.label}</span>
                </div>
              );
            })}
          </div>
          <p className="lede">
            <strong>{rhythm.busiestMonth?.plays}</strong> plays in one month.
            Favourite night: <strong>{rhythm.busiestDay?.label}</strong>.
          </p>
        </>
      ),
    },
    rhythm.bigNight && rhythm.bigNight.plays > 1 && {
      id: 'big-night',
      theme: 'neon',
      render: () => (
        <>
          <p className="eyebrow">Biggest game night</p>
          <p className="stat-hero">{rhythm.bigNight.plays}</p>
          <h2 className="stat-caption">games in one day</h2>
          <p className="lede">{rhythm.bigNight.label}</p>
          {rhythm.streak > 1 && (
            <p className="footnote">Longest streak: {rhythm.streak} days in a row.</p>
          )}
        </>
      ),
    },
    places.top && {
      id: 'places',
      theme: 'forest',
      render: () => (
        <>
          <p className="eyebrow">Home turf</p>
          <h1 className="mega">{places.top.name}</h1>
          <p className="lede">
            hosted <strong>{places.top.plays}</strong> of your {totals.plays} plays.
          </p>
          {places.all.length > 1 && (
            <Bars
              rows={places.all.slice(0, 5).map((p) => ({ label: p.name, value: p.plays }))}
              accent="rgba(255,255,255,0.85)"
            />
          )}
        </>
      ),
    },
    records.longest && {
      id: 'records',
      theme: 'slate',
      render: () => (
        <>
          <p className="eyebrow">For the record books</p>
          <h2 className="title">Records</h2>
          <div className="cards">
            <div className="card">
              <small>Longest session</small>
              <strong>{records.longest.game?.name}</strong>
              <span>{hoursLabel(records.longest.minutes)}</span>
            </div>
            {records.biggestScore && (
              <div className="card">
                <small>Highest score</small>
                <strong>{records.biggestScore.score}</strong>
                <span>{records.biggestScore.player?.name} · {records.biggestScore.game?.name}</span>
              </div>
            )}
            {records.biggestBlowout && (
              <div className="card">
                <small>Biggest blowout</small>
                <strong>+{records.biggestBlowout.margin}</strong>
                <span>{records.biggestBlowout.game?.name}</span>
              </div>
            )}
            {records.closest && (
              <div className="card">
                <small>Closest finish</small>
                <strong>{records.closest.margin === 0 ? 'Tied' : `+${records.closest.margin}`}</strong>
                <span>{records.closest.game?.name}</span>
              </div>
            )}
          </div>
        </>
      ),
    },
    totals.newGames > 0 && {
      id: 'new',
      theme: 'candy',
      render: () => (
        <>
          <p className="eyebrow">Fresh cardboard</p>
          <p className="stat-hero">{totals.newGames}</p>
          <h2 className="stat-caption">new games tried</h2>
          <p className="lede">
            {b.newToMe.slice(0, 6).map((g) => g.name).join(' · ')}
            {b.newToMe.length > 6 ? ` and ${b.newToMe.length - 6} more` : ''}
          </p>
          {totals.shelfOfShame > 0 && (
            <p className="footnote">
              Still unplayed in your collection: {totals.shelfOfShame} games. The shelf of shame grows.
            </p>
          )}
        </>
      ),
    },
    {
      id: 'outro',
      theme: 'aurora',
      render: () => (
        <>
          <p className="eyebrow">That was {rangeLabel}</p>
          <h1 className="mega">
            {fmt(totals.plays)} plays<br />
            {fmt(totals.hours)} hours<br />
            {totals.uniqueGames} games
          </h1>
          <p className="lede">Now go and roll something.</p>
          {meta.exportDate && <p className="footnote">Export from {meta.exportDate}</p>}
        </>
      ),
    },
  ];

  return slides.filter(Boolean);
}

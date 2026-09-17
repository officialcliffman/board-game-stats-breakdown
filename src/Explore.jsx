import React, { useEffect, useMemo, useState } from 'react';
import {
  LINEUP_MODES, activePlayers, buildGameCard, buildLineup, buildPlayerCards, playedGames,
} from './lib/explore.js';
import { buildGameSlides, buildLineupSlides, buildPlayerSlides } from './exploreSlides.jsx';
import { buildCeremony } from './lib/awards.js';
import { buildCeremonySlides } from './awardSlides.jsx';
import Deck from './Deck.jsx';
import { Avatar, Thumb, pct } from './ui.jsx';

const TABS = [
  { id: 'lineups', label: 'Head to head' },
  { id: 'awards', label: 'Awards' },
  { id: 'players', label: 'Players' },
  { id: 'games', label: 'Games' },
];

function Chip({ active, onClick, children }) {
  return (
    <button type="button" className={`chip${active ? ' is-active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** Tap-to-toggle player face. */
function PlayerToggle({ player, plays, isMe, active, onClick }) {
  return (
    <button type="button" className={`face${active ? ' is-active' : ''}`} onClick={onClick}>
      <Avatar player={player} size={56} />
      <strong>{player.name}{isMe ? ' ★' : ''}</strong>
      <small>{plays} plays</small>
    </button>
  );
}

function LineupChooser({ raw, year, onOpen }) {
  const roster = useMemo(() => activePlayers(raw, { year }), [raw, year]);
  const [selected, setSelected] = useState(() => roster.slice(0, 2).map((r) => r.player.id));
  const [mode, setMode] = useState('subset');

  // keep the selection honest when the year changes the roster
  const available = new Set(roster.map((r) => r.player.id));
  const picked = selected.filter((id) => available.has(id));

  const preview = useMemo(
    () => (picked.length >= 2 ? buildLineup(raw, { playerIds: picked, mode, year }) : null),
    [raw, picked.join(','), mode, year],
  );

  const toggle = (id) => setSelected((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  const modeDef = LINEUP_MODES.find((m) => m.id === mode);

  return (
    <>
      <h2 className="title title--compact">Pick a group</h2>
      <p className="chooser-hint">Two or more players.</p>
      <div className="faces">
        {roster.map(({ player, plays, isMe }) => (
          <PlayerToggle
            key={player.id}
            player={player}
            plays={plays}
            isMe={isMe}
            active={picked.includes(player.id)}
            onClick={() => toggle(player.id)}
          />
        ))}
      </div>

      <h3 className="chooser-heading">Which plays count?</h3>
      <div className="mode-list">
        {LINEUP_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mode${mode === m.id ? ' is-active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <strong>{m.label}</strong>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>

      <div className="chooser-go">
        {picked.length < 2 && <p className="chooser-hint">Select at least two players.</p>}
        {preview && preview.plays === 0 && (
          <p className="chooser-hint">
            No plays with that combination{year ? ` in ${year}` : ''}. Try a different mode.
          </p>
        )}
        {preview && preview.plays > 0 && (
          <button
            type="button"
            className="go"
            onClick={() => onOpen(buildLineupSlides(preview, modeDef.label), `${picked.join(',')}-${mode}`)}
          >
            Show breakdown
            <small>{preview.plays} plays · {preview.table.length} players</small>
          </button>
        )}
      </div>
    </>
  );
}

function AwardsChooser({ raw, year, onOpen }) {
  const roster = useMemo(() => activePlayers(raw, { year }), [raw, year]);
  const rosterIds = roster.map((r) => r.player.id);
  const rosterKey = rosterIds.join(',');

  // a ceremony wants the whole table by default
  const [selected, setSelected] = useState(rosterIds);
  const [mode, setMode] = useState('subset');

  // Changing the year changes who was even playing, so re-enrol everyone rather
  // than silently leaving out players the new range introduced.
  useEffect(() => { setSelected(rosterKey ? rosterKey.split(',').map(Number) : []); }, [rosterKey]);

  const available = new Set(rosterIds);
  const picked = selected.filter((id) => available.has(id));
  const allIn = picked.length === roster.length;

  const ceremony = useMemo(
    () => (picked.length >= 2 ? buildCeremony(raw, { playerIds: picked, mode, year }) : null),
    [raw, picked.join(','), mode, year],
  );

  const toggle = (id) => setSelected((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  return (
    <>
      <h2 className="title title--compact">Awards ceremony</h2>
      <p className="chooser-hint">
        A medal for every game, points on the board, and a winner at the end.
      </p>
      <div className="chooser-row">
        <span className="chooser-hint">
          {picked.length} of {roster.length} competing
        </span>
        <Chip active={false} onClick={() => setSelected(allIn ? [] : rosterIds)}>
          {allIn ? 'Clear all' : 'Everyone'}
        </Chip>
      </div>
      <div className="faces">
        {roster.map(({ player, plays, isMe }) => (
          <PlayerToggle
            key={player.id}
            player={player}
            plays={plays}
            isMe={isMe}
            active={picked.includes(player.id)}
            onClick={() => toggle(player.id)}
          />
        ))}
      </div>

      <h3 className="chooser-heading">Which plays count?</h3>
      <div className="mode-list">
        {LINEUP_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`mode${mode === m.id ? ' is-active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <strong>{m.label}</strong>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>

      <div className="chooser-go">
        {picked.length < 2 && <p className="chooser-hint">Pick at least two competitors.</p>}
        {ceremony && ceremony.events.length === 0 && (
          <p className="chooser-hint">
            No game has enough plays among these players to be a contest
            {year ? ` in ${year}` : ''}. Try more players, a different mode, or all time.
          </p>
        )}
        {ceremony && ceremony.events.length > 0 && (
          <button
            type="button"
            className="go"
            onClick={() => onOpen(
              buildCeremonySlides(ceremony),
              `awards-${picked.join(',')}-${mode}-${year}`,
            )}
          >
            Start the ceremony
            <small>
              {ceremony.events.length} events · {ceremony.standings.length} competitors
              {ceremony.skipped.length > 0 && ` · ${ceremony.skipped.length} not contested`}
            </small>
          </button>
        )}
      </div>
    </>
  );
}

function PlayerChooser({ raw, year, onOpen }) {
  const cards = useMemo(() => buildPlayerCards(raw, { year }), [raw, year]);
  if (!cards.length) return <p className="chooser-hint">No plays{year ? ` in ${year}` : ''}.</p>;

  return (
    <>
      <h2 className="title title--compact">Pick a player</h2>
      <div className="tiles">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className="tile"
            onClick={() => onOpen(buildPlayerSlides(c), `player-${c.id}-${year}`)}
          >
            <Avatar player={c.player} size={48} />
            <span className="tile-body">
              <strong>{c.player.name}</strong>
              <small>{c.plays} plays · {c.wins} wins · {pct(c.winRate)}</small>
              {c.bestGame && <small className="tile-note">Best: {c.bestGame.game?.name}</small>}
            </span>
            <span className="tile-chevron">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

function GameChooser({ raw, year, onOpen }) {
  const list = useMemo(() => playedGames(raw, { year }), [raw, year]);
  if (!list.length) return <p className="chooser-hint">No plays{year ? ` in ${year}` : ''}.</p>;

  return (
    <>
      <h2 className="title title--compact">Pick a game</h2>
      <div className="tiles tiles--games">
        {list.map(({ game, plays }) => (
          <button
            key={game.id}
            type="button"
            className="tile"
            onClick={() => onOpen(
              buildGameSlides(buildGameCard(raw, game.id, { year })),
              `game-${game.id}-${year}`,
            )}
          >
            <Thumb game={game} size={48} />
            <span className="tile-body">
              <strong>{game.name}</strong>
              <small>{plays} {plays === 1 ? 'play' : 'plays'}</small>
            </span>
            <span className="tile-chevron">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The drill-down. A graphical chooser that generates a themed mini-deck for
 * whatever you picked, using the same slide shell as the main breakdown.
 */
export default function Explore({ raw, year, years, onYearChange, onClose }) {
  const [tab, setTab] = useState('lineups');
  const [deck, setDeck] = useState(null); // { slides, key }

  const open = (slides, key) => setDeck({ slides, key });

  if (deck) {
    return (
      <Deck
        slides={deck.slides}
        resetKey={deck.key}
        onExit={() => setDeck(null)}
        onExitLabel="‹ Choose again"
        actions={(
          <button type="button" className="ghost" onClick={onClose}>Done</button>
        )}
      />
    );
  }

  return (
    <div className="slide theme-slate chooser-slide">
      <div className="slide-inner chooser">
        <header className="chooser-bar">
          <div className="tabs">
            {TABS.map((t) => (
              <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</Chip>
            ))}
          </div>
          <button type="button" className="ghost" onClick={onClose}>Done</button>
        </header>

        <div className="chooser-years">
          <Chip active={year === null} onClick={() => onYearChange(null)}>All time</Chip>
          {years.map((y) => (
            <Chip key={y} active={year === y} onClick={() => onYearChange(y)}>{y}</Chip>
          ))}
        </div>

        {tab === 'lineups' && <LineupChooser raw={raw} year={year} onOpen={open} />}
        {tab === 'awards' && <AwardsChooser raw={raw} year={year} onOpen={open} />}
        {tab === 'players' && <PlayerChooser raw={raw} year={year} onOpen={open} />}
        {tab === 'games' && <GameChooser raw={raw} year={year} onOpen={open} />}
      </div>
    </div>
  );
}

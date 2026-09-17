// An awards ceremony for a chosen group: one event per game, medals by win
// rate, bonuses for scoring, then a points table and some novelty awards.
import { inYear, prepare } from './stats.js';
import {
  MIN_PLAYS_FOR_RANKING, matchesLineup, scoreOf, scoresLookMeaningful,
} from './explore.js';

/** Olympic-ish: gold is worth notably more than a placing. */
export const AWARD_POINTS = {
  gold: 5,
  silver: 3,
  bronze: 1,
  highScore: 2,
  lowScore: -1,
};

/** A game needs this many plays by a player before their win rate earns a medal. */
export const MEDAL_MIN_PLAYS = MIN_PLAYS_FOR_RANKING;

const MEDALS = ['gold', 'silver', 'bronze'];

/**
 * Standard competition ranking: everyone level shares the place, and the
 * places behind them are skipped (1,1,3 rather than 1,1,2). Ties share the
 * medal and its full points — nobody is demoted by an arbitrary tie-break.
 */
function assignMedals(contenders) {
  const sorted = [...contenders].sort((a, b) => b.winRate - a.winRate);
  return sorted.map((entry) => {
    const place = 1 + sorted.filter((other) => other.winRate > entry.winRate).length;
    const medal = MEDALS[place - 1] ?? null;
    const sharedWith = sorted.filter((o) => o.winRate === entry.winRate).length - 1;
    return { ...entry, place, medal, shared: sharedWith > 0 };
  });
}

/**
 * @param opts.playerIds the competitors
 * @param opts.mode lineup mode, as in buildLineup ('subset' by default)
 * @param opts.year calendar year, or null for all time
 * @param opts.points override any of AWARD_POINTS
 */
export function buildCeremony(raw, opts = {}) {
  const {
    playerIds = [], mode = 'subset', year = null, points: overrides = {},
  } = opts;
  const points = { ...AWARD_POINTS, ...overrides };

  const ctx = prepare(raw);
  const { games, players, minutesOf } = ctx;
  const plays = inYear(ctx.allPlays, year)
    .filter((p) => matchesLineup(p, playerIds, mode));

  // ---- gather per game, per player -------------------------------------
  const perGame = new Map(); // gameId -> { plays, entries, realScores, byPlayer }
  const totals = new Map();  // playerId -> running tally

  const tallyFor = (id) => {
    if (!totals.has(id)) {
      totals.set(id, {
        player: players.get(id),
        points: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        medals: 0,
        highScores: 0,
        lowScores: 0,
        plays: 0,
        minutes: 0,
        events: 0,
      });
    }
    return totals.get(id);
  };

  for (const p of plays) {
    if (!perGame.has(p.gameRefId)) {
      perGame.set(p.gameRefId, {
        game: games.get(p.gameRefId),
        plays: 0,
        entries: 0,
        realScores: 0,
        byPlayer: new Map(),
      });
    }
    const slot = perGame.get(p.gameRefId);
    slot.plays += 1;

    for (const entry of p.playerScores || []) {
      const id = entry.playerRefId;
      if (!playerIds.includes(id)) continue;

      slot.entries += 1;
      const n = scoreOf(entry);
      if (n) slot.realScores += 1;

      if (!slot.byPlayer.has(id)) {
        slot.byPlayer.set(id, {
          player: players.get(id), plays: 0, wins: 0, best: null, worst: null,
        });
      }
      const rec = slot.byPlayer.get(id);
      rec.plays += 1;
      if (entry.winner) rec.wins += 1;
      if (n !== null) {
        if (rec.best === null || n > rec.best) rec.best = n;
        if (rec.worst === null || n < rec.worst) rec.worst = n;
      }

      const tally = tallyFor(id);
      tally.plays += 1;
      tally.minutes += minutesOf(p);
    }
  }

  // ---- turn each game into an event ------------------------------------
  const events = [];
  const skipped = [];

  for (const slot of perGame.values()) {
    const roster = [...slot.byPlayer.values()]
      .filter((r) => r.player)
      .map((r) => ({ ...r, winRate: r.plays ? r.wins / r.plays : 0 }));

    const contenders = roster.filter((r) => r.plays >= MEDAL_MIN_PLAYS);
    if (contenders.length < 2) {
      // not a contest: nobody, or only one player, has played it enough
      skipped.push({ game: slot.game, plays: slot.plays, roster });
      continue;
    }

    const standings = assignMedals(contenders);

    // Score bonuses are open to anyone who played it, even below the medal
    // threshold — a single great score still deserves the +2.
    const scored = slot.game && !slot.game.noPoints
      && scoresLookMeaningful(slot.realScores, slot.entries);
    const bests = roster.map((r) => r.best).filter((n) => n !== null);
    const worsts = roster.map((r) => r.worst).filter((n) => n !== null);
    const topScore = bests.length ? Math.max(...bests) : null;
    const lowScore = worsts.length ? Math.min(...worsts) : null;
    // if every score is identical there is nothing to reward or punish
    const spread = scored && topScore !== null && lowScore !== null && topScore !== lowScore;

    const highScorers = spread ? roster.filter((r) => r.best === topScore) : [];
    const lowScorers = spread ? roster.filter((r) => r.worst === lowScore) : [];

    const lines = new Map(); // playerId -> { player, medal, points, reasons }
    const lineFor = (r) => {
      if (!lines.has(r.player.id)) {
        lines.set(r.player.id, {
          player: r.player, medal: null, place: null, shared: false,
          plays: r.plays, wins: r.wins, winRate: r.winRate,
          best: r.best, worst: r.worst,
          points: 0, reasons: [],
        });
      }
      return lines.get(r.player.id);
    };

    for (const s of standings) {
      const line = lineFor(s);
      line.medal = s.medal;
      line.place = s.place;
      line.shared = s.shared;
      if (s.medal) {
        line.points += points[s.medal];
        line.reasons.push({
          kind: s.medal,
          points: points[s.medal],
          label: `${s.shared ? 'shared ' : ''}${s.medal}`,
        });
      }
    }

    for (const r of highScorers) {
      const line = lineFor(r);
      line.points += points.highScore;
      line.reasons.push({ kind: 'highScore', points: points.highScore, label: `high score ${topScore}` });
    }
    for (const r of lowScorers) {
      const line = lineFor(r);
      line.points += points.lowScore;
      line.reasons.push({ kind: 'lowScore', points: points.lowScore, label: `low score ${lowScore}` });
    }

    const table = [...lines.values()].sort((a, b) => (
      (a.place ?? 99) - (b.place ?? 99) || b.points - a.points
    ));

    for (const line of table) {
      const tally = tallyFor(line.player.id);
      tally.points += line.points;
      tally.events += 1;
      if (line.medal) {
        tally[line.medal] += 1;
        tally.medals += 1;
      }
      if (line.reasons.some((r) => r.kind === 'highScore')) tally.highScores += 1;
      if (line.reasons.some((r) => r.kind === 'lowScore')) tally.lowScores += 1;
    }

    events.push({
      game: slot.game,
      plays: slot.plays,
      scored,
      topScore: spread ? topScore : null,
      lowScore: spread ? lowScore : null,
      table,
      champion: table.find((l) => l.medal === 'gold') ?? null,
      contested: contenders.length,
    });
  }

  // warm-up first, main event last: fewest plays through to most played
  events.sort((a, b) => a.plays - b.plays || (a.game?.name ?? '').localeCompare(b.game?.name ?? ''));

  // ---- final table ------------------------------------------------------
  const standings = [...totals.values()]
    .filter((t) => t.player && t.events > 0)
    .sort((a, b) => (
      b.points - a.points || b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze
    ))
    .map((t, i, arr) => ({
      ...t,
      place: 1 + arr.filter((o) => (
        o.points > t.points
        || (o.points === t.points && (o.gold > t.gold
          || (o.gold === t.gold && o.silver > t.silver)))
      )).length,
    }));

  return {
    playerIds,
    mode,
    year,
    points,
    medalMinPlays: MEDAL_MIN_PLAYS,
    totalPlays: plays.length,
    events,
    skipped,
    standings,
    winner: standings[0] ?? null,
    specials: buildSpecials(standings, events),
  };
}

/** Novelty awards. Each is omitted unless it genuinely has a holder. */
function buildSpecials(standings, events) {
  const out = [];
  if (!standings.length) return out;

  const best = (list, key) => {
    const top = Math.max(...list.map(key));
    return top > 0 ? list.filter((x) => key(x) === top) : [];
  };

  // most silvers, never gold
  const bridesmaids = best(standings.filter((s) => s.gold === 0), (s) => s.silver);
  if (bridesmaids.length) {
    out.push({
      id: 'bridesmaid',
      title: 'The Bridesmaid',
      blurb: 'All those second places, never the top step.',
      holders: bridesmaids,
      detail: (s) => `${s.silver} silver, no gold`,
    });
  }

  const grinders = best(standings, (s) => s.plays);
  if (grinders.length) {
    out.push({
      id: 'grinder',
      title: 'The Grinder',
      blurb: 'Most games played. Someone has to put the hours in.',
      holders: grinders,
      detail: (s) => `${s.plays} plays`,
    });
  }

  // holds a highest score and a lowest score: all or nothing
  const cannons = standings.filter((s) => s.highScores > 0 && s.lowScores > 0);
  if (cannons.length) {
    const top = Math.max(...cannons.map((s) => s.highScores + s.lowScores));
    out.push({
      id: 'glass-cannon',
      title: 'Glass Cannon',
      blurb: 'Table highs and table lows, nothing in between.',
      holders: cannons.filter((s) => s.highScores + s.lowScores === top),
      detail: (s) => `${s.highScores} high, ${s.lowScores} low`,
    });
  }

  // wooden spoon only means something with a real field and a clear last place
  if (standings.length > 2) {
    const last = standings[standings.length - 1];
    const tiedLast = standings.filter((s) => s.points === last.points);
    if (tiedLast.length < standings.length) {
      out.push({
        id: 'wooden-spoon',
        title: 'The Wooden Spoon',
        blurb: 'Bottom of the table. There is always next year.',
        holders: tiedLast,
        detail: (s) => `${s.points} ${Math.abs(s.points) === 1 ? 'point' : 'points'}`,
      });
    }
  }

  return out;
}

/** Which games would be events for this selection, for a chooser preview. */
export function ceremonySize(raw, opts = {}) {
  const c = buildCeremony(raw, opts);
  return { events: c.events.length, skipped: c.skipped.length, players: c.standings.length };
}

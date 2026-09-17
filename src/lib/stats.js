// Turns a raw BGStatsExport JSON blob into everything the breakdown slides need.

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** BGStats writes local timestamps as "YYYY-MM-DD HH:mm:ss" — parse without timezone surprises. */
function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function safeJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function topN(counter, n) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => ({ key, value }));
}

function bump(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

/**
 * Index an export once: lookup maps, the cleaned play list, and the duration
 * heuristic. Every view in the app builds on top of this.
 */
export function prepare(raw) {
  const games = new Map(raw.games.map((g) => [g.id, g]));
  const players = new Map(raw.players.map((p) => [p.id, p]));
  const locations = new Map(raw.locations.map((l) => [l.id, l]));
  const meId = raw.userInfo?.meRefId ?? null;

  /** Best guess at a play's length when the play itself wasn't timed. */
  const avgDuration = (gameId) => {
    const game = games.get(gameId);
    if (!game) return 0;
    const fromStats = safeJson(game.metaData)?.averageDurationMin;
    if (fromStats > 0) return fromStats;
    // fall back to the BGG published play time
    if (game.minPlayTime > 0 && game.maxPlayTime > 0) {
      return Math.round((game.minPlayTime + game.maxPlayTime) / 2);
    }
    return game.maxPlayTime || game.minPlayTime || 0;
  };

  const allPlays = raw.plays
    .filter((p) => !p.ignored)
    .map((p) => ({ ...p, date: parseDate(p.playDate) }))
    .filter((p) => p.date && !Number.isNaN(+p.date))
    .sort((a, b) => a.date - b.date);

  return {
    games,
    players,
    locations,
    meId,
    meName: players.get(meId)?.name ?? 'You',
    allPlays,
    years: [...new Set(allPlays.map((p) => p.date.getFullYear()))].sort(),
    avgDuration,
    /** Minutes for a play, timed where possible. */
    minutesOf: (p) => (p.durationMin > 0 ? p.durationMin : avgDuration(p.gameRefId)),
  };
}

/** Restrict plays to a calendar year; null means all time. */
export function inYear(plays, year) {
  return year ? plays.filter((p) => p.date.getFullYear() === year) : plays;
}

/**
 * @param raw parsed BGStatsExport JSON
 * @param opts.year optional calendar year to restrict to; null = all time
 */
export function buildBreakdown(raw, opts = {}) {
  const { year = null } = opts;
  const ctx = prepare(raw);
  const { games, players, locations, meId, meName, allPlays, years, avgDuration } = ctx;
  const plays = inYear(allPlays, year);

  // ---- single pass over the plays in range -------------------------------
  let loggedMinutes = 0;
  let estimatedMinutes = 0;
  const gamePlays = new Map();       // gameId -> plays
  const gameMinutes = new Map();
  const dayOfWeek = new Map();
  const monthKey = new Map();        // "2026-01" -> plays
  const locationPlays = new Map();
  const playerPlays = new Map();
  const playerWins = new Map();
  const coPlayerPlays = new Map();   // plays alongside me
  const expansionPlays = new Map();
  const daysWithPlay = new Set();
  let coopPlays = 0;
  let teamPlays = 0;
  let myPlays = 0;
  let myWins = 0;
  const newToMe = [];                // games first played inside the range
  let longest = null;
  let biggestScore = null;
  let biggestBlowout = null;
  let closest = null;

  const firstPlayOfGame = new Map();
  const everPlayed = new Set();
  for (const p of allPlays) {
    everPlayed.add(p.gameRefId);
    if (!firstPlayOfGame.has(p.gameRefId)) firstPlayOfGame.set(p.gameRefId, p);
  }

  for (const p of plays) {
    const game = games.get(p.gameRefId);
    const mins = p.durationMin > 0 ? p.durationMin : avgDuration(p.gameRefId);
    if (p.durationMin > 0) loggedMinutes += p.durationMin; else estimatedMinutes += mins;

    bump(gamePlays, p.gameRefId);
    bump(gameMinutes, p.gameRefId, mins);
    bump(dayOfWeek, DAYS[p.date.getDay()]);
    bump(monthKey, `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}`);
    daysWithPlay.add(p.date.toDateString());
    if (p.locationRefId) bump(locationPlays, p.locationRefId);
    if (game?.cooperative) coopPlays += 1;
    if (p.usesTeams) teamPlays += 1;
    for (const e of p.expansionPlays || []) bump(expansionPlays, e.gameRefId);

    if (firstPlayOfGame.get(p.gameRefId) === p && game) newToMe.push(game);

    if (!longest || mins > longest.minutes) longest = { play: p, game, minutes: mins };

    const scores = p.playerScores || [];
    if (scores.some((s) => s.playerRefId === meId)) {
      myPlays += 1;
      for (const s of scores) if (s.playerRefId !== meId) bump(coPlayerPlays, s.playerRefId);
    }

    for (const s of scores) {
      bump(playerPlays, s.playerRefId);
      if (s.winner) {
        bump(playerWins, s.playerRefId);
        if (s.playerRefId === meId) myWins += 1;
      }
      const n = Number(s.score);
      if (game && !game.noPoints && Number.isFinite(n) && n !== 0
        && (!biggestScore || n > biggestScore.score)) {
        biggestScore = { score: n, player: players.get(s.playerRefId), game, play: p };
      }
    }

    // winning margins, only for scored competitive games
    if (game && !game.noPoints && !game.cooperative && scores.length >= 2) {
      const nums = scores.map((s) => Number(s.score)).filter(Number.isFinite);
      if (nums.length >= 2) {
        const sorted = [...nums].sort((a, b) => (game.highestWins ? b - a : a - b));
        const margin = Math.abs(sorted[0] - sorted[1]);
        if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = { play: p, game, margin };
        if (!closest || margin < closest.margin) closest = { play: p, game, margin };
      }
    }
  }

  // ---- derived ------------------------------------------------------------
  const totalMinutes = loggedMinutes + estimatedMinutes;

  const topGames = topN(gamePlays, 10).map(({ key, value }) => ({
    game: games.get(key),
    plays: value,
    minutes: gameMinutes.get(key) || 0,
  }));

  const topByTime = topN(gameMinutes, 5).map(({ key, value }) => ({
    game: games.get(key),
    minutes: value,
    plays: gamePlays.get(key) || 0,
  }));

  const podium = [...playerPlays.entries()]
    .map(([id, count]) => {
      const wins = playerWins.get(id) || 0;
      return { player: players.get(id), plays: count, wins, winRate: count ? wins / count : 0 };
    })
    .filter((r) => r.player)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  const rivals = [...coPlayerPlays.entries()]
    .map(([id, shared]) => {
      const wins = playerWins.get(id) || 0;
      const total = playerPlays.get(id) || 0;
      return { player: players.get(id), shared, wins, winRate: total ? wins / total : 0 };
    })
    .filter((r) => r.player)
    .sort((a, b) => b.shared - a.shared);

  // the co-player who beats you most often when you are both at the table
  let nemesis = null;
  for (const [id] of coPlayerPlays) {
    let headToHead = 0;
    let losses = 0;
    for (const p of plays) {
      const scores = p.playerScores || [];
      const mine = scores.find((x) => x.playerRefId === meId);
      const theirs = scores.find((x) => x.playerRefId === id);
      if (!mine || !theirs) continue;
      headToHead += 1;
      if (theirs.winner && !mine.winner) losses += 1;
    }
    if (headToHead && (!nemesis || losses > nemesis.losses)) {
      nemesis = { player: players.get(id), losses, headToHead };
    }
  }

  const busiestMonth = topN(monthKey, 1)[0];
  const busiestDay = topN(dayOfWeek, 1)[0];
  const topLocation = topN(locationPlays, 1)[0];

  // biggest game night = most plays crammed into one day
  const perDay = new Map();
  for (const p of plays) bump(perDay, p.date.toDateString());
  const bigNight = topN(perDay, 1)[0];

  // longest run of consecutive days with a play
  const dayList = [...daysWithPlay].map((d) => new Date(d).setHours(0, 0, 0, 0)).sort((a, b) => a - b);
  let streak = dayList.length ? 1 : 0;
  let run = streak;
  for (let i = 1; i < dayList.length; i += 1) {
    run = dayList[i] - dayList[i - 1] === 86400000 ? run + 1 : 1;
    if (run > streak) streak = run;
  }

  const monthSeries = [];
  if (plays.length) {
    const end = plays[plays.length - 1].date;
    const cursor = new Date(plays[0].date.getFullYear(), plays[0].date.getMonth(), 1);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      monthSeries.push({
        key,
        label: MONTHS[cursor.getMonth()].slice(0, 3),
        plays: monthKey.get(key) || 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const ratedGames = raw.games
    .filter((g) => g.rating > 0 && gamePlays.has(g.id))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((g) => ({ game: g, rating: g.rating / 10, plays: gamePlays.get(g.id) }));

  const designers = new Map();
  for (const [id, count] of gamePlays) {
    const d = games.get(id)?.designers;
    if (!d) continue;
    for (const name of d.split(',').map((x) => x.trim()).filter(Boolean)) bump(designers, name, count);
  }

  return {
    meta: {
      meName,
      year,
      years,
      exportDate: raw.userInfo?.exportDate ?? null,
      appVersion: raw.userInfo?.appVersion ?? null,
      rangeStart: plays[0]?.date ?? null,
      rangeEnd: plays[plays.length - 1]?.date ?? null,
    },
    totals: {
      plays: plays.length,
      uniqueGames: gamePlays.size,
      totalMinutes,
      loggedMinutes,
      estimatedMinutes,
      hours: Math.round(totalMinutes / 60),
      daysPlayed: daysWithPlay.size,
      people: playerPlays.size,
      coopPlays,
      teamPlays,
      expansionsUsed: expansionPlays.size,
      newGames: newToMe.length,
      collection: raw.games.filter((g) => g.isBaseGame).length,
      // never played at all, not merely unplayed inside the selected year
      shelfOfShame: raw.games.filter((g) => g.isBaseGame && !everPlayed.has(g.id)).length,
    },
    you: {
      plays: myPlays,
      wins: myWins,
      winRate: myPlays ? myWins / myPlays : 0,
    },
    topGames,
    topByTime,
    podium,
    rivals,
    nemesis,
    newToMe,
    ratedGames,
    topDesigners: topN(designers, 5),
    rhythm: {
      monthSeries,
      busiestMonth: busiestMonth && {
        label: `${MONTHS[+busiestMonth.key.slice(5) - 1]} ${busiestMonth.key.slice(0, 4)}`,
        plays: busiestMonth.value,
      },
      busiestDay: busiestDay && { label: busiestDay.key, plays: busiestDay.value },
      dayOfWeek: DAYS.map((d) => ({ label: d, plays: dayOfWeek.get(d) || 0 })),
      streak,
      bigNight: bigNight && {
        label: new Date(bigNight.key).toLocaleDateString(undefined, {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
        plays: bigNight.value,
      },
    },
    places: {
      top: topLocation && {
        name: locations.get(topLocation.key)?.name ?? 'Unknown',
        plays: topLocation.value,
      },
      all: topN(locationPlays, 10).map(({ key, value }) => ({
        name: locations.get(key)?.name ?? 'Unknown',
        plays: value,
      })),
    },
    records: { longest, biggestScore, biggestBlowout, closest },
  };
}

export { MONTHS, DAYS, parseDate, safeJson, topN, bump };

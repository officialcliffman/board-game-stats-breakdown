// Optional drill-down views: pick a lineup, a player, or a game and dig in.
import { prepare, inYear, bump, topN, safeJson } from './stats.js';

const MIN_PLAYS_FOR_RANKING = 2; // below this a win rate is noise, not a record

export function scoreOf(s) {
  const n = Number(s.score);
  return Number.isFinite(n) ? n : null;
}

/**
 * Whether a game's scores carry information. Games won by a condition rather
 * than points log mostly blanks and zeroes while still leaving `noPoints`
 * false, and averaging those produces nonsense. Defined once, used by the game
 * card and the awards ceremony alike.
 */
export function scoresLookMeaningful(realScores, entries) {
  return entries > 0 && realScores >= entries / 2;
}

export const LINEUP_MODES = [
  {
    id: 'subset',
    label: 'Only these players',
    blurb: 'Any combination from the group, nobody from outside it.',
  },
  {
    id: 'includes',
    label: 'All of them, plus anyone',
    blurb: 'Every play the whole group was at, outsiders welcome.',
  },
  {
    id: 'exactly',
    label: 'Exactly this lineup',
    blurb: 'Only plays with all of them and nobody else.',
  },
];

/** Who from the selection was at this play? */
function attendeesFrom(play, ids) {
  const at = [...new Set((play.playerScores || []).map((s) => s.playerRefId))];
  return { at, selected: at.filter((id) => ids.includes(id)) };
}

/**
 * Does this play involve a given set of players?
 *
 * - 'includes' — all of ids present, anyone else may also be there
 * - 'subset'   — no outsiders, but any two or more of ids counts
 * - 'exactly'  — all of ids and nobody else
 */
export function matchesLineup(play, ids, mode) {
  const { at, selected } = attendeesFrom(play, ids);
  if (mode === 'subset') return selected.length >= 2 && selected.length === at.length;
  const hasAll = selected.length === ids.length;
  if (mode === 'exactly') return hasAll && at.length === ids.length;
  return hasAll;
}

/**
 * Rank a wins map, keeping everyone level at the top rather than picking one
 * arbitrarily. `tied` is true when two or more share the lead.
 */
function leadersOf(winsMap, players) {
  const ranked = [...winsMap.entries()]
    .map(([id, wins]) => ({ player: players.get(id), wins }))
    .filter((r) => r.player)
    .sort((a, z) => z.wins - a.wins);
  if (!ranked.length) return { leaders: [], tied: false, ranked };
  const best = ranked[0].wins;
  const leaders = ranked.filter((r) => r.wins === best);
  return { leaders, tied: leaders.length > 1, ranked };
}

/** Blank per-player accumulator. */
function newRecord(player) {
  return {
    player,
    plays: 0,
    wins: 0,
    winRate: 0,
    soloWins: 0,      // wins that weren't shared with another winner
    scoredPlays: 0,
    scoreTotal: 0,
    avgScore: null,
    bestScore: null,
    worstScore: null,
    startedFirst: 0,
  };
}

function addPlayToRecord(rec, play, entry, game) {
  rec.plays += 1;
  if (entry.winner) {
    rec.wins += 1;
    if ((play.playerScores || []).filter((s) => s.winner).length === 1) rec.soloWins += 1;
  }
  if (entry.startPlayer) rec.startedFirst += 1;

  const n = scoreOf(entry);
  if (n !== null && game && !game.noPoints) {
    rec.scoredPlays += 1;
    rec.scoreTotal += n;
    if (rec.bestScore === null || n > rec.bestScore) rec.bestScore = n;
    if (rec.worstScore === null || n < rec.worstScore) rec.worstScore = n;
  }
}

function finishRecord(rec) {
  rec.winRate = rec.plays ? rec.wins / rec.plays : 0;
  rec.avgScore = rec.scoredPlays ? rec.scoreTotal / rec.scoredPlays : null;
  return rec;
}

/**
 * Head-to-head for a chosen lineup of players.
 *
 * @param opts.playerIds players who must be at the table
 * @param opts.mode 'includes' (default) or 'exactly' — only that lineup, no extras
 * @param opts.year calendar year, or null for all time
 */
export function buildLineup(raw, opts = {}) {
  const { playerIds = [], mode = 'includes', year = null } = opts;
  const ctx = prepare(raw);
  const { games, players, locations, minutesOf } = ctx;

  const plays = inYear(ctx.allPlays, year)
    .filter((p) => matchesLineup(p, playerIds, mode));

  const records = new Map(playerIds.map((id) => [id, newRecord(players.get(id))]));
  const gamePlays = new Map();
  const gameMinutes = new Map();
  const locationPlays = new Map();
  const perGameWins = new Map(); // gameId -> Map(playerId -> wins)
  const combos = new Map();      // "1,2" -> { plays, wins: Map(playerId -> wins) }
  let minutes = 0;
  let undecided = 0; // plays where nobody in the lineup won (draw, or an outsider won)

  for (const p of plays) {
    const game = games.get(p.gameRefId);
    const mins = minutesOf(p);
    minutes += mins;
    bump(gamePlays, p.gameRefId);
    bump(gameMinutes, p.gameRefId, mins);
    if (p.locationRefId) bump(locationPlays, p.locationRefId);

    // which slice of the selection actually met for this play
    const comboKey = attendeesFrom(p, playerIds).selected.sort((a, z) => a - z).join(',');
    if (!combos.has(comboKey)) combos.set(comboKey, { plays: 0, wins: new Map() });
    combos.get(comboKey).plays += 1;

    let winnerInLineup = false;
    for (const entry of p.playerScores || []) {
      const rec = records.get(entry.playerRefId);
      if (!rec) continue;
      addPlayToRecord(rec, p, entry, game);
      if (entry.winner) {
        winnerInLineup = true;
        if (!perGameWins.has(p.gameRefId)) perGameWins.set(p.gameRefId, new Map());
        bump(perGameWins.get(p.gameRefId), entry.playerRefId);
        bump(combos.get(comboKey).wins, entry.playerRefId);
      }
    }
    if (!winnerInLineup) undecided += 1;
  }

  const table = [...records.values()]
    .filter((r) => r.player)
    .map(finishRecord)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  // which games each lineup member owns, and who owns each game
  const games_ = topN(gamePlays, 12).map(({ key, value }) => {
    const { leaders, tied, ranked } = leadersOf(perGameWins.get(key) || new Map(), players);
    return {
      game: games.get(key),
      plays: value,
      minutes: gameMinutes.get(key) || 0,
      leaders,
      tied,
      wins: ranked,
    };
  });

  return {
    playerIds,
    mode,
    year,
    plays: plays.length,
    minutes,
    undecided,
    firstPlay: plays[0]?.date ?? null,
    lastPlay: plays[plays.length - 1]?.date ?? null,
    table,
    games: games_,
    locations: topN(locationPlays, 5).map(({ key, value }) => ({
      name: locations.get(key)?.name ?? 'Unknown',
      plays: value,
    })),
    /** Head-to-head grid: how often row beat column when both were playing. */
    grid: buildGrid(plays, playerIds, players),
    /** Which slices of the selection met, biggest first. */
    combos: [...combos.entries()]
      .map(([key, c]) => {
        const ids = key ? key.split(',').map(Number) : [];
        const { leaders, tied } = leadersOf(c.wins, players);
        return {
          key,
          players: ids.map((id) => players.get(id)).filter(Boolean),
          size: ids.length,
          plays: c.plays,
          leaders,
          tied,
        };
      })
      .filter((c) => c.size > 0)
      .sort((a, z) => z.plays - a.plays),
  };
}

/** For each ordered pair, how many of their shared plays each one won. */
function buildGrid(plays, playerIds, players) {
  const cells = new Map(); // "a:b" -> { shared, aWins, bWins }
  for (const p of plays) {
    const entries = (p.playerScores || []).filter((s) => playerIds.includes(s.playerRefId));
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        const key = a.playerRefId < b.playerRefId
          ? `${a.playerRefId}:${b.playerRefId}`
          : `${b.playerRefId}:${a.playerRefId}`;
        const [lowId] = key.split(':').map(Number);
        const low = a.playerRefId === lowId ? a : b;
        const high = a.playerRefId === lowId ? b : a;
        if (!cells.has(key)) cells.set(key, { shared: 0, lowWins: 0, highWins: 0 });
        const cell = cells.get(key);
        cell.shared += 1;
        if (low.winner && !high.winner) cell.lowWins += 1;
        if (high.winner && !low.winner) cell.highWins += 1;
      }
    }
  }
  return [...cells.entries()].map(([key, cell]) => {
    const [a, b] = key.split(':').map(Number);
    return {
      a: players.get(a),
      b: players.get(b),
      shared: cell.shared,
      aWins: cell.lowWins,
      bWins: cell.highWins,
      draws: cell.shared - cell.lowWins - cell.highWins,
    };
  }).sort((x, y) => y.shared - x.shared);
}

/**
 * Every player's record, with their best and worst game.
 * "Best" and "worst" are by win rate over games with at least
 * MIN_PLAYS_FOR_RANKING plays, so a single lucky game can't top the list.
 */
export function buildPlayerCards(raw, opts = {}) {
  const { year = null } = opts;
  const ctx = prepare(raw);
  const { games, players, minutesOf } = ctx;
  const plays = inYear(ctx.allPlays, year);

  const byPlayer = new Map(); // id -> { record, perGame: Map(gameId -> {plays, wins, best}) }

  for (const p of plays) {
    const game = games.get(p.gameRefId);
    for (const entry of p.playerScores || []) {
      const id = entry.playerRefId;
      if (!byPlayer.has(id)) {
        byPlayer.set(id, {
          record: newRecord(players.get(id)),
          perGame: new Map(),
          minutes: 0,
          partners: new Map(),
        });
      }
      const slot = byPlayer.get(id);
      addPlayToRecord(slot.record, p, entry, game);
      slot.minutes += minutesOf(p);

      if (!slot.perGame.has(p.gameRefId)) {
        slot.perGame.set(p.gameRefId, { game, plays: 0, wins: 0, best: null });
      }
      const g = slot.perGame.get(p.gameRefId);
      g.plays += 1;
      if (entry.winner) g.wins += 1;
      const n = scoreOf(entry);
      if (n !== null && game && !game.noPoints && (g.best === null || n > g.best)) g.best = n;

      for (const other of p.playerScores || []) {
        if (other.playerRefId !== id) bump(slot.partners, other.playerRefId);
      }
    }
  }

  return [...byPlayer.entries()]
    .map(([id, slot]) => {
      const record = finishRecord(slot.record);
      const perGame = [...slot.perGame.values()]
        .map((g) => ({ ...g, winRate: g.plays ? g.wins / g.plays : 0 }))
        .sort((a, b) => b.plays - a.plays);

      const rankable = perGame.filter((g) => g.plays >= MIN_PLAYS_FOR_RANKING);
      const pool = rankable.length ? rankable : perGame;
      const byRate = [...pool].sort((a, b) => b.winRate - a.winRate || b.plays - a.plays);
      const topPartner = topN(slot.partners, 1)[0];

      return {
        id,
        ...record,
        minutes: slot.minutes,
        perGame,
        mostPlayed: perGame[0] ?? null,
        bestGame: byRate[0] ?? null,
        worstGame: byRate.length > 1 ? byRate[byRate.length - 1] : null,
        rankingIsProvisional: !rankable.length,
        topPartner: topPartner && {
          player: players.get(topPartner.key),
          shared: topPartner.value,
        },
      };
    })
    .filter((r) => r.player)
    .sort((a, b) => b.plays - a.plays);
}

/**
 * Pull the interesting flags out of a play's scoresheet blob.
 *
 * BG Stats stores the sheet as a JSON string of groups of rows. Row `type`
 * tells us what a row means:
 * - `radioOverall` — a way to win the whole game (LOTR: Duel's "Quest of the
 *   Ring", Splendor Duel's "Win: 10+ Crowns"). The winner's score uuid appears
 *   in the row.
 * - `radio` / `checkbox` — an in-game achievement, exclusive or not (CATAN's
 *   Longest Road, Patchwork's 7x7 token).
 *
 * Row keys are player score uuids, which we map back via each entry's own
 * metaData rather than a global uuid table, so anonymous players still resolve.
 */
function readScoresheet(play, entries, players) {
  const sheet = safeJson(play.scoresheet);
  const out = {
    conditions: [], achievements: [], conditionLabels: [], hasConditionRows: false,
  };
  if (!sheet?.groups) return out;

  const byUuid = new Map();
  for (const entry of entries) {
    const uuid = safeJson(entry.metaData)?.scoreUuid;
    if (uuid) {
      byUuid.set(uuid, { player: players.get(entry.playerRefId), role: entry.role || null });
    }
  }

  for (const group of sheet.groups) {
    for (const row of group.rows || []) {
      const type = row.type ?? 'number';
      if (type !== 'radioOverall' && type !== 'radio' && type !== 'checkbox') continue;

      const claimants = Object.keys(row.scores || {})
        .map((uuid) => byUuid.get(uuid))
        .filter((x) => x?.player);

      if (type === 'radioOverall') {
        out.hasConditionRows = true;
        // every offered condition, so we can also spot the ones never used
        out.conditionLabels.push(row.label);
        if (claimants.length) out.conditions.push({ label: row.label, claimants });
      } else if (claimants.length) {
        out.achievements.push({ label: row.label, group: group.label ?? null, claimants });
      }
    }
  }
  return out;
}

/** Running score aggregate, for roles/boards/variants. */
function newScoreBucket(name) {
  return {
    name,
    // `entries` counts player-slots; `playCount` counts distinct plays. They are
    // equal for roles (one player per role) but differ for a board or variant,
    // where every player at the table shares the one value.
    entries: 0,
    playCount: 0,
    wins: 0,
    scoredPlays: 0,
    scoreTotal: 0,
    avgScore: null,
    winRate: 0,
    highest: null,
    lowest: null,
    byPlayer: new Map(),
    seenPlays: new Set(),
  };
}

function addToBucket(bucket, entry, player, play, countable) {
  bucket.entries += 1;
  if (!bucket.seenPlays.has(play.uuid)) {
    bucket.seenPlays.add(play.uuid);
    bucket.playCount += 1;
  }
  if (entry.winner) bucket.wins += 1;

  if (!bucket.byPlayer.has(player?.id)) {
    bucket.byPlayer.set(player?.id, { player, plays: 0, wins: 0 });
  }
  const per = bucket.byPlayer.get(player?.id);
  per.plays += 1;
  if (entry.winner) per.wins += 1;

  const n = countable ? scoreOf(entry) : null;
  if (n !== null) {
    bucket.scoredPlays += 1;
    bucket.scoreTotal += n;
    const who = { score: n, player, date: play.date };
    if (!bucket.highest || n > bucket.highest.score) bucket.highest = who;
    if (!bucket.lowest || n < bucket.lowest.score) bucket.lowest = who;
  }
}

function finishBucket(bucket) {
  bucket.winRate = bucket.entries ? bucket.wins / bucket.entries : 0;
  bucket.avgScore = bucket.scoredPlays ? bucket.scoreTotal / bucket.scoredPlays : null;
  bucket.players = [...bucket.byPlayer.values()]
    .filter((p) => p.player)
    .sort((a, z) => z.plays - a.plays);
  delete bucket.byPlayer;
  delete bucket.seenPlays;
  return bucket;
}

/**
 * Best/worst role by win rate, over roles with enough plays to mean anything.
 * Mirrors how a player's best/worst game works.
 */
function rankBuckets(buckets) {
  const rankable = buckets.filter((b) => b.entries >= MIN_PLAYS_FOR_RANKING);
  const pool = rankable.length ? rankable : buckets;
  const byRate = [...pool].sort((a, z) => z.winRate - a.winRate || z.entries - a.entries);
  return {
    best: byRate[0] ?? null,
    worst: byRate.length > 1 ? byRate[byRate.length - 1] : null,
    provisional: !rankable.length,
  };
}

/**
 * Boards and variants are a property of the whole play, so every player at the
 * table shares them — a win rate would just reflect the player count. Rank them
 * by scoring instead.
 */
function rankByScore(buckets) {
  const scored = buckets.filter((b) => b.avgScore !== null);
  const byScore = [...scored].sort((a, z) => z.avgScore - a.avgScore);
  return {
    highest: byScore[0] ?? null,
    lowest: byScore.length > 1 ? byScore[byScore.length - 1] : null,
    thin: buckets.every((b) => b.playCount < MIN_PLAYS_FOR_RANKING),
  };
}

/** One game, every player's record in it, plus roles / boards / variants. */
export function buildGameCard(raw, gameId, opts = {}) {
  const { year = null } = opts;
  const ctx = prepare(raw);
  const { games, players, locations, minutesOf } = ctx;
  const game = games.get(gameId);
  const plays = inYear(ctx.allPlays, year).filter((p) => p.gameRefId === gameId);
  const scoresCount = !!game && !game.noPoints;

  const records = new Map();
  const locationPlays = new Map();
  const byCount = new Map();      // player count -> plays
  const roleBuckets = new Map();
  const boardBuckets = new Map();
  const variantBuckets = new Map();
  const conditionRows = new Map();   // label -> how this game got won
  const achievementRows = new Map(); // label -> in-game honours claimed
  const conditionTally = { withRows: 0, marked: 0 };
  const offeredConditions = new Set(); // including any never actually achieved
  // how completely these optional fields are filled in, so the UI can say so
  const coverage = {
    entries: 0, roleEntries: 0, rolePlays: 0, boardPlays: 0, variantPlays: 0, realScores: 0,
  };
  let minutes = 0;
  let timedPlays = 0;
  let firstPlayerWins = 0;
  let firstPlayerKnown = 0;
  let highest = null;
  let lowest = null;

  for (const p of plays) {
    minutes += minutesOf(p);
    if (p.durationMin > 0) timedPlays += 1;
    if (p.locationRefId) bump(locationPlays, p.locationRefId);
    const entries = p.playerScores || [];
    bump(byCount, entries.length);

    const starter = entries.find((s) => s.startPlayer);
    if (starter) {
      firstPlayerKnown += 1;
      if (starter.winner) firstPlayerWins += 1;
    }

    // board is a play-level field; the variant lives inside the scoresheet blob
    const variant = safeJson(p.scoresheet)?.variantLabel || null;

    const sheet = readScoresheet(p, entries, players);
    if (sheet.hasConditionRows) {
      conditionTally.withRows += 1;
      if (sheet.conditions.length) conditionTally.marked += 1;
      for (const label of sheet.conditionLabels) offeredConditions.add(label);
    }
    for (const cond of sheet.conditions) {
      if (!conditionRows.has(cond.label)) {
        conditionRows.set(cond.label, {
          name: cond.label, plays: 0, byPlayer: new Map(), byRole: new Map(),
        });
      }
      const slot = conditionRows.get(cond.label);
      slot.plays += 1;
      for (const { player, role } of cond.claimants) {
        if (!slot.byPlayer.has(player.id)) slot.byPlayer.set(player.id, { player, count: 0 });
        slot.byPlayer.get(player.id).count += 1;
        if (role) bump(slot.byRole, role);
      }
    }
    for (const ach of sheet.achievements) {
      if (!achievementRows.has(ach.label)) {
        achievementRows.set(ach.label, { name: ach.label, claims: 0, byPlayer: new Map() });
      }
      const slot = achievementRows.get(ach.label);
      for (const { player } of ach.claimants) {
        slot.claims += 1;
        if (!slot.byPlayer.has(player.id)) slot.byPlayer.set(player.id, { player, count: 0 });
        slot.byPlayer.get(player.id).count += 1;
      }
    }
    coverage.entries += entries.length;
    if (entries.some((s) => s.role)) coverage.rolePlays += 1;
    if (p.board) coverage.boardPlays += 1;
    if (variant) coverage.variantPlays += 1;

    for (const entry of entries) {
      if (entry.role) coverage.roleEntries += 1;
      if (scoreOf(entry)) coverage.realScores += 1;
      const id = entry.playerRefId;
      const player = players.get(id);
      if (!records.has(id)) records.set(id, newRecord(player));
      addPlayToRecord(records.get(id), p, entry, game);

      // roles are per player; boards and variants are per play, so every player
      // at the table contributes their score to the play's board/variant bucket
      for (const [key, store] of [
        [entry.role, roleBuckets],
        [p.board, boardBuckets],
        [variant, variantBuckets],
      ]) {
        if (!key) continue;
        if (!store.has(key)) store.set(key, newScoreBucket(key));
        addToBucket(store.get(key), entry, player, p, scoresCount);
      }

      const n = scoreOf(entry);
      if (n !== null && game && !game.noPoints) {
        const who = { score: n, player: players.get(id), date: p.date };
        if (!highest || n > highest.score) highest = who;
        if (!lowest || n < lowest.score) lowest = who;
      }
    }
  }

  const table = [...records.values()]
    .filter((r) => r.player)
    .map(finishRecord)
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

  const finishAll = (store) => [...store.values()]
    .map(finishBucket)
    .sort((a, z) => z.entries - a.entries || z.winRate - a.winRate);

  const roles = finishAll(roleBuckets);
  const boards = finishAll(boardBuckets);

  const rankPeople = (map) => [...map.values()].sort((a, z) => z.count - a.count);

  const conditions = [...conditionRows.values()]
    .map((c) => ({
      name: c.name,
      plays: c.plays,
      players: rankPeople(c.byPlayer),
      roles: topN(c.byRole, 10).map(({ key, value }) => ({ role: key, count: value })),
    }))
    .sort((a, z) => z.plays - a.plays);

  const achievements = [...achievementRows.values()]
    .map((a) => ({ name: a.name, claims: a.claims, players: rankPeople(a.byPlayer) }))
    .sort((a, z) => z.claims - a.claims);

  // BG Stats fills variantLabel with the game's own name for most games, which
  // tells you nothing. Keep it only when it actually distinguishes something.
  const allVariants = finishAll(variantBuckets);
  const variants = allVariants.length > 1
    || (allVariants.length === 1 && allVariants[0].name !== game?.name)
    ? allVariants
    : [];

  return {
    game,
    year,
    scoresCount,
    /**
     * True when scores actually carry information. Games won by a condition
     * rather than points (LOTR: Duel) log mostly blanks and zeroes while still
     * leaving `noPoints` false, and averaging those produces nonsense.
     */
    scoresMeaningful: scoresCount
      && scoresLookMeaningful(coverage.realScores, coverage.entries),
    coverage,
    roles,
    roleRanking: rankBuckets(roles),
    /** The different ways this game was actually won. */
    conditions,
    conditionTally: {
      ...conditionTally,
      // plays that offered win conditions but recorded none: decided on points
      onPoints: conditionTally.withRows - conditionTally.marked,
      offered: offeredConditions.size,
    },
    /** Routes to victory the sheet offers that nobody has managed yet. */
    unusedConditions: [...offeredConditions]
      .filter((label) => !conditions.some((c) => c.name === label)),
    /** In-game honours (Longest Road, 7x7 token) rather than ways to win. */
    achievements,
    boards,
    boardRanking: rankByScore(boards),
    variants,
    variantRanking: rankByScore(variants),
    plays: plays.length,
    minutes,
    timedPlays,
    avgMinutes: plays.length ? Math.round(minutes / plays.length) : 0,
    firstPlay: plays[0]?.date ?? null,
    lastPlay: plays[plays.length - 1]?.date ?? null,
    table,
    champion: table[0] ?? null,
    highest,
    lowest,
    firstPlayerAdvantage: firstPlayerKnown ? firstPlayerWins / firstPlayerKnown : null,
    firstPlayerKnown,
    playerCounts: [...byCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([count, value]) => ({ count, plays: value })),
    locations: topN(locationPlays, 5).map(({ key, value }) => ({
      name: locations.get(key)?.name ?? 'Unknown',
      plays: value,
    })),
  };
}

/** Games that actually have plays in range, for populating pickers. */
export function playedGames(raw, opts = {}) {
  const { year = null } = opts;
  const ctx = prepare(raw);
  const counts = new Map();
  for (const p of inYear(ctx.allPlays, year)) bump(counts, p.gameRefId);
  return topN(counts, 500).map(({ key, value }) => ({
    game: ctx.games.get(key),
    plays: value,
  })).filter((r) => r.game);
}

/** Players with plays in range, for populating pickers. */
export function activePlayers(raw, opts = {}) {
  const { year = null } = opts;
  const ctx = prepare(raw);
  const counts = new Map();
  for (const p of inYear(ctx.allPlays, year)) {
    for (const s of p.playerScores || []) bump(counts, s.playerRefId);
  }
  return topN(counts, 500).map(({ key, value }) => ({
    player: ctx.players.get(key),
    plays: value,
    isMe: key === ctx.meId,
  })).filter((r) => r.player);
}

export { MIN_PLAYS_FOR_RANKING };

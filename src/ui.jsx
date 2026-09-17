import React from 'react';

export const fmt = (n) => n.toLocaleString();
export const pct = (n) => `${Math.round(n * 100)}%`;

export function hoursLabel(minutes) {
  const mins = Math.round(minutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function dateLabel(date) {
  if (!date) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function Thumb({ game, size = 64 }) {
  if (!game?.urlThumb) {
    return (
      <div className="thumb thumb--empty" style={{ width: size, height: size }}>
        {game?.name?.[0] ?? '?'}
      </div>
    );
  }
  return (
    <img
      className="thumb"
      src={game.urlThumb}
      alt={game.name}
      loading="lazy"
      style={{ width: size, height: size }}
    />
  );
}

export function Bars({ rows, accent = 'rgba(255,255,255,0.9)' }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className={`bar-row${r.muted ? ' is-muted' : ''}`} key={r.label}>
          <span className="bar-label" title={r.label}>{r.label}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(r.value / max) * 100}%`, background: accent }} />
          </div>
          <span className="bar-value">{r.display ?? r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Small labelled figure, used across the drill-down panels. */
export function Stat({ label, value, sub }) {
  return (
    <div className="stat-cell">
      <small>{label}</small>
      <strong>{value}</strong>
      {sub && <span>{sub}</span>}
    </div>
  );
}

/** Stable per-player colour, derived from the BG Stats player id. */
export function playerColor(id, alpha = 1) {
  const hue = (Number(id) * 77) % 360;
  return `hsl(${hue} 72% 62% / ${alpha})`;
}

export function Avatar({ player, size = 44, ring }) {
  const initials = (player?.name ?? '?')
    .split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: playerColor(player?.id ?? 0, 0.28),
        borderColor: ring ?? playerColor(player?.id ?? 0),
        color: playerColor(player?.id ?? 0),
      }}
    >
      {initials}
    </span>
  );
}

/** Ring chart for a single proportion. */
export function Donut({ value, label, sub, size = 168, stroke = 14, color = '#fff' }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="donut" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={stroke}
        />
        <circle
          className="donut-arc"
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference * value} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="donut-face">
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
    </div>
  );
}

/** Two players, one bar: who beat whom, with the middle for undecided plays. */
export function VsBar({ a, b, aWins, bWins, draws = 0, shared }) {
  const total = shared || aWins + bWins + draws || 1;
  const seg = (n) => `${(n / total) * 100}%`;
  const winner = aWins === bWins ? null : (aWins > bWins ? a : b);
  return (
    <div className="vs">
      <div className="vs-head">
        <span className="vs-side">
          <Avatar player={a} size={34} />
          <strong>{a?.name}</strong>
        </span>
        <span className="vs-score">
          {aWins}<em>–</em>{bWins}
        </span>
        <span className="vs-side vs-side--right">
          <strong>{b?.name}</strong>
          <Avatar player={b} size={34} />
        </span>
      </div>
      <div className="vs-track">
        <div className="vs-seg" style={{ width: seg(aWins), background: playerColor(a?.id ?? 0) }} />
        {draws > 0 && <div className="vs-seg vs-seg--draw" style={{ width: seg(draws) }} />}
        <div className="vs-seg" style={{ width: seg(bWins), background: playerColor(b?.id ?? 0) }} />
      </div>
      <small className="vs-foot">
        {shared} shared {shared === 1 ? 'play' : 'plays'}
        {draws > 0 && ` · ${draws} decided by neither`}
        {winner && ` · ${winner.name} ahead`}
      </small>
    </div>
  );
}

/** Horizontal bars tinted per player, with an avatar per row. */
export function PlayerBars({ rows, max: forcedMax }) {
  const max = forcedMax ?? Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="pbars">
      {rows.map((r) => (
        <div className="pbar" key={r.label ?? r.player?.id}>
          <Avatar player={r.player} size={34} />
          <span className="pbar-main">
            <span className="pbar-top">
              {/* an explicit label wins, so one player's games can share a colour */}
              <strong>{r.label ?? r.player?.name}</strong>
              <small>{r.display ?? r.value}</small>
            </span>
            <span className="pbar-track">
              <span
                className="pbar-fill"
                style={{
                  width: `${(r.value / max) * 100}%`,
                  background: playerColor(r.player?.id ?? 0),
                }}
              />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact vertical bars, for player-count and month-style distributions. */
export function ColumnChart({ rows, height = 130 }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="columns" style={{ height }}>
      {rows.map((r) => (
        <div className="column" key={r.label} title={`${r.label}: ${r.value}`}>
          <span className="column-value">{r.value || ''}</span>
          <div className="column-bar" style={{ height: `${(r.value / max) * 100}%` }} />
          <span className="column-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

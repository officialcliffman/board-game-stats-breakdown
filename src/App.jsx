import React, { useCallback, useMemo, useRef, useState } from 'react';
import { buildBreakdown } from './lib/stats.js';
import { buildSlides } from './slides.jsx';
import Deck from './Deck.jsx';
import Explore from './Explore.jsx';

function Dropzone({ onLoad, error }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => onLoad(reader.result, file.name);
    reader.readAsText(file);
  };

  return (
    <div className="slide theme-aurora">
      <div className="slide-inner">
        <p className="eyebrow">BGS Breakdown</p>
        <h1 className="mega">Your board game<br />year, unwrapped</h1>
        <p className="lede">
          Export your data from BG Stats (<em>Settings → Backup / Export → JSON</em>) and drop the
          file here. Everything is processed in your browser — nothing is uploaded.
        </p>

        <div
          className={`dropzone${dragging ? ' is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) readFile(file);
          }}
        >
          <strong>Drop your BGStatsExport.json here</strong>
          <span>or click to browse</span>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])}
          />
        </div>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

function YearPicker({ years, value, onChange }) {
  return (
    <div className="year-picker">
      <button
        type="button"
        className={value === null ? 'is-active' : ''}
        onClick={() => onChange(null)}
      >
        All time
      </button>
      {years.map((y) => (
        <button
          key={y}
          type="button"
          className={value === y ? 'is-active' : ''}
          onClick={() => onChange(y)}
        >
          {y}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [raw, setRaw] = useState(null);
  const [error, setError] = useState(null);
  const [year, setYear] = useState(null);
  const [exploring, setExploring] = useState(false);

  const handleLoad = useCallback((text) => {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed.plays) || !Array.isArray(parsed.games)) {
        throw new Error('That JSON does not look like a BG Stats export (no plays/games arrays).');
      }
      setRaw(parsed);
      setError(null);
      // default to the most recent year that has plays
      const ys = [...new Set(parsed.plays.map((p) => Number(p.playDate?.slice(0, 4))))]
        .filter(Boolean).sort();
      setYear(ys.length > 1 ? ys[ys.length - 1] : null);
    } catch (e) {
      setError(e.message || 'Could not read that file.');
    }
  }, []);

  const breakdown = useMemo(() => (raw ? buildBreakdown(raw, { year }) : null), [raw, year]);
  const slides = useMemo(() => (breakdown ? buildSlides(breakdown) : []), [breakdown]);

  if (!breakdown) return <Dropzone onLoad={handleLoad} error={error} />;

  if (exploring) {
    return (
      <Explore
        raw={raw}
        year={year}
        years={breakdown.meta.years}
        onYearChange={setYear}
        onClose={() => setExploring(false)}
      />
    );
  }

  if (!slides.length) {
    return (
      <div className="slide theme-slate">
        <div className="slide-inner">
          <h2 className="title">No plays found for {year ?? 'this range'}</h2>
          <YearPicker years={breakdown.meta.years} value={year} onChange={setYear} />
        </div>
      </div>
    );
  }

  return (
    <Deck
      slides={slides}
      resetKey={year}
      footer={<YearPicker years={breakdown.meta.years} value={year} onChange={setYear} />}
      actions={(
        <>
          <button type="button" className="ghost" onClick={() => setExploring(true)}>
            Dig deeper
          </button>
          <button type="button" className="ghost" onClick={() => setRaw(null)}>
            New file
          </button>
        </>
      )}
    />
  );
}

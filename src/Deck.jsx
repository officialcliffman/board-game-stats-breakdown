import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The slide shell: gradient background, progress bar, and keyboard/click/swipe
 * navigation. Any view that can express itself as an array of
 * `{ id, theme, render }` gets the story-deck treatment for free — the main
 * breakdown and every drill-down go through here.
 *
 * @param slides    array of { id, theme, render }
 * @param resetKey  changing this jumps back to the first slide
 * @param onExit    called on Escape / the back button, if given
 * @param footer    rendered bottom-left, e.g. the year picker
 * @param paused    true while something above the deck owns the keyboard
 */
export default function Deck({
  slides, resetKey, onExit, onExitLabel = 'Back', footer, actions, paused = false,
}) {
  const [index, setIndex] = useState(0);
  const touchStart = useRef(null);

  useEffect(() => { setIndex(0); }, [resetKey]);

  const go = useCallback((delta) => {
    setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(slides.length - 1, 0)));
  }, [slides.length]);

  useEffect(() => {
    if (paused) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && onExit) { onExit(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onExit, paused]);

  if (!slides.length) return null;
  const slide = slides[Math.min(index, slides.length - 1)];

  return (
    <div
      className={`slide theme-${slide.theme}`}
      onClick={(e) => {
        if (paused || e.target.closest('button, a, input, select, table, .no-advance')) return;
        go(e.clientX < window.innerWidth * 0.25 ? -1 : 1);
      }}
      onTouchStart={(e) => {
        touchStart.current = paused || e.target.closest('.no-advance')
          ? null
          : e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className="progress">
        {slides.map((s, i) => (
          <span key={s.id} className={i <= index ? 'is-done' : ''} />
        ))}
      </div>

      <div className="slide-inner" key={slide.id}>
        {slide.render()}
      </div>

      <div className="chrome">
        {footer ?? <span />}
        <div className="chrome-actions">
          {actions}
          {onExit && (
            <button type="button" className="ghost" onClick={onExit}>
              {onExitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

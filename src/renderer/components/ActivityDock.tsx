import React, { useEffect, useRef, useState } from 'react';
import type { ProgressEvent } from '../../shared/types';

/**
 * Floating bottom-right activity button + popover.
 *
 * Replaces the old in-page ProgressPanel. Holds the full session history of
 * progress events (no auto-removal) and surfaces a badge with the count of
 * currently-active items.
 */
export function ActivityDock({
  events,
  onClear
}: {
  events: ProgressEvent[];
  onClear: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = events.filter((e) => e.phase === 'start' || e.phase === 'progress').length;
  const errored = events.some((e) => e.phase === 'error');
  const total = events.length;

  // Sort newest-first for display.
  const ordered = [...events].sort((a, b) => {
    // events array is already roughly newest-first (App pushes new ones to front),
    // but ensure a stable order when timestamps tie.
    return 0;
  });

  return (
    <>
      <button
        ref={buttonRef}
        className={`activity-dock__button ${active > 0 ? 'activity-dock__button--active' : ''} ${errored && active === 0 ? 'activity-dock__button--error' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Activity (${total} ${total === 1 ? 'event' : 'events'})`}
        title="Activity"
      >
        <span className="activity-dock__icon" aria-hidden>
          {active > 0 ? '⟳' : '◔'}
        </span>
        <span className="activity-dock__label">Activity</span>
        {total > 0 && (
          <span
            className={`activity-dock__badge ${active > 0 ? 'activity-dock__badge--active' : errored ? 'activity-dock__badge--error' : ''}`}
          >
            {active > 0 ? active : total}
          </span>
        )}
      </button>

      {open && (
        <div ref={popoverRef} className="activity-dock__popover" role="dialog" aria-label="Activity history">
          <header className="activity-dock__header">
            <h3>Activity</h3>
            <span className="muted">
              {total === 0
                ? 'No activity yet'
                : `${total} event${total === 1 ? '' : 's'} this session`}
            </span>
            <div className="activity-dock__header-actions">
              {total > 0 && (
                <button className="small ghost" onClick={onClear}>
                  Clear
                </button>
              )}
              <button
                className="small ghost"
                onClick={() => setOpen(false)}
                aria-label="Close activity"
              >
                ✕
              </button>
            </div>
          </header>
          {total === 0 ? (
            <div className="activity-dock__empty">
              <div className="empty__icon" aria-hidden>
                ✨
              </div>
              <p>Backups, uploads, downloads and scheduled jobs will appear here as they happen.</p>
            </div>
          ) : (
            <ol className="activity-dock__list">
              {ordered.map((e) => (
                <li key={e.id} className={`activity-item activity-item--${e.phase}`}>
                  <div className="activity-item__row">
                    <span className="activity-item__label">{e.label}</span>
                    <span className={`chip chip--${phaseChip(e.phase)}`}>{phaseText(e)}</span>
                  </div>
                  {(e.phase === 'progress' || e.phase === 'start') && (
                    <div className="bar">
                      <span
                        style={{
                          width: `${Math.round((e.ratio ?? 0) * 100)}%`,
                          background: 'var(--accent)'
                        }}
                      />
                    </div>
                  )}
                  {e.phase === 'done' && (
                    <div className="bar">
                      <span style={{ width: '100%', background: 'var(--ok)' }} />
                    </div>
                  )}
                  {e.message && (
                    <div className="activity-item__message muted">{e.message}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </>
  );
}

function phaseChip(phase: ProgressEvent['phase']): 'ok' | 'bad' | 'info' | 'warn' {
  switch (phase) {
    case 'done': return 'ok';
    case 'error': return 'bad';
    case 'progress': return 'info';
    case 'start': return 'warn';
  }
}

function phaseText(e: ProgressEvent): string {
  switch (e.phase) {
    case 'done': return 'done';
    case 'error': return 'error';
    case 'progress': return e.ratio !== undefined ? `${Math.round(e.ratio * 100)}%` : 'running';
    case 'start': return 'starting';
  }
}

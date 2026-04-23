import React from 'react';
import type { ProgressEvent } from '../../shared/types';

export function ProgressPanel({
  events
}: {
  events: ProgressEvent[];
}): JSX.Element | null {
  if (events.length === 0) return null;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Activity</h3>
        <span className="chip chip--info right">{events.length}</span>
      </div>
      <div className="progress-list">
        {events.map((e) => (
          <div key={e.id} className="progress-item">
            <div className="row">
              <span>{e.label}</span>
              <span className="right muted">
                {e.phase === 'error'
                  ? `error: ${e.message ?? ''}`
                  : e.phase === 'done'
                    ? 'done'
                    : e.message ?? ''}
              </span>
            </div>
            <div className="bar">
              <span
                style={{
                  width: `${Math.round((e.ratio ?? (e.phase === 'done' ? 1 : 0)) * 100)}%`,
                  background:
                    e.phase === 'error'
                      ? 'var(--danger)'
                      : 'var(--accent)'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

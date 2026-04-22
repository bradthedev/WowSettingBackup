import React from 'react';
import type { BackupMeta } from '../../shared/types';
import { formatBytes, formatDate } from './format';

export function MetaDetails({
  meta
}: {
  meta?: BackupMeta;
}): JSX.Element {
  if (!meta) {
    return (
      <div className="muted" style={{ padding: '8px 4px' }}>
        No metadata sidecar found for this backup.
      </div>
    );
  }
  const s = meta.source;
  return (
    <div
      style={{
        background: 'var(--panel-2)',
        borderRadius: 6,
        padding: 12,
        margin: '6px 0',
        fontSize: 13,
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        rowGap: 4,
        columnGap: 12
      }}
    >
      <div className="muted">Source machine</div>
      <div>
        {s.hostname} <span className="muted">({s.username})</span>
      </div>

      <div className="muted">OS</div>
      <div>
        {s.platform} {s.arch} · {s.osRelease}
      </div>

      <div className="muted">Primary IP</div>
      <div>{s.primaryIp ?? '—'}</div>

      {Object.keys(s.ipv4Addresses).length > 0 && (
        <>
          <div className="muted">All IPv4</div>
          <div>
            {Object.entries(s.ipv4Addresses)
              .map(([ifname, addrs]) => `${ifname}: ${addrs.join(', ')}`)
              .join(' · ')}
          </div>
        </>
      )}

      <div className="muted">App version</div>
      <div>{s.appVersion}</div>

      <div className="muted">WoW install root</div>
      <div style={{ wordBreak: 'break-all' }}>{meta.wowInstallRoot}</div>

      <div className="muted">Backup created</div>
      <div>{formatDate(meta.createdAtIso)}</div>

      {meta.uploadedAtIso && (
        <>
          <div className="muted">Uploaded</div>
          <div>{formatDate(meta.uploadedAtIso)}</div>
        </>
      )}

      <div className="muted">Size</div>
      <div>{formatBytes(meta.sizeBytes)}</div>

      {meta.entryCount != null && (
        <>
          <div className="muted">Entries in zip</div>
          <div>{meta.entryCount}</div>
        </>
      )}

      <div className="muted">SHA-256</div>
      <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>
        {meta.sha256}
      </div>

      {meta.note && (
        <>
          <div className="muted">Note</div>
          <div>{meta.note}</div>
        </>
      )}
    </div>
  );
}

import { useRef, useState } from 'react';
import { DOC_TYPES, EXPIRING_DOCS } from '../data/config';
import { daysUntil, fmtDate, fmtDateTime, nowIso, uid } from '../utils/helpers';
import { Field } from './ui';

const ext = (name = '') => (name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);

/**
 * Upload, version and expire documents for a customer.
 * props: documents, onChange(nextDocuments, auditDetail), requiredDocs, uploadedBy, canUpload, canVerify, onVerify(docId)
 */
export default function DocumentManager({
  documents, onChange, requiredDocs = [], uploadedBy, canUpload = true, canVerify = false, verifiedBy,
  docTypes = Object.values(DOC_TYPES), expiringTypes = EXPIRING_DOCS,
}) {
  const [type, setType] = useState(requiredDocs[0] || docTypes[0]);
  const [expiry, setExpiry] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const fileRef = useRef(null);

  const current = documents.filter((d) => d.current);
  const history = documents.filter((d) => !d.current);
  const needsExpiry = expiringTypes.includes(type);

  const upload = () => {
    if (!file) return;
    const prev = documents.filter((d) => d.type === type);
    const version = prev.length + 1;
    const next = documents.map((d) => (d.type === type ? { ...d, current: false } : d));
    next.push({
      id: uid('doc'),
      type,
      fileName: file.name,
      size: file.size,
      mime: file.type,
      issuedOn,
      expiry: needsExpiry ? expiry : '',
      version,
      current: true,
      uploadedBy,
      uploadedAt: nowIso(),
      verified: false,
      verifiedBy: '',
      note,
    });
    onChange(next, `${type} uploaded (v${version}): ${file.name}`);
    setFile(null); setExpiry(''); setIssuedOn(''); setNote('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = (id) => {
    const doc = documents.find((d) => d.id === id);
    if (!window.confirm(`Remove ${doc.type} (${doc.fileName})? Earlier versions, if any, will become current.`)) return;
    let next = documents.filter((d) => d.id !== id);
    const older = next.filter((d) => d.type === doc.type).sort((a, b) => b.version - a.version);
    if (older[0]) next = next.map((d) => (d.id === older[0].id ? { ...d, current: true } : d));
    onChange(next, `${doc.type} removed: ${doc.fileName}`);
  };

  const verify = (id, ok) => {
    const doc = documents.find((d) => d.id === id);
    onChange(
      documents.map((d) => (d.id === id ? { ...d, verified: ok, verifiedBy: ok ? verifiedBy : '', verifiedAt: ok ? nowIso() : '' } : d)),
      `${doc.type} ${ok ? 'verified' : 'verification cleared'}`,
    );
  };

  const missing = requiredDocs.filter((t) => !current.some((d) => d.type === t));

  return (
    <div className="stack">
      {missing.length > 0 && (
        <div className="alert alert-warn">
          <b>Required documents still missing:</b> {missing.join(', ')}
        </div>
      )}

      {canUpload && (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="card-body">
            <div className="form-grid cols-3">
              <Field label="Document type" required>
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {docTypes.map((t) => (
                    <option key={t} value={t}>{t}{requiredDocs.includes(t) ? ' (required)' : ''}</option>
                  ))}
                </select>
              </Field>
              <Field label="File" required hint="Any image or PDF. Only the file name and size are kept in this demo.">
                <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
              <Field label="Issued on"><input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} /></Field>
              {needsExpiry && (
                <Field label="Expiry date" required><input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
              )}
              <Field label="Note" className={needsExpiry ? 'span-2' : 'span-3'}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Renewed copy collected during field visit" />
              </Field>
            </div>
            <div className="row mt-16">
              <button className="btn btn-primary" disabled={!file || (needsExpiry && !expiry)} onClick={upload}>
                Upload {current.some((d) => d.type === type) ? 'new version' : 'document'}
              </button>
              {current.some((d) => d.type === type) && <span className="small muted">A current {type} exists. Uploading will archive it as a previous version.</span>}
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-8">Current documents ({current.length})</h3>
        {current.length === 0 ? <p className="muted">No documents uploaded.</p> : current.map((d) => {
          const days = d.expiry ? daysUntil(d.expiry) : null;
          return (
            <div key={d.id} className="doc-item">
              <div className="doc-icon">{ext(d.fileName)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="strong">{d.type} <span className="muted small">v{d.version}</span>{requiredDocs.includes(d.type) && <span className="chip on" style={{ marginLeft: 6 }}>required</span>}</div>
                <div className="small muted">{d.fileName}{d.size ? ` · ${(d.size / 1024).toFixed(0)} KB` : ''}{d.issuedOn ? ` · issued ${fmtDate(d.issuedOn)}` : ''} · uploaded {fmtDateTime(d.uploadedAt)} by {d.uploadedBy}{d.note ? ` · ${d.note}` : ''}</div>
                {d.expiry && (
                  <div className={`small ${days < 0 ? 'badge badge-red' : days <= 60 ? 'badge badge-amber' : 'muted'}`} style={{ marginTop: 4 }}>
                    {days < 0 ? `Expired ${fmtDate(d.expiry)}` : `Expires ${fmtDate(d.expiry)} (${days} days)`}
                  </div>
                )}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {d.verified ? <span className="badge badge-green">✓ Verified by {d.verifiedBy}</span> : <span className="badge badge-gray">Unverified</span>}
                {canVerify && (
                  <button className="btn btn-sm" onClick={() => verify(d.id, !d.verified)}>{d.verified ? 'Clear' : 'Verify'}</button>
                )}
                {canUpload && <button className="btn btn-sm btn-ghost" onClick={() => remove(d.id)}>Remove</button>}
              </div>
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <div>
          <button className="btn-link" onClick={() => setShowHistory((s) => !s)}>
            {showHistory ? 'Hide' : 'Show'} previous versions ({history.length})
          </button>
          {showHistory && history.map((d) => (
            <div key={d.id} className="doc-item" style={{ opacity: 0.7 }}>
              <div className="doc-icon" style={{ background: 'var(--gray-soft)', color: 'var(--gray)' }}>{ext(d.fileName)}</div>
              <div style={{ flex: 1 }}>
                <div>{d.type} <span className="muted small">v{d.version} · superseded</span></div>
                <div className="small muted">{d.fileName} · uploaded {fmtDateTime(d.uploadedAt)} by {d.uploadedBy}{d.expiry ? ` · expiry ${fmtDate(d.expiry)}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

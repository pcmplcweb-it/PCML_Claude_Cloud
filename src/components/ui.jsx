import { useEffect, useState } from 'react';
import { CREDIT_STATUS, RISK, STATUS, STATUS_COLORS } from '../data/config';
import { HR_STATUS_COLORS } from '../hr/config';
import { SUPPLIER_STATUS_COLORS, TERMS_STATUS } from '../kys/config';

// HR keys are spread last; the shared strings (Draft, Closed, Cancelled, Pending, Approved, Rejected) carry the same tone in every portal.
const ALL_STATUS_COLORS = { ...STATUS_COLORS, ...SUPPLIER_STATUS_COLORS, ...HR_STATUS_COLORS };

export const StatusBadge = ({ status }) => (
  <span className={`badge badge-${ALL_STATUS_COLORS[status] || 'gray'}`}>
    <span className="dot" />
    {status}
  </span>
);

export const RiskBadge = ({ category }) => {
  if (!category) return <span className="badge badge-gray">Not assessed</span>;
  const tone = category === RISK.HIGH ? 'red' : category === RISK.MEDIUM ? 'amber' : 'green';
  return <span className={`badge badge-${tone}`}>{category} risk</span>;
};

export const CreditBadge = ({ status }) => {
  const tone = {
    [CREDIT_STATUS.NONE]: 'gray',
    [CREDIT_STATUS.REQUESTED]: 'blue',
    [CREDIT_STATUS.UNDER_REVIEW]: 'indigo',
    [CREDIT_STATUS.APPROVED]: 'green',
    [CREDIT_STATUS.DECLINED]: 'red',
    [CREDIT_STATUS.SUSPENDED]: 'amber',
  }[status] || 'gray';
  return <span className={`badge badge-${tone}`}>{status}</span>;
};

export const Card = ({ title, actions, children, className = '', bodyClass = '' }) => (
  <div className={`card ${className}`}>
    {(title || actions) && (
      <div className="card-head">
        <h3>{title}</h3>
        {actions && <div className="row">{actions}</div>}
      </div>
    )}
    <div className={`card-body ${bodyClass}`}>{children}</div>
  </div>
);

export const Field = ({ label, required, hint, children, className = '' }) => (
  <div className={`field ${className}`}>
    {label && (
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
    )}
    {children}
    {hint && <span className="hint">{hint}</span>}
  </div>
);

export const Alert = ({ kind = 'info', title, children }) => (
  <div className={`alert alert-${kind}`}>
    {title && <div className="strong">{title}</div>}
    {children}
  </div>
);

export const Progress = ({ value }) => (
  <div className={`progress ${value >= 100 ? 'good' : value < 50 ? 'warn' : ''}`}>
    <span style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);

export const EmptyState = ({ children }) => <div className="empty">{children}</div>;

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

const FLOW = [STATUS.DRAFT, STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL, STATUS.ACTIVE];

export const TermsBadge = ({ status }) => {
  const tone = {
    [TERMS_STATUS.NONE]: 'gray',
    [TERMS_STATUS.REQUESTED]: 'blue',
    [TERMS_STATUS.UNDER_REVIEW]: 'indigo',
    [TERMS_STATUS.APPROVED]: 'green',
    [TERMS_STATUS.DECLINED]: 'red',
    [TERMS_STATUS.SUSPENDED]: 'amber',
  }[status] || 'gray';
  return <span className={`badge badge-${tone}`}>{status}</span>;
};

export const WorkflowSteps = ({ status, steps = FLOW }) => {
  const idx = steps.indexOf(status);
  const offTrack = idx === -1;
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
          <div className={`step ${!offTrack && i < idx ? 'done' : ''} ${!offTrack && i === idx ? 'current' : ''}`}>
            <span className="n">{!offTrack && i < idx ? '✓' : i + 1}</span>
            <span>{s}</span>
          </div>
          {i < steps.length - 1 && <span className="step-line" />}
        </div>
      ))}
      {offTrack && (
        <div className="step current" style={{ marginLeft: 12 }}>
          <StatusBadge status={status} />
        </div>
      )}
    </div>
  );
};

export const Toasts = ({ toasts }) => (
  <div className="toasts">
    {toasts.map((t) => (
      <div key={t.id} className={`toast ${t.kind}`}>{t.message}</div>
    ))}
  </div>
);

// ---------------------------------------------------------------- HR
// Appraisal grade with the tone of its band (bands come from hrSettings.appraisal.bands).
export const GradeBadge = ({ grade, bands = [] }) => {
  if (!grade) return <span className="badge badge-gray">Not graded</span>;
  const band = bands.find((b) => b.code === grade);
  return <span className={`badge badge-${band?.tone || 'gray'}`}>{band ? `${band.code} · ${band.name}` : grade}</span>;
};

// Five-point rating as a radio group of chips; anchors give the tooltip per point.
export const RatingPills = ({ value, onChange, disabled, anchors = [] }) => {
  const current = Number(value) || 0;
  const pick = (n) => { if (!disabled) onChange?.(String(n)); };
  const onKey = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); pick(Math.min(5, current + 1 || 1)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); pick(Math.max(1, current - 1 || 1)); }
  };
  return (
    <div className="rating-pills" role="radiogroup" onKeyDown={onKey}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={String(value) === String(n)} className={`chip ${String(value) === String(n) ? 'on' : ''}`} title={anchors[n - 1] || ''} disabled={disabled} onClick={() => pick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
};

// Horizontal score bar with the numeric value beside it.
export const ScoreBar = ({ value, max = 100 }) => {
  const n = Number(value);
  const pct = Number.isFinite(n) && max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0;
  return (
    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
      <div className={`progress ${pct >= 75 ? 'good' : pct < 45 ? 'warn' : ''}`} style={{ flex: 1, minWidth: 80 }}><span style={{ width: `${pct}%` }} /></div>
      <span className="mono small nowrap">{Number.isFinite(n) ? n : '—'}</span>
    </div>
  );
};

// Generic reason capture for status changes that must be justified in the audit trail.
export function ReasonModal({ title, label = 'Reason (recorded in the audit trail)', danger, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const ok = reason.trim().length > 0;
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ok} onClick={() => ok && onConfirm(reason.trim())}>{confirmLabel}</button></>}>
      <Field label={label} required><textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

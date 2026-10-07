// Row-level quick actions shared by the customer and supplier lists:
// a small dropdown menu plus the modals that initiate credit / terms
// requests and decisions and periodic reviews without opening the record.
import { useEffect, useRef, useState } from 'react';
import { CREDIT_STATUS, PAYMENT_TERMS } from '../data/config';
import { SUPPLIER_PAYMENT_TERMS, TERMS_STATUS } from '../kys/config';
import { supplierInsights } from '../kys/helpers';
import { useStore } from '../store/StoreContext';
import { businessInsights, fmtMoney, nowIso, referenceSummary, termsToDays, validateCustomer } from '../utils/helpers';
import { Alert, Field, Modal } from './ui';

export function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const openedAt = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    openedAt.current = Date.now();
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    // Scrolling moves the anchor, so close the menu; ignore the scroll-into-view that can follow the opening click.
    const closeOnScroll = () => { if (Date.now() - openedAt.current > 400) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('resize', closeOnScroll);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('scroll', closeOnScroll, true); window.removeEventListener('resize', closeOnScroll); };
  }, [open]);
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  // The menu is positioned fixed (from the button's rectangle) so it is never clipped by a scrolling table wrapper.
  const toggle = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 230) });
    setOpen((o) => !o);
  };
  return (
    <div className="row-menu" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button className="btn btn-sm" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>Actions ▾</button>
      {open && (
        <div className="row-menu-list" role="menu" style={{ top: pos.top, left: pos.left }}>
          {visible.map((it) => (
            <button key={it.label} role="menuitem" className={`row-menu-item ${it.danger ? 'danger' : ''}`} disabled={it.disabled} title={it.hint} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.label}{it.hint && <span className="small muted"> · {it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- KYC credit
export function CreditRequestModal({ customer: c, onClose }) {
  const { dispatch, currentUser, notify } = useStore();
  const [f, setF] = useState({ ...c.credit, requestedCreditDays: c.credit.requestedCreditDays ?? termsToDays(c.credit.paymentTerms) });
  const ins = businessInsights(c);
  const submit = () => {
    if (!(Number(f.requestedLimit) > 0)) { notify('Enter a requested limit greater than zero.', 'error'); return; }
    const fresh = { ...f, status: CREDIT_STATUS.REQUESTED, proposedLimit: '', approvedLimit: '', approvedCreditDays: '', decisionBy: '', decisionAt: '', decisionNote: '' };
    dispatch({ type: 'CREDIT_DECISION', id: c.id, by: currentUser.name, credit: fresh, detail: `Requested ${fmtMoney(f.requestedLimit)} on ${f.paymentTerms} (${f.requestedCreditDays || 0} credit days)` });
    notify(`Credit request submitted for ${c.businessName}.`);
    onClose();
  };
  return (
    <Modal title={`Request credit · ${c.businessName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit request</button></>}>
      {ins.monthlyTurnover > 0 && <p className="small muted">Monthly turnover {fmtMoney(Math.round(ins.monthlyTurnover))}{ins.supplierCredit ? ` · existing supplier credit ${fmtMoney(ins.supplierCredit)}` : ''}.</p>}
      <div className="form-grid">
        <Field label="Requested limit (BDT)" required><input type="number" min="0" autoFocus value={f.requestedLimit} onChange={(e) => setF({ ...f, requestedLimit: e.target.value })} /></Field>
        <Field label="Payment terms"><select value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value, requestedCreditDays: termsToDays(e.target.value) })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Credit days requested" required><input type="number" min="0" value={f.requestedCreditDays ?? ''} onChange={(e) => setF({ ...f, requestedCreditDays: e.target.value })} /></Field>
        <Field label="Trade / bank references"><input value={f.references} onChange={(e) => setF({ ...f, references: e.target.value })} /></Field>
        <Field label="Justification" className="span-2"><textarea value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function CreditDecisionModal({ customer: c, onClose }) {
  const { dispatch, currentUser, notify } = useStore();
  const [f, setF] = useState({ ...c.credit, proposedLimit: c.credit.proposedLimit || c.credit.requestedLimit, approvedLimit: c.credit.approvedLimit || c.credit.requestedLimit, approvedCreditDays: c.credit.approvedCreditDays === '' || c.credit.approvedCreditDays == null ? (c.credit.requestedCreditDays ?? termsToDays(c.credit.paymentTerms)) : c.credit.approvedCreditDays });
  const ins = businessInsights(c);
  const refs = referenceSummary(c.references || []);
  const decide = (status) => {
    const approved = status === CREDIT_STATUS.APPROVED;
    if (approved && !(Number(f.approvedLimit) > 0)) { notify('Enter an approved limit greater than zero.', 'error'); return; }
    const decision = { ...f, status, decisionBy: currentUser.name, decisionAt: nowIso(), approvedLimit: approved ? f.approvedLimit : '', proposedLimit: approved ? f.proposedLimit : '', approvedCreditDays: approved ? f.approvedCreditDays : '' };
    dispatch({ type: 'CREDIT_DECISION', id: c.id, by: currentUser.name, credit: decision, detail: approved ? `Approved ${fmtMoney(f.approvedLimit)} on ${f.paymentTerms} (${f.approvedCreditDays} credit days). ${f.decisionNote || ''}` : f.decisionNote || 'Declined' });
    notify(`Credit ${status.toLowerCase()} for ${c.businessName}.`);
    onClose();
  };
  return (
    <Modal title={`Credit decision · ${c.businessName}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={() => decide(CREDIT_STATUS.DECLINED)}>Decline</button><button className="btn btn-success" onClick={() => decide(CREDIT_STATUS.APPROVED)}>Approve</button></>}>
      <div className="chip-list">
        <span className="chip">Risk: {c.risk.category || 'not assessed'}</span>
        {ins.creditMonths != null && <span className="chip">Requested = {ins.creditMonths} months of turnover</span>}
        {ins.supplierCredit > 0 && <span className="chip">Supplier credit {fmtMoney(ins.supplierCredit)}</span>}
        <span className="chip">References {refs.positive}/{refs.total} positive</span>
        {ins.leverage != null && <span className="chip">Leverage {ins.leverage}%</span>}
      </div>
      {ins.flags.filter((x) => x.tone === 'danger' || x.tone === 'warn').length > 0 && (
        <Alert kind="warn"><ul>{ins.flags.filter((x) => x.tone === 'danger' || x.tone === 'warn').map((x) => <li key={x.text}>{x.text}</li>)}</ul></Alert>
      )}
      <div className="form-grid">
        <Field label="Requested"><input disabled value={`${fmtMoney(c.credit.requestedLimit)} · ${c.credit.paymentTerms} · ${c.credit.requestedCreditDays ?? termsToDays(c.credit.paymentTerms)} days`} /></Field>
        <Field label="Payment terms"><select value={f.paymentTerms} onChange={(e) => setF({ ...f, paymentTerms: e.target.value, approvedCreditDays: termsToDays(e.target.value) })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Proposed limit (BDT)"><input type="number" min="0" value={f.proposedLimit} onChange={(e) => setF({ ...f, proposedLimit: e.target.value })} /></Field>
        <Field label="Approved limit (BDT)" required><input type="number" min="0" value={f.approvedLimit} onChange={(e) => setF({ ...f, approvedLimit: e.target.value })} /></Field>
        <Field label="Approved credit days" required><input type="number" min="0" value={f.approvedCreditDays} onChange={(e) => setF({ ...f, approvedCreditDays: e.target.value })} /></Field>
        <Field label="Decision note" className="span-2"><textarea value={f.decisionNote} onChange={(e) => setF({ ...f, decisionNote: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ periodic review
export function ReviewModal({ entity, portal = 'kyc', typeCfg, onClose }) {
  const { dispatch, currentUser, notify } = useStore();
  const [notes, setNotes] = useState('');
  const name = portal === 'kys' ? entity.name : entity.businessName;
  const errors = portal === 'kyc' ? validateCustomer(entity, typeCfg) : [];
  const complete = () => {
    dispatch({ type: portal === 'kys' ? 'SUPPLIER_COMPLETE_REVIEW' : 'COMPLETE_REVIEW', id: entity.id, by: currentUser.name, detail: notes || 'Periodic review completed; details confirmed' });
    notify(`Periodic review recorded for ${name}.`);
    onClose();
  };
  const remind = () => {
    dispatch({ type: portal === 'kys' ? 'SUPPLIER_LOG' : 'LOG', id: entity.id, action: 'Reminder Sent', by: currentUser.name, detail: `Periodic review reminder sent to ${entity.mobile}${entity.email ? ` and ${entity.email}` : ''}` });
    notify(`Reminder sent to ${name} (simulated).`, 'info');
    onClose();
  };
  return (
    <Modal title={`Periodic review · ${name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn" onClick={remind}>Request update from {portal === 'kys' ? 'supplier' : 'customer'}</button><button className="btn btn-primary" onClick={complete}>Mark reviewed</button></>}>
      <p>Last reviewed {entity.lastReviewed || 'never'}; next due {entity.reviewDue || 'not scheduled'}. Completing the review schedules the next one {typeCfg?.reviewMonths} months from today.</p>
      {errors.length > 0 && <Alert kind="warn" title="Outstanding issues found on this record"><ul>{errors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      <Field label="Review notes"><textarea autoFocus value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}

// ------------------------------------------------------- KYS commercial terms
export function TermsRequestModal({ supplier: s, onClose }) {
  const { dispatch, currentUser, notify } = useStore();
  const [f, setF] = useState({ ...s.terms });
  const ins = supplierInsights(s);
  const submit = () => {
    if (!f.annualCap) { notify('Enter the proposed annual cap.', 'error'); return; }
    const fresh = { ...f, status: TERMS_STATUS.REQUESTED, approvedPaymentTerms: '', approvedCap: '', rating: '', decisionBy: '', decisionAt: '', decisionNote: '' };
    dispatch({ type: 'TERMS_DECISION', id: s.id, by: currentUser.name, terms: fresh, detail: `Requested ${fresh.requestedPaymentTerms}, cap ${fmtMoney(fresh.annualCap)}` });
    notify(`Commercial terms requested for ${s.name}.`);
    onClose();
  };
  return (
    <Modal title={`Request commercial terms · ${s.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Submit request</button></>}>
      {ins.y1 > 0 && <p className="small muted">Supplier turnover {fmtMoney(ins.y1)}{ins.utilisation != null ? ` · ${ins.utilisation}% of capacity committed to us` : ''}.</p>}
      <div className="form-grid">
        <Field label="Requested payment terms"><select autoFocus value={f.requestedPaymentTerms} onChange={(e) => setF({ ...f, requestedPaymentTerms: e.target.value, creditDaysOffered: termsToDays(e.target.value) || f.creditDaysOffered })}>{SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Credit days offered by supplier"><input type="number" min="0" value={f.creditDaysOffered} onChange={(e) => setF({ ...f, creditDaysOffered: e.target.value })} /></Field>
        <Field label="Proposed annual cap (BDT)" required><input type="number" min="0" value={f.annualCap} onChange={(e) => setF({ ...f, annualCap: e.target.value })} /></Field>
        <Field label="Security deposit / bank guarantee (BDT)"><input type="number" min="0" value={f.securityDeposit} onChange={(e) => setF({ ...f, securityDeposit: e.target.value })} /></Field>
        <Field label="Justification" className="span-2"><textarea value={f.justification} onChange={(e) => setF({ ...f, justification: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

export function TermsDecisionModal({ supplier: s, onClose }) {
  const { dispatch, currentUser, notify } = useStore();
  const [f, setF] = useState({ ...s.terms, approvedPaymentTerms: s.terms.approvedPaymentTerms || s.terms.requestedPaymentTerms, approvedCap: s.terms.approvedCap || s.terms.annualCap, rating: s.terms.rating || 'Approved' });
  const ins = supplierInsights(s);
  const refs = referenceSummary(s.references || []);
  const decide = (status) => {
    const approved = status === TERMS_STATUS.APPROVED;
    if (approved && !f.approvedCap) { notify('Enter the approved annual cap.', 'error'); return; }
    const decision = { ...f, status, decisionBy: currentUser.name, decisionAt: nowIso(), approvedCap: approved ? f.approvedCap : '', approvedPaymentTerms: approved ? f.approvedPaymentTerms : '', rating: approved ? f.rating : '' };
    dispatch({ type: 'TERMS_DECISION', id: s.id, by: currentUser.name, terms: decision, detail: approved ? `Approved ${decision.approvedPaymentTerms}, cap ${fmtMoney(decision.approvedCap)}. ${f.decisionNote || ''}` : f.decisionNote || 'Declined' });
    notify(`Terms ${status.toLowerCase()} for ${s.name}.`);
    onClose();
  };
  return (
    <Modal title={`Commercial terms decision · ${s.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={() => decide(TERMS_STATUS.DECLINED)}>Decline</button><button className="btn btn-success" onClick={() => decide(TERMS_STATUS.APPROVED)}>Approve</button></>}>
      <div className="chip-list">
        <span className="chip">Risk: {s.risk.category || 'not assessed'}</span>
        {ins.capVsTurnover != null && <span className="chip">Cap = {ins.capVsTurnover}% of supplier turnover</span>}
        {ins.auditScore != null && <span className="chip">Audit score {ins.auditScore}</span>}
        <span className="chip">References {refs.positive}/{refs.total} positive</span>
        {ins.leverage != null && <span className="chip">Leverage {ins.leverage}%</span>}
      </div>
      {ins.flags.filter((x) => x.tone === 'danger' || x.tone === 'warn').length > 0 && (
        <Alert kind="warn"><ul>{ins.flags.filter((x) => x.tone === 'danger' || x.tone === 'warn').map((x) => <li key={x.text}>{x.text}</li>)}</ul></Alert>
      )}
      <div className="form-grid">
        <Field label="Requested"><input disabled value={`${s.terms.requestedPaymentTerms} · cap ${fmtMoney(s.terms.annualCap)}`} /></Field>
        <Field label="Approved payment terms"><select value={f.approvedPaymentTerms} onChange={(e) => setF({ ...f, approvedPaymentTerms: e.target.value })}>{SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Approved annual cap (BDT)" required><input type="number" min="0" value={f.approvedCap} onChange={(e) => setF({ ...f, approvedCap: e.target.value })} /></Field>
        <Field label="Supplier rating"><select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}>{['Preferred', 'Approved', 'Conditional', 'Trial'].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Decision note" className="span-2"><textarea value={f.decisionNote} onChange={(e) => setF({ ...f, decisionNote: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

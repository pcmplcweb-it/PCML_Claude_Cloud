// Employee-record modals for the HR portal: probation decision, salary
// revision and disciplinary records. Each follows quickActions.jsx — its own
// useStore, a local form `f`, validation through notify(..., 'error'), one
// dispatch, a toast and onClose.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APPRAISAL_STATUS, DISCIPLINARY_TYPES, EMPLOYEE_STATUS, MISCONDUCT_CLAUSES, canHr } from '../hr/config';
import { addMonths, attendanceSummary, emptyDisciplinary, fmtDate, fmtMoney2, fmtPct, grossSalary, hrToday, num, periodMonths, probationEndDate, probationOutcome } from '../hr/helpers';
import { useStore } from '../store/StoreContext';
import { Alert, Field, Modal } from './ui';

const SALARY_COMPONENTS = [
  ['basic', 'Basic'], ['houseRent', 'House rent'], ['medical', 'Medical'], ['conveyance', 'Conveyance'],
  ['dearness', 'Dearness allowance'], ['adhoc', 'Ad-hoc allowance'], ['otherAllowances', 'Other allowances'],
];
const DISCIPLINARY_OUTCOMES = ['', 'Pending reply', 'Upheld', 'Exonerated', 'Withdrawn'];
const DONE = [APPRAISAL_STATUS.PUBLISHED, APPRAISAL_STATUS.ACKNOWLEDGED, APPRAISAL_STATUS.CLOSED];

// ------------------------------------------------------------ probation decision
export function ProbationDecisionModal({ employee: e, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const by = currentUser.name;
  const end = probationEndDate(e);
  const [f, setF] = useState({ confirmationDate: end || asOf, extendedTo: addMonths(end || asOf, num(settings.probation?.extensionMonths) || 3), reason: '' });

  // The probation review to score against: a published one wins, otherwise the latest still open.
  const reviews = state.appraisals.filter((a) => a.employeeId === e.id && a.type === 'Probation' && a.status !== APPRAISAL_STATUS.CANCELLED);
  const apr = reviews.find((a) => DONE.includes(a.status)) || reviews[0] || null;
  const summary = attendanceSummary(e.id, periodMonths(e.employment.joinDate, asOf), state.attendance);
  const outcome = probationOutcomeSafe(e, apr, summary, settings);

  const allowed = canHr(currentUser.role, 'confirm') && e.status === EMPLOYEE_STATUS.PROBATION;
  const published = apr && DONE.includes(apr.status);

  const confirm = () => {
    if (!allowed) { notify('Your role cannot decide probation.', 'error'); return; }
    if (!f.confirmationDate) { notify('Enter the confirmation date.', 'error'); return; }
    dispatch({
      type: 'EMPLOYEE_TRANSITION', id: e.id, status: EMPLOYEE_STATUS.CONFIRMED, by, label: 'Probation Confirmed', asOf,
      reason: f.reason.trim() || `Confirmed with effect from ${fmtDate(f.confirmationDate)}`,
      patch: { employment: { ...e.employment, confirmationDate: f.confirmationDate } },
    });
    if (published && apr.status !== APPRAISAL_STATUS.CLOSED) {
      dispatch({ type: 'APPRAISAL_TRANSITION', id: apr.id, status: APPRAISAL_STATUS.CLOSED, by, label: 'Appraisal Closed', detail: 'Closed by probation decision: Confirm' });
    }
    notify(`${e.name} confirmed in service.`);
    onClose();
  };
  const extend = () => {
    if (!allowed) { notify('Your role cannot decide probation.', 'error'); return; }
    if (!outcome.canExtend) { notify('Probation can be extended only once (s.4(8)).', 'error'); return; }
    if (!f.extendedTo || f.extendedTo <= (end || asOf)) { notify('The extended end date must be after the current probation end.', 'error'); return; }
    if (!f.reason.trim()) { notify('A reason is required to extend probation.', 'error'); return; }
    dispatch({
      type: 'EMPLOYEE_TRANSITION', id: e.id, status: EMPLOYEE_STATUS.PROBATION, by, label: 'Probation Extended', asOf, reason: f.reason.trim(),
      patch: { employment: { ...e.employment, probation: { ...e.employment.probation, extended: true, extendedTo: f.extendedTo } } },
    });
    notify(`Probation extended to ${fmtDate(f.extendedTo)}.`);
    onClose();
  };
  const notConfirm = () => {
    if (!allowed) { notify('Your role cannot decide probation.', 'error'); return; }
    if (!f.reason.trim()) { notify('A reason is required when probation is not confirmed.', 'error'); return; }
    dispatch({ type: 'HR_LOG', employeeId: e.id, action: 'Probation Not Confirmed', by, detail: f.reason.trim() });
    onClose();
    nav(`/hr/settlements/new?employee=${e.id}&type=Termination&probation=1`);
  };

  const tick = (c) => (c.pending ? <span className="badge badge-gray">pending</span> : c.ok ? <span className="badge badge-green">✓</span> : <span className="badge badge-red">✗</span>);
  const val = (c) => (c.value == null || c.value === '' ? '—' : c.key === 'attendance' ? fmtPct(c.value) : String(c.value));

  return (
    <Modal title={`Probation decision · ${e.name}`} wide onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-danger" disabled={!allowed} onClick={notConfirm}>Not confirm</button>
        <button className="btn btn-warn" disabled={!allowed || !outcome.canExtend} title={outcome.canExtend ? '' : 'already extended once'} onClick={extend}>Extend{outcome.canExtend ? '' : ' (already extended)'}</button>
        <button className="btn btn-success" disabled={!allowed} onClick={confirm}>✓ Confirm</button>
      </>}>
      <p className="small muted">Probation {e.employment.probation.extended ? `extended to ${fmtDate(end)}` : `ends ${fmtDate(end)}`} · joined {fmtDate(e.employment.joinDate)} · review {apr ? `${apr.code} (${apr.status})` : 'not created'}.</p>
      {!published && <Alert kind="warn">No published probation review: the score check stays pending. {apr ? 'Publish the review first for a score-based decision.' : ''}</Alert>}
      <table>
        <thead><tr><th>Check</th><th>Value</th><th>Result</th></tr></thead>
        <tbody>{outcome.checks.map((c) => <tr key={c.key}><td>{c.label}{c.hint && <div className="small muted">{c.hint}</div>}</td><td className="mono">{val(c)}</td><td>{tick(c)}</td></tr>)}</tbody>
      </table>
      <div className="row mt-8"><span className="muted small">Suggested decision:</span> <span className={`badge ${outcome.suggestion === 'Confirm' ? 'badge-green' : outcome.suggestion === 'Extend' ? 'badge-amber' : 'badge-red'}`}>{outcome.suggestion}</span>{summary.months === 0 && <span className="small muted">· no attendance recorded for the probation period</span>}</div>
      <div className="form-grid mt-16">
        <Field label="Confirmation date (Confirm)" hint="Defaults to the probation end date."><input type="date" value={f.confirmationDate} onChange={(ev) => setF({ ...f, confirmationDate: ev.target.value })} /></Field>
        <Field label="Extend probation to (Extend)" hint={`Default: ${settings.probation?.extensionMonths || 3} months after the current end; one extension only.`}><input type="date" value={f.extendedTo} disabled={!outcome.canExtend} onChange={(ev) => setF({ ...f, extendedTo: ev.target.value })} /></Field>
        <Field label="Reason (recorded in the audit trail)" className="span-2" hint="Required for Extend and Not confirm."><textarea value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} /></Field>
      </div>
      {!allowed && <Alert kind="warn">Only the HR Head or an administrator can record the probation decision.</Alert>}
    </Modal>
  );
}

// probationOutcome reads an unrated Integrity competency as 0 (fails); show it as pending instead until the review is rated.
function probationOutcomeSafe(e, apr, summary, settings) {
  const out = probationOutcome(e, apr, summary, settings);
  const integ = (apr?.competencies || []).find((c) => c.code === 'INTEG');
  if (!integ || integ.hrRating || integ.mgrRating) return out;
  const checks = out.checks.map((c) => (c.key === 'integrity' ? { ...c, ok: true, pending: true, value: null } : c));
  return { ...out, checks, suggestion: checks.every((c) => c.ok) ? 'Confirm' : out.suggestion };
}

// --------------------------------------------------------------- salary revision
export function SalaryRevisionModal({ employee: e, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const asOf = hrToday(state.hrSettings);
  const by = currentUser.name;
  const init = {};
  SALARY_COMPONENTS.forEach(([k]) => { init[k] = e.salary[k] ?? ''; });
  const [f, setF] = useState({ ...init, effectiveFrom: asOf, reason: '' });
  const before = grossSalary(e.salary);
  const after = grossSalary(f);
  const changed = SALARY_COMPONENTS.some(([k]) => String(e.salary[k] ?? '') !== String(f[k] ?? ''));

  const submit = () => {
    if (!canHr(currentUser.role, 'editSalary')) { notify('Only the HR Head can revise salary.', 'error'); return; }
    if (num(f.basic) <= 0) { notify('Basic salary must be greater than zero.', 'error'); return; }
    if (!changed) { notify('No salary component has changed.', 'error'); return; }
    if (!f.effectiveFrom) { notify('Enter the effective date.', 'error'); return; }
    if (!f.reason.trim()) { notify('A reason is required for a salary revision.', 'error'); return; }
    const salary = { ...e.salary, effectiveFrom: f.effectiveFrom };
    SALARY_COMPONENTS.forEach(([k]) => { salary[k] = f[k]; });
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...e, salary }, by, action: 'Salary Revised', detail: `${f.reason.trim()} (effective ${fmtDate(f.effectiveFrom)})` }); // amounts stay in salary.history (masked); the audit detail is visible to anyone in scope
    notify(`Salary revised for ${e.name}.`);
    onClose();
  };

  return (
    <Modal title={`Revise salary · ${e.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit}>Record revision</button></>}>
      <div className="form-grid">
        {SALARY_COMPONENTS.map(([k, label]) => (
          <Field key={k} label={`${label} (BDT)`} required={k === 'basic'} hint={String(e.salary[k] ?? '') !== String(f[k] ?? '') ? `was ${fmtMoney2(e.salary[k] || 0)}` : undefined}>
            <input type="number" min="0" value={f[k]} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} />
          </Field>
        ))}
        <Field label="Gross (computed)"><input disabled value={`${fmtMoney2(after)}${changed ? ` (was ${fmtMoney2(before)})` : ''}`} /></Field>
        <Field label="Effective from" required><input type="date" value={f.effectiveFrom} onChange={(ev) => setF({ ...f, effectiveFrom: ev.target.value })} /></Field>
        <Field label="Reason (recorded in the audit trail)" required className="span-2"><textarea autoFocus value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} placeholder="e.g. Annual increment per CYC-2025 grade A" /></Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------- disciplinary record
export function DisciplinaryModal({ employee: e, record, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const asOf = hrToday(state.hrSettings);
  const by = currentUser.name;
  const [f, setF] = useState(() => (record ? { ...record } : { ...emptyDisciplinary(by), date: asOf }));
  const docs = (e.documents || []).filter((d) => d.current !== false);
  const enquiry = f.type === 'Dismissal Enquiry';

  const submit = () => {
    if (!canHr(currentUser.role, 'disciplinary')) { notify('Your role cannot record disciplinary actions.', 'error'); return; }
    if (!f.type || !f.date) { notify('Type and date are required.', 'error'); return; }
    if (enquiry && (!f.showCauseDate || !f.enquiryDate)) { notify('A Dismissal Enquiry needs both the show-cause date and the enquiry date (s.24).', 'error'); return; }
    if (f.showCauseDate && f.replyDueDate && f.replyDueDate < f.showCauseDate) { notify('Reply due date cannot be before the show-cause date.', 'error'); return; }
    const disciplinary = record ? e.disciplinary.map((d) => (d.id === record.id ? f : d)) : [...(e.disciplinary || []), f];
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...e, disciplinary }, by, action: 'Disciplinary Recorded', detail: `${f.type} dated ${f.date}${record ? ' (updated)' : ''}${f.outcome ? ` — ${f.outcome}` : ''}` });
    notify(`${f.type} recorded for ${e.name}.`);
    onClose();
  };

  return (
    <Modal title={`${record ? 'Edit' : 'Record'} disciplinary action · ${e.name}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={submit}>{record ? 'Save changes' : 'Record'}</button></>}>
      {enquiry && <Alert kind="info">A dismissal for misconduct (s.23) is valid only after a show-cause notice and an enquiry (s.24); both dates are mandatory and the settlement wizard checks for them.</Alert>}
      <div className="form-grid">
        <Field label="Type" required><select autoFocus value={f.type} onChange={(ev) => setF({ ...f, type: ev.target.value })}>{DISCIPLINARY_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Date" required><input type="date" value={f.date} onChange={(ev) => setF({ ...f, date: ev.target.value })} /></Field>
        <Field label="Reference no."><input value={f.reference} onChange={(ev) => setF({ ...f, reference: ev.target.value })} placeholder="e.g. HR/SC/2026/07" /></Field>
        <Field label="Misconduct clause (s.23(4))"><select value={f.misconductClause} onChange={(ev) => setF({ ...f, misconductClause: ev.target.value })}>{MISCONDUCT_CLAUSES.map((c) => <option key={c} value={c}>{c || '— not applicable —'}</option>)}</select></Field>
        <Field label="Show-cause issued" required={enquiry}><input type="date" value={f.showCauseDate} onChange={(ev) => setF({ ...f, showCauseDate: ev.target.value })} /></Field>
        <Field label="Reply due"><input type="date" value={f.replyDueDate} onChange={(ev) => setF({ ...f, replyDueDate: ev.target.value })} /></Field>
        <Field label="Enquiry date" required={enquiry}><input type="date" value={f.enquiryDate} onChange={(ev) => setF({ ...f, enquiryDate: ev.target.value })} /></Field>
        <Field label="Outcome" hint="Withdrawn records do not count against the employee."><select value={f.outcome} onChange={(ev) => setF({ ...f, outcome: ev.target.value })}>{DISCIPLINARY_OUTCOMES.map((o) => <option key={o} value={o}>{o || '— open —'}</option>)}</select></Field>
        <Field label="Supporting document" className="span-2"><select value={f.documentId} onChange={(ev) => setF({ ...f, documentId: ev.target.value })}><option value="">— none —</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.type} · {d.fileName}</option>)}</select></Field>
        <Field label="Note" className="span-2"><textarea value={f.note} onChange={(ev) => setF({ ...f, note: ev.target.value })} /></Field>
      </div>
    </Modal>
  );
}

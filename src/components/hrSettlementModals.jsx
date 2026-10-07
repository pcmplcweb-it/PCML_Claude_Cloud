// Final-settlement modals: clearance sign-off per department, the three
// approval stages (with return to HR) and payment recording. Each owns its
// store access and dispatches on confirm, like the quick-action modals.
import { useState } from 'react';
import { CLEARANCE_STATUS, PAY_MODES, RELATIONS, SETTLEMENT_STATUS } from '../hr/config';
import { canApproveStage, canSignClearance, fmtMoney2, hrToday, nextSettlementStatus, nowIso, requiresManagementApproval, settlementDeadlineOf } from '../hr/helpers';
import { useStore } from '../store/StoreContext';
import { fmtDate } from '../utils/helpers';
import { Alert, Field, Modal } from './ui';

const STAGE = { hr: { key: 'HR', label: 'HR Approved' }, finance: { key: 'Finance', label: 'Finance Approved' }, management: { key: 'Management', label: 'Management Approved' } };
const n = (v) => (v === '' || v == null ? 0 : Number(v));

// ------------------------------------------------------------- clearance
export function ClearanceSignOffModal({ settlement: sep, row, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const [f, setF] = useState({ status: row.status === CLEARANCE_STATUS.PENDING ? CLEARANCE_STATUS.CLEARED : row.status, remarks: row.remarks || '', recoverable: row.recoverable || '' });
  const emp = state.employees.find((e) => e.id === sep.employeeId);
  const allowed = canSignClearance(row, sep, emp, currentUser);
  const by = currentUser.name;

  const sign = () => {
    if (!allowed) { notify('Your role cannot sign this clearance row.', 'error'); return; }
    if (f.status === CLEARANCE_STATUS.DUES && !f.remarks.trim() && n(f.recoverable) <= 0) { notify('Describe the dues found or enter the recoverable amount.', 'error'); return; }
    if (n(f.recoverable) < 0) { notify('Recoverable amount cannot be negative.', 'error'); return; }
    const clearance = sep.clearance.map((r) => (r.dept === row.dept ? { ...r, status: f.status, remarks: f.remarks.trim(), recoverable: f.status === CLEARANCE_STATUS.DUES ? String(n(f.recoverable)) : '', signedBy: by, signedAt: nowIso() } : r));
    dispatch({ type: 'UPSERT_SETTLEMENT', settlement: { ...sep, clearance, inputsChangedAt: nowIso() }, by, action: 'Clearance Signed', detail: `${row.label}: ${f.status}` });
    notify(`${row.label} clearance signed: ${f.status}.`);
    onClose();
  };

  return (
    <Modal title={`Clearance sign-off · ${row.label} · ${sep.code}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!allowed} onClick={sign}>Sign off</button></>}>
      {!allowed && <Alert kind="warn">{row.dept === 'LINE' ? 'Only the employee\'s reporting manager (or HR Head / Admin) can sign the line-manager clearance.' : 'Your role cannot sign this clearance row.'}</Alert>}
      <p className="small muted">Confirm each item has been returned or reconciled for {emp?.name || 'the employee'}. Dues found are deducted from the final statement.</p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 18 }} className="small">{row.items.map((it) => <li key={it}>{it}</li>)}</ul>
      <div className="form-grid">
        <Field label="Outcome" required>
          <select autoFocus value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {[CLEARANCE_STATUS.CLEARED, CLEARANCE_STATUS.DUES].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Recoverable amount (BDT)" hint={f.status === CLEARANCE_STATUS.DUES ? 'Reported as a flag on the statement; enter the deduction under Inputs.' : 'Only for dues found'}>
          <input type="number" min="0" disabled={f.status !== CLEARANCE_STATUS.DUES} value={f.recoverable} onChange={(e) => setF({ ...f, recoverable: e.target.value })} />
        </Field>
        <Field label="Remarks" className="span-2" required={f.status === CLEARANCE_STATUS.DUES}><textarea value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="e.g. Laptop returned; SIM retained until month end" /></Field>
      </div>
      {row.signedBy && <p className="small muted mt-8">Previously signed by {row.signedBy} on {fmtDate(row.signedAt)} ({row.status}).</p>}
    </Modal>
  );
}

// -------------------------------------------------------------- approvals
export function ApprovalModal({ settlement: sep, stage, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const [comment, setComment] = useState('');
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const emp = state.employees.find((e) => e.id === sep.employeeId);
  const st = STAGE[stage] || STAGE.hr;
  const gate = canApproveStage(sep, st.key, currentUser);
  const totals = sep.statement?.totals || {};
  const next = nextSettlementStatus(sep, emp, settings);
  const by = currentUser.name;
  const mgmt = requiresManagementApproval(sep, emp, totals, settings);

  const approve = () => {
    if (!gate.ok) { notify(gate.reason, 'error'); return; }
    if (!sep.statement) { notify('The statement has not been finalised.', 'error'); return; }
    dispatch({ type: 'SETTLEMENT_TRANSITION', id: sep.id, status: next, by, label: st.label, approval: { stage: st.key, decision: 'Approved', comment: comment.trim() }, detail: comment.trim() || `${st.key} approval recorded`, asOf });
    notify(`${st.label}: ${sep.code} is now ${next}.`);
    onClose();
  };
  const returnToHr = () => {
    if (!gate.ok) { notify(gate.reason, 'error'); return; }
    if (!comment.trim()) { notify('A comment is required to return the settlement to HR.', 'error'); return; }
    dispatch({ type: 'SETTLEMENT_TRANSITION', id: sep.id, status: SETTLEMENT_STATUS.RETURNED, by, label: 'Returned to HR', reason: comment.trim(), approval: { stage: st.key, decision: 'Returned', comment: comment.trim() }, asOf });
    notify(`${sep.code} returned to HR.`, 'info');
    onClose();
  };

  return (
    <Modal title={`${st.key} approval · ${sep.code} · ${emp?.name || ''}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-warn" disabled={!gate.ok} onClick={returnToHr}>Return to HR</button><button className="btn btn-success" disabled={!gate.ok} onClick={approve}>Approve ({st.key})</button></>}>
      {!gate.ok && <Alert kind="warn">{gate.reason}</Alert>}
      {!sep.statement && <Alert kind="danger">No frozen statement: HR must finalise the dues before approval.</Alert>}
      <div className="chip-list">
        <span className="chip">Type: {sep.type}</span>
        <span className="chip">LWD {fmtDate(sep.lastWorkingDay)}</span>
        <span className="chip">Deadline {fmtDate(settlementDeadlineOf(sep, settings))}</span>
        <span className="chip">Prepared by {sep.statement?.computedBy || '—'}</span>
      </div>
      <dl className="kv mt-8">
        <dt>Earnings</dt><dd className="mono">{fmtMoney2(totals.earnings)}</dd>
        <dt>Deductions</dt><dd className="mono">{fmtMoney2(totals.deductions)}</dd>
        <dt>Net payable</dt><dd className="mono strong">{fmtMoney2(totals.netPayable)}</dd>
        <dt>PF net</dt><dd className="mono">{fmtMoney2(totals.pfNet)}</dd>
        <dt>Total to {sep.statement?.meta?.payee === 'Nominee' ? 'nominee' : 'employee'}</dt><dd className="mono strong">{fmtMoney2(totals.totalToEmployee)}</dd>
        <dt>On approval</dt><dd>{next}{stage === 'finance' && mgmt ? ' (management approval required: type, grade or amount threshold)' : ''}</dd>
      </dl>
      {(sep.statement?.flags || []).filter((x) => x.tone !== 'info').length > 0 && (
        <Alert kind="warn"><ul>{sep.statement.flags.filter((x) => x.tone !== 'info').map((x) => <li key={x.text}>{x.text}</li>)}</ul></Alert>
      )}
      <Field label="Comment" hint="Required when returning to HR; recorded in the approvals history."><textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
    </Modal>
  );
}

// ---------------------------------------------------------------- payment
export function PaymentModal({ settlement: sep, employee: emp, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const net = sep.statement?.totals?.netPayable ?? '';
  const death = sep.type === 'Death';
  const [f, setF] = useState(() => ({
    ...sep.payment,
    paidAt: sep.payment.paidAt || asOf,
    amount: sep.payment.amount || (net === '' ? '' : String(net)),
    bankAccountNo: sep.payment.bankAccountNo || emp?.bank?.accountNo || '',
    payee: death ? 'Nominee' : sep.payment.payee || 'Employee',
    payeeName: sep.payment.payeeName || (death ? sep.nominee?.name || emp?.nominee?.name || '' : ''),
    payeeRelation: sep.payment.payeeRelation || (death ? sep.nominee?.relation || emp?.nominee?.relation || '' : ''),
    payeeNid: sep.payment.payeeNid || (death ? sep.nominee?.nid || emp?.nominee?.nid || '' : ''),
  }));
  const gate = canApproveStage(sep, 'Pay', currentUser);
  const deadline = settlementDeadlineOf(sep, settings);
  const by = currentUser.name;
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));

  const pay = () => {
    if (!gate.ok) { notify(gate.reason, 'error'); return; }
    if (!f.paidAt) { notify('Enter the payment date.', 'error'); return; }
    if (f.paidAt > asOf) { notify('Payment date cannot be in the future.', 'error'); return; }
    if (!f.reference.trim()) { notify('Enter the payment reference (transfer / cheque number).', 'error'); return; }
    if (n(f.amount) <= 0) { notify('Enter the amount paid.', 'error'); return; }
    if (f.payee === 'Nominee' && !f.payeeName.trim()) { notify('Enter the nominee name.', 'error'); return; }
    if (f.mode === 'Bank Transfer' && !f.bankAccountNo.trim()) { notify('Enter the bank account credited.', 'error'); return; }
    const payment = { ...f, reference: f.reference.trim(), amount: String(n(f.amount)), paidBy: by };
    dispatch({ type: 'SETTLEMENT_TRANSITION', id: sep.id, status: SETTLEMENT_STATUS.PAID, by, label: 'Settlement Paid', patch: { payment }, detail: `${fmtMoney2(payment.amount)} by ${f.mode} ref ${payment.reference}`, asOf });
    notify(`${sep.code} marked paid.`);
    onClose();
  };

  return (
    <Modal title={`Record payment · ${sep.code} · ${emp?.name || ''}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-success" disabled={!gate.ok} onClick={pay}>Record payment</button></>}>
      {!gate.ok && <Alert kind="warn">{gate.reason}</Alert>}
      {deadline && f.paidAt > deadline && <Alert kind="warn">Payment date is after the statutory deadline {fmtDate(deadline)} (30 working days, s.123).</Alert>}
      {n(f.amount) > 0 && net !== '' && Math.abs(n(f.amount) - n(net)) >= 0.01 && <Alert kind="info">Amount differs from the net payable {fmtMoney2(net)} on the approved statement.</Alert>}
      <div className="form-grid">
        <Field label="Paid on" required><input type="date" autoFocus max={asOf} value={f.paidAt} onChange={(e) => set({ paidAt: e.target.value })} /></Field>
        <Field label="Mode"><select value={f.mode} onChange={(e) => set({ mode: e.target.value })}>{PAY_MODES.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Reference" required hint="Transfer, cheque or voucher number"><input value={f.reference} onChange={(e) => set({ reference: e.target.value })} placeholder={`${sep.code}/BANK/0000`} /></Field>
        <Field label="Amount (BDT)" required hint={net === '' ? 'Statement not finalised' : `Net payable ${fmtMoney2(net)}`}><input type="number" min="0" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></Field>
        <Field label="Bank account credited" required={f.mode === 'Bank Transfer'}><input value={f.bankAccountNo} onChange={(e) => set({ bankAccountNo: e.target.value })} /></Field>
        <Field label="Payee"><select value={f.payee} disabled={death} onChange={(e) => set({ payee: e.target.value })}>{['Employee', 'Nominee'].map((p) => <option key={p}>{p}</option>)}</select></Field>
        {f.payee === 'Nominee' && (
          <>
            <Field label="Nominee name" required><input value={f.payeeName} onChange={(e) => set({ payeeName: e.target.value })} /></Field>
            <Field label="Relation"><select value={f.payeeRelation} onChange={(e) => set({ payeeRelation: e.target.value })}><option value="">—</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Nominee NID" className="span-2"><input value={f.payeeNid} onChange={(e) => set({ payeeNid: e.target.value })} /></Field>
          </>
        )}
        <Field label="PF paid on" hint="If the fund paid separately"><input type="date" max={asOf} value={f.pfPaidAt} onChange={(e) => set({ pfPaidAt: e.target.value })} /></Field>
        <Field label="PF payment reference"><input value={f.pfReference} onChange={(e) => set({ pfReference: e.target.value })} /></Field>
      </div>
      <p className="small muted mt-8">Recording the payment closes the settlement and marks the employee as Separated if not already.</p>
    </Modal>
  );
}

// Leave & attendance quick actions shared by the leave queue, the employee
// record and the HR dashboard: request leave, decide a request, adjust an
// employee's leave entitlement and enter one month of attendance.
import { useMemo, useState } from 'react';
import { ACTIVE_EMPLOYEE_STATUSES, HR_ROLES, LEAVE_STATUS, canHr } from '../hr/config';
import {
  allLeaveBalances, approvedLeaveDaysInMonth, countLeaveDays, emptyAttendance, emptyLeaveRequest, hrToday, lastMonths,
  leaveApproverFor, leaveBalance, leaveEntitlement, lwpDaysInMonth, monthKey, monthLabel, num, physicalAttendancePct, validateAttendance, validateLeaveRequest,
} from '../hr/helpers';
import { useStore } from '../store/StoreContext';
import { fmtDate, fmtDateTime } from '../utils/helpers';
import { Alert, Field, Modal } from './ui';

const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;

// Approver of a request: the stored approver, else the reporting manager; '' means the HR Head decides.
const approverOf = (r, emp) => r.approverId || emp?.employment?.reportingManagerId || '';
const balanceHint = (b, typeCfg) => {
  if (!b || b.unlimited) return 'unlimited';
  return `${b.balance} available · ${b.taken} taken · ${b.pending} pending${typeCfg?.maxConsecutive ? ` · max ${typeCfg.maxConsecutive} consecutive` : ''}`;
};

// ------------------------------------------------------------- leave request
export function LeaveRequestModal({ employee, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  // G.2: leaveRequest ∧ (self ∨ leaveAdminister) — HR (leaveAdminister) can file for anyone; everyone else only for themselves.
  const candidates = useMemo(() => state.employees
    .filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status))
    .filter((e) => canHr(role, 'leaveAdminister') || e.id === currentUser.employeeId)
    .sort((a, b) => a.name.localeCompare(b.name)), [state.employees, role, currentUser.employeeId]);
  const defaultId = employee?.id || (candidates.some((e) => e.id === currentUser.employeeId) ? currentUser.employeeId : candidates[0]?.id || '');
  const [f, setF] = useState(() => emptyLeaveRequest(defaultId, by));
  const [errors, setErrors] = useState([]);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));

  const emp = state.employees.find((e) => e.id === f.employeeId);
  const typeCfg = state.leaveTypes.find((t) => t.code === f.typeCode);
  const year = f.from ? Number(f.from.slice(0, 4)) : Number(settings.leave.year);
  const days = useMemo(() => countLeaveDays(f.from, f.to, f.halfDay, settings.calendar, typeCfg), [f.from, f.to, f.halfDay, settings.calendar, typeCfg]);
  const balance = useMemo(() => (emp && typeCfg ? leaveBalance(emp, typeCfg, year, state.leaveRequests, settings, asOf, state.attendance) : null),
    [emp, typeCfg, year, state.leaveRequests, settings, asOf, state.attendance]);
  const approver = emp ? state.employees.find((e) => e.id === leaveApproverFor(emp)) : null;

  const submit = () => {
    const req = { ...f, days, halfDay: f.halfDay && f.from === f.to, approverId: emp ? leaveApproverFor(emp) : '' };
    const errs = validateLeaveRequest(req, emp, typeCfg, balance, state.leaveRequests, settings.calendar);
    if (errs.length) { setErrors(errs); notify(errs[0], 'error'); return; }
    dispatch({ type: 'UPSERT_LEAVE_REQUEST', request: req, by });
    notify(`Leave request submitted for ${emp.name} (${days} day${days === 1 ? '' : 's'} ${typeCfg.code}).`);
    onClose();
  };

  return (
    <Modal title={`Request leave${emp ? ` · ${emp.name}` : ''}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={!emp}>Submit request</button></>}>
      {candidates.length === 0 && <Alert kind="warn">No active employee in your scope can request leave.</Alert>}
      {errors.length > 0 && <Alert kind="danger" title="Please fix the following"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      <div className="form-grid">
        <Field label="Employee" required>
          <select autoFocus value={f.employeeId} onChange={(e) => set({ employeeId: e.target.value })} disabled={!!employee}>
            {candidates.map((e) => <option key={e.id} value={e.id}>{e.name}{e.code ? ` (${e.code})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Leave type" required hint={balanceHint(balance, typeCfg)}>
          <select value={f.typeCode} onChange={(e) => set({ typeCode: e.target.value })}>
            {state.leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}{t.genderOnly ? ` (${t.genderOnly.toLowerCase()} only)` : ''}</option>)}
          </select>
        </Field>
        <Field label="From" required><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value, to: f.to && f.to < e.target.value ? e.target.value : f.to })} /></Field>
        <Field label="To" required><input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></Field>
        <Field label="Half day" hint="Single-day requests only"><label className="row small"><input type="checkbox" checked={f.halfDay} disabled={!f.from || f.from !== f.to} onChange={(e) => set({ halfDay: e.target.checked })} /> Count as half a day</label></Field>
        <Field label="Days" hint={typeCfg?.countCalendarDays ? 'calendar days' : 'working days (weekly offs and holidays skipped)'}><input disabled value={days} /></Field>
        <Field label="Reason" required className="span-2"><textarea value={f.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
        <Field label="Handover to">
          <select value={f.handoverTo} onChange={(e) => set({ handoverTo: e.target.value })}>
            <option value="">— none —</option>
            {state.employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && e.id !== f.employeeId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Approver"><input disabled value={approver ? approver.name : 'HR Head'} /></Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------ leave decision
export function LeaveDecisionModal({ request: r, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const [comment, setComment] = useState('');
  const emp = state.employees.find((e) => e.id === r.employeeId);
  const typeCfg = state.leaveTypes.find((t) => t.code === r.typeCode);
  const year = Number((r.from || '').slice(0, 4)) || Number(settings.leave.year);
  const balance = useMemo(() => (emp && typeCfg ? leaveBalance(emp, typeCfg, year, state.leaveRequests, settings, asOf, state.attendance) : null),
    [emp, typeCfg, year, state.leaveRequests, settings, asOf, state.attendance]);
  const approver = state.employees.find((e) => e.id === approverOf(r, emp));
  const pending = r.status === LEAVE_STATUS.PENDING;
  // The named approver decides; HR Head, MD and Admin may decide any request. Nobody decides their own.
  const own = !!currentUser.employeeId && currentUser.employeeId === r.employeeId;
  const allowed = canHr(role, 'leaveApprove') && !own && (approverOf(r, emp) === currentUser.employeeId || [HR_ROLES.HR_HEAD, HR_ROLES.MANAGEMENT, HR_ROLES.ADMIN].includes(role));
  const hint = !pending ? `request is ${r.status}` : own ? 'you cannot decide your own request' : !allowed ? `approver is ${approver?.name || 'HR Head'}` : '';
  const short = balance && !balance.unlimited && balance.balance != null && num(r.days) > balance.balance;

  const decide = (status) => {
    if (!pending || !allowed) { notify(hint, 'error'); return; }
    if (status === LEAVE_STATUS.REJECTED && !comment.trim()) { notify('A comment is required to reject.', 'error'); return; }
    if (status === LEAVE_STATUS.APPROVED && short) { notify(`Request of ${r.days} days exceeds the available ${typeCfg.code} balance of ${balance.balance}.`, 'error'); return; }
    dispatch({ type: 'LEAVE_DECISION', id: r.id, status, by, comment: comment.trim() });
    notify(`Leave ${status.toLowerCase()} for ${emp?.name || 'employee'} (${r.code}).`);
    onClose();
  };

  return (
    <Modal title={`Leave decision · ${r.code}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-danger" disabled={!pending || !allowed} title={hint} onClick={() => decide(LEAVE_STATUS.REJECTED)}>Reject</button>
      <button className="btn btn-success" disabled={!pending || !allowed} title={hint} onClick={() => decide(LEAVE_STATUS.APPROVED)}>Approve</button>
    </>}>
      {hint && <Alert kind="warn">{hint.charAt(0).toUpperCase() + hint.slice(1)}.</Alert>}
      {short && <Alert kind="danger">Approving would exceed the balance: {r.days} days requested, {balance.balance} available.</Alert>}
      {kv([
        ['Employee', emp ? `${emp.name}${emp.code ? ` · ${emp.code}` : ''}` : r.employeeId],
        ['Leave type', typeCfg ? `${typeCfg.code} · ${typeCfg.name}` : r.typeCode],
        ['Period', `${fmtDate(r.from)} → ${fmtDate(r.to)}${r.halfDay ? ' (half day)' : ''}`],
        ['Days', String(r.days)],
        ['Balance', balanceHint(balance, typeCfg)],
        ['Reason', r.reason],
        ['Handover to', r.handoverTo ? state.employees.find((e) => e.id === r.handoverTo)?.name : ''],
        ['Requested', `${r.requestedBy || '—'} · ${fmtDateTime(r.requestedAt)}`],
        ['Approver', approver ? approver.name : 'HR Head'],
      ])}
      <Field label={`Comment${pending ? ' (required to reject)' : ''}`} className="span-2"><textarea autoFocus value={comment} onChange={(e) => setComment(e.target.value)} disabled={!pending || !allowed} /></Field>
    </Modal>
  );
}

// ---------------------------------------------------------- leave entitlement
export function EntitlementModal({ employee: e, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const year = Number(settings.leave.year);
  const [f, setF] = useState(() => ({ opening: { ...(e.leave?.opening || {}) }, entitlementOverride: { ...(e.leave?.entitlementOverride || {}) }, refusedBeyondCap: { ...(e.leave?.refusedBeyondCap || {}) } }));
  const setCell = (bucket, code, v) => setF((p) => ({ ...p, [bucket]: { ...p[bucket], [code]: v } }));
  const editable = canHr(role, 'leaveAdminister');
  const types = state.leaveTypes.filter((t) => !t.unlimited && (!t.genderOnly || t.genderOnly === e.gender));
  // Live balances with the draft applied, so the effect of a change is visible before saving.
  const preview = useMemo(() => allLeaveBalances({ ...e, leave: f }, types, year, state.leaveRequests, settings, asOf, state.attendance), [e, f, types, year, state.leaveRequests, settings, asOf, state.attendance]);
  const defaultOf = (t) => leaveEntitlement({ ...e, leave: { ...f, entitlementOverride: {} } }, t, year, settings, state.attendance);

  const save = () => {
    if (!editable) { notify('Only HR can adjust entitlements.', 'error'); return; }
    const changes = [];
    const cur = e.leave || {};
    const diff = (label, bucket) => types.forEach((t) => {
      const before = String(cur[bucket]?.[t.code] ?? '');
      const after = String(f[bucket][t.code] ?? '');
      if (before !== after) changes.push(`${t.code} ${label} ${before || '—'} → ${after || '—'}`);
    });
    diff('opening', 'opening'); diff('override', 'entitlementOverride'); diff('refused credit', 'refusedBeyondCap');
    if (changes.length === 0) { notify('Nothing changed.', 'info'); onClose(); return; }
    if (Object.values(f).some((bucket) => Object.values(bucket).some((v) => v !== '' && (Number.isNaN(Number(v)) || Number(v) < 0)))) { notify('Entitlement values must be non-negative numbers.', 'error'); return; }
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...e, leave: { ...cur, ...f } }, by, action: 'Leave Entitlement Adjusted', detail: changes.join('; ') });
    notify(`Leave entitlement adjusted for ${e.name}.`);
    onClose();
  };

  return (
    <Modal title={`Leave entitlement · ${e.name}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button>{editable && <button className="btn btn-primary" onClick={save}>Save changes</button>}</>}>
      <p className="small muted">Leave year {year}. Opening balance is carried from the previous year; an override replaces the computed annual entitlement; refused-leave credit raises the EL cap (s.117). Blank = default.</p>
      {!editable && <Alert kind="info">Read-only — entitlement adjustments require HR Officer or HR Head.</Alert>}
      <div className="table-wrap"><table>
        <thead><tr><th>Type</th><th className="right">Default entitlement</th><th className="right">Opening</th><th className="right">Override</th><th className="right">Refused credit</th><th className="right">Taken</th><th className="right">Pending</th><th className="right">Balance</th></tr></thead>
        <tbody>{types.map((t) => {
          const b = preview.find((x) => x.type.code === t.code);
          return (
            <tr key={t.code}>
              <td><div className="strong">{t.code}</div><div className="small muted">{t.name}{t.carryForward ? ` · carry ≤ ${t.carryCap}` : ' · no carry'}</div></td>
              <td className="right mono">{defaultOf(t) ?? '—'}</td>
              <td className="right"><input type="number" min="0" step="0.5" style={{ width: 80, textAlign: 'right' }} disabled={!editable} value={f.opening[t.code] ?? ''} onChange={(ev) => setCell('opening', t.code, ev.target.value)} /></td>
              <td className="right"><input type="number" min="0" step="0.5" style={{ width: 80, textAlign: 'right' }} disabled={!editable} placeholder="default" value={f.entitlementOverride[t.code] ?? ''} onChange={(ev) => setCell('entitlementOverride', t.code, ev.target.value)} /></td>
              <td className="right">{t.code === 'EL' ? <input type="number" min="0" step="1" style={{ width: 80, textAlign: 'right' }} disabled={!editable} value={f.refusedBeyondCap[t.code] ?? ''} onChange={(ev) => setCell('refusedBeyondCap', t.code, ev.target.value)} /> : <span className="muted">—</span>}</td>
              <td className="right mono">{b?.taken ?? 0}</td>
              <td className="right mono">{b?.pending ?? 0}</td>
              <td className="right mono strong">{b?.balance ?? '—'}{b?.cap != null ? <span className="small muted"> / cap {b.cap}</span> : null}</td>
            </tr>
          );
        })}</tbody>
      </table></div>
    </Modal>
  );
}

// ----------------------------------------------------------- attendance entry
const COUNT_FIELDS = [
  ['workingDays', 'Working days'], ['present', 'Present'], ['absent', 'Absent'], ['unapproved', 'Unapproved absence'], ['unapprovedRun', 'Longest unapproved run'],
  ['late', 'Late arrivals'], ['earlyOut', 'Early outs'], ['leave', 'Approved leave'], ['lwp', 'Leave without pay'],
];

export function AttendanceEntryModal({ employee: e, month, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const editable = canHr(role, 'attendanceEntry');
  // Existing month, or a fresh row with leave / LWP prefilled from approved requests and the rest marked present.
  const buildRow = (ym) => {
    const existing = state.attendance.find((a) => a.employeeId === e.id && a.month === ym);
    if (existing) return { ...existing };
    const rec = emptyAttendance(e.id, ym, settings.calendar);
    const leave = approvedLeaveDaysInMonth(e.id, ym, state.leaveRequests, settings.calendar, state.leaveTypes);
    const lwp = lwpDaysInMonth(e.id, ym, state.leaveRequests, settings.calendar, state.leaveTypes);
    return { ...rec, leave, lwp, present: Math.max(0, rec.workingDays - leave - lwp) };
  };
  const [ym, setYm] = useState(month || lastMonths(1, asOf)[0]);
  const [rec, setRec] = useState(() => buildRow(ym));
  const [reason, setReason] = useState('');
  const existing = state.attendance.some((a) => a.employeeId === e.id && a.month === ym);
  const errors = validateAttendance(rec);
  const pct = physicalAttendancePct(rec);
  const set = (patch) => setRec((p) => ({ ...p, ...patch }));
  const changeMonth = (v) => { if (!v) return; setYm(v); setRec(buildRow(v)); setReason(''); };

  const save = () => {
    if (!editable) { notify('Only HR can enter attendance.', 'error'); return; }
    if (errors.length) { notify(errors[0], 'error'); return; }
    if (rec.locked && !reason.trim()) { notify('This month is locked by an appraisal snapshot — a reason is required to change it.', 'error'); return; }
    const out = { ...rec };
    COUNT_FIELDS.forEach(([k]) => { out[k] = num(rec[k]); });
    out.overtimeHrs = String(rec.overtimeHrs ?? '0');
    dispatch({ type: 'UPSERT_ATTENDANCE', records: [out], by, reason: reason.trim() });
    notify(`Attendance for ${monthLabel(ym)} saved for ${e.name}.`);
    onClose();
  };

  return (
    <Modal title={`Attendance · ${e.name} · ${monthLabel(ym)}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button>{editable && <button className="btn btn-primary" onClick={save} disabled={errors.length > 0}>Save month</button>}</>}>
      {!editable && <Alert kind="info">Read-only — attendance entry requires HR Officer or HR Head.</Alert>}
      {rec.locked && <Alert kind="warn">This month is locked (used by an appraisal snapshot). Changes require a reason and are recorded in the audit trail.</Alert>}
      {errors.length > 0 && <Alert kind="danger"><ul>{errors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
      <div className="form-grid cols-3">
        <Field label="Month" required><input type="month" value={ym} max={monthKey(asOf)} disabled={!!month} onChange={(ev) => changeMonth(ev.target.value)} /></Field>
        <Field label="Record"><input disabled value={existing ? `Saved${rec.enteredBy ? ` by ${rec.enteredBy}` : ''} · ${fmtDate(rec.updatedAt)}` : 'New (prefilled from approved leave)'} /></Field>
        <Field label="Physical attendance"><input disabled value={pct == null ? '—' : `${pct}%`} /></Field>
        {COUNT_FIELDS.map(([k, label]) => (
          <Field key={k} label={label} required={k === 'workingDays'}><input type="number" min="0" step={k === 'workingDays' ? 1 : 0.5} disabled={!editable} value={rec[k] ?? ''} onChange={(ev) => set({ [k]: ev.target.value })} /></Field>
        ))}
        <Field label="Overtime hours"><input type="number" min="0" step="0.5" disabled={!editable} value={rec.overtimeHrs ?? ''} onChange={(ev) => set({ overtimeHrs: ev.target.value })} /></Field>
        <Field label="Remarks" className="span-2"><input disabled={!editable} value={rec.remarks || ''} onChange={(ev) => set({ remarks: ev.target.value })} /></Field>
        {rec.locked && editable && <Field label="Reason for changing a locked month" required className="span-3"><textarea value={reason} onChange={(ev) => setReason(ev.target.value)} /></Field>}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Invariant: present + absent + leave + LWP = working days; unapproved ≤ absent; longest run ≤ unapproved. Approved leave counts as attended for the appraisal gate.</p>
    </Modal>
  );
}

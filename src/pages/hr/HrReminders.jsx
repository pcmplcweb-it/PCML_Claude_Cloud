import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ProbationDecisionModal } from '../../components/hrEmployeeModals';
import { Alert, Card, EmptyState, ReasonModal } from '../../components/ui';
import { EMPLOYEE_STATUS, HR_ROLES, canHr } from '../../hr/config';
import { fmtDate, hrReminders, hrScope, hrToday } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const WINDOWS = [30, 60, 90];

// Display order and titles of the reminder kinds produced by hrReminders.
const KINDS = [
  { kind: 'probation', title: 'Probation decisions due', hint: 'Confirm, extend once or not confirm before the probation end date.' },
  { kind: 'deemedPermanent', title: 'Deemed-permanent risk', hint: 'Probation ended without a decision; the employee may be deemed permanent (s.4(8)).' },
  { kind: 'contract', title: 'Contracts expiring', hint: 'Fixed-term contracts ending inside the window (s.26(2)).' },
  { kind: 'document', title: 'Documents expiring', hint: 'Passports, licences, contracts and medical certificates.' },
  { kind: 'appraisalOverdue', title: 'Overdue appraisals', hint: 'Stage owner shown; HR may act on behalf once the due date has passed.' },
  { kind: 'settlementDeadline', title: 'Settlements vs deadline', hint: 'Dues must be paid within the working-day deadline (s.123).' },
  { kind: 'exitDatePassed', title: 'Exit date passed', hint: 'Last working day has passed while the employee is still On Notice.' },
  { kind: 'leavePending', title: 'Leave pending > 3 working days', hint: 'Requests awaiting a decision for more than three working days.' },
  { kind: 'pfEligible', title: 'PF eligibility', hint: 'Employees past the membership eligibility period who are not enrolled.' },
  { kind: 'retirement', title: 'Retirements', hint: 'Employees reaching the retirement age within 12 months (s.28).' },
  { kind: 'absenceNotice', title: 'Unapproved absence ≥ 10 days', hint: 'Issue the s.27(3A) notice; a second notice after 10 further days enables deemed resignation.' },
  { kind: 'pipDue', title: 'PIP checkpoints', hint: 'Performance improvement plans reaching their end date.' },
];

export default function HrReminders() {
  const { state, dispatch, currentUser, notify } = useStore();
  const [sp, setSp] = useSearchParams();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const windowDays = WINDOWS.includes(Number(sp.get('window'))) ? Number(sp.get('window')) : 60;
  const [modal, setModal] = useState(null); // { kind: 'probation' | 'absence', employee }

  const scope = useMemo(() => hrScope(currentUser, state.employees || []), [currentUser, state.employees]);
  const reminders = useMemo(() => hrReminders(state, currentUser, asOf, windowDays), [state, currentUser, asOf, windowDays]);
  const groups = useMemo(() => KINDS.map((k) => ({ ...k, rows: reminders.filter((r) => r.kind === k.kind) })).filter((g) => g.rows.length > 0), [reminders]);
  const empOf = (id) => state.employees.find((e) => e.id === id);
  const canRemind = role !== HR_ROLES.EMPLOYEE;

  const setWindow = (v) => { const n = new URLSearchParams(sp); n.set('window', v); setSp(n); };

  const sendReminder = (r) => {
    const emp = empOf(r.employeeId);
    if (!emp) { notify('No employee record to notify.', 'error'); return; }
    dispatch({ type: 'HR_LOG', employeeId: emp.id, action: 'Reminder Sent', by, detail: `${KINDS.find((k) => k.kind === r.kind)?.title || r.kind}: ${r.text}` });
    notify(`Reminder sent to ${emp.name}.`, 'info');
  };

  const confirmExit = (r) => {
    const emp = empOf(r.employeeId);
    if (!emp) return;
    const sep = state.settlements.find((s) => s.id === emp.separationId);
    if (!window.confirm(`Confirm that ${emp.name} has exited on ${fmtDate(sep?.lastWorkingDay)}? The employee becomes Separated.`)) return;
    dispatch({ type: 'EMPLOYEE_TRANSITION', id: emp.id, status: EMPLOYEE_STATUS.SEPARATED, by, label: 'Exit Completed', asOf, patch: sep?.lastWorkingDay ? { separatedAt: sep.lastWorkingDay } : undefined });
    notify(`${emp.name} marked as separated.`);
  };

  const issueAbsenceNotice = (reason) => {
    const emp = modal.employee;
    const notice = emp.absenceNotice || { firstNoticeOn: '', secondNoticeOn: '' };
    const second = !!notice.firstNoticeOn;
    const absenceNotice = second ? { ...notice, secondNoticeOn: asOf } : { ...notice, firstNoticeOn: asOf };
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...emp, absenceNotice }, by, action: 'Absence Notice Issued', detail: `${second ? 'Second' : 'First'} s.27(3A) notice dated ${fmtDate(asOf)}: ${reason}` });
    notify(`${second ? 'Second' : 'First'} s.27(3A) notice recorded for ${emp.name}.`);
    setModal(null);
  };

  // Per-kind primary action (gated by permission); the link to the record is always available.
  const actionFor = (r) => {
    const emp = empOf(r.employeeId);
    if (!emp) return null;
    if ((r.kind === 'probation' || r.kind === 'deemedPermanent') && canHr(role, 'confirm')) return <button className="btn btn-sm btn-primary" onClick={() => setModal({ kind: 'probation', employee: emp })}>Decide</button>;
    if (r.kind === 'exitDatePassed' && canHr(role, 'markExit')) return <button className="btn btn-sm btn-primary" onClick={() => confirmExit(r)}>Confirm exit</button>;
    if (r.kind === 'absenceNotice' && canHr(role, 'disciplinary')) return <button className="btn btn-sm btn-warn" onClick={() => setModal({ kind: 'absence', employee: emp })}>Record s.27(3A) notice</button>;
    return null;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Reminders &amp; due dates</h1><p className="sub">{reminders.length} item(s) in your scope as of {fmtDate(asOf)}{settings.calendar.asOfDate ? ' (demo clock)' : ''}.</p></div>
        <div className="page-actions">
          <label className="small muted" htmlFor="reminder-window">Window</label>
          <select id="reminder-window" value={windowDays} onChange={(e) => setWindow(e.target.value)}>
            {WINDOWS.map((w) => <option key={w} value={w}>{w} days</option>)}
          </select>
        </div>
      </div>

      {scope.kind !== 'all' && <Alert kind="info">Only reminders for {scope.kind === 'team' ? 'you and your direct reports' : 'your own file'} are listed.</Alert>}

      {groups.length === 0 ? (
        <Card><EmptyState>Nothing is due in the next {windowDays} days.</EmptyState></Card>
      ) : groups.map((g) => (
        <Card key={g.kind} title={`${g.title} (${g.rows.length})`} actions={<span className="small muted">{g.hint}</span>}>
          <div className="stack" style={{ gap: 8 }}>
            {g.rows.map((r, i) => (
              <div key={`${r.employeeId}-${i}`} className={`alert alert-${r.tone}`}>
                <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
                  <span>{r.text}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {actionFor(r)}
                    {canRemind && <button className="btn btn-sm" onClick={() => sendReminder(r)}>Send reminder</button>}
                    <Link className="btn btn-sm btn-ghost" to={r.to}>Open →</Link>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {modal?.kind === 'probation' && <ProbationDecisionModal employee={modal.employee} onClose={() => setModal(null)} />}
      {modal?.kind === 'absence' && (
        <ReasonModal title={`s.27(3A) absence notice · ${modal.employee.name}`} label="Notice reference / note (recorded in the audit trail)" confirmLabel="Record notice" onConfirm={issueAbsenceNotice} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

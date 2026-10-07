import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, EmptyState, ReasonModal, StatusBadge } from '../../components/ui';
import { RowMenu } from '../../components/quickActions';
import { AttendanceEntryModal, EntitlementModal, LeaveDecisionModal, LeaveRequestModal } from '../../components/hrLeaveModals';
import { exportCsv } from '../../components/reportBits';
import { ACTIVE_EMPLOYEE_STATUSES, HR_ROLES, LEAVE_STATUS, canHr } from '../../hr/config';
import {
  allLeaveBalances, approvedLeaveDaysInMonth, attendanceKpi, designationName, emptyAttendance, hrScope, hrToday, isHrRole, lastMonths, lwpDaysInMonth,
  monthKey, monthLabel, monthRange, num, pendingLeaveForUser, physicalAttendancePct, recentAttendance, validateAttendance,
} from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate, fmtDateTime } from '../../utils/helpers';

const L = LEAVE_STATUS;
const TABS = [{ key: 'requests', label: 'Requests' }, { key: 'balances', label: 'Balances' }, { key: 'attendance', label: 'Attendance' }];
const STATUS_FILTERS = [{ value: '', label: 'All statuses' }, ...Object.values(L).map((s) => ({ value: s, label: s }))];
// Attendance grid columns: [key, header, numeric]
const ATT_COLS = [
  ['workingDays', 'WD', true], ['present', 'Present', true], ['absent', 'Absent', true], ['unapproved', 'Unapp.', true], ['unapprovedRun', 'Run', true],
  ['late', 'Late', true], ['earlyOut', 'Early', true], ['leave', 'Leave', true], ['lwp', 'LWP', true], ['overtimeHrs', 'OT hrs', true], ['remarks', 'Remarks', false],
];
const byName = (a, b) => a.name.localeCompare(b.name);

export default function LeaveQueue({ initialTab = 'requests' }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  // Memoised so the derived lists below can depend on it without re-running every render.
  const asOf = useMemo(() => hrToday(settings), [settings]);
  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);
  // The route decides the tab (/hr/attendance → attendance); ?tab=balances selects the second tab on /hr/leave.
  const tab = params.get('tab') || initialTab;
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [month, setMonth] = useState('');
  const [action, setAction] = useState(null); // { kind: 'request' | 'decide' | 'cancel' | 'entitlement' | 'attendance', request?, employee? }
  const [year, setYear] = useState(Number(settings.leave.year));
  const [attMonth, setAttMonth] = useState(lastMonths(1, asOf)[0]);
  const [edits, setEdits] = useState({}); // employeeId → partial attendance row (strings from inputs)
  const [attReason, setAttReason] = useState('');
  const [attErrors, setAttErrors] = useState([]);

  const employees = useMemo(() => (scope.kind === 'all' ? state.employees : state.employees.filter((e) => scope.ids.has(e.id))), [state.employees, scope]);
  const activeVisible = useMemo(() => employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)).sort(byName), [employees]);
  const visible = useMemo(() => state.leaveRequests.filter((r) => scope.kind === 'all' || scope.ids.has(r.employeeId)), [state.leaveRequests, scope]);
  const empOf = (id) => state.employees.find((e) => e.id === id);
  const selectTab = (key) => nav(key === 'attendance' ? '/hr/attendance' : key === 'balances' ? '/hr/leave?tab=balances' : '/hr/leave');

  // ---------------------------------------------------------------- tiles
  const pendingForMe = useMemo(() => pendingLeaveForUser(state.leaveRequests, state.employees, currentUser), [state.leaveRequests, state.employees, currentUser]);
  const thisMonth = monthRange(monthKey(asOf));
  const approvedThisMonth = visible.filter((r) => r.status === L.APPROVED && r.from <= thisMonth.to && r.to >= thisMonth.from).length;
  const onLeaveToday = new Set(visible.filter((r) => r.status === L.APPROVED && r.from <= asOf && r.to >= asOf).map((r) => r.employeeId)).size;
  const lastMonth = lastMonths(1, asOf)[0];
  const unapprovedLastMonth = state.attendance.filter((a) => a.month === lastMonth && employees.some((e) => e.id === a.employeeId)).reduce((s, a) => s + num(a.unapproved), 0);

  // ------------------------------------------------------------- requests
  const months = useMemo(() => [...new Set(visible.map((r) => monthKey(r.from)))].sort().reverse(), [visible]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((r) => !status || r.status === status)
      .filter((r) => !type || r.typeCode === type)
      .filter((r) => !month || monthKey(r.from) === month)
      .filter((r) => {
        if (!needle) return true;
        const e = state.employees.find((x) => x.id === r.employeeId);
        return [r.code, e?.name, e?.code, r.typeCode, r.reason].some((v) => (v || '').toLowerCase().includes(needle));
      })
      .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  }, [visible, status, type, month, q, state.employees]);

  // The named approver (else the reporting manager) decides; HR Head, MD and Admin decide any request; nobody decides their own.
  const approverOf = (r) => r.approverId || empOf(r.employeeId)?.employment?.reportingManagerId || '';
  const isOwn = (r) => !!currentUser.employeeId && currentUser.employeeId === r.employeeId;
  const canDecide = (r) => canHr(role, 'leaveApprove') && !isOwn(r) && (approverOf(r) === currentUser.employeeId || [HR_ROLES.HR_HEAD, HR_ROLES.MANAGEMENT, HR_ROLES.ADMIN].includes(role));
  // Requester (or HR) may cancel while Pending, or an Approved request that has not started.
  const canCancel = (r) => (r.status === L.PENDING || (r.status === L.APPROVED && r.from > asOf)) && (isOwn(r) || r.requestedBy === by || isHrRole(role));
  const rowActions = (r) => [
    { label: 'Open employee', onClick: () => nav(`/hr/employees/${r.employeeId}`) },
    r.status === L.PENDING && canHr(role, 'leaveApprove') && {
      label: 'Approve / Reject', disabled: !canDecide(r), hint: canDecide(r) ? undefined : isOwn(r) ? 'own request' : `approver: ${empOf(approverOf(r))?.name || 'HR Head'}`,
      onClick: () => setAction({ kind: 'decide', request: r }),
    },
    canCancel(r) && { label: 'Cancel request', danger: true, onClick: () => setAction({ kind: 'cancel', request: r }) },
  ];
  const cancelRequest = (r, reason) => {
    dispatch({ type: 'LEAVE_DECISION', id: r.id, status: L.CANCELLED, by, comment: reason });
    notify(`${r.code} cancelled.`);
    setAction(null);
  };

  // ------------------------------------------------------------- balances
  const matrix = useMemo(() => activeVisible.map((e) => ({ employee: e, balances: allLeaveBalances(e, state.leaveTypes, year, state.leaveRequests, settings, asOf, state.attendance) })),
    [activeVisible, state.leaveTypes, year, state.leaveRequests, settings, asOf, state.attendance]);
  const settingsYear = Number(settings.leave.year);
  const canClose = canHr(role, 'closeLeaveYear');
  const closeHint = year !== settingsYear ? `select the current leave year (${settingsYear})` : undefined;
  const closeYear = () => {
    if (!canClose || closeHint) return;
    if (!window.confirm(`Close leave year ${settingsYear}?\n\nBalances of every active employee roll into the ${settingsYear + 1} opening within the carry-forward caps, and the leave year becomes ${settingsYear + 1}. This cannot be undone.`)) return;
    dispatch({ type: 'CLOSE_LEAVE_YEAR', by, asOf });
    notify(`Leave year ${settingsYear} closed; balances carried into ${settingsYear + 1}.`);
    setYear(settingsYear + 1);
  };
  const exportBalances = () => {
    const header = ['Code', 'Employee', 'Department', ...state.leaveTypes.flatMap((t) => [`${t.code} balance`, `${t.code} taken`, `${t.code} pending`])];
    const data = matrix.map(({ employee: e, balances }) => [e.code, e.name, e.employment.department, ...balances.flatMap((b) => ((b.type.genderOnly && b.type.genderOnly !== e.gender) ? ['', '', ''] : [b.unlimited ? '' : b.balance, b.taken, b.pending]))]);
    exportCsv([header, ...data], `hr_leave_balances_${year}.csv`);
  };

  // ----------------------------------------------------------- attendance
  const editable = canHr(role, 'attendanceEntry');
  const base = useMemo(() => {
    // Active employees plus anyone who already has a row for the month (e.g. separated mid-month).
    const list = employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status) || state.attendance.some((a) => a.employeeId === e.id && a.month === attMonth)).sort(byName);
    return list.map((e) => {
      const existing = state.attendance.find((a) => a.employeeId === e.id && a.month === attMonth);
      const kpi = attendanceKpi(recentAttendance(e.id, state.attendance, asOf), settings);
      if (existing) return { employee: e, rec: existing, isNew: false, kpi };
      // Prefill: working days from the calendar, leave / LWP from approved requests, the rest present.
      const rec = emptyAttendance(e.id, attMonth, settings.calendar);
      const leave = approvedLeaveDaysInMonth(e.id, attMonth, state.leaveRequests, settings.calendar, state.leaveTypes);
      const lwp = lwpDaysInMonth(e.id, attMonth, state.leaveRequests, settings.calendar, state.leaveTypes);
      return { employee: e, rec: { ...rec, leave, lwp, present: Math.max(0, rec.workingDays - leave - lwp) }, isNew: true, kpi };
    });
  }, [employees, state.attendance, state.leaveRequests, state.leaveTypes, attMonth, settings, asOf]);
  const grid = useMemo(() => base.map((b) => {
    const row = { ...b.rec, ...(edits[b.employee.id] || {}) };
    const changed = !!edits[b.employee.id] && ATT_COLS.some(([k]) => String(row[k] ?? '') !== String(b.rec[k] ?? ''));
    return { ...b, row, changed, errors: validateAttendance(row), pct: physicalAttendancePct(row) };
  }), [base, edits]);
  const changedRows = grid.filter((g) => g.changed);
  const lockedChanged = changedRows.filter((g) => g.rec.locked);
  const setCell = (id, k, v) => setEdits((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const changeAttMonth = (v) => { if (!v) return; setAttMonth(v); setEdits({}); setAttReason(''); setAttErrors([]); };
  const toRecord = (row) => {
    const out = { ...row };
    ATT_COLS.forEach(([k, , numeric]) => { if (numeric && k !== 'overtimeHrs') out[k] = num(row[k]); });
    out.overtimeHrs = String(row.overtimeHrs ?? '0');
    out.remarks = row.remarks || '';
    return out;
  };
  const saveMonth = () => {
    if (!editable) return;
    if (changedRows.length === 0) { notify('No rows have been changed.', 'info'); return; }
    const bad = changedRows.filter((g) => g.errors.length);
    if (bad.length) { const list = bad.map((g) => `${g.employee.name}: ${g.errors.join(' ')}`); setAttErrors(list); notify(list[0], 'error'); return; }
    if (lockedChanged.length && !attReason.trim()) { notify('Locked months can only be changed with a reason.', 'error'); return; }
    dispatch({ type: 'UPSERT_ATTENDANCE', records: changedRows.map((g) => toRecord(g.row)), by, reason: attReason.trim() });
    notify(`${changedRows.length} attendance row${changedRows.length === 1 ? '' : 's'} saved for ${monthLabel(attMonth)}.`);
    setEdits({}); setAttReason(''); setAttErrors([]);
  };
  const exportAttendance = () => {
    const header = ['Code', 'Employee', 'Month', ...ATT_COLS.map(([, h]) => h), 'Attendance %', 'KPI (6 mo)', 'Status'];
    const data = grid.map((g) => [g.employee.code, g.employee.name, attMonth, ...ATT_COLS.map(([k]) => g.row[k] ?? ''), g.pct ?? '', g.kpi.score ?? '', g.isNew ? 'not saved' : g.rec.locked ? 'locked' : 'saved']);
    exportCsv([header, ...data], `hr_attendance_${attMonth}.csv`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Leave &amp; attendance</h1><p className="sub">Leave year {settingsYear} · as of {fmtDate(asOf)} · {scope.kind === 'all' ? 'all employees' : scope.kind === 'team' ? 'your team' : 'your own records'}</p></div>
        {canHr(role, 'leaveRequest') && <div className="page-actions"><button className="btn btn-primary" onClick={() => setAction({ kind: 'request' })}>+ Request leave</button></div>}
      </div>

      <div className="grid grid-4">
        <div className="card stat tone-amber clickable" onClick={() => { setParams({ status: L.PENDING }); if (tab !== 'requests') nav(`/hr/leave?status=${L.PENDING}`); }}><span className="stat-label">Pending for me</span><span className="stat-value">{pendingForMe.length}</span><span className="stat-hint">awaiting my decision</span></div>
        <div className="card stat tone-green"><span className="stat-label">Approved this month</span><span className="stat-value">{approvedThisMonth}</span><span className="stat-hint">{monthLabel(monthKey(asOf))}</span></div>
        <div className="card stat tone-blue"><span className="stat-label">On leave today</span><span className="stat-value">{onLeaveToday}</span><span className="stat-hint">{fmtDate(asOf)}</span></div>
        <div className={`card stat ${unapprovedLastMonth > 0 ? 'tone-red' : ''}`}><span className="stat-label">Unapproved absence</span><span className="stat-value">{unapprovedLastMonth}</span><span className="stat-hint">days in {monthLabel(lastMonth)}</span></div>
      </div>

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => selectTab(t.key)}>{t.label}</button>)}
        </div>

        {tab === 'requests' && (
          <>
            <div className="table-toolbar">
              <input className="search" placeholder="Search code, employee, type, reason…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>{STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
              <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{state.leaveTypes.map((t) => <option key={t.code} value={t.code}>{t.code} · {t.name}</option>)}</select>
              <select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">All months</option>{months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select>
            </div>
            {rows.length === 0 ? <EmptyState>No leave requests match these filters.</EmptyState> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Code</th><th>Employee</th><th>Type</th><th>From → To</th><th className="right">Days</th><th>Reason</th><th>Status</th><th>Applied</th><th>Decision</th><th></th></tr></thead>
                <tbody>{rows.map((r) => {
                  const e = empOf(r.employeeId);
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.code}</td>
                      <td><div className="strong">{e?.name || r.employeeId}</div><div className="small muted">{e ? `${e.code || 'draft'} · ${designationName(e.employment.designation)}` : ''}</div></td>
                      <td>{r.typeCode}</td>
                      <td className="nowrap">{fmtDate(r.from)} → {fmtDate(r.to)}{r.halfDay ? <span className="small muted"> (½)</span> : null}</td>
                      <td className="right mono">{r.days}</td>
                      <td className="small" style={{ maxWidth: 220 }}>{r.reason}{r.handoverTo ? <div className="muted">Handover: {empOf(r.handoverTo)?.name || '—'}</div> : null}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="small muted nowrap">{fmtDate(r.requestedAt)}<div>{r.requestedBy}</div></td>
                      <td className="small muted">{r.decision?.by ? <>{r.decision.by} · {fmtDate(r.decision.at)}{r.decision.comment ? <div>{r.decision.comment}</div> : null}</> : r.status === L.PENDING ? `awaiting ${empOf(approverOf(r))?.name || 'HR Head'}` : '—'}</td>
                      <td><RowMenu items={rowActions(r)} /></td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
          </>
        )}

        {tab === 'balances' && (
          <div className="card-body stack">
            <div className="row-between">
              <div className="row">
                <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>{[settingsYear - 1, settingsYear, settingsYear + 1].map((y) => <option key={y} value={y}>Leave year {y}{y === settingsYear ? ' (current)' : ''}</option>)}</select>
                <span className="small muted">Cell = balance / taken / pending. EL cap {settings.leave.elCapDays} days (s.117); LWP is unlimited.</span>
              </div>
              <div className="row">
                {canHr(role, 'reports') && <button className="btn btn-sm" onClick={exportBalances} disabled={matrix.length === 0}>Export CSV</button>}
                {canClose && <button className="btn btn-sm btn-danger" onClick={closeYear} disabled={!!closeHint} title={closeHint}>Close leave year {settingsYear}</button>}
              </div>
            </div>
            {matrix.length === 0 ? <EmptyState>No active employees in your scope.</EmptyState> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Employee</th>{state.leaveTypes.map((t) => <th key={t.code} className="right" title={t.name}>{t.code}</th>)}{canHr(role, 'leaveAdminister') && <th></th>}</tr></thead>
                <tbody>{matrix.map(({ employee: e, balances }) => (
                  <tr key={e.id} className="clickable" onClick={() => nav(`/hr/employees/${e.id}`)}>
                    <td><div className="strong">{e.name}</div><div className="small muted">{e.code} · {designationName(e.employment.designation)} · {e.status}</div></td>
                    {balances.map((b) => (
                      <td key={b.type.code} className="right nowrap">
                        {b.type.genderOnly && b.type.genderOnly !== e.gender ? <span className="muted">—</span>
                          : b.unlimited ? <span className="small muted">{b.taken} taken</span>
                            : <><span className={`mono strong ${b.balance < 0 ? 'badge badge-red' : ''}`}>{b.balance}</span><span className="small muted"> / {b.taken} / {b.pending}</span></>}
                      </td>
                    ))}
                    {canHr(role, 'leaveAdminister') && <td className="nowrap" onClick={(ev) => ev.stopPropagation()}><button className="btn btn-sm" onClick={() => setAction({ kind: 'entitlement', employee: e })}>Adjust</button></td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          <div className="card-body stack">
            <div className="row-between">
              <div className="row">
                <input type="month" value={attMonth} max={monthKey(asOf)} onChange={(e) => changeAttMonth(e.target.value)} style={{ width: 'auto' }} />
                <span className="small muted">{monthLabel(attMonth)} · {grid.length} employees · {grid.filter((g) => !g.isNew).length} saved{editable ? ' · only edited rows are saved' : ' · read-only'}</span>
              </div>
              <div className="row">
                {canHr(role, 'reports') && <button className="btn btn-sm" onClick={exportAttendance} disabled={grid.length === 0}>Export CSV</button>}
                {editable && <button className="btn btn-sm btn-primary" onClick={saveMonth} disabled={changedRows.length === 0}>Save month{changedRows.length ? ` (${changedRows.length})` : ''}</button>}
              </div>
            </div>
            {attErrors.length > 0 && <Alert kind="danger" title="Fix these rows before saving"><ul>{attErrors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
            {lockedChanged.length > 0 && (
              <Alert kind="warn" title={`${lockedChanged.length} locked month${lockedChanged.length === 1 ? '' : 's'} edited`}>
                Locked rows are already used by an appraisal snapshot. A reason is required and is recorded in the audit trail.
                <textarea style={{ marginTop: 8 }} placeholder="Reason for changing locked attendance…" value={attReason} onChange={(e) => setAttReason(e.target.value)} />
              </Alert>
            )}
            {grid.length === 0 ? <EmptyState>No employees in your scope for this month.</EmptyState> : (
              <div className="table-wrap att-grid"><table>
                <thead><tr><th>Employee</th>{ATT_COLS.map(([k, h]) => <th key={k} className={k === 'remarks' ? '' : 'right'}>{h}</th>)}<th className="right">Att. %</th><th className="right">KPI (6 mo)</th><th>Check</th><th>Status</th>{editable && <th></th>}</tr></thead>
                <tbody>{grid.map((g) => (
                  <tr key={g.employee.id}>
                    <td className="nowrap"><div className="strong">{g.employee.name}</div><div className="small muted">{g.employee.code} · {designationName(g.employee.employment.designation)}</div></td>
                    {ATT_COLS.map(([k, , numeric]) => (
                      <td key={k} className={numeric ? 'right' : ''}>
                        {editable
                          ? <input type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={k === 'overtimeHrs' ? 0.5 : 1} style={numeric ? undefined : { width: 140, textAlign: 'left' }} value={g.row[k] ?? ''} onChange={(e) => setCell(g.employee.id, k, e.target.value)} />
                          : <span className={numeric ? 'mono' : 'small'}>{g.row[k] ?? '—'}</span>}
                      </td>
                    ))}
                    <td className="right mono">{g.pct == null ? '—' : `${g.pct}%`}</td>
                    <td className="right mono" title={g.kpi.score == null ? 'no attendance history' : `attendance ${g.kpi.attScore} · punctuality ${g.kpi.punct}`}>{g.kpi.score ?? '—'}</td>
                    <td>{g.errors.length ? <span className="badge badge-red" title={g.errors.join(' ')}>✗ {g.errors.length}</span> : <span className="badge badge-green">✓</span>}</td>
                    <td className="nowrap">
                      {g.rec.locked && <span className="badge badge-amber">Locked</span>}{' '}
                      {g.changed ? <span className="badge badge-blue">Edited</span> : g.isNew ? <span className="badge badge-gray">Not saved</span> : <span className="small muted" title={`by ${g.rec.enteredBy || '—'}`}>{fmtDateTime(g.rec.updatedAt)}</span>}
                    </td>
                    {editable && <td className="nowrap"><button className="btn btn-sm" onClick={() => setAction({ kind: 'attendance', employee: g.employee })}>Open</button></td>}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <p className="small muted">Row rule: present + absent + leave + LWP = working days; unapproved ≤ absent; longest run ≤ unapproved. Attendance % counts physical presence; the KPI column is the system attendance score over the last six months.</p>
          </div>
        )}
      </div>

      {action?.kind === 'request' && <LeaveRequestModal onClose={() => setAction(null)} />}
      {action?.kind === 'decide' && <LeaveDecisionModal request={action.request} onClose={() => setAction(null)} />}
      {action?.kind === 'cancel' && <ReasonModal title={`Cancel ${action.request.code}`} danger confirmLabel="Cancel request" onConfirm={(reason) => cancelRequest(action.request, reason)} onClose={() => setAction(null)} />}
      {action?.kind === 'entitlement' && <EntitlementModal employee={action.employee} onClose={() => setAction(null)} />}
      {action?.kind === 'attendance' && <AttendanceEntryModal employee={action.employee} month={attMonth} onClose={() => setAction(null)} />}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { pageAppraisalVisibility, redactAppraisalAudit } from '../../components/hrAppraisalModals';
import { BarList, TONE } from '../../components/reportBits';
import { Alert, Card, EmptyState, GradeBadge, StatusBadge } from '../../components/ui';
import { ACTIVE_EMPLOYEE_STATUSES, APPRAISAL_FLOW, APPRAISAL_OPEN, APPRAISAL_STATUS, CYCLE_STATUS, DEPARTMENTS, EMPLOYEE_STATUS, HR_ROLES, HR_STATUS_COLORS, SETTLEMENT_OPEN, canHr } from '../../hr/config';
import {
  allLeaveBalances, appraisalDueDate, appraisalOverdue, departmentOf, designationName, employeeInsights, employeeName, expiringEmployeeDocuments, fmtDate, fmtDateTime, fmtMoney,
  hrReminders, hrScope, hrToday, managerOf, monthlyPayroll, myAppraisalQueue, mySettlementQueue, openAppraisalsOf, pendingLeaveForUser, probationsDue, settlementsOverdue, visibleEmployees,
} from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const DEMO_NOTE_KEY = 'hr_demo_note';
const readDemoNote = () => { try { return localStorage.getItem(DEMO_NOTE_KEY) !== 'dismissed'; } catch { return true; } };

export default function HrDashboard() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const role = currentUser.role;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const { employees, appraisals, appraisalCycles, leaveRequests, leaveTypes, attendance, settlements } = state;
  const [demoNote, setDemoNote] = useState(readDemoNote);
  const dismissNote = () => { setDemoNote(false); try { localStorage.setItem(DEMO_NOTE_KEY, 'dismissed'); } catch { /* storage unavailable */ } };

  // Everything below is scoped to what the signed-in user may see (own file / team / all).
  const scope = useMemo(() => hrScope(currentUser, employees), [currentUser, employees]);
  const visible = useMemo(() => visibleEmployees(employees, currentUser), [employees, currentUser]);
  const active = useMemo(() => visible.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)), [visible]);
  const onProbation = useMemo(() => visible.filter((e) => e.status === EMPLOYEE_STATUS.PROBATION), [visible]);
  const probationDue = useMemo(() => probationsDue(visible, 30, asOf), [visible, asOf]);
  const queue = useMemo(() => myAppraisalQueue(appraisals, employees, currentUser, asOf), [appraisals, employees, currentUser, asOf]);
  const leavePending = useMemo(() => pendingLeaveForUser(leaveRequests, employees, currentUser), [leaveRequests, employees, currentUser]);
  const sepQueue = useMemo(() => mySettlementQueue(settlements, employees, currentUser, settings), [settlements, employees, currentUser, settings]);
  const openSettlements = useMemo(() => settlements.filter((s) => SETTLEMENT_OPEN.includes(s.status) && (scope.kind === 'all' || scope.ids.has(s.employeeId))), [settlements, scope]);
  const overdueSettlements = useMemo(() => settlementsOverdue(openSettlements, settings, asOf), [openSettlements, settings, asOf]);
  const reminders = useMemo(() => hrReminders(state, currentUser, asOf), [state, currentUser, asOf]);
  const expiring = useMemo(() => expiringEmployeeDocuments(visible, 60, asOf), [visible, asOf]);
  const openCycle = appraisalCycles.find((c) => c.status === CYCLE_STATUS.OPEN);
  const cycleAprs = useMemo(() => (openCycle ? appraisals.filter((a) => a.cycleId === openCycle.id) : []), [appraisals, openCycle]);
  const funnel = useMemo(() => [...APPRAISAL_FLOW, APPRAISAL_STATUS.RETURNED, APPRAISAL_STATUS.DISPUTED, APPRAISAL_STATUS.CANCELLED]
    .map((st) => ({ label: st, value: cycleAprs.filter((a) => a.status === st).length, color: TONE[HR_STATUS_COLORS[st]] }))
    .filter((r) => r.value > 0 || APPRAISAL_FLOW.includes(r.label)), [cycleAprs]);
  const cycleOverdue = cycleAprs.filter((a) => APPRAISAL_OPEN.includes(a.status) && appraisalOverdue(a, asOf) > 0).length;
  const byDept = useMemo(() => DEPARTMENTS.map((d) => ({ label: d.name, value: active.filter((e) => departmentOf(e) === d.code).length })).filter((r) => r.value > 0), [active]);
  // Scoped like every other card: team/self users only see events on employees in their scope.
  // 'Appraisal Updated' diffs are redacted to what the viewer may see on that appraisal (own ratings before Published, HR calibration).
  const audit = useMemo(() => state.audit.filter((a) => a.portal === 'hr' && (scope.kind === 'all' || scope.ids.has(a.customerId))).slice(0, 7).map((h) => {
    if (h.action !== 'Appraisal Updated') return h;
    const apr = appraisals.find((x) => x.id === h.refId);
    return redactAppraisalAudit(h, apr ? pageAppraisalVisibility(apr, currentUser) : { managerFields: false, hrFields: false });
  }), [state.audit, scope, appraisals, currentUser]);
  // Detail lines can carry salary / dues amounts; show them only to viewSensitive roles or on the user's own file.
  const showDetail = (a) => canHr(role, 'viewSensitive') || (!!currentUser.employeeId && a.customerId === currentUser.employeeId);
  const me = scope.employee;
  const myBalances = useMemo(() => (me ? allLeaveBalances(me, leaveTypes, settings.leave.year, leaveRequests, settings, asOf, attendance) : []), [me, leaveTypes, settings, leaveRequests, asOf, attendance]);
  const myRequests = useMemo(() => (me ? leaveRequests.filter((r) => r.employeeId === me.id).sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')) : []), [me, leaveRequests]);

  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const first = currentUser.name.split(' ')[0];
  const demo = demoNote && (
    <Alert kind="info">
      <div className="row-between">
        <span><b>Demo note:</b> switch the signed-in user (top bar) to act as manager, HR, Finance or Management.</span>
        <button className="btn btn-sm btn-ghost" onClick={dismissNote}>Dismiss</button>
      </div>
    </Alert>
  );

  // Employee self-service view: own profile, balances, appraisal and requests only.
  if (role === HR_ROLES.EMPLOYEE) {
    const ins = me ? employeeInsights(me, { asOf, settings, employees }) : null;
    const myOpen = me ? openAppraisalsOf(me.id, appraisals) : [];
    return (
      <div className="stack">
        <div className="page-head">
          <div><h1>Welcome, {first}</h1><p className="sub">Your employee file, leave balances and appraisals.</p></div>
          {me && <div className="page-actions"><Link className="btn" to={`/hr/employees/${me.id}`}>Open my file</Link><Link className="btn btn-primary" to="/hr/leave">Leave &amp; attendance</Link></div>}
        </div>
        {demo}
        {!me && <Alert kind="warn">Your user is not linked to an employee record.</Alert>}
        {me && (
          <div className="grid grid-2">
            <Card title="My profile" actions={<StatusBadge status={me.status} />}>
              {kv([
                ['Employee code', <span key="employee-code" className="mono">{me.code || '(draft)'}</span>], ['Designation', designationName(me.employment.designation)],
                ['Department', DEPARTMENTS.find((d) => d.code === departmentOf(me))?.name], ['Grade', me.employment.grade],
                ['Reporting manager', managerOf(me, employees)?.name], ['Joined', fmtDate(me.employment.joinDate)], ['Service', ins?.serviceText],
                ['Last appraisal', me.lastAppraisal?.grade ? <span key="last-appraisal">{me.lastAppraisal.code} · <GradeBadge grade={me.lastAppraisal.grade} bands={settings.appraisal.bands} /></span> : ''],
              ])}
              {ins?.flags.length > 0 && <div className="stack mt-8" style={{ gap: 6 }}>{ins.flags.map((f) => <div key={f.text} className={`alert alert-${f.tone} small`}>{f.text}</div>)}</div>}
            </Card>
            <Card title={`Leave balances · ${settings.leave.year}`} actions={<Link className="btn btn-sm" to="/hr/leave">Request leave</Link>}>
              <div className="table-wrap"><table>
                <thead><tr><th>Type</th><th className="right">Opening</th><th className="right">Entitlement</th><th className="right">Taken</th><th className="right">Pending</th><th className="right">Balance</th></tr></thead>
                <tbody>{myBalances.map((b) => (
                  <tr key={b.type.code}>
                    <td><span className="strong">{b.type.code}</span> <span className="muted small">{b.type.name}</span></td>
                    <td className="right mono">{b.unlimited ? '—' : b.opening}</td><td className="right mono">{b.unlimited ? 'Unlimited' : b.entitlement}</td>
                    <td className="right mono">{b.taken}</td><td className="right mono">{b.pending}</td><td className="right mono strong">{b.unlimited ? '—' : b.balance}</td>
                  </tr>))}
                </tbody>
              </table></div>
            </Card>
            <Card title="My appraisals" actions={<Link className="btn btn-sm" to="/hr/appraisals">All</Link>}>
              {myOpen.length === 0 ? <EmptyState>No appraisal in progress.</EmptyState> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Type</th><th>Status</th><th>Due</th><th></th></tr></thead>
                  <tbody>{myOpen.map((a) => {
                    const q = queue.find((x) => x.appraisal.id === a.id);
                    return (
                      <tr key={a.id} className="clickable" onClick={() => nav(`/hr/appraisals/${a.id}`)}>
                        <td className="mono">{a.code}</td><td>{a.type}</td><td><StatusBadge status={a.status} /></td>
                        <td className="nowrap">{fmtDate(appraisalDueDate(a))}{q?.days > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>{q.days}d overdue</span>}</td>
                        <td>{q && <span className="badge badge-purple">Your action</span>}</td>
                      </tr>);
                  })}
                  </tbody>
                </table></div>
              )}
            </Card>
            <Card title="My leave requests">
              {myRequests.length === 0 ? <EmptyState>No leave requests yet.</EmptyState> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Type</th><th>Dates</th><th className="right">Days</th><th>Status</th></tr></thead>
                  <tbody>{myRequests.slice(0, 6).map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.code}</td><td>{r.typeCode}</td><td className="nowrap">{fmtDate(r.from)} → {fmtDate(r.to)}</td><td className="right mono">{r.days}</td><td><StatusBadge status={r.status} /></td>
                    </tr>))}
                  </tbody>
                </table></div>
              )}
            </Card>
          </div>
        )}
        {reminders.length > 0 && (
          <Card title="Alerts for me">
            <div className="stack" style={{ gap: 8 }}>{reminders.slice(0, 8).map((r, i) => <div key={`${r.kind}-${i}`} className={`alert alert-${r.tone}`}><Link to={r.to}>{r.text}</Link></div>)}</div>
          </Card>
        )}
      </div>
    );
  }

  const tiles = [
    { label: 'Headcount', value: active.length, hint: 'Probation, confirmed, on notice or suspended', tone: 'blue', to: '/hr/employees?status=active' },
    { label: 'On probation', value: onProbation.length, hint: probationDue.length ? `${probationDue.length} decision(s) due within 30 days` : 'No decision due within 30 days', tone: probationDue.length ? 'amber' : 'blue', to: '/hr/employees?status=Probation' },
    { label: 'Appraisals awaiting me', value: queue.length, hint: 'Stages where you are the owner', tone: 'purple', to: '/hr/appraisals?queue=mine' },
    { label: 'Leave pending for me', value: leavePending.length, hint: 'Requests awaiting a decision', tone: 'amber', to: '/hr/leave?status=Pending' },
    { label: 'Settlements open', value: openSettlements.length, hint: overdueSettlements.length ? `${overdueSettlements.length} past the s.123 deadline` : 'None past the payment deadline', tone: overdueSettlements.length ? 'red' : 'indigo', to: '/hr/settlements' },
    { label: 'Reminders', value: reminders.length, hint: 'Due dates and statutory checkpoints', tone: reminders.some((r) => r.tone === 'danger') ? 'red' : 'amber', to: '/hr/reminders' },
    ...(canHr(role, 'viewSensitive') ? [{ label: 'Payroll / month', value: fmtMoney(monthlyPayroll(active)), hint: 'Gross salary of the active headcount', tone: 'green', to: '/hr/reports' }] : []),
    { label: 'Documents expiring', value: expiring.length, hint: 'Within 60 days or already expired', tone: expiring.some((r) => r.days < 0) ? 'red' : 'amber', to: '/hr/reminders' },
  ];

  // One row per item the signed-in user is expected to act on, across the three workflows.
  const queueRows = [
    ...queue.map(({ appraisal: a, employee: e, days }) => ({ key: a.id, kind: 'Appraisal', title: `${a.code} · ${e?.name || ''}`, sub: `${a.type} · ${a.status}`, status: a.status, due: days > 0 ? <span className="badge badge-red">{days}d overdue</span> : fmtDate(appraisalDueDate(a)), to: `/hr/appraisals/${a.id}` })),
    ...leavePending.map((r) => ({ key: r.id, kind: 'Leave', title: `${r.code} · ${employeeName(r.employeeId, employees)}`, sub: `${r.typeCode} ${fmtDate(r.from)} → ${fmtDate(r.to)} (${r.days}d)`, status: r.status, due: fmtDate(r.requestedAt), to: '/hr/leave?status=Pending' })),
    ...sepQueue.map(({ settlement: s, employee: e, action }) => ({ key: s.id, kind: 'Settlement', title: `${s.code} · ${e?.name || ''}`, sub: action.label, status: s.status, due: fmtDate(s.lastWorkingDay), to: `/hr/settlements/${s.id}` })),
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Welcome, {first}</h1>
          <p className="sub">{scope.kind === 'team' ? 'Your team' : scope.kind === 'all' ? 'The whole organisation' : 'Your file'} as of {fmtDate(asOf)}{settings.calendar.asOfDate ? ' (demo clock)' : ''}.</p>
        </div>
        {canHr(role, 'create') && <div className="page-actions"><Link className="btn btn-primary" to="/hr/employees/new">+ New employee</Link></div>}
      </div>
      {demo}

      <div className="grid grid-4">
        {tiles.map((t) => (
          <div key={t.label} className={`card stat tone-${t.tone}`} onClick={() => nav(t.to)} role="button" tabIndex={0}>
            <span className="stat-label">{t.label}</span>
            <span className="stat-value">{t.value}</span>
            <span className="stat-hint">{t.hint}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <Card title={`My queue · ${role}`} actions={<Link className="btn btn-sm" to="/hr/appraisals?queue=mine">All appraisals</Link>}>
          {queueRows.length === 0 ? <EmptyState>Nothing waiting for you right now.</EmptyState> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Item</th><th>Kind</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>{queueRows.slice(0, 10).map((r) => (
                <tr key={`${r.kind}-${r.key}`} className="clickable" onClick={() => nav(r.to)}>
                  <td><div className="strong"><Link to={r.to} onClick={(e) => e.stopPropagation()}>{r.title}</Link></div><div className="small muted">{r.sub}</div></td>
                  <td>{r.kind}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="muted small nowrap">{r.due}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
          {queueRows.length > 10 && <div className="small muted mt-8">and {queueRows.length - 10} more.</div>}
        </Card>

        <Card title="Alerts" actions={<Link className="btn btn-sm" to="/hr/reminders">All reminders</Link>}>
          {reminders.length === 0 ? <EmptyState>No due dates or statutory checkpoints right now.</EmptyState> : (
            <div className="stack" style={{ gap: 8 }}>
              {reminders.slice(0, 8).map((r, i) => (
                <div key={`${r.kind}-${r.employeeId}-${i}`} className={`alert alert-${r.tone}`}><Link to={r.to}>{r.text}</Link></div>
              ))}
              {reminders.length > 8 && <Link to="/hr/reminders" className="small">View all {reminders.length} reminders →</Link>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title={openCycle ? `Open cycle · ${openCycle.code} ${openCycle.name}` : 'Open cycle'} actions={<Link className="btn btn-sm" to="/hr/cycles">Cycles</Link>}>
          {!openCycle ? <EmptyState>No appraisal cycle is open.</EmptyState> : (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span className="chip">{fmtDate(openCycle.periodFrom)} → {fmtDate(openCycle.periodTo)}</span>
                <span className="chip">{cycleAprs.length} appraisals</span>
                <span className={`chip ${cycleOverdue ? 'on' : ''}`}>{cycleOverdue} overdue</span>
              </div>
              <BarList rows={funnel} />
            </div>
          )}
        </Card>

        <Card title="Headcount by department" actions={<Link className="btn btn-sm" to="/hr/employees?status=active">Employees</Link>}>
          {byDept.length === 0 ? <EmptyState>No active employees in your scope.</EmptyState> : <BarList rows={byDept} color="var(--purple)" />}
        </Card>
      </div>

      <Card title="Recent activity" actions={canHr(role, 'audit') && <Link className="btn btn-sm" to="/hr/audit">Full audit trail</Link>}>
        {audit.length === 0 ? <EmptyState>No HR activity recorded yet.</EmptyState> : (
          <ul className="timeline">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="when">{fmtDateTime(a.at)}</span>
                <span>
                  <b>{a.action}</b> · {a.customerId === 'hr_system' ? <span>{a.businessName}</span> : <Link to={`/hr/employees/${a.customerId}`}>{a.businessName}</Link>}
                  {a.refCode && <span className="mono small muted"> {a.refCode}</span>} <span className="muted">by {a.by}</span>
                  {a.detail && showDetail(a) && <div className="small muted">{a.detail}</div>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarList, TONE, exportCsv } from '../../components/reportBits';
import { Card, EmptyState, GradeBadge, StatusBadge } from '../../components/ui';
import { ACTIVE_EMPLOYEE_STATUSES, CYCLE_STATUS, DEPARTMENTS, EMPLOYEE_STATUS, GRADES, HR_ROLES, HR_STATUS_COLORS, LEAVE_STATUS, SEPARATION_SECTIONS, SEPARATION_TYPES, SETTLEMENT_OPEN, SETTLEMENT_STATUS, canHr } from '../../hr/config';
import {
  computeSettlement, countLeaveDays, daysBetween, departmentOf, designationName, employeeName, fmtDate, fmtMoney, fmtMoney2, fmtPct, grossSalary, gradeDistribution, hrToday, lastMonths,
  monthLabel, monthRange, num, round2, settlementDeadlineOf, settlementsOverdue,
} from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const TABS = [['headcount', 'Headcount & payroll'], ['appraisals', 'Appraisals'], ['leave', 'Leave & attendance'], ['settlements', 'Settlements']];
const LOW_ATTENDANCE_PCT = 90;
const deptName = (code) => DEPARTMENTS.find((d) => d.code === code)?.name || code || 'Unassigned';
const avg = (arr) => (arr.length ? round2(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
const sum = (arr) => round2(arr.reduce((s, v) => s + v, 0));
// Attendance % over a set of { a: attendanceRow } entries: present + approved leave ÷ working days.
const pctOf = (rows) => { const wd = sum(rows.map(({ a }) => num(a.workingDays))); return wd ? round2(sum(rows.map(({ a }) => num(a.present) + num(a.leave))) / wd * 100) : null; };

export default function HrReports() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const role = currentUser.role;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const { employees, appraisals, appraisalCycles, leaveRequests, leaveTypes, attendance, settlements } = state;
  const sensitive = canHr(role, 'viewSensitive');
  const bands = settings.appraisal.bands;
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'headcount';
  const setParam = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  const dateTag = asOf;

  // ---- Headcount & payroll
  const active = useMemo(() => employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)), [employees]);
  const byDept = useMemo(() => DEPARTMENTS.map((d) => ({ label: d.name, value: active.filter((e) => departmentOf(e) === d.code).length })).filter((r) => r.value > 0), [active]);
  const byGrade = useMemo(() => GRADES.map((g) => ({ label: g, value: active.filter((e) => e.employment.grade === g).length })).filter((r) => r.value > 0), [active]);
  const byStatus = useMemo(() => Object.values(EMPLOYEE_STATUS).map((st) => ({ label: st, value: employees.filter((e) => e.status === st).length, color: TONE[HR_STATUS_COLORS[st]] })).filter((r) => r.value > 0), [employees]);
  const byType = useMemo(() => ['Permanent', 'Contractual', 'Temporary', 'Casual'].map((t) => ({ label: t, value: active.filter((e) => e.employment.employmentType === t).length })).filter((r) => r.value > 0), [active]);
  const payroll = useMemo(() => DEPARTMENTS.map((d) => {
    const rows = active.filter((e) => departmentOf(e) === d.code);
    return { code: d.code, label: d.name, n: rows.length, basic: sum(rows.map((e) => num(e.salary.basic))), gross: sum(rows.map((e) => grossSalary(e.salary))) };
  }).filter((r) => r.n > 0), [active]);
  const payrollTotal = { n: active.length, basic: sum(payroll.map((r) => r.basic)), gross: sum(payroll.map((r) => r.gross)) };
  const separatedThisYear = employees.filter((e) => e.status === EMPLOYEE_STATUS.SEPARATED && String(e.separatedAt || '').slice(0, 4) === asOf.slice(0, 4)).length;

  const exportEmployees = () => {
    const rows = [['Code', 'Name', 'Designation', 'Department', 'Grade', 'Status', 'Employment type', 'Worker category', 'Joined', 'Confirmed', 'Reporting manager', 'Location', 'Mobile', 'Email', ...(sensitive ? ['Basic', 'Gross', 'PF member'] : []), 'Last grade', 'Updated']];
    employees.forEach((e) => rows.push([
      e.code, e.name, designationName(e.employment.designation), deptName(departmentOf(e)), e.employment.grade, e.status, e.employment.employmentType, e.employment.workerCategory, e.employment.joinDate,
      e.employment.confirmationDate, employeeName(e.employment.reportingManagerId, employees), e.employment.workLocation, e.mobile, e.email,
      ...(sensitive ? [e.salary.basic, grossSalary(e.salary), e.pf.member ? 'Yes' : 'No'] : []), e.lastAppraisal?.grade, e.updatedAt,
    ]));
    exportCsv(rows, `hr_employees_${dateTag}.csv`);
  };

  // ---- Appraisals
  const cycles = useMemo(() => [...appraisalCycles].sort((a, b) => (b.periodFrom || '').localeCompare(a.periodFrom || '')), [appraisalCycles]);
  const cycleId = sp.get('cycle') || cycles.find((c) => c.status === CYCLE_STATUS.OPEN)?.id || cycles[0]?.id || '';
  const cycle = cycles.find((c) => c.id === cycleId);
  const cycleAprs = useMemo(() => appraisals.filter((a) => a.cycleId === cycleId), [appraisals, cycleId]);
  const graded = useMemo(() => cycleAprs.filter((a) => a.scores?.final != null && a.scores?.gradeFinal).map((a) => ({ a, e: employees.find((x) => x.id === a.employeeId) })), [cycleAprs, employees]);
  const distOriginal = useMemo(() => gradeDistribution(cycleAprs, bands, 'gradeOriginal'), [cycleAprs, bands]);
  const distFinal = useMemo(() => gradeDistribution(cycleAprs, bands, 'gradeFinal'), [cycleAprs, bands]);
  const deptAverages = useMemo(() => DEPARTMENTS.map((d) => {
    const rows = graded.filter(({ e }) => departmentOf(e) === d.code);
    return { code: d.code, label: d.name, n: rows.length, kpi: avg(rows.map(({ a }) => num(a.scores.kpi))), comp: avg(rows.map(({ a }) => num(a.scores.competency))), final: avg(rows.map(({ a }) => num(a.scores.final))) };
  }).filter((r) => r.n > 0), [graded]);
  const funnel = useMemo(() => [...new Set(cycleAprs.map((a) => a.status))].map((st) => ({ label: st, value: cycleAprs.filter((a) => a.status === st).length, color: TONE[HR_STATUS_COLORS[st]] })), [cycleAprs]);
  const ranked = useMemo(() => [...graded].sort((x, y) => num(y.a.scores.final) - num(x.a.scores.final)), [graded]);
  const showRanking = canHr(role, 'hrReview') || role === HR_ROLES.MANAGEMENT;
  // Increment simulation: editable % per band over Σ basic of the employees graded into that band, annualised.
  const [pcts, setPcts] = useState({});
  const [budget, setBudget] = useState('');
  const simulation = useMemo(() => bands.map((b) => {
    const rows = graded.filter(({ a }) => a.scores.gradeFinal === b.code);
    const basic = sum(rows.map(({ e }) => num(e?.salary?.basic)));
    const pct = pcts[b.code] ?? String(b.incrementPct);
    return { code: b.code, name: b.name, n: rows.length, basic, pct, cost: round2(basic * num(pct) / 100 * 12) };
  }), [bands, graded, pcts]);
  const simulationTotal = sum(simulation.map((r) => r.cost));

  // ---- Leave & attendance
  const months = lastMonths(12, asOf);
  const month = months.includes(sp.get('month')) ? sp.get('month') : months[0];
  const monthAtt = attendance.filter((a) => a.month === month).map((a) => ({ a, e: employees.find((x) => x.id === a.employeeId) })).filter((r) => r.e);
  const attByDept = useMemo(() => DEPARTMENTS.map((d) => ({ label: d.name, value: pctOf(monthAtt.filter(({ e }) => departmentOf(e) === d.code)) })).filter((r) => r.value != null), [monthAtt]);
  const overallPct = pctOf(monthAtt);
  const leaveByType = (() => {
    const { from, to } = monthRange(month);
    return leaveTypes.map((t) => ({
      label: `${t.code} · ${t.name}`,
      value: leaveRequests.filter((r) => r.typeCode === t.code && r.status === LEAVE_STATUS.APPROVED && r.from <= to && r.to >= from)
        .reduce((s, r) => s + countLeaveDays(r.from > from ? r.from : from, r.to < to ? r.to : to, r.halfDay && r.from === r.to, settings.calendar, t), 0),
    })).filter((r) => r.value > 0);
  })();
  const lowAttendance = useMemo(() => monthAtt.map((r) => ({ ...r, pct: pctOf([r]) })).filter((r) => r.pct != null && r.pct < LOW_ATTENDANCE_PCT).sort((x, y) => x.pct - y.pct), [monthAtt]);
  const pendingLeave = leaveRequests.filter((r) => r.status === LEAVE_STATUS.PENDING).length;
  const unapprovedDays = sum(monthAtt.map(({ a }) => num(a.unapproved)));

  // ---- Settlements
  const sepRows = settlements.map((s) => {
    const e = employees.find((x) => x.id === s.employeeId);
    const st = s.statement || (e ? computeSettlement(e, s, settings, { asOf }) : null);
    return { s, e, st, net: st ? num(st.totals.netPayable) : 0, pf: st ? num(st.totals.pfNet) : 0, deadline: settlementDeadlineOf(s, settings) };
  });
  const counted = sepRows.filter(({ s }) => s.status !== SETTLEMENT_STATUS.WITHDRAWN);
  const sepByType = SEPARATION_TYPES.map((t) => ({ label: t, value: counted.filter(({ s }) => s.type === t).length })).filter((r) => r.value > 0);
  const sepByStatus = useMemo(() => Object.values(SETTLEMENT_STATUS).map((st) => ({ label: st, value: settlements.filter((s) => s.status === st).length, color: TONE[HR_STATUS_COLORS[st]] })).filter((r) => r.value > 0), [settlements]);
  const paid = counted.filter(({ s }) => s.status === SETTLEMENT_STATUS.PAID && s.payment?.paidAt && s.lastWorkingDay);
  const avgDaysToPay = avg(paid.map(({ s }) => daysBetween(s.lastWorkingDay, s.payment.paidAt)));
  const overdue = settlementsOverdue(settlements, settings, asOf);
  const openCount = settlements.filter((s) => SETTLEMENT_OPEN.includes(s.status)).length;

  const exportSettlements = () => {
    const rows = [['Code', 'Employee', 'Employee code', 'Type', 'Section', 'Status', 'Notice date', 'Last working day', 'Deadline', 'Clearance signed', 'Earnings', 'Deductions', 'Net payable', 'PF net', 'Total to employee', 'Statement frozen', 'Paid on', 'Payment ref']];
    sepRows.forEach(({ s, e, st }) => rows.push([
      s.code, e?.name, e?.code, s.type, SEPARATION_SECTIONS[s.type], s.status, s.noticeDate, s.lastWorkingDay, settlementDeadlineOf(s, settings), `${(s.clearance || []).filter((r) => r.status !== 'Pending').length}/${(s.clearance || []).length}`,
      st?.totals.earnings, st?.totals.deductions, st?.totals.netPayable, st?.totals.pfNet, st?.totals.totalToEmployee, s.statement ? s.statement.computedAt : 'live', s.payment?.paidAt, s.payment?.reference,
    ]));
    exportCsv(rows, `hr_settlements_${dateTag}.csv`);
  };

  const exportAction = tab === 'headcount' ? exportEmployees : tab === 'settlements' ? exportSettlements : null;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Reports</h1><p className="sub">Snapshot of the organisation as of {fmtDate(asOf)}{settings.calendar.asOfDate ? ' (demo clock)' : ''}.</p></div>
        <div className="page-actions">
          <button className="btn" onClick={() => window.print()}>Print</button>
          {exportAction && <button className="btn btn-primary" onClick={exportAction}>Export CSV</button>}
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {TABS.map(([k, label]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParam('tab', k)}>{label}</button>)}
        </div>
        <div className="card-body stack">
          {tab === 'headcount' && (
            <>
              <div className="grid grid-4">
                <div className="card stat tone-blue"><span className="stat-label">Active headcount</span><span className="stat-value">{active.length}</span><span className="stat-hint">{employees.filter((e) => e.status === EMPLOYEE_STATUS.DRAFT).length} draft record(s)</span></div>
                <div className="card stat tone-amber"><span className="stat-label">On probation</span><span className="stat-value">{active.filter((e) => e.status === EMPLOYEE_STATUS.PROBATION).length}</span></div>
                <div className="card stat tone-red"><span className="stat-label">On notice / suspended</span><span className="stat-value">{active.filter((e) => [EMPLOYEE_STATUS.NOTICE, EMPLOYEE_STATUS.SUSPENDED].includes(e.status)).length}</span></div>
                <div className="card stat"><span className="stat-label">Separated this year</span><span className="stat-value">{separatedThisYear}</span></div>
              </div>
              <div className="grid grid-2">
                <Card title="Headcount by department"><BarList rows={byDept} color="var(--purple)" /></Card>
                <Card title="Headcount by grade"><BarList rows={byGrade} color="var(--indigo)" /></Card>
                <Card title="Employees by status"><BarList rows={byStatus} /></Card>
                <Card title="Active by employment type"><BarList rows={byType} color="var(--primary)" /></Card>
              </div>
              {sensitive ? (
                <Card title="Monthly payroll by department">
                  <div className="table-wrap"><table>
                    <thead><tr><th>Department</th><th className="right">Headcount</th><th className="right">Σ Basic</th><th className="right">Σ Gross</th><th className="right">Avg gross</th></tr></thead>
                    <tbody>
                      {payroll.map((r) => (
                        <tr key={r.code}><td className="strong">{r.label}</td><td className="right mono">{r.n}</td><td className="right mono">{fmtMoney(r.basic)}</td><td className="right mono">{fmtMoney(r.gross)}</td><td className="right mono">{fmtMoney(Math.round(r.gross / r.n))}</td></tr>
                      ))}
                      <tr><td className="strong">Total</td><td className="right mono strong">{payrollTotal.n}</td><td className="right mono strong">{fmtMoney(payrollTotal.basic)}</td><td className="right mono strong">{fmtMoney(payrollTotal.gross)}</td><td className="right mono">{payrollTotal.n ? fmtMoney(Math.round(payrollTotal.gross / payrollTotal.n)) : '—'}</td></tr>
                    </tbody>
                  </table></div>
                </Card>
              ) : <EmptyState>Payroll figures are visible to HR, Finance and Management only.</EmptyState>}
            </>
          )}

          {tab === 'appraisals' && (
            <>
              <div className="table-toolbar" style={{ padding: 0, border: 'none' }}>
                <label className="small muted" htmlFor="report-cycle">Cycle</label>
                <select id="report-cycle" value={cycleId} onChange={(e) => setParam('cycle', e.target.value)}>
                  {cycles.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name} ({c.status})</option>)}
                </select>
                {cycle && <span className="chip">{fmtDate(cycle.periodFrom)} → {fmtDate(cycle.periodTo)}</span>}
                <span className="chip">{cycleAprs.length} appraisals · {graded.length} graded</span>
              </div>
              {!cycle ? <EmptyState>No appraisal cycle exists yet.</EmptyState> : (
                <>
                  <div className="grid grid-2">
                    <Card title="Grade distribution · original vs final vs guided">
                      <div className="table-wrap"><table>
                        <thead><tr><th>Band</th><th className="right">Original</th><th className="right">%</th><th className="right">Final</th><th className="right">%</th><th className="right">Guided %</th></tr></thead>
                        <tbody>{distFinal.map((f, i) => {
                          const o = distOriginal[i];
                          const off = Math.abs(f.pct - f.guidedPct) > 10 && graded.length > 0;
                          return (
                            <tr key={f.code}>
                              <td><GradeBadge grade={f.code} bands={bands} /></td>
                              <td className="right mono">{o.count}</td><td className="right mono muted">{o.pct}%</td>
                              <td className="right mono strong">{f.count}</td><td className="right mono">{f.pct}%</td>
                              <td className="right mono">{f.guidedPct}% {off && <span className="badge badge-amber">off guide</span>}</td>
                            </tr>);
                        })}
                        </tbody>
                      </table></div>
                    </Card>
                    <Card title="Cycle completion">{funnel.length === 0 ? <EmptyState>No appraisals in this cycle.</EmptyState> : <BarList rows={funnel} />}</Card>
                  </div>
                  <Card title="Department averages">
                    {deptAverages.length === 0 ? <EmptyState>No scored appraisals yet.</EmptyState> : (
                      <div className="table-wrap"><table>
                        <thead><tr><th>Department</th><th className="right">Graded</th><th className="right">KPI</th><th className="right">Competency</th><th className="right">Final</th></tr></thead>
                        <tbody>{deptAverages.map((r) => <tr key={r.code}><td className="strong">{r.label}</td><td className="right mono">{r.n}</td><td className="right mono">{r.kpi}</td><td className="right mono">{r.comp}</td><td className="right mono strong">{r.final}</td></tr>)}</tbody>
                      </table></div>
                    )}
                  </Card>
                  {showRanking && (
                    <div className="grid grid-2">
                      {[['Top 5', ranked.slice(0, 5)], ['Bottom 5', [...ranked].reverse().slice(0, 5)]].map(([title, rows]) => (
                        <Card key={title} title={title}>
                          {rows.length === 0 ? <EmptyState>No graded appraisals.</EmptyState> : (
                            <div className="table-wrap"><table>
                              <thead><tr><th>Employee</th><th>Department</th><th className="right">Final</th><th>Grade</th></tr></thead>
                              <tbody>{rows.map(({ a, e }) => (
                                <tr key={a.id} className="clickable" onClick={() => nav(`/hr/appraisals/${a.id}`)}>
                                  <td><div className="strong">{e?.name}</div><div className="small muted">{a.code} · {designationName(e?.employment?.designation)}</div></td>
                                  <td>{deptName(departmentOf(e))}</td><td className="right mono">{a.scores.final}</td><td><GradeBadge grade={a.scores.gradeFinal} bands={bands} /></td>
                                </tr>))}
                              </tbody>
                            </table></div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                  {sensitive && (
                    <Card title="Increment simulation" actions={<span className="small muted">Σ basic × band % × 12 months</span>}>
                      <div className="table-wrap"><table>
                        <thead><tr><th>Band</th><th className="right">Employees</th><th className="right">Σ Basic / month</th><th className="right">Increment %</th><th className="right">Annual cost</th></tr></thead>
                        <tbody>
                          {simulation.map((r) => (
                            <tr key={r.code}>
                              <td><GradeBadge grade={r.code} bands={bands} /></td><td className="right mono">{r.n}</td><td className="right mono">{fmtMoney(r.basic)}</td>
                              <td className="right"><input type="number" min="0" step="0.5" value={r.pct} style={{ width: 80, textAlign: 'right' }} onChange={(e) => setPcts({ ...pcts, [r.code]: e.target.value })} /></td>
                              <td className="right mono">{fmtMoney2(r.cost)}</td>
                            </tr>
                          ))}
                          <tr><td className="strong">Total</td><td className="right mono strong">{graded.length}</td><td></td><td></td><td className="right mono strong">{fmtMoney2(simulationTotal)}</td></tr>
                        </tbody>
                      </table></div>
                      <div className="row mt-8" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label className="small muted" htmlFor="increment-budget">Annual budget (BDT)</label>
                        <input id="increment-budget" type="number" min="0" value={budget} style={{ width: 160 }} onChange={(e) => setBudget(e.target.value)} placeholder="0" />
                        {budget !== '' && (
                          <span className={`badge ${simulationTotal > num(budget) ? 'badge-red' : 'badge-green'}`}>
                            {simulationTotal > num(budget) ? `Over budget by ${fmtMoney2(simulationTotal - num(budget))}` : `Within budget, ${fmtMoney2(num(budget) - simulationTotal)} headroom`}
                          </span>
                        )}
                        <button className="btn btn-sm btn-ghost" onClick={() => { setPcts({}); setBudget(''); }}>Reset to band defaults</button>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'leave' && (
            <>
              <div className="table-toolbar" style={{ padding: 0, border: 'none' }}>
                <label className="small muted" htmlFor="report-month">Month</label>
                <select id="report-month" value={month} onChange={(e) => setParam('month', e.target.value)}>
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
                <span className="chip">{monthAtt.length} attendance record(s)</span>
              </div>
              <div className="grid grid-4">
                <div className={`card stat ${overallPct != null && overallPct < LOW_ATTENDANCE_PCT ? 'tone-red' : 'tone-green'}`}><span className="stat-label">Attendance</span><span className="stat-value">{fmtPct(overallPct, 1)}</span><span className="stat-hint">Present + approved leave ÷ working days</span></div>
                <div className="card stat tone-blue"><span className="stat-label">Approved leave days</span><span className="stat-value">{sum(leaveByType.map((r) => r.value))}</span><span className="stat-hint">{monthLabel(month)}</span></div>
                <div className="card stat tone-amber"><span className="stat-label">Pending requests</span><span className="stat-value">{pendingLeave}</span><span className="stat-hint">All months</span></div>
                <div className="card stat tone-red"><span className="stat-label">Unapproved absence</span><span className="stat-value">{unapprovedDays}</span><span className="stat-hint">Days in {monthLabel(month)}</span></div>
              </div>
              <div className="grid grid-2">
                <Card title={`Attendance % by department · ${monthLabel(month)}`}>{attByDept.length === 0 ? <EmptyState>No attendance recorded for this month.</EmptyState> : <BarList rows={attByDept} color="var(--success)" />}</Card>
                <Card title={`Leave taken by type · ${monthLabel(month)}`}>{leaveByType.length === 0 ? <EmptyState>No approved leave in this month.</EmptyState> : <BarList rows={leaveByType} color="var(--indigo)" />}</Card>
              </div>
              <Card title={`Employees below ${LOW_ATTENDANCE_PCT}% (${lowAttendance.length})`}>
                {lowAttendance.length === 0 ? <EmptyState>Everyone with a record is at or above {LOW_ATTENDANCE_PCT}%.</EmptyState> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Employee</th><th>Department</th><th className="right">Working days</th><th className="right">Present</th><th className="right">Leave</th><th className="right">Absent</th><th className="right">Unapproved</th><th className="right">Late</th><th className="right">Attendance</th></tr></thead>
                    <tbody>{lowAttendance.map(({ a, e, pct }) => (
                      <tr key={a.id} className="clickable" onClick={() => nav(`/hr/employees/${e.id}`)}>
                        <td><div className="strong">{e.name}</div><div className="small muted">{e.code} · {designationName(e.employment.designation)}</div></td>
                        <td>{deptName(departmentOf(e))}</td><td className="right mono">{a.workingDays}</td><td className="right mono">{a.present}</td><td className="right mono">{a.leave}</td><td className="right mono">{a.absent}</td>
                        <td className="right mono">{a.unapproved}</td><td className="right mono">{a.late}</td><td className="right mono"><span className="badge badge-red">{fmtPct(pct, 1)}</span></td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
              </Card>
            </>
          )}

          {tab === 'settlements' && (
            <>
              <div className="grid grid-4">
                <div className="card stat tone-blue"><span className="stat-label">Open settlements</span><span className="stat-value">{openCount}</span><span className="stat-hint">{overdue.length} past the deadline</span></div>
                <div className="card stat tone-green"><span className="stat-label">Σ Net payable</span><span className="stat-value">{fmtMoney(Math.round(sum(counted.map((r) => r.net))))}</span><span className="stat-hint">Frozen statements, live preview otherwise</span></div>
                <div className="card stat tone-indigo"><span className="stat-label">Σ PF payable</span><span className="stat-value">{fmtMoney(Math.round(sum(counted.map((r) => r.pf))))}</span><span className="stat-hint">Net provident fund balances</span></div>
                <div className={`card stat ${avgDaysToPay != null && avgDaysToPay > 42 ? 'tone-red' : 'tone-amber'}`}><span className="stat-label">Avg days LWD → paid</span><span className="stat-value">{avgDaysToPay ?? '—'}</span><span className="stat-hint">{paid.length} paid · deadline {settings.settlement.deadlineWorkingDays} working days (s.123)</span></div>
              </div>
              <div className="grid grid-2">
                <Card title="Separations by type">{sepByType.length === 0 ? <EmptyState>None.</EmptyState> : <BarList rows={sepByType} color="var(--purple)" />}</Card>
                <Card title="Settlements by status">{sepByStatus.length === 0 ? <EmptyState>None.</EmptyState> : <BarList rows={sepByStatus} />}</Card>
              </div>
              <Card title={`Overdue vs deadline (${overdue.length})`}>
                {overdue.length === 0 ? <EmptyState>No open settlement is past its payment deadline.</EmptyState> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Code</th><th>Employee</th><th>Type</th><th>Status</th><th>Last working day</th><th>Deadline</th><th className="right">Days overdue</th></tr></thead>
                    <tbody>{overdue.map(({ settlement: s, deadline, days }) => (
                      <tr key={s.id} className="clickable" onClick={() => nav(`/hr/settlements/${s.id}`)}>
                        <td className="mono">{s.code}</td><td className="strong">{employeeName(s.employeeId, employees)}</td><td>{s.type}</td><td><StatusBadge status={s.status} /></td>
                        <td>{fmtDate(s.lastWorkingDay)}</td><td>{fmtDate(deadline)}</td><td className="right"><span className="badge badge-red">{days}d</span></td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
              </Card>
              <Card title={`All settlements (${sepRows.length})`} actions={<Link className="btn btn-sm" to="/hr/settlements">Open queue</Link>}>
                {sepRows.length === 0 ? <EmptyState>No separations recorded.</EmptyState> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Code</th><th>Employee</th><th>Type</th><th>LWD</th><th>Deadline</th><th>Status</th><th className="right">Net payable</th><th className="right">PF net</th></tr></thead>
                    <tbody>{sepRows.map(({ s, e, st, deadline }) => (
                      <tr key={s.id} className="clickable" onClick={() => nav(`/hr/settlements/${s.id}`)}>
                        <td className="mono">{s.code}</td><td className="strong">{e?.name || '—'}</td><td>{s.type} <span className="muted small">{SEPARATION_SECTIONS[s.type]}</span></td>
                        <td className="nowrap">{fmtDate(s.lastWorkingDay)}</td><td className="nowrap">{fmtDate(deadline)}</td><td><StatusBadge status={s.status} /></td>
                        <td className="right mono">{st ? fmtMoney2(st.totals.netPayable) : '—'}{!s.statement && <span className="small muted"> live</span>}</td><td className="right mono">{st ? fmtMoney2(st.totals.pfNet) : '—'}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

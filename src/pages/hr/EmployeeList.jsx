import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, StatusBadge } from '../../components/ui';
import { RowMenu } from '../../components/quickActions';
import { LeaveRequestModal } from '../../components/hrLeaveModals';
import { exportCsv } from '../../components/reportBits';
import { ACTIVE_EMPLOYEE_STATUSES, DEPARTMENTS, EMPLOYEE_STATUS, canHr } from '../../hr/config';
import { designationName, employeeName, fmtDate, hrScope, hrToday, probationsDue, visibleEmployees } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const S = EMPLOYEE_STATUS;
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active (Probation / Confirmed / On Notice / Suspended)' },
  { value: 'probation-due', label: 'Probation decision due (30 days)' },
  ...Object.values(S).map((s) => ({ value: s, label: s })),
];
const deptName = (code) => DEPARTMENTS.find((d) => d.code === code)?.name || code || '';

export default function EmployeeList() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [action, setAction] = useState(null); // { kind: 'leave', employee }
  const status = params.get('status') || '';
  const role = currentUser.role;
  const asOf = hrToday(state.hrSettings);
  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);
  const visible = useMemo(() => visibleEmployees(state.employees, currentUser), [state.employees, currentUser]);
  const dueIds = useMemo(() => new Set(probationsDue(visible, 30, asOf).map((r) => r.employee.id)), [visible, asOf]);

  // Quick actions available on a row, with the same role and status rules as the detail page.
  const rowActions = (e) => {
    const active = ACTIVE_EMPLOYEE_STATUSES.includes(e.status);
    const self = currentUser.employeeId === e.id;
    return [
      { label: 'Open record', onClick: () => nav(`/hr/employees/${e.id}`) },
      canHr(role, 'edit') && e.status !== S.SEPARATED && { label: 'Edit record', onClick: () => nav(`/hr/employees/${e.id}/edit`) },
      canHr(role, 'leaveRequest') && (self || canHr(role, 'leaveAdminister')) && active && { label: 'Request leave', onClick: () => setAction({ kind: 'leave', employee: e }) },
      canHr(role, 'separationInitiate') && active && !e.separationId && { label: 'Initiate separation', onClick: () => nav(`/hr/settlements/new?employee=${e.id}`) },
      !!e.separationId && { label: 'Open settlement', onClick: () => nav(`/hr/settlements/${e.separationId}`) },
    ];
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((e) => {
        if (status === 'active') return ACTIVE_EMPLOYEE_STATUSES.includes(e.status);
        if (status === 'probation-due') return dueIds.has(e.id);
        return !status || e.status === status;
      })
      .filter((e) => !dept || e.employment.department === dept)
      .filter((e) => !needle || [e.code, e.name, e.nid, e.mobile, e.email, designationName(e.employment.designation)]
        .some((v) => (v || '').toLowerCase().includes(needle)))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [visible, q, dept, status, dueIds]);

  const exportRows = () => {
    const header = ['Code', 'Name', 'Designation', 'Department', 'Grade', 'Employment type', 'Joined', 'Reporting manager', 'Status', 'Mobile', 'Email', 'Updated'];
    exportCsv([header, ...rows.map((e) => [e.code, e.name, designationName(e.employment.designation), deptName(e.employment.department), e.employment.grade, e.employment.employmentType, e.employment.joinDate, employeeName(e.employment.reportingManagerId, state.employees), e.status, e.mobile, e.email, fmtDate(e.updatedAt)])], `hr_employees_${asOf}.csv`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Employees</h1>
          <p className="sub">{rows.length} of {visible.length} records{scope.kind === 'team' ? ' · your team' : scope.kind === 'self' ? ' · your own record' : ''}{dueIds.size ? ` · ${dueIds.size} probation decision(s) due` : ''}</p>
        </div>
        <div className="page-actions">
          {canHr(role, 'reports') && <button className="btn" onClick={exportRows} disabled={rows.length === 0}>Export CSV</button>}
          {canHr(role, 'create') && <Link className="btn btn-primary" to="/hr/employees/new">+ New employee</Link>}
        </div>
      </div>

      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder="Search code, name, NID, mobile, email, designation…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>{STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          <select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select>
        </div>
        {rows.length === 0 ? <EmptyState>No employees match these filters.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Employee</th><th>Grade</th><th>Joined</th><th>Manager</th><th>Status</th><th>Updated</th><th></th></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id} className="clickable" onClick={() => nav(`/hr/employees/${e.id}`)}>
                <td className="mono">{e.code || <span className="muted">draft</span>}</td>
                <td><div className="strong">{e.name || '(unnamed)'}</div><div className="small muted">{designationName(e.employment.designation)}{e.employment.designation && e.employment.department ? ' · ' : ''}{deptName(e.employment.department)}</div></td>
                <td>{e.employment.grade || '—'}</td>
                <td className="nowrap">{fmtDate(e.employment.joinDate)}</td>
                <td className="small">{employeeName(e.employment.reportingManagerId, state.employees) || <span className="muted">—</span>}</td>
                <td><StatusBadge status={e.status} />{dueIds.has(e.id) && <span className="badge badge-amber" style={{ marginLeft: 6 }}>decision due</span>}</td>
                <td className="muted small nowrap">{fmtDate(e.updatedAt)}</td>
                <td><RowMenu items={rowActions(e)} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {action?.kind === 'leave' && <LeaveRequestModal employee={action.employee} onClose={() => setAction(null)} />}
    </div>
  );
}

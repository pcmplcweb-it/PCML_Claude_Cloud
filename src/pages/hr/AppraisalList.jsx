import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { pageAppraisalQueue, pageAppraisalVisibility } from '../../components/hrAppraisalModals';
import { RowMenu } from '../../components/quickActions';
import { EmptyState, GradeBadge, ReasonModal, StatusBadge } from '../../components/ui';
import { APPRAISAL_OPEN, APPRAISAL_STATUS, DEPARTMENTS, canHr } from '../../hr/config';
import { appraisalDueDate, appraisalOverdue, appraisalOwner, departmentOf, designationName, fmtDate, hrScope, hrToday } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const A = APPRAISAL_STATUS;
const CANCELLABLE = [A.KPI_SETTING, A.AGREED, A.SELF, A.MANAGER, A.HR, A.RETURNED];

export default function AppraisalList() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [cancel, setCancel] = useState(null); // appraisal being cancelled
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const bands = settings.appraisal?.bands || [];
  const cycle = params.get('cycle') || '';
  const status = params.get('status') || '';
  const mine = params.get('queue') === 'mine';
  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);
  // Team scope = own file + direct reports; the managerId check also covers reports re-assigned after the appraisal was created.
  const { visible, queue, tiles, rows } = useMemo(() => {
    const vis = scope.kind === 'all' ? state.appraisals : state.appraisals.filter((a) => scope.ids.has(a.employeeId) || (currentUser.employeeId && a.managerId === currentUser.employeeId));
    // Same gating as the form: includes HR's overdue KPI-setting on-behalf items, excludes reviewer stages on one's own record.
    const q1 = pageAppraisalQueue(vis, state.employees, currentUser, asOf);
    const queueIds = new Set(q1.map((x) => x.appraisal.id));
    const needle = q.trim().toLowerCase();
    const list = vis
      .filter((a) => (cycle === 'probation' ? a.type === 'Probation' : !cycle || a.cycleId === cycle))
      .filter((a) => !status || a.status === status)
      .filter((a) => !mine || queueIds.has(a.id))
      .map((a) => ({ a, e: state.employees.find((e) => e.id === a.employeeId) }))
      .filter(({ e }) => !dept || departmentOf(e) === dept)
      .filter(({ a, e }) => !needle || [a.code, e?.name, e?.code, designationName(e?.employment?.designation), a.templateCode].some((v) => (v || '').toLowerCase().includes(needle)))
      .map(({ a, e }) => ({ a, e, owner: appraisalOwner(a, state.employees), due: appraisalDueDate(a), overdue: APPRAISAL_OPEN.includes(a.status) ? appraisalOverdue(a, asOf) : 0, vis: pageAppraisalVisibility(a, currentUser) }))
      .sort((x, y) => y.overdue - x.overdue || new Date(y.a.updatedAt) - new Date(x.a.updatedAt));
    return {
      visible: vis, queue: q1, rows: list,
      tiles: { overdue: vis.filter((a) => APPRAISAL_OPEN.includes(a.status) && appraisalOverdue(a, asOf) > 0).length, hr: vis.filter((a) => a.status === A.HR).length, published: vis.filter((a) => a.status === A.PUBLISHED).length },
    };
  }, [state.appraisals, state.employees, scope, currentUser, asOf, cycle, status, mine, dept, q]);

  const setParam = (patch) => {
    const next = { cycle, status, queue: mine ? 'mine' : '', ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };
  const cycleName = (id) => state.appraisalCycles.find((c) => c.id === id)?.code || '';
  const doCancel = (reason) => {
    dispatch({ type: 'APPRAISAL_TRANSITION', id: cancel.id, status: A.CANCELLED, by, label: 'Appraisal Cancelled', reason });
    notify(`${cancel.code} cancelled.`);
    setCancel(null);
  };
  const rowActions = ({ a }) => [
    { label: 'Open appraisal', onClick: () => nav(`/hr/appraisals/${a.id}`) },
    canHr(role, 'cancelAppraisal') && CANCELLABLE.includes(a.status) && a.employeeId !== currentUser.employeeId && { label: 'Cancel appraisal', danger: true, onClick: () => setCancel(a) },
  ];
  const tile = (label, value, tone, patch, hint) => (
    <div className={`card stat tone-${tone} clickable`} style={{ cursor: 'pointer' }} onClick={() => setParam(patch)}><span className="stat-label">{label}</span><span className="stat-value">{value}</span><span className="stat-hint">{hint}</span></div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Appraisals</h1><p className="sub">{rows.length} of {visible.length} appraisals{scope.kind === 'team' ? ' (you and your direct reports)' : scope.kind === 'self' ? ' (your own)' : ''}</p></div>
      </div>

      <div className="grid grid-4">
        {tile('In my queue', queue.length, 'purple', { queue: 'mine', status: '' }, 'stages waiting for me')}
        {tile('Overdue', tiles.overdue, tiles.overdue ? 'red' : 'green', { queue: '', status: '' }, 'past the stage due date')}
        {tile('Awaiting HR', tiles.hr, 'indigo', { queue: '', status: A.HR }, 'manager reviews submitted')}
        {tile('Published, not acknowledged', tiles.published, 'amber', { queue: '', status: A.PUBLISHED }, `employees have ${settings.appraisal?.ackDays} days`)}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder="Search code, employee, designation, template…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={cycle} onChange={(e) => setParam({ cycle: e.target.value })}>
            <option value="">All cycles</option>
            {state.appraisalCycles.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            <option value="probation">Probation reviews</option>
          </select>
          <select value={status} onChange={(e) => setParam({ status: e.target.value })}><option value="">All statuses</option>{Object.values(A).map((s) => <option key={s}>{s}</option>)}</select>
          <select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select>
          <button className={`btn ${mine ? 'btn-primary' : ''}`} onClick={() => setParam({ queue: mine ? '' : 'mine' })}>My queue</button>
        </div>
        {rows.length === 0 ? <EmptyState>No appraisals match these filters.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Employee</th><th>Type / cycle</th><th>Period</th><th>Status</th><th>Owner</th><th>Due</th><th className="right">Final</th><th>Grade</th><th></th></tr></thead>
            <tbody>{rows.map(({ a, e, owner, due, overdue, vis }) => (
              <tr key={a.id} className="clickable" onClick={() => nav(`/hr/appraisals/${a.id}`)}>
                <td className="mono">{a.code}{a.proRata && <div className="small muted">pro-rata</div>}</td>
                <td><div className="strong">{e?.name || '—'}</div><div className="small muted">{designationName(e?.employment?.designation)}{e ? ` · ${departmentOf(e)}` : ''}</div></td>
                <td>{a.type}<div className="small muted mono">{cycleName(a.cycleId) || a.templateCode}</div></td>
                <td className="nowrap small">{fmtDate(a.periodFrom)} → {fmtDate(a.periodTo)}</td>
                <td><StatusBadge status={a.status} /></td>
                <td className="small">{owner ? <>{owner.stage}<div className="muted">{owner.name}</div></> : <span className="muted">—</span>}</td>
                <td className="nowrap small">{due ? fmtDate(due) : <span className="muted">—</span>}{overdue > 0 && <div><span className="badge badge-red">{overdue} d overdue</span></div>}</td>
                <td className="right mono">{vis.managerFields && a.scores?.final != null ? a.scores.final : '—'}</td>
                <td>{vis.managerFields ? <GradeBadge grade={a.scores?.gradeFinal} bands={bands} /> : <span className="muted small">pending</span>}</td>
                <td><RowMenu items={rowActions({ a })} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {cancel && <ReasonModal title={`Cancel appraisal · ${cancel.code}`} danger confirmLabel="Cancel appraisal" onConfirm={doCancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

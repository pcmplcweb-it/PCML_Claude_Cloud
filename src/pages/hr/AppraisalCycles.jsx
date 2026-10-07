import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CycleModal, OpenCycleModal } from '../../components/hrAppraisalModals';
import { RowMenu } from '../../components/quickActions';
import { BarList, TONE } from '../../components/reportBits';
import { Alert, Card, EmptyState, Progress, StatusBadge } from '../../components/ui';
import { APPRAISAL_FLOW, APPRAISAL_OPEN, APPRAISAL_STATUS, CYCLE_STATUS, HR_STATUS_COLORS, canHr } from '../../hr/config';
import { appraisalOverdue, fmtDate, hrToday } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const A = APPRAISAL_STATUS;
const FUNNEL = [...APPRAISAL_FLOW, A.RETURNED, A.DISPUTED, A.CANCELLED];
// Appraisals that stop a cycle from closing: every open status except Published (which CLOSE_CYCLE closes itself).
const BLOCKING = APPRAISAL_OPEN.filter((s) => s !== A.PUBLISHED);
const DONE = [A.PUBLISHED, A.ACKNOWLEDGED, A.CLOSED];

export default function AppraisalCycles() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const role = currentUser.role;
  const by = currentUser.name;
  const asOf = hrToday(state.hrSettings);
  const [modal, setModal] = useState(null); // { kind: 'new' | 'edit' | 'open', cycle }
  const [blocked, setBlocked] = useState(null); // { cycle, list } when a close was refused

  const rows = useMemo(() => [...state.appraisalCycles]
    .map((c) => {
      const aprs = state.appraisals.filter((x) => x.cycleId === c.id);
      const byStatus = aprs.reduce((m, x) => ({ ...m, [x.status]: (m[x.status] || 0) + 1 }), {});
      const done = aprs.filter((x) => DONE.includes(x.status)).length;
      const live = aprs.filter((x) => x.status !== A.CANCELLED).length;
      return { c, aprs, byStatus, done, pct: live ? Math.round((done / live) * 100) : 0, overdue: aprs.filter((x) => APPRAISAL_OPEN.includes(x.status) && appraisalOverdue(x, asOf) > 0).length };
    })
    .sort((x, y) => (y.c.periodFrom || '').localeCompare(x.c.periodFrom || '')), [state.appraisalCycles, state.appraisals, asOf]);
  const opens = rows.filter((r) => r.c.status === CYCLE_STATUS.OPEN);

  const close = (r) => {
    const list = r.aprs.filter((x) => BLOCKING.includes(x.status));
    if (list.length) { setBlocked({ cycle: r.c, list }); notify(`${list.length} appraisal(s) are not yet published or cancelled.`, 'error'); return; }
    setBlocked(null);
    if (!window.confirm(`Close ${r.c.code}? Published results become final and are copied to each employee's record.`)) return;
    dispatch({ type: 'CLOSE_CYCLE', id: r.c.id, by });
    notify(`Cycle ${r.c.code} closed.`);
  };

  const rowActions = (r) => [
    { label: 'View appraisals', onClick: () => nav(`/hr/appraisals?cycle=${r.c.id}`) },
    r.c.status === CYCLE_STATUS.PLANNED && canHr(role, 'manageCycles') && { label: 'Edit cycle', onClick: () => setModal({ kind: 'edit', cycle: r.c }) },
    r.c.status === CYCLE_STATUS.PLANNED && canHr(role, 'manageCycles') && { label: 'Open cycle', onClick: () => setModal({ kind: 'open', cycle: r.c }) },
    r.c.status === CYCLE_STATUS.OPEN && canHr(role, 'publish') && { label: 'Close cycle', danger: true, hint: r.aprs.some((x) => BLOCKING.includes(x.status)) ? `${r.aprs.filter((x) => BLOCKING.includes(x.status)).length} not final` : undefined, onClick: () => close(r) },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Appraisal cycles</h1><p className="sub">A cycle fixes the period and stage due dates; opening it creates one appraisal per eligible employee from the KPI templates.</p></div>
        {canHr(role, 'manageCycles') && <div className="page-actions"><button className="btn btn-primary" onClick={() => setModal({ kind: 'new' })}>+ New cycle</button></div>}
      </div>

      {blocked && (
        <Alert kind="warn" title={`${blocked.cycle.code} cannot close: ${blocked.list.length} appraisal(s) are still in progress`}>
          <ul>{blocked.list.map((x) => <li key={x.id}><Link to={`/hr/appraisals/${x.id}`}>{x.code}</Link> · {state.employees.find((e) => e.id === x.employeeId)?.name} — {x.status}</li>)}</ul>
          <p className="small muted">Publish them, or cancel stragglers with a reason, then close again.</p>
        </Alert>
      )}

      {opens.map((open) => (
        <Card key={open.c.id} title={`Open cycle · ${open.c.code} ${open.c.name}`} actions={<><span className={`badge ${open.overdue ? 'badge-red' : 'badge-green'}`}>{open.overdue} overdue</span><Link className="btn btn-sm" to={`/hr/appraisals?cycle=${open.c.id}`}>Open appraisals</Link></>}>
          <div className="grid grid-2">
            {open.aprs.length === 0 ? <EmptyState>No appraisals in this cycle.</EmptyState> : <BarList rows={FUNNEL.filter((s) => open.byStatus[s]).map((s) => ({ label: s, value: open.byStatus[s], color: TONE[HR_STATUS_COLORS[s]] || TONE.gray }))} />}
            <dl className="kv">
              <dt>Period</dt><dd>{fmtDate(open.c.periodFrom)} → {fmtDate(open.c.periodTo)}</dd>
              <dt>Appraisals</dt><dd>{open.aprs.length} created · {open.done} published or later · {open.byStatus[A.CANCELLED] || 0} cancelled</dd>
              <dt>Progress</dt><dd><div className="row" style={{ gap: 8 }}><div style={{ width: 160 }}><Progress value={open.pct} /></div><span className="small">{open.pct}%</span></div></dd>
              <dt>Due dates</dt><dd className="small">KPI {fmtDate(open.c.due.kpi)} · self {fmtDate(open.c.due.self)} · manager {fmtDate(open.c.due.manager)} · HR {fmtDate(open.c.due.hr)} · publish {fmtDate(open.c.due.publish)} · ack {fmtDate(open.c.due.ack)}</dd>
              <dt>Opened</dt><dd>{fmtDate(open.c.openedAt)}</dd>
            </dl>
          </div>
        </Card>
      ))}

      <div className="card">
        {rows.length === 0 ? <EmptyState>No cycles yet.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Period</th><th>Status</th><th>Appraisals</th><th>Progress</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c.id} className="clickable" onClick={() => nav(`/hr/appraisals?cycle=${r.c.id}`)}>
                <td className="mono">{r.c.code}</td>
                <td><div className="strong">{r.c.name}</div><div className="small muted">increment from {fmtDate(r.c.payout?.incrementEffective) || '—'}{r.c.payout?.bonusPayable ? ' · bonus payable' : ''}</div></td>
                <td>{r.c.type}</td>
                <td className="nowrap small">{fmtDate(r.c.periodFrom)} → {fmtDate(r.c.periodTo)}</td>
                <td><StatusBadge status={r.c.status} /></td>
                <td>
                  {r.aprs.length === 0 ? <span className="muted small">none</span> : (
                    <div className="chip-list">{FUNNEL.filter((s) => r.byStatus[s]).map((s) => <span key={s} className={`badge badge-${HR_STATUS_COLORS[s] || 'gray'}`} title={s}>{s} · {r.byStatus[s]}</span>)}</div>
                  )}
                </td>
                <td style={{ minWidth: 140 }}><div className="row" style={{ gap: 8 }}><Progress value={r.pct} /><span className="small muted">{r.pct}%</span></div>{r.overdue > 0 && <div className="small" style={{ color: 'var(--danger)' }}>{r.overdue} overdue</div>}</td>
                <td><RowMenu items={rowActions(r)} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {modal?.kind === 'new' && <CycleModal onClose={() => setModal(null)} />}
      {modal?.kind === 'edit' && <CycleModal cycle={modal.cycle} onClose={() => setModal(null)} />}
      {modal?.kind === 'open' && <OpenCycleModal cycle={modal.cycle} onClose={() => setModal(null)} />}
    </div>
  );
}

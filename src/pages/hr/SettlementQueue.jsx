import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RowMenu } from '../../components/quickActions';
import { EmptyState, ReasonModal, StatusBadge } from '../../components/ui';
import { SEPARATION_SECTIONS, SEPARATION_TYPES, SETTLEMENT_OPEN, SETTLEMENT_STATUS, canHr } from '../../hr/config';
import { computeSettlement, daysUntilAsOf, designationName, fmtMoney2, hrScope, hrToday, mySettlementQueue, settlementAction, settlementDeadlineOf, settlementsOverdue } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate } from '../../utils/helpers';

const S = SETTLEMENT_STATUS;
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open (not Paid / Withdrawn)' },
  { value: 'approvals', label: 'Awaiting approval (HR / Finance / Management)' },
  ...Object.values(S).map((s) => ({ value: s, label: s })),
];
const HOLDABLE = [S.INITIATED, S.CLEARANCE, S.RETURNED];
const APPROVALS = [S.HR_APPROVAL, S.FINANCE_APPROVAL, S.MGMT_APPROVAL];

// Status a held settlement returns to: the last on-track status in its history.
const releaseStatus = (sep) => [...(sep.history || [])].reverse().find((h) => HOLDABLE.includes(h.status))?.status || S.INITIATED;

export default function SettlementQueue() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [action, setAction] = useState(null); // { kind: 'hold' | 'release' | 'withdraw', settlement }
  const status = params.get('status') || '';
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);

  // Settlements inside the user's scope, each with its employee, deadline, live net and the action open to me.
  const visible = useMemo(() => state.settlements
    .filter((sep) => scope.kind === 'all' || scope.ids.has(sep.employeeId))
    .map((sep) => {
      const emp = state.employees.find((e) => e.id === sep.employeeId);
      const net = sep.statement ? sep.statement.totals.netPayable : emp ? computeSettlement(emp, sep, settings, { asOf }).totals.netPayable : null;
      return { sep, emp, net, deadline: settlementDeadlineOf(sep, settings), signed: (sep.clearance || []).filter((r) => r.status !== 'Pending').length, action: settlementAction(sep, emp, currentUser, settings) };
    })
    .sort((a, b) => new Date(b.sep.updatedAt) - new Date(a.sep.updatedAt)),
  [state.settlements, state.employees, settings, asOf, scope, currentUser]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return visible
      .filter((r) => {
        if (status === 'open') return SETTLEMENT_OPEN.includes(r.sep.status);
        if (status === 'approvals') return APPROVALS.includes(r.sep.status);
        return !status || r.sep.status === status;
      })
      .filter((r) => !type || r.sep.type === type)
      .filter((r) => !needle || [r.sep.code, r.emp?.name, r.emp?.code, r.sep.type, r.sep.reason].some((v) => (v || '').toLowerCase().includes(needle)));
  }, [visible, q, status, type]);

  const mine = useMemo(() => mySettlementQueue(state.settlements, state.employees, currentUser, settings), [state.settlements, state.employees, currentUser, settings]);
  const inClearance = visible.filter((r) => r.sep.status === S.CLEARANCE);
  const approved = visible.filter((r) => r.sep.status === S.APPROVED);
  const approvedNet = approved.reduce((s, r) => s + Number(r.net || 0), 0);
  const overdue = useMemo(() => settlementsOverdue(state.settlements.filter((sep) => scope.kind === 'all' || scope.ids.has(sep.employeeId)), settings, asOf), [state.settlements, settings, asOf, scope]);

  const transition = (sep, status, label, reason) => {
    dispatch({ type: 'SETTLEMENT_TRANSITION', id: sep.id, status, by, label, reason, asOf });
    setAction(null);
    notify(`${sep.code}: ${label.toLowerCase()}.`);
  };
  const confirmAction = (reason) => {
    const sep = action.settlement;
    if (action.kind === 'hold') transition(sep, S.ON_HOLD, 'Placed on Hold', reason);
    else if (action.kind === 'release') transition(sep, releaseStatus(sep), 'Released from Hold', reason);
    else transition(sep, S.WITHDRAWN, 'Withdrawn', reason);
  };

  // Row actions mirror the detail page's gating: hold / release for HR Head, withdraw before HR approval.
  const rowActions = (r) => [
    { label: 'Open settlement', onClick: () => nav(`/hr/settlements/${r.sep.id}`) },
    r.emp && { label: 'Open employee', onClick: () => nav(`/hr/employees/${r.emp.id}`) },
    canHr(role, 'settlementHold') && HOLDABLE.includes(r.sep.status) && { label: 'Place on hold', onClick: () => setAction({ kind: 'hold', settlement: r.sep }) },
    canHr(role, 'settlementHold') && r.sep.status === S.ON_HOLD && { label: 'Release from hold', onClick: () => setAction({ kind: 'release', settlement: r.sep }) },
    canHr(role, 'separationInitiate') && [...HOLDABLE, S.ON_HOLD].includes(r.sep.status) && { label: 'Withdraw separation', danger: true, onClick: () => setAction({ kind: 'withdraw', settlement: r.sep }) },
  ];

  const deadlineBadge = (r) => {
    if (!r.deadline) return '—';
    const days = daysUntilAsOf(r.deadline, asOf);
    const open = SETTLEMENT_OPEN.includes(r.sep.status);
    return <>{fmtDate(r.deadline)} {open && days < 0 && <span className="badge badge-red">{-days} d overdue</span>}{open && days >= 0 && days <= 7 && <span className="badge badge-amber">{days} d</span>}</>;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Final settlements</h1><p className="sub">{rows.length} of {visible.length} settlements · clearance, dues computation and approvals under the Labour Act 2006 (s.123: pay within 30 working days of the last working day).</p></div>
        {canHr(role, 'separationInitiate') && <div className="page-actions"><Link className="btn btn-primary" to="/hr/settlements/new">+ Initiate separation</Link></div>}
      </div>

      <div className="grid grid-4">
        <div className="card stat tone-purple" onClick={() => setParams({ status: 'open' })}><span className="stat-label">Awaiting me</span><span className="stat-value">{mine.length}</span><span className="stat-hint">{mine.length ? mine.slice(0, 2).map((m) => m.action.label).join(' · ') : 'nothing to act on'}</span></div>
        <div className="card stat tone-blue" onClick={() => setParams({ status: S.CLEARANCE })}><span className="stat-label">Clearance in progress</span><span className="stat-value">{inClearance.length}</span><span className="stat-hint">{inClearance.reduce((s, r) => s + (5 - r.signed), 0)} department sign-offs pending</span></div>
        <div className="card stat tone-green" onClick={() => setParams({ status: S.APPROVED })}><span className="stat-label">Approved for payment</span><span className="stat-value">{approved.length}</span><span className="stat-hint">Σ net {fmtMoney2(approvedNet)}</span></div>
        <div className={`card stat ${overdue.length ? 'tone-red' : ''}`} onClick={() => setParams({ status: 'open' })}><span className="stat-label">Overdue vs deadline</span><span className="stat-value">{overdue.length}</span><span className="stat-hint">{overdue.length ? `oldest ${Math.max(...overdue.map((o) => o.days))} days past` : 'all within 30 working days'}</span></div>
      </div>

      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder="Search code, employee, type, reason…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>{STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{SEPARATION_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        {rows.length === 0 ? <EmptyState>No settlements match these filters.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Employee</th><th>Type</th><th>LWD</th><th>Deadline</th><th>Clearance</th><th className="right">Net payable</th><th>Status</th><th>My action</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.sep.id} className="clickable" onClick={() => nav(`/hr/settlements/${r.sep.id}`)}>
                <td className="mono">{r.sep.code}</td>
                <td><div className="strong">{r.emp?.name || '—'}</div><div className="small muted">{r.emp?.code}{r.emp ? ` · ${designationName(r.emp.employment?.designation)}` : ''}</div></td>
                <td>{r.sep.type}<div className="small muted">{SEPARATION_SECTIONS[r.sep.type]}</div></td>
                <td className="nowrap">{fmtDate(r.sep.lastWorkingDay)}</td>
                <td className="nowrap">{deadlineBadge(r)}</td>
                <td><span className={`badge ${r.signed === 5 ? 'badge-green' : r.signed ? 'badge-amber' : 'badge-gray'}`}>{r.signed}/5</span></td>
                <td className="right mono">{r.net == null ? '—' : fmtMoney2(r.net)}{!r.sep.statement && r.net != null && <div className="small muted">live</div>}</td>
                <td><StatusBadge status={r.sep.status} /></td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>{r.action ? <button className="btn btn-sm btn-primary" onClick={() => nav(`/hr/settlements/${r.sep.id}`)}>{r.action.label}</button> : <span className="small muted">—</span>}</td>
                <td className="nowrap"><RowMenu items={rowActions(r)} /></td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>

      {action?.kind === 'hold' && <ReasonModal title={`Place on hold · ${action.settlement.code}`} confirmLabel="Place on hold" onConfirm={confirmAction} onClose={() => setAction(null)} />}
      {action?.kind === 'release' && <ReasonModal title={`Release from hold · ${action.settlement.code}`} label={`Reason (returns to ${releaseStatus(action.settlement)})`} confirmLabel="Release" onConfirm={confirmAction} onClose={() => setAction(null)} />}
      {action?.kind === 'withdraw' && <ReasonModal title={`Withdraw separation · ${action.settlement.code}`} label="Reason (the employee returns to their previous status)" danger confirmLabel="Withdraw" onConfirm={confirmAction} onClose={() => setAction(null)} />}
    </div>
  );
}

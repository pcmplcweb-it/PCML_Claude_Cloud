import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditBadge, EmptyState, Progress, RiskBadge, StatusBadge } from '../components/ui';
import { CREDIT_STATUS, DIVISIONS, STATUS, can } from '../data/config';
import { CreditDecisionModal, CreditRequestModal, ReviewModal, RowMenu } from '../components/quickActions';
import { useStore } from '../store/StoreContext';
import { completeness, fmtDate } from '../utils/helpers';

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending (Submitted / Verification / Approval)' },
  { value: 'incomplete', label: 'Incomplete (Draft / Returned)' },
  ...Object.values(STATUS).map((s) => ({ value: s, label: s })),
];

export default function CustomerList() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [division, setDivision] = useState('');
  const [action, setAction] = useState(null); // { kind: 'credit-request' | 'credit-decide' | 'review', customer }
  const status = params.get('status') || '';
  const role = currentUser.role;

  // Quick actions available on a row, with the same role and status rules as the detail page.
  const rowActions = (c) => [
    { label: 'Open record', onClick: () => nav(`/kyc/customers/${c.id}`) },
    [STATUS.DRAFT, STATUS.RETURNED].includes(c.status) && can(role, 'edit') && { label: 'Edit application', onClick: () => nav(`/kyc/customers/${c.id}/edit`) },
    can(role, 'creditRequest') && [CREDIT_STATUS.NONE, CREDIT_STATUS.DECLINED].includes(c.credit.status) && c.status !== STATUS.REJECTED && { label: 'Request credit', onClick: () => setAction({ kind: 'credit-request', customer: c }) },
    can(role, 'creditDecide') && [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW].includes(c.credit.status) && {
      label: 'Decide credit', disabled: c.status !== STATUS.ACTIVE, hint: c.status !== STATUS.ACTIVE ? 'KYC not active' : undefined, onClick: () => setAction({ kind: 'credit-decide', customer: c }),
    },
    can(role, 'review') && c.status === STATUS.ACTIVE && { label: 'Periodic review', hint: c.reviewDue ? `due ${fmtDate(c.reviewDue)}` : undefined, onClick: () => setAction({ kind: 'review', customer: c }) },
  ];
  const cfg = (c) => state.customerTypes.find((t) => t.code === c.customerType);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.customers
      .filter((c) => {
        if (status === 'pending') return [STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status);
        if (status === 'incomplete') return [STATUS.DRAFT, STATUS.RETURNED].includes(c.status);
        return !status || c.status === status;
      })
      .filter((c) => !type || c.customerType === type)
      .filter((c) => !division || c.division === division)
      .filter((c) => !needle || [c.code, c.name, c.businessName, c.mobile, c.business.tradeLicenseNo, c.district,
        // Identity numbers are searchable only for roles allowed to see them.
        ...(can(currentUser.role, 'viewSensitive') ? [c.identity.idNumber] : [])]
        .some((v) => (v || '').toLowerCase().includes(needle)))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [state.customers, q, type, division, status, currentUser.role]);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <p className="sub">{rows.length} of {state.customers.length} records</p>
        </div>
        {can(currentUser.role, 'create') && (
          <div className="page-actions"><Link className="btn btn-primary" to="/kyc/customers/new">+ New application</Link></div>
        )}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder="Search code, name, business, mobile, NID, trade license…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {state.customerTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <select value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">All divisions</option>
            {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <EmptyState>No customers match these filters.</EmptyState> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Code</th><th>Business</th><th>Type</th><th>Location</th><th>Status</th><th>Completeness</th><th>Risk</th><th>Credit</th><th>Updated</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const pct = completeness(c, cfg(c));
                  return (
                    <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                      <td className="mono">{c.code || <span className="muted">draft</span>}</td>
                      <td><div className="strong">{c.businessName || '(untitled)'}</div><div className="small muted">{c.name} · {c.mobile}</div></td>
                      <td>{cfg(c)?.name}</td>
                      <td>{c.district ? `${c.district}, ${c.division}` : c.division}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 8 }}><Progress value={pct} /><span className="small muted">{pct}%</span></div></td>
                      <td><RiskBadge category={c.risk.category} /></td>
                      <td><CreditBadge status={c.credit.status} /></td>
                      <td className="muted small nowrap">{fmtDate(c.updatedAt)}</td>
                      <td><RowMenu items={rowActions(c)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {action?.kind === 'credit-request' && <CreditRequestModal customer={action.customer} onClose={() => setAction(null)} />}
      {action?.kind === 'credit-decide' && <CreditDecisionModal customer={action.customer} onClose={() => setAction(null)} />}
      {action?.kind === 'review' && <ReviewModal entity={action.customer} portal="kyc" typeCfg={cfg(action.customer)} onClose={() => setAction(null)} />}
    </div>
  );
}

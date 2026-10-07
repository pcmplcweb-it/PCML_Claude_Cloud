import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EmptyState, Progress, RiskBadge, StatusBadge, TermsBadge } from '../../components/ui';
import { COUNTRIES, SUPPLIER_STATUS, SUPPLY_CATEGORIES, TERMS_STATUS, canKys } from '../../kys/config';
import { ReviewModal, RowMenu, TermsDecisionModal, TermsRequestModal } from '../../components/quickActions';
import { supplierCompleteness } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate } from '../../utils/helpers';

const S = SUPPLIER_STATUS;
const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending (Submitted / Evaluation / Approval)' },
  { value: 'incomplete', label: 'Incomplete (Draft / Returned)' },
  { value: 'closed', label: 'Rejected / Blacklisted (last 90 days)' },
  ...Object.values(S).map((s) => ({ value: s, label: s })),
];
const isRecent = (iso) => new Date(iso).getTime() >= Date.now() - 90 * 86400000;

export default function SupplierList() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [action, setAction] = useState(null); // { kind: 'terms-request' | 'terms-decide' | 'review', supplier }
  const status = params.get('status') || '';
  const role = currentUser.role;

  // Quick actions available on a row, with the same role and status rules as the detail page.
  const rowActions = (s) => [
    { label: 'Open record', onClick: () => nav(`/kys/suppliers/${s.id}`) },
    [S.DRAFT, S.RETURNED].includes(s.status) && canKys(role, 'edit') && { label: 'Edit application', onClick: () => nav(`/kys/suppliers/${s.id}/edit`) },
    canKys(role, 'termsRequest') && [TERMS_STATUS.NONE, TERMS_STATUS.DECLINED].includes(s.terms.status) && ![S.REJECTED, S.BLACKLISTED].includes(s.status) && { label: 'Request commercial terms', onClick: () => setAction({ kind: 'terms-request', supplier: s }) },
    canKys(role, 'termsDecide') && [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW].includes(s.terms.status) && {
      label: 'Decide commercial terms', disabled: s.status !== S.ACTIVE, hint: s.status !== S.ACTIVE ? 'supplier not active' : undefined, onClick: () => setAction({ kind: 'terms-decide', supplier: s }),
    },
    canKys(role, 'review') && s.status === S.ACTIVE && { label: 'Periodic review', hint: s.reviewDue ? `due ${fmtDate(s.reviewDue)}` : undefined, onClick: () => setAction({ kind: 'review', supplier: s }) },
  ];
  const cfg = (s) => state.supplierTypes.find((t) => t.code === s.supplierType);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.suppliers
      .filter((s) => {
        if (status === 'pending') return [S.SUBMITTED, S.EVALUATION, S.APPROVAL].includes(s.status);
        if (status === 'incomplete') return [S.DRAFT, S.RETURNED].includes(s.status);
        if (status === 'closed') return [S.REJECTED, S.BLACKLISTED].includes(s.status) && isRecent(s.updatedAt); // same 90-day window as the dashboard tile
        return !status || s.status === status;
      })
      .filter((s) => !type || s.supplierType === type)
      .filter((s) => !category || s.capability.categories.includes(category))
      .filter((s) => !country || s.country === country)
      .filter((s) => !needle || [s.code, s.name, s.tradeName, s.contactName, s.mobile, s.email, s.registration.tradeLicenseNo, s.city,
        ...(canKys(currentUser.role, 'viewSensitive') ? [s.registration.tin, s.registration.bin] : [])]
        .some((v) => (v || '').toLowerCase().includes(needle)))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [state.suppliers, q, type, category, country, status, currentUser.role]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Suppliers</h1><p className="sub">{rows.length} of {state.suppliers.length} records</p></div>
        {canKys(currentUser.role, 'create') && <div className="page-actions"><Link className="btn btn-primary" to="/kys/suppliers/new">+ New supplier application</Link></div>}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder="Search code, name, contact, mobile, email, trade license…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={status} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}>{STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{state.supplierTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
          <select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{SUPPLY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">All countries</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        {rows.length === 0 ? <EmptyState>No suppliers match these filters.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Supplier</th><th>Type</th><th>Categories</th><th>Country</th><th>Status</th><th>Completeness</th><th>Risk</th><th>Terms</th><th>Updated</th><th></th></tr></thead>
            <tbody>{rows.map((s) => {
              const pct = supplierCompleteness(s, cfg(s));
              return (
                <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                  <td className="mono">{s.code || <span className="muted">draft</span>}</td>
                  <td><div className="strong">{s.name || '(untitled)'}</div><div className="small muted">{s.contactName}{s.contactName && s.mobile ? ' · ' : ''}{s.mobile}</div></td>
                  <td>{cfg(s)?.name}</td>
                  <td className="small">{s.capability.categories.slice(0, 2).join(', ')}{s.capability.categories.length > 2 ? ` +${s.capability.categories.length - 2}` : ''}</td>
                  <td>{s.country}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td style={{ minWidth: 120 }}><div className="row" style={{ gap: 8 }}><Progress value={pct} /><span className="small muted">{pct}%</span></div></td>
                  <td><RiskBadge category={s.risk.category} /></td>
                  <td><TermsBadge status={s.terms.status} /></td>
                  <td className="muted small nowrap">{fmtDate(s.updatedAt)}</td>
                  <td><RowMenu items={rowActions(s)} /></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </div>

      {action?.kind === 'terms-request' && <TermsRequestModal supplier={action.supplier} onClose={() => setAction(null)} />}
      {action?.kind === 'terms-decide' && <TermsDecisionModal supplier={action.supplier} onClose={() => setAction(null)} />}
      {action?.kind === 'review' && <ReviewModal entity={action.supplier} portal="kys" typeCfg={cfg(action.supplier)} onClose={() => setAction(null)} />}
    </div>
  );
}

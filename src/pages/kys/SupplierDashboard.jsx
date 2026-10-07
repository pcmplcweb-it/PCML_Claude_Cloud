import { Link, useNavigate } from 'react-router-dom';
import { Card, EmptyState, StatusBadge } from '../../components/ui';
import { SUPPLIER_STATUS, TERMS_STATUS, canKys } from '../../kys/config';
import { expiringSupplierDocuments, supplierCompleteness, supplierReviewsDue } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate, fmtDateTime, fmtMoney } from '../../utils/helpers';

export default function SupplierDashboard() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const { suppliers, supplierTypes } = state;
  const audit = state.audit.filter((a) => a.portal === 'kys');
  const cfg = (s) => supplierTypes.find((t) => t.code === s.supplierType);
  const S = SUPPLIER_STATUS;

  const pending = suppliers.filter((s) => [S.SUBMITTED, S.EVALUATION, S.APPROVAL].includes(s.status));
  const incomplete = suppliers.filter((s) => [S.DRAFT, S.RETURNED].includes(s.status) && supplierCompleteness(s, cfg(s)) < 100);
  const ninetyDaysAgo = Date.now() - 90 * 86400000;
  const closed = suppliers.filter((s) => [S.REJECTED, S.BLACKLISTED].includes(s.status) && new Date(s.updatedAt).getTime() >= ninetyDaysAgo);
  const active = suppliers.filter((s) => s.status === S.ACTIVE);
  const expiring = expiringSupplierDocuments(suppliers, 60);
  const reviews = supplierReviewsDue(suppliers);
  const termsQueue = suppliers.filter((s) => [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW].includes(s.terms.status));

  const myQueue = (() => {
    const r = currentUser.role;
    const wanted = [
      ...(canKys(r, 'evaluate') ? [S.SUBMITTED, S.EVALUATION] : []),
      ...(canKys(r, 'approve') ? [S.APPROVAL] : []),
    ];
    if (wanted.length) return suppliers.filter((s) => wanted.includes(s.status));
    if (canKys(r, 'termsDecide')) return termsQueue;
    return suppliers.filter((s) => [S.DRAFT, S.RETURNED].includes(s.status));
  })();

  const tiles = [
    { label: 'Pending applications', value: pending.length, hint: 'Submitted, in evaluation or awaiting approval', tone: 'blue', to: '/kys/suppliers?status=pending' },
    { label: 'Incomplete records', value: incomplete.length, hint: 'Drafts and returned applications', tone: 'amber', to: '/kys/suppliers?status=incomplete' },
    { label: 'Rejected / blacklisted', value: closed.length, hint: 'In the last 90 days', tone: 'red', to: '/kys/suppliers?status=closed' },
    { label: 'Expiring documents', value: expiring.length, hint: 'Licences and certifications within 60 days or expired', tone: 'amber', to: '/kys/reviews' },
    { label: 'Reviews due', value: reviews.length, hint: 'Periodic supplier reviews due within 30 days', tone: 'red', to: '/kys/reviews' },
    { label: 'Approved suppliers', value: active.length, hint: 'Qualified and active', tone: 'green', to: `/kys/suppliers?status=${encodeURIComponent(S.ACTIVE)}` },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Welcome, {currentUser.name.split(' ')[0]}</h1>
          <p className="sub">Supplier qualification status across {supplierTypes.map((t) => t.name.toLowerCase()).join(', ')} suppliers.</p>
        </div>
        {canKys(currentUser.role, 'create') && <div className="page-actions"><Link className="btn btn-primary" to="/kys/suppliers/new">+ New supplier application</Link></div>}
      </div>

      <div className="grid grid-3">
        {tiles.map((t) => (
          <div key={t.label} className={`card stat tone-${t.tone}`} onClick={() => nav(t.to)} role="button" tabIndex={0}>
            <span className="stat-label">{t.label}</span>
            <span className="stat-value">{t.value}</span>
            <span className="stat-hint">{t.hint}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-2">
        <Card title={`My queue · ${currentUser.role}`} actions={<Link className="btn btn-sm" to="/kys/suppliers">All suppliers</Link>}>
          {myQueue.length === 0 ? <EmptyState>Nothing waiting for you right now.</EmptyState> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Supplier</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>{myQueue.slice(0, 8).map((s) => (
                <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                  <td><div className="strong">{s.name || '(untitled)'}</div><div className="small muted">{s.code || 'Draft'} · {s.contactName}</div></td>
                  <td>{cfg(s)?.name}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td className="muted small nowrap">{fmtDate(s.updatedAt)}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>

        <Card title="Alerts">
          {expiring.length === 0 && reviews.length === 0 ? <EmptyState>No expiring documents or overdue reviews.</EmptyState> : (
            <div className="stack" style={{ gap: 8 }}>
              {reviews.slice(0, 4).map(({ supplier, days }) => (
                <div key={`r-${supplier.id}`} className="alert alert-warn">
                  <Link to={`/kys/suppliers/${supplier.id}`}><b>{supplier.name}</b></Link> periodic review {days < 0 ? `overdue by ${-days} days` : `due in ${days} days`} ({fmtDate(supplier.reviewDue)}).
                </div>
              ))}
              {expiring.slice(0, 4).map(({ supplier, doc, days }) => (
                <div key={`e-${doc.id}`} className={`alert ${days < 0 ? 'alert-danger' : 'alert-warn'}`}>
                  <Link to={`/kys/suppliers/${supplier.id}`}><b>{supplier.name}</b></Link>: {doc.type} {days < 0 ? `expired ${-days} days ago` : `expires in ${days} days`} ({fmtDate(doc.expiry)}).
                </div>
              ))}
              {(expiring.length > 4 || reviews.length > 4) && <Link to="/kys/reviews" className="small">View all alerts →</Link>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Commercial terms awaiting decision" actions={<Link className="btn btn-sm" to="/kys/terms">Open queue</Link>}>
          {termsQueue.length === 0 ? <EmptyState>No pending terms requests.</EmptyState> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Supplier</th><th>KYS</th><th>Terms</th><th className="right">Annual cap</th></tr></thead>
              <tbody>{termsQueue.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                  <td className="strong">{s.name}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>{s.terms.requestedPaymentTerms}</td>
                  <td className="right mono">{fmtMoney(s.terms.annualCap)}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>

        <Card title="Recent activity" actions={canKys(currentUser.role, 'audit') && <Link className="btn btn-sm" to="/kys/audit">Full audit trail</Link>}>
          <ul className="timeline">
            {audit.slice(0, 7).map((a) => (
              <li key={a.id}>
                <span className="when">{fmtDateTime(a.at)}</span>
                <span><b>{a.action}</b> · <Link to={`/kys/suppliers/${a.customerId}`}>{a.businessName}</Link> <span className="muted">by {a.by}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { Card, EmptyState, StatusBadge } from '../components/ui';
import { CREDIT_STATUS, STATUS, can } from '../data/config';
import { useStore } from '../store/StoreContext';
import { completeness, expiringDocuments, fmtDate, fmtDateTime, overdueReviews } from '../utils/helpers';

export default function Dashboard() {
  const { state, currentUser } = useStore();
  const nav = useNavigate();
  const { customers, audit, customerTypes } = state;
  const cfg = (c) => customerTypes.find((t) => t.code === c.customerType);

  const pending = customers.filter((c) => [STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status));
  const incomplete = customers.filter((c) => [STATUS.DRAFT, STATUS.RETURNED].includes(c.status) && completeness(c, cfg(c)) < 100);
  const ninetyDaysAgo = Date.now() - 90 * 86400000;
  const rejected = customers.filter((c) => c.status === STATUS.REJECTED && new Date(c.updatedAt).getTime() >= ninetyDaysAgo);
  const active = customers.filter((c) => c.status === STATUS.ACTIVE);
  const expiring = expiringDocuments(customers, 60);
  const reviews = overdueReviews(customers);
  const creditQueue = customers.filter((c) => [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW].includes(c.credit.status));

  const myQueue = (() => {
    const r = currentUser.role;
    // A role with both verify and approve rights (Administrator) sees the union of both queues.
    const wanted = [
      ...(can(r, 'verify') ? [STATUS.SUBMITTED, STATUS.VERIFICATION] : []),
      ...(can(r, 'approve') ? [STATUS.APPROVAL] : []),
    ];
    if (wanted.length) return customers.filter((c) => wanted.includes(c.status));
    if (can(r, 'creditDecide')) return creditQueue;
    return customers.filter((c) => [STATUS.DRAFT, STATUS.RETURNED].includes(c.status));
  })();

  const tiles = [
    { label: 'Pending applications', value: pending.length, hint: 'Submitted, in verification or awaiting approval', tone: 'blue', to: '/kyc/customers?status=pending' },
    { label: 'Incomplete records', value: incomplete.length, hint: 'Drafts and returned applications', tone: 'amber', to: '/kyc/customers?status=incomplete' },
    { label: 'Rejected cases', value: rejected.length, hint: 'Rejected in the last 90 days (list shows all)', tone: 'red', to: `/kyc/customers?status=${encodeURIComponent(STATUS.REJECTED)}` },
    { label: 'Expiring documents', value: expiring.length, hint: 'Within 60 days or already expired', tone: 'amber', to: '/kyc/reviews' },
    { label: 'Reviews due', value: reviews.length, hint: 'Periodic KYC reviews due within 30 days', tone: 'red', to: '/kyc/reviews' },
    { label: 'Active customers', value: active.length, hint: 'Fully verified and approved', tone: 'green', to: `/kyc/customers?status=${encodeURIComponent(STATUS.ACTIVE)}` },
  ];

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Welcome, {currentUser.name.split(' ')[0]}</h1>
          <p className="sub">KYC status across {customerTypes.map((t) => t.name.toLowerCase()).join(', ')} customers.</p>
        </div>
        {can(currentUser.role, 'create') && (
          <div className="page-actions">
            <Link className="btn btn-primary" to="/kyc/customers/new">+ New application</Link>
          </div>
        )}
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
        <Card title={`My queue · ${currentUser.role}`} actions={<Link className="btn btn-sm" to="/kyc/customers">All customers</Link>}>
          {myQueue.length === 0 ? (
            <EmptyState>Nothing waiting for you right now.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Updated</th></tr></thead>
                <tbody>
                  {myQueue.slice(0, 8).map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                      <td><div className="strong">{c.businessName || '(untitled)'}</div><div className="small muted">{c.code || 'Draft'} · {c.name}</div></td>
                      <td>{cfg(c)?.name}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td className="muted small nowrap">{fmtDate(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Alerts">
          {expiring.length === 0 && reviews.length === 0 ? (
            <EmptyState>No expiring documents or overdue reviews.</EmptyState>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {reviews.slice(0, 4).map(({ customer, days }) => (
                <div key={`r-${customer.id}`} className="alert alert-warn">
                  <Link to={`/kyc/customers/${customer.id}`}><b>{customer.businessName}</b></Link> periodic review {days < 0 ? `overdue by ${-days} days` : `due in ${days} days`} ({fmtDate(customer.reviewDue)}).
                </div>
              ))}
              {expiring.slice(0, 4).map(({ customer, doc, days }) => (
                <div key={`e-${doc.id}`} className={`alert ${days < 0 ? 'alert-danger' : 'alert-warn'}`}>
                  <Link to={`/kyc/customers/${customer.id}`}><b>{customer.businessName}</b></Link>: {doc.type} {days < 0 ? `expired ${-days} days ago` : `expires in ${days} days`} ({fmtDate(doc.expiry)}).
                </div>
              ))}
              {(expiring.length > 4 || reviews.length > 4) && <Link to="/kyc/reviews" className="small">View all alerts →</Link>}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Credit requests awaiting decision" actions={<Link className="btn btn-sm" to="/kyc/credit">Open queue</Link>}>
          {creditQueue.length === 0 ? <EmptyState>No pending credit requests.</EmptyState> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Customer</th><th>KYC</th><th className="right">Requested</th><th>Terms</th></tr></thead>
              <tbody>{creditQueue.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                  <td className="strong">{c.businessName}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td className="right mono">{Number(c.credit.requestedLimit).toLocaleString()}</td>
                  <td>{c.credit.paymentTerms}{c.credit.requestedCreditDays != null ? ` · ${c.credit.requestedCreditDays} days` : ''}</td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </Card>

        <Card title="Recent activity" actions={can(currentUser.role, 'audit') && <Link className="btn btn-sm" to="/kyc/audit">Full audit trail</Link>}>
          <ul className="timeline">
            {audit.filter((a) => (a.portal || 'kyc') === 'kyc').slice(0, 7).map((a) => (
              <li key={a.id}>
                <span className="when">{fmtDateTime(a.at)}</span>
                <span><b>{a.action}</b> · <Link to={`/kyc/customers/${a.customerId}`}>{a.businessName}</Link> <span className="muted">by {a.by}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

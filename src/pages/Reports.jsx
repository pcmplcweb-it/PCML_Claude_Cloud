import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, RiskBadge, StatusBadge } from '../components/ui';
import { DIVISIONS, RISK, STATUS, STATUS_COLORS } from '../data/config';
import { useStore } from '../store/StoreContext';
import { completeness, expiringDocuments, fmtDate, overdueReviews } from '../utils/helpers';

const TONE = { gray: '#5b6675', blue: '#2a62c7', indigo: '#4b4fc4', purple: '#7a3fb3', green: '#1e7e4b', amber: '#b26a00', red: '#c62828' };

const BarList = ({ rows, color }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <div className="bar"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color || color || 'var(--primary)' }} /></div>
          <span className="right mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

const toCsv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

export default function Reports() {
  const { state } = useStore();
  const nav = useNavigate();
  const { customers, customerTypes } = state;
  const cfg = (c) => customerTypes.find((t) => t.code === c.customerType);

  const byStatus = Object.values(STATUS).map((s) => ({ label: s, value: customers.filter((c) => c.status === s).length, color: TONE[STATUS_COLORS[s]] }));
  const byType = customerTypes.map((t) => ({ label: t.name, value: customers.filter((c) => c.customerType === t.code).length }));
  const byDivision = DIVISIONS.map((d) => ({ label: d, value: customers.filter((c) => c.division === d).length })).filter((r) => r.value > 0);
  const byRisk = [RISK.LOW, RISK.MEDIUM, RISK.HIGH].map((r) => ({ label: r, value: customers.filter((c) => c.risk.category === r).length, color: r === RISK.HIGH ? TONE.red : r === RISK.MEDIUM ? TONE.amber : TONE.green }))
    .concat([{ label: 'Not assessed', value: customers.filter((c) => !c.risk.category).length, color: TONE.gray }]);

  const incomplete = customers.filter((c) => [STATUS.DRAFT, STATUS.RETURNED].includes(c.status)).map((c) => ({ c, pct: completeness(c, cfg(c)) })).sort((a, b) => a.pct - b.pct);
  const rejected = customers.filter((c) => c.status === STATUS.REJECTED);
  const expiring = expiringDocuments(customers, 90);
  const reviews = overdueReviews(customers);

  const activeDays = customers.filter((c) => c.status === STATUS.ACTIVE).map((c) => {
    const created = state.audit.filter((a) => a.customerId === c.id && a.action === 'Created').map((a) => new Date(a.at)).sort((a, b) => a - b)[0];
    const approved = state.audit.filter((a) => a.customerId === c.id && a.action === 'Approved').map((a) => new Date(a.at)).sort((a, b) => b - a)[0];
    return created && approved ? (approved - created) / 86400000 : null;
  }).filter((d) => d != null);
  const avgTurnaround = activeDays.length ? (activeDays.reduce((s, d) => s + d, 0) / activeDays.length).toFixed(1) : '—';

  const exportCsv = () => {
    const rows = [['Code', 'Business', 'Owner', 'Type', 'Division', 'District', 'Mobile', 'Status', 'Risk', 'Credit status', 'Approved limit', 'Terms', 'Approved credit days', 'Review due', 'Completeness %', 'Updated']];
    customers.forEach((c) => rows.push([c.code, c.businessName, c.name, cfg(c)?.name, c.division, c.district, c.mobile, c.status, c.risk.category, c.credit.status, c.credit.approvedLimit, c.credit.paymentTerms, c.credit.approvedCreditDays, c.reviewDue, completeness(c, cfg(c)), c.updatedAt]));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `kyc_customers_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Reports</h1><p className="sub">Snapshot of the KYC portfolio as of today.</p></div>
        <div className="page-actions"><button className="btn" onClick={() => window.print()}>Print</button><button className="btn btn-primary" onClick={exportCsv}>Export CSV</button></div>
      </div>

      <div className="grid grid-4">
        <div className="card stat"><span className="stat-label">Total customers</span><span className="stat-value">{customers.length}</span></div>
        <div className="card stat tone-green"><span className="stat-label">Active</span><span className="stat-value">{customers.filter((c) => c.status === STATUS.ACTIVE).length}</span></div>
        <div className="card stat tone-blue"><span className="stat-label">Avg. onboarding time</span><span className="stat-value">{avgTurnaround}<span style={{ fontSize: 14, fontWeight: 500 }}> days</span></span><span className="stat-hint">creation to activation</span></div>
        <div className="card stat tone-red"><span className="stat-label">Rejection rate</span><span className="stat-value">{customers.length ? Math.round((rejected.length / customers.length) * 100) : 0}%</span></div>
      </div>

      <div className="grid grid-2">
        <Card title="Applications by status"><BarList rows={byStatus} /></Card>
        <Card title="Risk distribution"><BarList rows={byRisk} /></Card>
        <Card title="Customers by type"><BarList rows={byType} /></Card>
        <Card title="Customers by division"><BarList rows={byDivision} color="var(--indigo)" /></Card>
      </div>

      <Card title={`Incomplete records (${incomplete.length})`}>
        {incomplete.length === 0 ? <EmptyState>None.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Status</th><th>Completeness</th><th>Created by</th><th>Updated</th></tr></thead>
            <tbody>{incomplete.map(({ c, pct }) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                <td className="strong">{c.businessName || '(untitled)'}</td><td><StatusBadge status={c.status} /></td><td>{pct}%</td><td>{c.createdBy}</td><td>{fmtDate(c.updatedAt)}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title={`Rejected cases (${rejected.length})`}>
          {rejected.length === 0 ? <EmptyState>None.</EmptyState> : rejected.map((c) => (
            <div key={c.id} className="doc-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/kyc/customers/${c.id}`)}>
              <div style={{ flex: 1 }}><div className="strong">{c.businessName} <span className="muted small">{c.code}</span></div><div className="small muted">{c.statusReason}</div></div>
              <RiskBadge category={c.risk.category} />
            </div>
          ))}
        </Card>
        <Card title={`Expiring documents, 90 days (${expiring.length}) · Reviews due or overdue (${reviews.length})`}>
          {expiring.length === 0 && reviews.length === 0 ? <EmptyState>Nothing due.</EmptyState> : (
            <ul className="timeline">
              {reviews.map(({ customer, days }) => <li key={`r${customer.id}`}><span className="when">{fmtDate(customer.reviewDue)}</span><span>Review · <b>{customer.businessName}</b> <span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? 'overdue' : `${days}d`}</span></span></li>)}
              {expiring.map(({ customer, doc, days }) => <li key={doc.id}><span className="when">{fmtDate(doc.expiry)}</span><span>{doc.type} · <b>{customer.businessName}</b> <span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? 'expired' : `${days}d`}</span></span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, RiskBadge, StatusBadge } from '../../components/ui';
import { RISK } from '../../data/config';
import { COUNTRIES, SUPPLIER_STATUS, SUPPLIER_STATUS_COLORS, SUPPLY_CATEGORIES } from '../../kys/config';
import { expiringSupplierDocuments, supplierCompleteness, supplierReviewsDue } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate } from '../../utils/helpers';

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

export default function SupplierReports() {
  const { state } = useStore();
  const nav = useNavigate();
  const { suppliers, supplierTypes } = state;
  const S = SUPPLIER_STATUS;
  const cfg = (s) => supplierTypes.find((t) => t.code === s.supplierType);

  const byStatus = Object.values(S).map((st) => ({ label: st, value: suppliers.filter((s) => s.status === st).length, color: TONE[SUPPLIER_STATUS_COLORS[st]] }));
  const byType = supplierTypes.map((t) => ({ label: t.name, value: suppliers.filter((s) => s.supplierType === t.code).length }));
  const byCategory = SUPPLY_CATEGORIES.map((c) => ({ label: c, value: suppliers.filter((s) => s.capability.categories.includes(c)).length })).filter((r) => r.value > 0);
  const byCountry = COUNTRIES.map((c) => ({ label: c, value: suppliers.filter((s) => s.country === c).length })).filter((r) => r.value > 0);
  const byRisk = [RISK.LOW, RISK.MEDIUM, RISK.HIGH].map((r) => ({ label: r, value: suppliers.filter((s) => s.risk.category === r).length, color: r === RISK.HIGH ? TONE.red : r === RISK.MEDIUM ? TONE.amber : TONE.green }))
    .concat([{ label: 'Not assessed', value: suppliers.filter((s) => !s.risk.category).length, color: TONE.gray }]);

  const incomplete = suppliers.filter((s) => [S.DRAFT, S.RETURNED].includes(s.status)).map((s) => ({ s, pct: supplierCompleteness(s, cfg(s)) })).sort((a, b) => a.pct - b.pct);
  const closed = suppliers.filter((s) => [S.REJECTED, S.BLACKLISTED].includes(s.status));
  const expiring = expiringSupplierDocuments(suppliers, 90);
  const reviews = supplierReviewsDue(suppliers);
  const audited = suppliers.filter((s) => s.siteAudit.done && s.siteAudit.score);
  const avgAudit = audited.length ? Math.round(audited.reduce((a, s) => a + Number(s.siteAudit.score), 0) / audited.length) : '—';

  const exportCsv = () => {
    const rows = [['Code', 'Supplier', 'Type', 'Country', 'Categories', 'Contact', 'Mobile', 'Email', 'Status', 'Risk', 'Audit score', 'Terms status', 'Payment terms', 'Annual cap', 'Review due', 'Completeness %', 'Updated']];
    suppliers.forEach((s) => rows.push([s.code, s.name, cfg(s)?.name, s.country, s.capability.categories.join('; '), s.contactName, s.mobile, s.email, s.status, s.risk.category, s.siteAudit.score, s.terms.status, s.terms.approvedPaymentTerms, s.terms.approvedCap, s.reviewDue, supplierCompleteness(s, cfg(s)), s.updatedAt]));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `kys_suppliers_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Reports</h1><p className="sub">Snapshot of the supplier base as of today.</p></div>
        <div className="page-actions"><button className="btn" onClick={() => window.print()}>Print</button><button className="btn btn-primary" onClick={exportCsv}>Export CSV</button></div>
      </div>

      <div className="grid grid-4">
        <div className="card stat"><span className="stat-label">Total suppliers</span><span className="stat-value">{suppliers.length}</span></div>
        <div className="card stat tone-green"><span className="stat-label">Approved</span><span className="stat-value">{suppliers.filter((s) => s.status === S.ACTIVE).length}</span></div>
        <div className="card stat tone-blue"><span className="stat-label">Avg. site audit score</span><span className="stat-value">{avgAudit}</span><span className="stat-hint">{audited.length} audited</span></div>
        <div className="card stat tone-red"><span className="stat-label">Rejected / blacklisted</span><span className="stat-value">{closed.length}</span></div>
      </div>

      <div className="grid grid-2">
        <Card title="Applications by status"><BarList rows={byStatus} /></Card>
        <Card title="Risk distribution"><BarList rows={byRisk} /></Card>
        <Card title="Suppliers by type"><BarList rows={byType} /></Card>
        <Card title="Suppliers by category"><BarList rows={byCategory} color="var(--indigo)" /></Card>
        <Card title="Suppliers by country"><BarList rows={byCountry} color="var(--purple)" /></Card>
        <Card title={`Rejected & blacklisted (${closed.length})`}>
          {closed.length === 0 ? <EmptyState>None.</EmptyState> : closed.map((s) => (
            <div key={s.id} className="doc-item" style={{ cursor: 'pointer' }} onClick={() => nav(`/kys/suppliers/${s.id}`)}>
              <div style={{ flex: 1 }}><div className="strong">{s.name} <span className="muted small">{s.code}</span> <StatusBadge status={s.status} /></div><div className="small muted">{s.statusReason}</div></div>
              <RiskBadge category={s.risk.category} />
            </div>
          ))}
        </Card>
      </div>

      <Card title={`Incomplete records (${incomplete.length})`}>
        {incomplete.length === 0 ? <EmptyState>None.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Supplier</th><th>Status</th><th>Completeness</th><th>Created by</th><th>Updated</th></tr></thead>
            <tbody>{incomplete.map(({ s, pct }) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                <td className="strong">{s.name || '(untitled)'}</td><td><StatusBadge status={s.status} /></td><td>{pct}%</td><td>{s.createdBy}</td><td>{fmtDate(s.updatedAt)}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Expiring items, 90 days (${expiring.length}) · Reviews due or overdue (${reviews.length})`}>
        {expiring.length === 0 && reviews.length === 0 ? <EmptyState>Nothing due.</EmptyState> : (
          <ul className="timeline">
            {reviews.map(({ supplier, days }) => <li key={`r${supplier.id}`}><span className="when">{fmtDate(supplier.reviewDue)}</span><span>Review · <b>{supplier.name}</b> <span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? 'overdue' : `${days}d`}</span></span></li>)}
            {expiring.map(({ supplier, doc, days }) => <li key={`${supplier.id}-${doc.id}`}><span className="when">{fmtDate(doc.expiry)}</span><span>{doc.type} · <b>{supplier.name}</b> <span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? 'expired' : `${days}d`}</span></span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

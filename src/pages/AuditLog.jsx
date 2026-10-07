import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';
import { useStore } from '../store/StoreContext';
import { fmtDateTime } from '../utils/helpers';

export default function AuditLog({ portal = 'kyc' }) {
  const { state } = useStore();
  const base = { kyc: '/kyc/customers', kys: '/kys/suppliers', hr: '/hr/employees' }[portal];
  const entityLabel = { kyc: 'Customer', kys: 'Supplier', hr: 'Employee' }[portal];
  const entries = useMemo(() => state.audit.filter((a) => (a.portal || 'kyc') === portal), [state.audit, portal]);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const actions = useMemo(() => [...new Set(entries.map((a) => a.action))].sort(), [entries]);
  // Users come from the entries themselves so seeded names that are not switchable users still appear.
  const users = useMemo(() => [...new Set(entries.map((a) => a.by))].sort(), [entries]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries
      .filter((a) => !action || a.action === action)
      .filter((a) => !user || a.by === user)
      .filter((a) => !needle || [a.customerCode, a.businessName, a.detail, a.by, a.refCode].some((v) => (v || '').toLowerCase().includes(needle)));
  }, [entries, q, action, user]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Audit trail</h1><p className="sub">Every create, change, verification, approval and rejection, with who and when. {rows.length} of {entries.length} entries.</p></div>
      </div>
      <div className="card">
        <div className="table-toolbar">
          <input className="search" placeholder={`Search ${entityLabel.toLowerCase()}, reference, detail, user…`} value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{actions.map((a) => <option key={a}>{a}</option>)}</select>
          <select value={user} onChange={(e) => setUser(e.target.value)}><option value="">All users</option>{users.map((u) => <option key={u}>{u}</option>)}</select>
        </div>
        {rows.length === 0 ? <EmptyState>No entries match.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Timestamp</th><th>Action</th><th>{entityLabel}</th><th>By</th><th>Detail</th></tr></thead>
            <tbody>{rows.map((a) => (
              <tr key={a.id}>
                <td className="nowrap muted">{fmtDateTime(a.at)}</td>
                <td className="strong nowrap">{a.action}</td>
                <td>
                  {a.customerId === 'hr_system' ? <span>{a.businessName}</span> : <Link to={`${base}/${a.customerId}`}>{a.businessName || '(untitled)'}</Link>}
                  <div className="small muted mono">{a.customerCode}</div>
                  {a.refCode && <div className="small mono">{a.refCode}</div>}
                </td>
                <td className="nowrap">{a.by}</td>
                <td className="muted">{a.detail}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

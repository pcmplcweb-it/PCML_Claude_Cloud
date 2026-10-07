import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, Field, Modal, StatusBadge } from '../components/ui';
import { can } from '../data/config';
import { useStore } from '../store/StoreContext';
import { expiringDocuments, fmtDate, overdueReviews } from '../utils/helpers';

export default function Reviews() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const [window_, setWindow] = useState(60);
  const [reviewing, setReviewing] = useState(null);
  const [notes, setNotes] = useState('');
  const reviews = overdueReviews(state.customers);
  const expiring = expiringDocuments(state.customers, window_);
  const cfg = (c) => state.customerTypes.find((t) => t.code === c.customerType);

  const complete = () => {
    dispatch({ type: 'COMPLETE_REVIEW', id: reviewing.id, by: currentUser.name, detail: notes || 'Periodic review completed' });
    notify(`Review recorded for ${reviewing.businessName}.`);
    setReviewing(null); setNotes('');
  };

  const remind = (c, what) => {
    dispatch({ type: 'LOG', id: c.id, action: 'Reminder Sent', by: currentUser.name, detail: `${what} reminder sent to ${c.mobile}${c.email ? ` and ${c.email}` : ''}` });
    notify(`Reminder sent to ${c.businessName} (simulated).`, 'info');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Periodic reviews &amp; document expiry</h1>
          <p className="sub">Customers are re-reviewed every {state.customerTypes.map((t) => `${t.reviewMonths} months (${t.name})`).join(', ')}.</p>
        </div>
      </div>

      <Card title={`Reviews due or overdue (${reviews.length})`}>
        {reviews.length === 0 ? <EmptyState>No reviews due in the next 30 days.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Last reviewed</th><th>Due</th><th>Reviewer</th><th></th></tr></thead>
            <tbody>{reviews.map(({ customer: c, days }) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                <td><div className="strong">{c.businessName}</div><div className="small muted">{c.code}</div></td>
                <td>{cfg(c)?.name}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>{fmtDate(c.lastReviewed)}</td>
                <td><span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? `${-days} days overdue` : `in ${days} days`}</span><div className="small muted">{fmtDate(c.reviewDue)}</div></td>
                <td>{c.assignedReviewer || '—'}</td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {can(currentUser.role, 'review') ? (
                    <>
                      <button className="btn btn-sm" onClick={() => remind(c, 'Periodic review')}>Request update</button>{' '}
                      <button className="btn btn-sm btn-primary" onClick={() => setReviewing(c)}>Complete review</button>
                    </>
                  ) : <span className="small muted">Reviewer action</span>}
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Expiring documents (${expiring.length})`} actions={
        <select value={window_} onChange={(e) => setWindow(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={30}>Within 30 days</option><option value={60}>Within 60 days</option><option value={90}>Within 90 days</option><option value={365}>Within 1 year</option>
        </select>
      }>
        {expiring.length === 0 ? <EmptyState>No documents expiring in this window.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Status</th><th>Document</th><th>Version</th><th>Expiry</th><th></th></tr></thead>
            <tbody>{expiring.map(({ customer: c, doc, days }) => (
              <tr key={doc.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                <td><div className="strong">{c.businessName}</div><div className="small muted">{c.code || 'Draft'}</div></td>
                <td><StatusBadge status={c.status} /></td>
                <td>{doc.type}<div className="small muted">{doc.fileName}</div></td>
                <td>v{doc.version}</td>
                <td><span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? `expired ${-days} days ago` : `${days} days left`}</span><div className="small muted">{fmtDate(doc.expiry)}</div></td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {can(currentUser.role, 'review') && <><button className="btn btn-sm" onClick={() => remind(c, `${doc.type} renewal`)}>Send reminder</button>{' '}</>}
                  <button className="btn btn-sm btn-primary" onClick={() => nav(`/kyc/customers/${c.id}`)}>{can(currentUser.role, 'edit') ? 'Upload renewal' : 'Open'}</button>
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      {reviewing && (
        <Modal title={`Complete periodic review · ${reviewing.businessName}`} onClose={() => setReviewing(null)}
          footer={<><button className="btn" onClick={() => setReviewing(null)}>Cancel</button><button className="btn btn-primary" onClick={complete}>Mark reviewed</button></>}>
          <p>Confirm identity, business registration, contact details, location and bank details have been re-checked. The next review will be scheduled {cfg(reviewing)?.reviewMonths} months from today.</p>
          <Field label="Review notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

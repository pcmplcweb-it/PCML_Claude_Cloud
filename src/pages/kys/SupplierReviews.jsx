import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, Field, Modal, StatusBadge } from '../../components/ui';
import { canKys } from '../../kys/config';
import { expiringSupplierDocuments, supplierReviewsDue } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate } from '../../utils/helpers';

export default function SupplierReviews() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const [window_, setWindow] = useState(60);
  const [reviewing, setReviewing] = useState(null);
  const [notes, setNotes] = useState('');
  const reviews = supplierReviewsDue(state.suppliers);
  const expiring = expiringSupplierDocuments(state.suppliers, window_);
  const cfg = (s) => state.supplierTypes.find((t) => t.code === s.supplierType);
  const canReview = canKys(currentUser.role, 'review');

  const complete = () => {
    dispatch({ type: 'SUPPLIER_COMPLETE_REVIEW', id: reviewing.id, by: currentUser.name, detail: notes || 'Periodic supplier review completed' });
    notify(`Review recorded for ${reviewing.name}.`);
    setReviewing(null); setNotes('');
  };
  const remind = (s, what) => {
    dispatch({ type: 'SUPPLIER_LOG', id: s.id, action: 'Reminder Sent', by: currentUser.name, detail: `${what} reminder sent to ${s.email || s.mobile}` });
    notify(`Reminder sent to ${s.name} (simulated).`, 'info');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Periodic reviews &amp; document expiry</h1><p className="sub">Suppliers are re-reviewed every {state.supplierTypes.map((t) => `${t.reviewMonths} months (${t.name})`).join(', ')}.</p></div>
      </div>

      <Card title={`Reviews due or overdue (${reviews.length})`}>
        {reviews.length === 0 ? <EmptyState>No reviews due in the next 30 days.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Supplier</th><th>Type</th><th>Status</th><th>Last reviewed</th><th>Due</th><th>Evaluator</th><th></th></tr></thead>
            <tbody>{reviews.map(({ supplier: s, days }) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                <td><div className="strong">{s.name}</div><div className="small muted">{s.code}</div></td>
                <td>{cfg(s)?.name}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>{fmtDate(s.lastReviewed)}</td>
                <td><span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? `${-days} days overdue` : `in ${days} days`}</span><div className="small muted">{fmtDate(s.reviewDue)}</div></td>
                <td>{s.assignedEvaluator || '—'}</td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {canReview ? <><button className="btn btn-sm" onClick={() => remind(s, 'Periodic review')}>Request update</button>{' '}<button className="btn btn-sm btn-primary" onClick={() => setReviewing(s)}>Complete review</button></> : <span className="small muted">Evaluator action</span>}
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Expiring licences, certifications & documents (${expiring.length})`} actions={
        <select value={window_} onChange={(e) => setWindow(Number(e.target.value))} style={{ width: 'auto' }}>
          <option value={30}>Within 30 days</option><option value={60}>Within 60 days</option><option value={90}>Within 90 days</option><option value={365}>Within 1 year</option>
        </select>
      }>
        {expiring.length === 0 ? <EmptyState>Nothing expiring in this window.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Supplier</th><th>Status</th><th>Item</th><th>Expiry</th><th></th></tr></thead>
            <tbody>{expiring.map(({ supplier: s, doc, days }) => (
              <tr key={`${s.id}-${doc.id}`} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                <td><div className="strong">{s.name}</div><div className="small muted">{s.code || 'Draft'}</div></td>
                <td><StatusBadge status={s.status} /></td>
                <td>{doc.type}<div className="small muted">{doc.fileName}</div></td>
                <td><span className={`badge ${days < 0 ? 'badge-red' : 'badge-amber'}`}>{days < 0 ? `expired ${-days} days ago` : `${days} days left`}</span><div className="small muted">{fmtDate(doc.expiry)}</div></td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {canReview && <><button className="btn btn-sm" onClick={() => remind(s, `${doc.type} renewal`)}>Send reminder</button>{' '}</>}
                  <button className="btn btn-sm btn-primary" onClick={() => nav(`/kys/suppliers/${s.id}`)}>Open</button>
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      {reviewing && (
        <Modal title={`Complete periodic review · ${reviewing.name}`} onClose={() => setReviewing(null)}
          footer={<><button className="btn" onClick={() => setReviewing(null)}>Cancel</button><button className="btn btn-primary" onClick={complete}>Mark reviewed</button></>}>
          <p>Confirm registration, certifications, capability, financial standing, bank details and performance have been re-checked. The next review will be scheduled {cfg(reviewing)?.reviewMonths} months from today.</p>
          <Field label="Review notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

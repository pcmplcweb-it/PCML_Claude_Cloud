import { useNavigate } from 'react-router-dom';
import { Card, EmptyState, RiskBadge, StatusBadge, TermsBadge } from '../../components/ui';
import { SUPPLIER_STATUS, TERMS_STATUS, canKys } from '../../kys/config';
import { useStore } from '../../store/StoreContext';
import { fmtDate, fmtMoney } from '../../utils/helpers';

export default function TermsQueue() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const queue = state.suppliers.filter((s) => [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW].includes(s.terms.status));
  const approved = state.suppliers.filter((s) => s.terms.status === TERMS_STATUS.APPROVED && s.status === SUPPLIER_STATUS.ACTIVE);
  const declined = state.suppliers.filter((s) => s.terms.status === TERMS_STATUS.DECLINED);
  const totalCap = approved.reduce((a, s) => a + Number(s.terms.approvedCap || 0), 0);

  const startReview = (s) => {
    dispatch({ type: 'TERMS_DECISION', id: s.id, by: currentUser.name, terms: { status: TERMS_STATUS.UNDER_REVIEW }, detail: 'Commercial terms review started' });
    notify('Marked under review.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Commercial terms</h1><p className="sub">Payment terms, annual spend cap and supplier rating are approved by Finance once the supplier is Active.</p></div>
      </div>

      <div className="grid grid-4">
        <div className="card stat tone-blue"><span className="stat-label">Awaiting decision</span><span className="stat-value">{queue.length}</span><span className="stat-hint">{queue.filter((s) => s.status !== SUPPLIER_STATUS.ACTIVE).length} blocked on KYS</span></div>
        <div className="card stat tone-green"><span className="stat-label">Approved suppliers with terms</span><span className="stat-value">{approved.length}</span><span className="stat-hint">active commercial terms</span></div>
        <div className="card stat"><span className="stat-label">Total annual cap</span><span className="stat-value" style={{ fontSize: 20 }}>{fmtMoney(totalCap)}</span><span className="stat-hint">sum of approved caps</span></div>
        <div className="card stat tone-red"><span className="stat-label">Declined</span><span className="stat-value">{declined.length}</span><span className="stat-hint">may re-apply after review</span></div>
      </div>

      <Card title="Pending terms requests">
        {queue.length === 0 ? <EmptyState>No pending requests.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Supplier</th><th>KYS status</th><th>Risk</th><th>Requested terms</th><th className="right">Credit days offered</th><th className="right">Annual cap</th><th>Terms status</th><th></th></tr></thead>
            <tbody>{queue.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                <td><div className="strong">{s.name}</div><div className="small muted">{s.code} · {s.contactName}</div></td>
                <td><StatusBadge status={s.status} /></td>
                <td><RiskBadge category={s.risk.category} /></td>
                <td>{s.terms.requestedPaymentTerms}</td>
                <td className="right">{s.terms.creditDaysOffered || '—'}</td>
                <td className="right mono">{fmtMoney(s.terms.annualCap)}</td>
                <td><TermsBadge status={s.terms.status} /></td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {canKys(currentUser.role, 'termsDecide') && s.terms.status === TERMS_STATUS.REQUESTED && <button className="btn btn-sm" onClick={() => startReview(s)}>Start review</button>}
                  {' '}<button className="btn btn-sm btn-primary" onClick={() => nav(`/kys/suppliers/${s.id}`)}>{s.status === SUPPLIER_STATUS.ACTIVE ? 'Decide' : 'Open'}</button>
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="Approved commercial terms">
        {approved.length === 0 ? <EmptyState>No approved terms.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Supplier</th><th>Rating</th><th>Payment terms</th><th className="right">Annual cap</th><th>Decided by</th><th>Date</th><th>Note</th></tr></thead>
            <tbody>{approved.map((s) => (
              <tr key={s.id} className="clickable" onClick={() => nav(`/kys/suppliers/${s.id}`)}>
                <td><div className="strong">{s.name}</div><div className="small muted">{s.code}</div></td>
                <td>{s.terms.rating ? <span className="badge badge-green">{s.terms.rating}</span> : '—'}</td>
                <td>{s.terms.approvedPaymentTerms}</td>
                <td className="right mono strong">{fmtMoney(s.terms.approvedCap)}</td>
                <td>{s.terms.decisionBy}</td>
                <td className="nowrap">{fmtDate(s.terms.decisionAt)}</td>
                <td className="small muted">{s.terms.decisionNote}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

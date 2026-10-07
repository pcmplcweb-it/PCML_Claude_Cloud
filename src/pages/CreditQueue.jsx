import { useNavigate } from 'react-router-dom';
import { Card, CreditBadge, EmptyState, RiskBadge, StatusBadge } from '../components/ui';
import { CREDIT_STATUS, STATUS, can } from '../data/config';
import { useStore } from '../store/StoreContext';
import { fmtDate, fmtMoney } from '../utils/helpers';

export default function CreditQueue() {
  const { state, dispatch, currentUser, notify } = useStore();
  const nav = useNavigate();
  const queue = state.customers.filter((c) => [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW].includes(c.credit.status));
  // Only Active customers hold a live facility; suspended ones carry a Suspended credit status.
  const approved = state.customers.filter((c) => c.credit.status === CREDIT_STATUS.APPROVED && c.status === STATUS.ACTIVE);
  const declined = state.customers.filter((c) => c.credit.status === CREDIT_STATUS.DECLINED);
  const totalExposure = approved.reduce((s, c) => s + Number(c.credit.approvedLimit || 0), 0);

  const markUnderReview = (c) => {
    dispatch({ type: 'CREDIT_DECISION', id: c.id, by: currentUser.name, credit: { status: CREDIT_STATUS.UNDER_REVIEW }, detail: 'Credit review started' });
    notify('Marked under review.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Credit assessment</h1>
          <p className="sub">Credit decisions are separate from KYC approval and require an Active customer.</p>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="card stat tone-blue"><span className="stat-label">Awaiting decision</span><span className="stat-value">{queue.length}</span><span className="stat-hint">{queue.filter((c) => c.status !== STATUS.ACTIVE).length} blocked on KYC</span></div>
        <div className="card stat tone-green"><span className="stat-label">Approved facilities</span><span className="stat-value">{approved.length}</span><span className="stat-hint">customers with a limit</span></div>
        <div className="card stat"><span className="stat-label">Total approved limit</span><span className="stat-value" style={{ fontSize: 20 }}>{fmtMoney(totalExposure)}</span><span className="stat-hint">sum of approved limits</span></div>
        <div className="card stat tone-red"><span className="stat-label">Declined</span><span className="stat-value">{declined.length}</span><span className="stat-hint">may re-apply after KYC review</span></div>
      </div>

      <Card title="Pending credit requests">
        {queue.length === 0 ? <EmptyState>No pending requests.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>KYC status</th><th>Risk</th><th className="right">Requested</th><th>Terms</th><th className="right">Credit days</th><th>Credit status</th><th>References</th><th></th></tr></thead>
            <tbody>{queue.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                <td><div className="strong">{c.businessName}</div><div className="small muted">{c.code} · {c.name}</div></td>
                <td><StatusBadge status={c.status} /></td>
                <td><RiskBadge category={c.risk.category} /></td>
                <td className="right mono">{fmtMoney(c.credit.requestedLimit)}</td>
                <td>{c.credit.paymentTerms}</td>
                <td className="right">{c.credit.requestedCreditDays ?? '—'}</td>
                <td><CreditBadge status={c.credit.status} /></td>
                <td className="small muted" style={{ maxWidth: 240 }}>{c.credit.references || '—'}</td>
                <td className="nowrap" onClick={(e) => e.stopPropagation()}>
                  {can(currentUser.role, 'creditDecide') && c.credit.status === CREDIT_STATUS.REQUESTED && <button className="btn btn-sm" onClick={() => markUnderReview(c)}>Start review</button>}
                  {' '}<button className="btn btn-sm btn-primary" onClick={() => nav(`/kyc/customers/${c.id}`)}>{c.status === STATUS.ACTIVE ? 'Decide' : 'Open'}</button>
                </td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="Approved credit facilities">
        {approved.length === 0 ? <EmptyState>No approved facilities.</EmptyState> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Customer</th><th>KYC</th><th>Risk</th><th className="right">Approved limit</th><th>Terms</th><th className="right">Credit days</th><th>Decided by</th><th>Date</th><th>Note</th></tr></thead>
            <tbody>{approved.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => nav(`/kyc/customers/${c.id}`)}>
                <td><div className="strong">{c.businessName}</div><div className="small muted">{c.code}</div></td>
                <td><StatusBadge status={c.status} /></td>
                <td><RiskBadge category={c.risk.category} /></td>
                <td className="right mono strong">{fmtMoney(c.credit.approvedLimit)}</td>
                <td>{c.credit.paymentTerms}</td>
                <td className="right">{c.credit.approvedCreditDays === '' || c.credit.approvedCreditDays == null ? '—' : c.credit.approvedCreditDays}</td>
                <td>{c.credit.decisionBy}</td>
                <td className="nowrap">{fmtDate(c.credit.decisionAt)}</td>
                <td className="small muted">{c.credit.decisionNote}</td>
              </tr>))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

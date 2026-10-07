import { Link } from 'react-router-dom';
import { STATUS } from '../data/config';
import { ACTIVE_EMPLOYEE_STATUSES, APPRAISAL_OPEN, SETTLEMENT_OPEN } from '../hr/config';
import { SUPPLIER_STATUS } from '../kys/config';
import { useStore } from '../store/StoreContext';

export default function Portal() {
  const { state } = useStore();
  const kycPending = state.customers.filter((c) => [STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status)).length;
  const kysPending = state.suppliers.filter((s) => [SUPPLIER_STATUS.SUBMITTED, SUPPLIER_STATUS.EVALUATION, SUPPLIER_STATUS.APPROVAL].includes(s.status)).length;
  const active = state.employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)).length;
  const openAppraisals = state.appraisals.filter((a) => APPRAISAL_OPEN.includes(a.status)).length;
  const settlementsOpen = state.settlements.filter((s) => SETTLEMENT_OPEN.includes(s.status)).length;

  const cards = [
    {
      to: '/kyc',
      icon: '👥',
      title: 'KYC · Know Your Customer',
      text: 'Onboard and verify dealers, retailers and corporate customers. Identity, business, bank and reference checks, risk rating, credit approval and periodic review.',
      stats: [`${state.customers.length} customers`, `${kycPending} pending`, `${state.customers.filter((c) => c.status === STATUS.ACTIVE).length} active`],
      tone: 'var(--primary)',
    },
    {
      to: '/kys',
      icon: '🏭',
      title: 'KYS · Know Your Supplier',
      text: 'Qualify and monitor suppliers. Registration and compliance, capability and capacity, financial strength, site audit, references, risk rating, commercial-terms approval and periodic review.',
      stats: [`${state.suppliers.length} suppliers`, `${kysPending} pending`, `${state.suppliers.filter((s) => s.status === SUPPLIER_STATUS.ACTIVE).length} active`],
      tone: 'var(--success)',
    },
    {
      to: '/hr',
      icon: '🧑‍💼',
      title: 'HR · Know Your Employee',
      text: 'Employee master files, KPI-based appraisal cycles, leave and attendance, and Labour Act-compliant final settlement with clearance and approvals.',
      stats: [`${active} employees`, `${openAppraisals} appraisals open`, `${settlementsOpen} settlements open`],
      tone: 'var(--purple)',
    },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'linear-gradient(160deg, #122033 0%, #1f3550 100%)' }}>
      <div style={{ width: '100%', maxWidth: 1180 }}>
        <div style={{ textAlign: 'center', color: '#fff', marginBottom: 28 }}>
          <div style={{ fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8' }}>Due diligence portals</div>
          <h1 style={{ fontSize: 30, marginTop: 6 }}>Choose a portal</h1>
          <p style={{ color: '#cbd5e1', marginTop: 6 }}>All three portals share the same roles framework, document handling, audit trail and scheduling.</p>
        </div>
        <div className="grid grid-3">
          {cards.map((c) => (
            <Link key={c.to} to={c.to} className="card" style={{ padding: 26, textDecoration: 'none', color: 'var(--text)', borderTop: `4px solid ${c.tone}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 34 }}>{c.icon}</div>
              <h2 style={{ fontSize: 19 }}>{c.title}</h2>
              <p className="muted">{c.text}</p>
              <div className="chip-list" style={{ marginTop: 'auto' }}>{c.stats.map((s) => <span key={s} className="chip">{s}</span>)}</div>
              <span className="btn btn-primary" style={{ alignSelf: 'flex-start', background: c.tone, borderColor: c.tone }}>Open portal →</span>
            </Link>
          ))}
        </div>
        <p className="small" style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>Front-end demo · data is stored in this browser only.</p>
      </div>
    </div>
  );
}

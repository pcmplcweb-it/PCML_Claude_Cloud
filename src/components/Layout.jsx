import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CREDIT_STATUS, ROLES, STATUS, USERS, can } from '../data/config';
import { HR_USERS, canHr } from '../hr/config';
import { hrNavCounts, hrToday } from '../hr/helpers';
import { KYS_USERS, SUPPLIER_STATUS, TERMS_STATUS, canKys } from '../kys/config';
import { expiringSupplierDocuments, supplierReviewsDue } from '../kys/helpers';
import { useStore } from '../store/StoreContext';
import { expiringDocuments, overdueReviews } from '../utils/helpers';
import { Toasts } from './ui';

const TITLES = {
  kyc: {
    '': 'Dashboard', customers: 'Customers', credit: 'Credit Assessment', reviews: 'Periodic Reviews', reports: 'Reports', audit: 'Audit Trail', settings: 'Settings',
  },
  kys: {
    '': 'Dashboard', suppliers: 'Suppliers', terms: 'Commercial Terms', reviews: 'Periodic Reviews', reports: 'Reports', audit: 'Audit Trail', settings: 'Settings',
  },
  hr: {
    '': 'Dashboard', employees: 'Employees', kpi: 'KPI Templates', cycles: 'Appraisal Cycles', appraisals: 'Appraisals', leave: 'Leave', attendance: 'Attendance', settlements: 'Final Settlement', reminders: 'Reminders & Due Dates', reports: 'Reports', audit: 'Audit Trail', settings: 'HR Settings',
  },
};

// Users valid for each portal: the portal's own roles plus the shared administrator. Module scope keeps the arrays' identity stable.
const ADMINS = USERS.filter((u) => u.role === ROLES.ADMIN);
const PORTALS = {
  kyc: { title: 'KYC Portal', sub: 'Customer onboarding & verification', users: USERS, can, fallback: 'KYC' },
  kys: { title: 'KYS Portal', sub: 'Supplier qualification & monitoring', users: [...KYS_USERS, ...ADMINS], can: canKys, fallback: 'KYS' },
  hr: { title: 'HR Portal', sub: 'Know your employee · KPI · leave · settlement', users: [...HR_USERS, ...ADMINS], can: canHr, fallback: 'HR' },
};

export default function Layout({ portal = 'kyc' }) {
  const { state, dispatch, currentUser, toasts } = useStore();
  const { pathname } = useLocation();
  const P = PORTALS[portal];
  const isKys = portal === 'kys';
  const base = `/${portal}`;

  const portalUsers = P.users;
  const validHere = portalUsers.some((u) => u.id === currentUser.id);
  useEffect(() => {
    if (!validHere) dispatch({ type: 'SET_USER', userId: portalUsers[0].id });
  }, [validHere, portalUsers, dispatch]);
  const role = currentUser.role;
  const allow = (action) => P.can(role, action);

  const customers = state.customers;
  const suppliers = state.suppliers;
  const pending = isKys
    ? suppliers.filter((s) => [SUPPLIER_STATUS.SUBMITTED, SUPPLIER_STATUS.EVALUATION, SUPPLIER_STATUS.APPROVAL].includes(s.status)).length
    : customers.filter((c) => [STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status)).length;
  const decisionQueue = isKys
    ? suppliers.filter((s) => [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW].includes(s.terms.status)).length
    : customers.filter((c) => [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW].includes(c.credit.status)).length;
  const reviewCount = isKys
    ? supplierReviewsDue(suppliers).length + expiringSupplierDocuments(suppliers, 60).length
    : overdueReviews(customers).length + expiringDocuments(customers, 60).length;
  // HR nav counts are scoped to the signed-in user (own file / team / all) and use the HR demo clock.
  const hc = useMemo(() => (portal === 'hr' ? hrNavCounts(state, currentUser, hrToday(state.hrSettings)) : null), [state, currentUser, portal]);

  const segment = pathname.replace(base, '').split('/').filter(Boolean)[0] || '';
  const title = TITLES[portal][segment] || P.fallback;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">{P.title}</div>
          <div className="brand-sub">{P.sub}</div>
          <div className="portal-switch">
            {['kyc', 'kys', 'hr'].map((key) => (
              <NavLink key={key} to={`/${key}`} className={() => `portal-btn ${portal === key ? 'on' : ''}`}>{key.toUpperCase()}</NavLink>
            ))}
          </div>
        </div>
        <nav className="nav">
          {portal !== 'hr' && (<>
            <NavLink to={base} end>📊 Dashboard</NavLink>
            <NavLink to={`${base}/${isKys ? 'suppliers' : 'customers'}`} end>
              {isKys ? '🏭 Suppliers' : '👥 Customers'}
              {pending > 0 && <span className="nav-count">{pending}</span>}
            </NavLink>
            {allow('create') && <NavLink to={`${base}/${isKys ? 'suppliers' : 'customers'}/new`}>➕ New Application</NavLink>}

            <div className="nav-section">Workflows</div>
            <NavLink to={`${base}/${isKys ? 'terms' : 'credit'}`}>
              {isKys ? '📜 Commercial Terms' : '💳 Credit Assessment'}
              {decisionQueue > 0 && <span className="nav-count">{decisionQueue}</span>}
            </NavLink>
            <NavLink to={`${base}/reviews`}>
              🔁 Periodic Reviews
              {reviewCount > 0 && <span className="nav-count">{reviewCount}</span>}
            </NavLink>

            <div className="nav-section">Insight</div>
            <NavLink to={`${base}/reports`}>📈 Reports</NavLink>
            {allow('audit') && <NavLink to={`${base}/audit`}>🧾 Audit Trail</NavLink>}
            {allow('settings') && <NavLink to={`${base}/settings`}>⚙️ Settings</NavLink>}
            <div className="nav-section">Portal</div>
            <NavLink to="/">⇄ Switch portal</NavLink>
          </>)}
          {portal === 'hr' && (<>
            <NavLink to={base} end>📊 Dashboard</NavLink>
            <NavLink to={`${base}/employees`} end>🧑‍💼 Employees{hc.employees > 0 && <span className="nav-count">{hc.employees}</span>}</NavLink>
            {allow('create') && <NavLink to={`${base}/employees/new`}>➕ New Employee</NavLink>}
            <div className="nav-section">Performance</div>
            <NavLink to={`${base}/kpi`}>🎯 KPI Templates</NavLink>
            <NavLink to={`${base}/cycles`}>📅 Appraisal Cycles</NavLink>
            <NavLink to={`${base}/appraisals`}>📝 Appraisals{hc.appraisals > 0 && <span className="nav-count">{hc.appraisals}</span>}</NavLink>
            <div className="nav-section">Workflows</div>
            <NavLink to={`${base}/leave`}>🏖️ Leave{hc.leave > 0 && <span className="nav-count">{hc.leave}</span>}</NavLink>
            <NavLink to={`${base}/attendance`}>🕒 Attendance</NavLink>
            <NavLink to={`${base}/settlements`}>🧾 Final Settlement{hc.settlements > 0 && <span className="nav-count">{hc.settlements}</span>}</NavLink>
            <NavLink to={`${base}/reminders`}>🔔 Reminders{hc.reminders > 0 && <span className="nav-count">{hc.reminders}</span>}</NavLink>
            <div className="nav-section">Insight</div>
            {allow('reports') && <NavLink to={`${base}/reports`}>📈 Reports</NavLink>}
            {allow('audit') && <NavLink to={`${base}/audit`}>🧾 Audit Trail</NavLink>}
            {allow('settings') && <NavLink to={`${base}/settings`}>⚙️ HR Settings</NavLink>}
            <div className="nav-section">Portal</div><NavLink to="/">⇄ Switch portal</NavLink>
          </>)}
        </nav>
        <div className="sidebar-footer">
          Front-end demo · data stored in this browser
          <br />
          <button className="btn-link small" onClick={() => { if (window.confirm('Reset all demo data (all portals) to the seeded sample?')) dispatch({ type: 'RESET' }); }}>
            Reset demo data
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">{title}</div>
          <div className="user-switch">
            <label htmlFor="user-select">Signed in as</label>
            <select id="user-select" value={validHere ? currentUser.id : portalUsers[0].id} onChange={(e) => dispatch({ type: 'SET_USER', userId: e.target.value })}>
              {portalUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
              ))}
            </select>
            <span className="role-chip">{role === ROLES.ADMIN ? 'Full access' : role}</span>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
}

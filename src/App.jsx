import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { can } from './data/config';
import { canHr } from './hr/config';
import { canKys } from './kys/config';
import { useStore } from './store/StoreContext';
import AuditLog from './pages/AuditLog';
import CreditQueue from './pages/CreditQueue';
import CustomerDetail from './pages/CustomerDetail';
import CustomerForm from './pages/CustomerForm';
import CustomerList from './pages/CustomerList';
import Dashboard from './pages/Dashboard';
import Portal from './pages/Portal';
import Reports from './pages/Reports';
import Reviews from './pages/Reviews';
import Settings from './pages/Settings';
import SupplierDashboard from './pages/kys/SupplierDashboard';
import SupplierDetail from './pages/kys/SupplierDetail';
import SupplierForm from './pages/kys/SupplierForm';
import SupplierList from './pages/kys/SupplierList';
import SupplierReports from './pages/kys/SupplierReports';
import SupplierReviews from './pages/kys/SupplierReviews';
import SupplierSettings from './pages/kys/SupplierSettings';
import TermsQueue from './pages/kys/TermsQueue';
import AppraisalCycles from './pages/hr/AppraisalCycles';
import AppraisalForm from './pages/hr/AppraisalForm';
import AppraisalList from './pages/hr/AppraisalList';
import EmployeeDetail from './pages/hr/EmployeeDetail';
import EmployeeForm from './pages/hr/EmployeeForm';
import EmployeeList from './pages/hr/EmployeeList';
import HrDashboard from './pages/hr/HrDashboard';
import HrReminders from './pages/hr/HrReminders';
import HrReports from './pages/hr/HrReports';
import HrSettings from './pages/hr/HrSettings';
import KpiTemplates from './pages/hr/KpiTemplates';
import LeaveQueue from './pages/hr/LeaveQueue';
import SettlementDetail from './pages/hr/SettlementDetail';
import SettlementNew from './pages/hr/SettlementNew';
import SettlementQueue from './pages/hr/SettlementQueue';

function Guard({ action, portal = 'kyc', children }) {
  const { currentUser } = useStore();
  const role = currentUser.role;
  const ok = portal === 'kys' ? canKys(role, action) : portal === 'hr' ? canHr(role, action) : can(role, action);
  if (!ok) {
    return (
      <div className="alert alert-warn">
        Your role ({currentUser.role}) does not have access to this area. Switch user from the top bar to try another role.
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Portal />} />

      <Route path="kyc" element={<Layout portal="kyc" />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<CustomerList />} />
        <Route path="customers/new" element={<Guard action="create"><CustomerForm /></Guard>} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<Guard action="edit"><CustomerForm /></Guard>} />
        <Route path="credit" element={<CreditQueue />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="reports" element={<Reports />} />
        <Route path="audit" element={<Guard action="audit"><AuditLog portal="kyc" /></Guard>} />
        <Route path="settings" element={<Guard action="settings"><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/kyc" replace />} />
      </Route>

      <Route path="kys" element={<Layout portal="kys" />}>
        <Route index element={<SupplierDashboard />} />
        <Route path="suppliers" element={<SupplierList />} />
        <Route path="suppliers/new" element={<Guard portal="kys" action="create"><SupplierForm /></Guard>} />
        <Route path="suppliers/:id" element={<SupplierDetail />} />
        <Route path="suppliers/:id/edit" element={<Guard portal="kys" action="edit"><SupplierForm /></Guard>} />
        <Route path="terms" element={<TermsQueue />} />
        <Route path="reviews" element={<SupplierReviews />} />
        <Route path="reports" element={<SupplierReports />} />
        <Route path="audit" element={<Guard portal="kys" action="audit"><AuditLog portal="kys" /></Guard>} />
        <Route path="settings" element={<Guard portal="kys" action="settings"><SupplierSettings /></Guard>} />
        <Route path="*" element={<Navigate to="/kys" replace />} />
      </Route>

      <Route path="hr" element={<Layout portal="hr" />}>
        <Route index element={<HrDashboard />} />
        <Route path="employees" element={<EmployeeList />} />
        <Route path="employees/new" element={<Guard portal="hr" action="create"><EmployeeForm /></Guard>} />
        <Route path="employees/:id" element={<EmployeeDetail />} />
        <Route path="employees/:id/edit" element={<Guard portal="hr" action="edit"><EmployeeForm /></Guard>} />
        <Route path="kpi" element={<KpiTemplates />} />
        <Route path="cycles" element={<AppraisalCycles />} />
        <Route path="appraisals" element={<AppraisalList />} />
        <Route path="appraisals/:id" element={<AppraisalForm />} />
        <Route path="leave" element={<LeaveQueue initialTab="requests" />} />
        <Route path="attendance" element={<LeaveQueue initialTab="attendance" />} />
        <Route path="settlements" element={<SettlementQueue />} />
        <Route path="settlements/new" element={<Guard portal="hr" action="separationInitiate"><SettlementNew /></Guard>} />
        <Route path="settlements/:id" element={<SettlementDetail />} />
        <Route path="reminders" element={<HrReminders />} />
        <Route path="reports" element={<Guard portal="hr" action="reports"><HrReports /></Guard>} />
        <Route path="audit" element={<Guard portal="hr" action="audit"><AuditLog portal="hr" /></Guard>} />
        <Route path="settings" element={<Guard portal="hr" action="settings"><HrSettings /></Guard>} />
        <Route path="*" element={<Navigate to="/hr" replace />} />
      </Route>

      {/* Legacy KYC paths */}
      <Route path="customers/*" element={<Navigate to="/kyc/customers" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

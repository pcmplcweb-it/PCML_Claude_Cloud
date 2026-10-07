// HR (Know Your Employee) configuration: roles, statuses, org structure,
// documents, clearance departments, competencies, KPI templates, leave types
// and the Bangladesh Labour Act 2006 (as amended 2026) statutory defaults.
import { ROLES } from '../data/config.js';

export const HR_ROLES = {
  HR_OFFICER: 'HR Officer',
  HR_HEAD: 'HR Head',
  LINE_MANAGER: 'Line Manager',
  FINANCE: 'Finance Manager',
  MANAGEMENT: 'Managing Director',
  EMPLOYEE: 'Employee',
  ADMIN: ROLES.ADMIN,
};

// `employeeId` links each HR user to their own employee record (scope, self-service, sign-offs).
export const HR_USERS = [
  { id: 'h1', name: 'Farhana Rahman', role: HR_ROLES.HR_OFFICER, territory: 'Human Resources', employeeId: 'emp_farhana' },
  { id: 'h2', name: 'Sabbir Hossain', role: HR_ROLES.HR_HEAD, territory: 'Human Resources', employeeId: 'emp_sabbir' },
  { id: 'h3', name: 'Kamrul Islam', role: HR_ROLES.LINE_MANAGER, territory: 'Sales', employeeId: 'emp_kamrul' },
  { id: 'h4', name: 'Mizanur Rahman', role: HR_ROLES.LINE_MANAGER, territory: 'Production', employeeId: 'emp_mizan' },
  { id: 'h5', name: 'Tahmina Akter', role: HR_ROLES.FINANCE, territory: 'Finance & Accounts', employeeId: 'emp_tahmina' },
  { id: 'h6', name: 'Anisur Rahman', role: HR_ROLES.MANAGEMENT, territory: 'Management', employeeId: 'emp_anisur' },
  { id: 'h7', name: 'Rakib Hasan', role: HR_ROLES.EMPLOYEE, territory: 'Sales', employeeId: 'emp_rakib' },
  { id: 'h8', name: 'Sumaiya Khatun', role: HR_ROLES.EMPLOYEE, territory: 'Finance & Accounts', employeeId: 'emp_sumaiya' },
];

const { HR_OFFICER: HO, HR_HEAD: HH, LINE_MANAGER: LM, FINANCE: FM, MANAGEMENT: MD, ADMIN: AD } = HR_ROLES;
const ALL = Object.values(HR_ROLES);

// Which roles can perform which workflow actions.
export const HR_PERMISSIONS = {
  // Employee master
  create: [HO, HH, AD],
  edit: [HO, HH, AD],
  editSalary: [HH, AD],
  activate: [HO, HH, AD],
  confirm: [HH, AD],
  suspend: [HH, AD],
  disciplinary: [HO, HH, AD],
  markExit: [HO, HH, AD],
  viewSensitive: [HO, HH, FM, MD, AD],
  viewDocuments: ALL,
  // KPI & evaluation
  manageKpi: [HO, HH, AD],
  manageCycles: [HH, AD],
  kpiSet: [LM, HH, MD, AD],
  selfAssess: ALL,
  managerReview: [LM, HH, MD, AD],
  hrReview: [HO, HH, AD],
  publish: [HH, AD],
  acknowledge: ALL,
  cancelAppraisal: [HH, AD],
  // Leave & attendance
  leaveRequest: ALL,
  leaveApprove: [LM, HH, MD, AD],
  leaveAdminister: [HO, HH, AD],
  attendanceEntry: [HO, HH, AD],
  closeLeaveYear: [HH, AD],
  // Final settlement
  separationInitiate: [HO, HH, AD],
  settlementEdit: [HO, HH, AD],
  clearanceSignOff: [HO, HH, LM, FM, AD],
  settlementHrApprove: [HH, AD],
  settlementFinanceApprove: [FM, AD],
  settlementManagementApprove: [MD, AD],
  settlementPay: [FM, AD],
  settlementHold: [HH, AD],
  issueCertificate: [HO, HH, AD],
  // Insight
  reports: [HO, HH, FM, MD, AD],
  audit: [HH, FM, MD, AD],
  settings: [HH, AD],
};

// Human-readable label per permission key (role matrix in Settings, denied-action hints).
export const HR_ACTION_LABELS = {
  create: 'Create employee record',
  edit: 'Edit employee record',
  editSalary: 'Revise salary',
  activate: 'Activate employee',
  confirm: 'Decide probation',
  suspend: 'Suspend / reinstate',
  disciplinary: 'Record disciplinary action',
  markExit: 'Confirm exit',
  viewSensitive: 'View salary, NID, bank',
  viewDocuments: 'View documents',
  manageKpi: 'Manage KPI templates',
  manageCycles: 'Create / open / close cycles',
  kpiSet: 'Set KPIs for reports',
  selfAssess: 'Self-assessment (own)',
  managerReview: 'Manager review (reports)',
  hrReview: 'HR review & calibration',
  publish: 'Publish results',
  acknowledge: 'Acknowledge result (own)',
  cancelAppraisal: 'Cancel appraisal',
  leaveRequest: 'Request leave',
  leaveApprove: 'Approve leave (reports)',
  leaveAdminister: 'Administer leave for anyone',
  attendanceEntry: 'Enter monthly attendance',
  closeLeaveYear: 'Close leave year',
  separationInitiate: 'Initiate separation',
  settlementEdit: 'Edit settlement inputs',
  clearanceSignOff: 'Sign clearance',
  settlementHrApprove: 'Approve settlement (HR)',
  settlementFinanceApprove: 'Approve settlement (Finance)',
  settlementManagementApprove: 'Approve settlement (Management)',
  settlementPay: 'Record payment',
  settlementHold: 'Hold / release settlement',
  issueCertificate: 'Issue service certificate',
  reports: 'View reports',
  audit: 'View audit trail',
  settings: 'Edit HR settings',
};

export const canHr = (role, action) => (HR_PERMISSIONS[action] || []).includes(role);

// Roles that act as "HR staff" (see everything, administer on behalf).
export const HR_STAFF_ROLES = [HO, HH, AD];

// ---------------------------------------------------------------------------
// Statuses and workflows. Strings are displayed verbatim, used as badge keys
// and as audit action labels.

export const EMPLOYEE_STATUS = {
  DRAFT: 'Draft',
  PROBATION: 'Probation',
  CONFIRMED: 'Confirmed',
  NOTICE: 'On Notice',
  SUSPENDED: 'Under Suspension',
  SEPARATED: 'Separated',
};

// Under Suspension renders off-track.
export const EMPLOYEE_FLOW = [EMPLOYEE_STATUS.DRAFT, EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.NOTICE, EMPLOYEE_STATUS.SEPARATED];
export const ACTIVE_EMPLOYEE_STATUSES = [EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.NOTICE, EMPLOYEE_STATUS.SUSPENDED];

export const CYCLE_STATUS = { PLANNED: 'Planned', OPEN: 'Open', CLOSED: 'Closed' };
export const CYCLE_TYPES = ['Annual', 'Half-yearly'];
export const APPRAISAL_TYPES = ['Annual', 'Half-yearly', 'Probation'];

export const APPRAISAL_STATUS = {
  KPI_SETTING: 'KPI Setting',
  AGREED: 'Goals Agreed',
  SELF: 'Self-Assessment',
  MANAGER: 'Manager Review',
  HR: 'HR Review',
  RETURNED: 'Returned to Manager',
  PUBLISHED: 'Published',
  ACKNOWLEDGED: 'Acknowledged',
  DISPUTED: 'Disputed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const APPRAISAL_FLOW = [
  APPRAISAL_STATUS.KPI_SETTING, APPRAISAL_STATUS.AGREED, APPRAISAL_STATUS.SELF, APPRAISAL_STATUS.MANAGER,
  APPRAISAL_STATUS.HR, APPRAISAL_STATUS.PUBLISHED, APPRAISAL_STATUS.ACKNOWLEDGED, APPRAISAL_STATUS.CLOSED,
];
export const APPRAISAL_OPEN = [
  APPRAISAL_STATUS.KPI_SETTING, APPRAISAL_STATUS.AGREED, APPRAISAL_STATUS.SELF, APPRAISAL_STATUS.MANAGER,
  APPRAISAL_STATUS.HR, APPRAISAL_STATUS.RETURNED, APPRAISAL_STATUS.PUBLISHED, APPRAISAL_STATUS.DISPUTED,
];

export const SETTLEMENT_STATUS = {
  INITIATED: 'Initiated',
  CLEARANCE: 'Clearance in Progress',
  HR_APPROVAL: 'Pending HR Approval',
  FINANCE_APPROVAL: 'Pending Finance Approval',
  MGMT_APPROVAL: 'Pending Management Approval',
  APPROVED: 'Approved for Payment',
  PAID: 'Paid',
  ON_HOLD: 'On Hold',
  RETURNED: 'Returned to HR',
  WITHDRAWN: 'Withdrawn',
};

export const SETTLEMENT_FLOW = [
  SETTLEMENT_STATUS.INITIATED, SETTLEMENT_STATUS.CLEARANCE, SETTLEMENT_STATUS.HR_APPROVAL, SETTLEMENT_STATUS.FINANCE_APPROVAL,
  SETTLEMENT_STATUS.MGMT_APPROVAL, SETTLEMENT_STATUS.APPROVED, SETTLEMENT_STATUS.PAID,
];
export const SETTLEMENT_OPEN = [
  SETTLEMENT_STATUS.INITIATED, SETTLEMENT_STATUS.CLEARANCE, SETTLEMENT_STATUS.HR_APPROVAL, SETTLEMENT_STATUS.FINANCE_APPROVAL,
  SETTLEMENT_STATUS.MGMT_APPROVAL, SETTLEMENT_STATUS.APPROVED, SETTLEMENT_STATUS.ON_HOLD, SETTLEMENT_STATUS.RETURNED,
];

export const LEAVE_STATUS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
export const CLEARANCE_STATUS = { PENDING: 'Pending', CLEARED: 'Cleared', DUES: 'Dues Found' };

// One badge-tone map for every HR status. Keys shared across enums (Closed,
// Cancelled, Pending, Approved) are listed once; no key clashes with a KYC/KYS tone.
export const HR_STATUS_COLORS = {
  // Employee
  [EMPLOYEE_STATUS.DRAFT]: 'gray',
  [EMPLOYEE_STATUS.PROBATION]: 'blue',
  [EMPLOYEE_STATUS.CONFIRMED]: 'green',
  [EMPLOYEE_STATUS.NOTICE]: 'amber',
  [EMPLOYEE_STATUS.SUSPENDED]: 'red',
  [EMPLOYEE_STATUS.SEPARATED]: 'gray',
  // Cycle
  [CYCLE_STATUS.PLANNED]: 'gray',
  [CYCLE_STATUS.OPEN]: 'blue',
  [CYCLE_STATUS.CLOSED]: 'gray',
  // Appraisal
  [APPRAISAL_STATUS.KPI_SETTING]: 'blue',
  [APPRAISAL_STATUS.AGREED]: 'indigo',
  [APPRAISAL_STATUS.SELF]: 'indigo',
  [APPRAISAL_STATUS.MANAGER]: 'purple',
  [APPRAISAL_STATUS.HR]: 'purple',
  [APPRAISAL_STATUS.RETURNED]: 'amber',
  [APPRAISAL_STATUS.PUBLISHED]: 'green',
  [APPRAISAL_STATUS.ACKNOWLEDGED]: 'green',
  [APPRAISAL_STATUS.DISPUTED]: 'red',
  [APPRAISAL_STATUS.CANCELLED]: 'red',
  // Settlement
  [SETTLEMENT_STATUS.INITIATED]: 'blue',
  [SETTLEMENT_STATUS.CLEARANCE]: 'indigo',
  [SETTLEMENT_STATUS.HR_APPROVAL]: 'purple',
  [SETTLEMENT_STATUS.FINANCE_APPROVAL]: 'purple',
  [SETTLEMENT_STATUS.MGMT_APPROVAL]: 'purple',
  [SETTLEMENT_STATUS.APPROVED]: 'green',
  [SETTLEMENT_STATUS.PAID]: 'green',
  [SETTLEMENT_STATUS.ON_HOLD]: 'amber',
  [SETTLEMENT_STATUS.RETURNED]: 'amber',
  [SETTLEMENT_STATUS.WITHDRAWN]: 'gray',
  // Leave and clearance rows
  [LEAVE_STATUS.PENDING]: 'amber',
  [LEAVE_STATUS.APPROVED]: 'green',
  [LEAVE_STATUS.REJECTED]: 'red',
  [CLEARANCE_STATUS.CLEARED]: 'green',
  [CLEARANCE_STATUS.DUES]: 'amber',
};

// ---------------------------------------------------------------------------
// Separation, discipline and employee attributes.

export const SEPARATION_TYPES = ['Resignation', 'Termination', 'Retrenchment', 'Discharge', 'Dismissal', 'Retirement', 'Death', 'End of Contract', 'Deemed Resignation (s.27(3A))'];

// Governing section of the Labour Act per separation type (shown on the statement).
export const SEPARATION_SECTIONS = {
  Resignation: 's.27',
  Termination: 's.26',
  Retrenchment: 's.20',
  Discharge: 's.22',
  Dismissal: 's.23',
  Retirement: 's.28',
  Death: 's.19',
  'End of Contract': 's.26(2)',
  'Deemed Resignation (s.27(3A))': 's.27(3A)',
};

export const EMPLOYER_INITIATED = ['Termination', 'Retrenchment', 'Discharge', 'Dismissal'];

// s.23(4) misconduct clauses; blank = not applicable.
export const MISCONDUCT_CLAUSES = ['', '23(4)(a)', '23(4)(b)', '23(4)(c)', '23(4)(d)', '23(4)(e)', '23(4)(f)', '23(4)(g)', '23(4)(h)', '23(4)(i)', '23(4)(j)'];

export const DISCIPLINARY_TYPES = ['Show Cause', 'Written Warning', 'Final Warning', 'Suspension', 'Dismissal Enquiry'];
export const RECOMMENDATIONS = ['', 'Increment', 'Increment & Promotion', 'Promotion', 'No Increment', 'PIP', 'Separation'];
export const PROBATION_DECISIONS = ['', 'Confirm', 'Extend', 'Not confirm'];
export const EMPLOYMENT_TYPES = ['Permanent', 'Contractual', 'Temporary', 'Casual'];
export const WORKER_CATEGORIES = ['Worker', 'Non-worker'];
export const WAGE_BASIS = ['Monthly', 'Daily', 'Piece'];

// Earned-leave accrual divisor (s.117) and cap per establishment type.
export const ESTABLISHMENT_TYPES = [
  { code: 'commercial', name: 'Commercial / office', elDivisor: 18, elCap: 60 },
  { code: 'factory', name: 'Factory', elDivisor: 18, elCap: 40 },
  { code: 'shop', name: 'Shop', elDivisor: 18, elCap: 60 },
  { code: 'road_transport', name: 'Road transport', elDivisor: 18, elCap: 40 },
  { code: 'tea', name: 'Tea plantation', elDivisor: 22, elCap: 60 },
  { code: 'newspaper', name: 'Newspaper', elDivisor: 11, elCap: 60 },
];

// Income-tax categories (threshold keys in `DEFAULT_HR_SETTINGS.tax.thresholds`).
export const TAX_CATEGORIES = [
  { code: 'general', name: 'General' },
  { code: 'female_senior', name: 'Female / aged 65+' },
  { code: 'disabled', name: 'Disabled / third gender' },
  { code: 'war_wounded', name: 'Gazetted war-wounded' },
];

export const PAY_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Mobile Wallet'];
export const LOAN_TYPES = ['Salary Advance', 'Staff Loan', 'PF Loan', 'Other'];

// ---------------------------------------------------------------------------
// KPI vocabulary.

export const KPI_CATEGORIES = ['Financial', 'Operational', 'Customer', 'People', 'Compliance'];
export const KPI_UNITS = ['BDT', 'BDT lakh', 'BDT crore', '%', 'Nos', 'Days', 'Hours', 'Score', 'Y/N', 'km/L'];

// Scoring methods (see helpers.scoreKpiLine).
export const KPI_METHODS = [
  { code: 'A', name: 'Linear achievement %' },
  { code: 'B', name: 'Threshold / target / stretch' },
  { code: 'C', name: 'Rating 1–5' },
  { code: 'D', name: 'Binary / milestone %' },
  { code: 'E', name: 'Step table' },
];
export const KPI_DIRECTIONS = ['higher', 'lower'];
export const KPI_SOURCES = ['manual', 'attendance'];

// ---------------------------------------------------------------------------
// Org structure.

export const DEPARTMENTS = [
  { code: 'MGMT', name: 'Management' },
  { code: 'HR', name: 'Human Resources & Admin' },
  { code: 'SALES', name: 'Sales' },
  { code: 'FIN', name: 'Finance & Accounts' },
  { code: 'PROD', name: 'Production' },
  { code: 'SCM', name: 'Supply Chain' },
  { code: 'IT', name: 'IT' },
  { code: 'ADMIN', name: 'Admin & Transport' },
];

// G1 = MD … G8 = operator / driver.
export const GRADES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];

// `templateCode` is the default KPI template for the designation.
export const DESIGNATIONS = [
  { code: 'MD', name: 'Managing Director', department: 'MGMT', grade: 'G1', workerCategory: 'Non-worker', probationMonths: 0, templateCode: '' },
  { code: 'HOH', name: 'Head of HR & Admin', department: 'HR', grade: 'G2', workerCategory: 'Non-worker', probationMonths: 6, templateCode: 'TPL-HRO' },
  { code: 'HOS', name: 'Head of Sales', department: 'SALES', grade: 'G2', workerCategory: 'Non-worker', probationMonths: 6, templateCode: 'TPL-ASM' },
  { code: 'PM', name: 'Production Manager', department: 'PROD', grade: 'G2', workerCategory: 'Non-worker', probationMonths: 6, templateCode: 'TPL-PS' },
  { code: 'HOF', name: 'Head of Finance', department: 'FIN', grade: 'G2', workerCategory: 'Non-worker', probationMonths: 6, templateCode: 'TPL-AE' },
  { code: 'ASM', name: 'Area Sales Manager', department: 'SALES', grade: 'G4', workerCategory: 'Non-worker', probationMonths: 6, templateCode: 'TPL-ASM' },
  { code: 'PS', name: 'Production Supervisor', department: 'PROD', grade: 'G7', workerCategory: 'Non-worker', probationMonths: 3, templateCode: 'TPL-PS' },
  { code: 'SO', name: 'Sales Officer', department: 'SALES', grade: 'G6', workerCategory: 'Worker', probationMonths: 6, templateCode: 'TPL-SO' },
  { code: 'AE', name: 'Accounts Executive', department: 'FIN', grade: 'G6', workerCategory: 'Worker', probationMonths: 6, templateCode: 'TPL-AE' },
  { code: 'PO', name: 'Procurement Officer', department: 'SCM', grade: 'G6', workerCategory: 'Worker', probationMonths: 6, templateCode: 'TPL-PO' },
  { code: 'HRO', name: 'HR Officer', department: 'HR', grade: 'G6', workerCategory: 'Worker', probationMonths: 6, templateCode: 'TPL-HRO' },
  { code: 'ITO', name: 'IT Officer', department: 'IT', grade: 'G6', workerCategory: 'Worker', probationMonths: 6, templateCode: 'TPL-ITO' },
  { code: 'MO', name: 'Machine Operator', department: 'PROD', grade: 'G8', workerCategory: 'Worker', probationMonths: 3, templateCode: 'TPL-PS' },
  { code: 'DRV', name: 'Driver', department: 'ADMIN', grade: 'G8', workerCategory: 'Worker', probationMonths: 3, templateCode: 'TPL-DRV' },
];

export const designationOf = (code) => DESIGNATIONS.find((d) => d.code === code);

// ---------------------------------------------------------------------------
// Documents.

export const EMPLOYEE_DOC_TYPES = {
  NID: 'National ID (NID)',
  TIN: 'TIN Certificate',
  PHOTO: 'Photograph',
  CV: 'CV / Resume',
  APPOINTMENT: 'Appointment Letter',
  CONFIRMATION: 'Confirmation Letter',
  EDU: 'Educational Certificate',
  EXPERIENCE: 'Experience Certificate',
  BANK: 'Bank Account Proof',
  PASSPORT: 'Passport',
  LICENCE: 'Driving Licence',
  CONTRACT: 'Employment Contract',
  NOMINEE: 'Nominee Form',
  MEDICAL: 'Medical Fitness Certificate',
  OTHER: 'Other',
};

// Documents that carry an expiry date.
export const EXPIRING_EMPLOYEE_DOCS = [EMPLOYEE_DOC_TYPES.PASSPORT, EMPLOYEE_DOC_TYPES.LICENCE, EMPLOYEE_DOC_TYPES.CONTRACT, EMPLOYEE_DOC_TYPES.MEDICAL];

// Documents every activated employee must have on file.
export const REQUIRED_EMPLOYEE_DOCS = [EMPLOYEE_DOC_TYPES.NID, EMPLOYEE_DOC_TYPES.PHOTO, EMPLOYEE_DOC_TYPES.APPOINTMENT, EMPLOYEE_DOC_TYPES.EDU];

export const SEPARATION_DOC_TYPES = {
  RESIGNATION: 'Resignation Letter',
  ACCEPTANCE: 'Acceptance of Resignation',
  TERMINATION: 'Termination / Retrenchment Notice',
  SHOW_CAUSE: 'Show-cause Notice',
  ENQUIRY: 'Enquiry Report',
  MEDICAL: 'Medical Certificate',
  DEATH: 'Death Certificate',
  CLEARANCE: 'Signed Clearance Form',
  STATEMENT: 'Signed Settlement Statement',
  CERTIFICATE: 'Service Certificate',
  OTHER: 'Other',
};

export const DISCIPLINARY_DOC_TYPES = ['Show-cause Notice', 'Reply', 'Enquiry Report', 'Warning Letter', 'Other'];

// ---------------------------------------------------------------------------
// Clearance departments (one sign-off row each on every settlement).
// IT signs through the HR Officer in the demo; LINE must be the employee's reporting manager.

export const CLEARANCE_DEPARTMENTS = [
  { dept: 'IT', label: 'IT', items: ['Laptop & accessories', 'Email & system access revoked', 'Software licences released'], signOffRoles: [HO, AD] },
  { dept: 'ADMIN', label: 'Admin', items: ['ID & access card', 'Keys / locker', 'Vehicle / fuel card', 'Mobile SIM & handset'], signOffRoles: [HO, AD] },
  { dept: 'FINANCE', label: 'Finance', items: ['Advances & loans', 'Expense claims settled', 'Petty cash / imprest', 'Tax & PF ledger reconciled'], signOffRoles: [FM, AD] },
  { dept: 'HR', label: 'HR', items: ['Leave record reconciled', 'Exit interview', 'Personal file complete'], signOffRoles: [HO, HH, AD] },
  { dept: 'LINE', label: 'Line manager', items: ['Handover of work & files', 'Customer / distributor handover', 'Company property'], signOffRoles: [LM, HH, AD], managerOnly: true },
];

// ---------------------------------------------------------------------------
// Competencies. weightStaff / weightManager each sum to 100; anchors[0..4]
// describe ratings 1..5. `gate` feeds the integrity cap; `managerial` items
// apply only to the manager set.

export const COMPETENCIES = [
  {
    code: 'TEAM', name: 'Teamwork', weightStaff: 15, weightManager: 10,
    anchors: ['Withholds information, conflicts unresolved', 'Cooperates when asked', 'Shares information, supports colleagues, completes shared tasks', 'Proactively helps other teams, resolves conflicts', 'Builds cross-team collaboration; others seek them out'],
  },
  {
    code: 'INTEG', name: 'Integrity & Ethics', weightStaff: 20, weightManager: 15, gate: true,
    anchors: ['Proven breach of policy or honesty', 'Bends rules, needs monitoring', 'Follows policy, honest reporting, declares conflicts', 'Challenges unethical practice, protects company assets', 'Sets the ethical standard; zero audit findings in area'],
  },
  {
    code: 'COMM', name: 'Communication', weightStaff: 15, weightManager: 10,
    anchors: ['Unclear, frequent misunderstandings', 'Communicates reactively', 'Clear written/verbal updates, reports on time', 'Tailors message to audience, presents well', 'Influences stakeholders, represents company externally'],
  },
  {
    code: 'INIT', name: 'Initiative & Ownership', weightStaff: 15, weightManager: 10,
    anchors: ['Waits for instruction, blames others', 'Needs follow-up', 'Completes assigned work without follow-up, flags problems', 'Proposes improvements, implements at least one', 'Drives measurable improvements beyond own role'],
  },
  {
    code: 'CUST', name: 'Customer / Service Focus', weightStaff: 15, weightManager: 10,
    anchors: ['Complaints unresolved, discourteous', 'Slow responses', 'Responds within SLA, courteous', 'Anticipates needs, reduces complaints', 'Creates service standards adopted by others'],
  },
  {
    code: 'KNOW', name: 'Job Knowledge & Quality', weightStaff: 20, weightManager: 10,
    anchors: ['Repeated errors, cannot work unsupervised', 'Basic knowledge, errors need correction', 'Competent, accurate, meets quality standard', 'Expert, trains others, near-zero errors', 'Recognised subject expert across company'],
  },
  {
    code: 'LEAD', name: 'Leadership & People Development', weightStaff: 0, weightManager: 20, managerial: true,
    anchors: ['Team attrition high, no 1:1s', 'Delegates poorly', 'Sets goals, reviews on time, develops a successor', 'Team exceeds targets, retains talent', 'Builds leaders; team is the benchmark'],
  },
  {
    code: 'PLAN', name: 'Planning & Decision Making', weightStaff: 0, weightManager: 15, managerial: true,
    anchors: ['Misses deadlines, decisions reversed', 'Reactive planning', 'Realistic plans, timely sound decisions', 'Anticipates risks, data-driven decisions', 'Strategic contribution beyond department'],
  },
];

// The competency rows copied into an appraisal for a given set ('staff' | 'manager').
export const competencySet = (set) => COMPETENCIES
  .filter((c) => (set === 'manager' ? c.weightManager : c.weightStaff) > 0)
  .map((c) => ({ code: c.code, name: c.name, weight: set === 'manager' ? c.weightManager : c.weightStaff }));

// ---------------------------------------------------------------------------
// Default KPI templates. Fixed ids so seed appraisals and fixtures can refer
// to them; every item weight set sums to 100.

// Step table rows for method E: [bound, score] pairs → string fields.
const steps = (pairs) => pairs.map(([bound, score]) => ({ bound: String(bound), score: String(score) }));

// One-sentence formula clause derived from the scoring method.
const formulaText = (item) => {
  switch (item.method) {
    case 'A': return `actual ÷ target × 100, linear, capped at ${item.cap}%.`;
    case 'B': return `0 below ${item.thresholdPct}% of target, 50 at threshold, 100 at target, 120 at ${item.stretchPct}% stretch.`;
    case 'C': return 'manager rating 1–5 × 20.';
    case 'D': return '100 when complete, otherwise the milestone fraction × 100.';
    default: return `step table ${item.steps.map((s) => `${item.direction === 'lower' ? '≤' : '≥'} ${s.bound} → ${s.score}`).join(', ')}; otherwise 0.`;
  }
};

// Builds one KPI line with the template defaults (thresholdPct 80, stretchPct 120,
// cap 120, not a gate, manual actuals, no steps). `desc` names the metric; the
// formula sentence is appended from the method.
const kpi = (code, name, category, unit, direction, target, method, weight, desc, extra = {}) => {
  const item = {
    id: `kpi_${code.toLowerCase().replace('-', '_')}`, code, name, description: '', category, unit, direction, method,
    target: String(target), thresholdPct: '80', stretchPct: '120', cap: '120', weight: String(weight), isGate: false, source: 'manual', steps: [],
    ...extra,
  };
  item.description = `${desc}: ${formulaText(item)}`;
  return item;
};

const template = (id, code, name, designationCodes, kpiWeight, competencySetName, attendanceMode, description, items, cycleTypes = ['Annual', 'Half-yearly']) => ({
  id, code, name, designationCodes, departmentCodes: [], cycleTypes,
  weights: { kpi: kpiWeight, competency: 100 - kpiWeight }, competencySet: competencySetName, attendanceMode, active: true, description, items,
});

export const DEFAULT_KPI_TEMPLATES = [
  template('tpl_so', 'TPL-SO', 'Sales Officer', ['SO'], 80, 'staff', 'kpi', 'Territory sales, collection and outlet coverage for Sales Officers.', [
    kpi('SO-1', 'Primary sales value vs target', 'Financial', '%', 'higher', 100, 'A', 30, 'Primary sales invoiced to distributors as a % of the annual target'),
    kpi('SO-2', 'Secondary sales vs target', 'Financial', '%', 'higher', 100, 'B', 15, 'Distributor-to-retail (secondary) sales as a % of target'),
    kpi('SO-3', 'Collection within credit days', 'Financial', '%', 'higher', 98, 'E', 15, 'Share of invoices collected within the allowed credit days', { steps: steps([[98, 100], [95, 80], [90, 60]]) }),
    kpi('SO-4', 'Productive calls per day', 'Operational', 'Nos', 'higher', 35, 'B', 15, 'Average outlet calls per working day that produced an order'),
    kpi('SO-5', 'Active outlets', 'Customer', 'Nos', 'higher', 450, 'A', 15, 'Outlets billed at least once a month in the territory'),
    kpi('SO-6', 'Market hygiene & reporting audit', 'Compliance', 'Score', 'higher', 90, 'E', 10, 'Audit score for merchandising, pricing and DSR reporting', { steps: steps([[90, 100], [80, 70], [70, 40]]) }),
  ]),
  template('tpl_asm', 'TPL-ASM', 'Area Sales Manager', ['ASM', 'HOS'], 60, 'manager', 'gate', 'Area revenue, receivables and team results for sales managers.', [
    kpi('ASM-1', 'Area sales value vs target', 'Financial', 'BDT crore', 'higher', 36, 'A', 30, 'Area primary sales value in BDT crore against the annual plan'),
    kpi('ASM-2', 'Overdue > 60 days (% of sales)', 'Financial', '%', 'lower', 1, 'E', 15, 'Receivables overdue beyond 60 days as a % of area sales', { steps: steps([[1, 100], [2, 70], [3, 40]]) }),
    kpi('ASM-3', 'Team productivity (% SOs ≥ 90% target)', 'People', '%', 'higher', 70, 'B', 15, 'Share of Sales Officers in the area reaching at least 90% of target'),
    kpi('ASM-4', 'Distributor health', 'Operational', 'Score', 'higher', 5, 'C', 15, 'Distributor stock cover, claim settlement and infrastructure'),
    kpi('ASM-5', 'Active outlet growth', 'Customer', '%', 'higher', 8, 'A', 15, 'Year-on-year growth in billed outlets'),
    kpi('ASM-6', 'Team attrition', 'People', '%', 'lower', 10, 'E', 10, 'Voluntary exits in the area team as a % of headcount', { steps: steps([[10, 100], [15, 60], [20, 30]]) }),
  ]),
  template('tpl_ae', 'TPL-AE', 'Accounts Executive', ['AE', 'HOF'], 70, 'staff', 'gate', 'Closing, compliance and reporting discipline for Finance & Accounts.', [
    kpi('AE-1', 'Month-end closing (working day)', 'Operational', 'Days', 'lower', 5, 'E', 20, 'Average working day of the month on which the books are closed', { steps: steps([[5, 100], [6, 70], [7, 40]]) }),
    kpi('AE-2', 'Statutory filings on time', 'Compliance', '%', 'higher', 100, 'E', 20, 'VAT, TDS and other statutory returns filed by the due date', { steps: steps([[100, 100], [90, 50]]), isGate: true }),
    kpi('AE-3', 'Voucher error rate', 'Operational', '%', 'lower', 0.5, 'B', 15, 'Vouchers corrected after posting as a % of vouchers raised'),
    kpi('AE-4', 'Bank reconciliation by 5th', 'Operational', '%', 'higher', 100, 'E', 15, 'Bank accounts reconciled by the 5th of the following month', { steps: steps([[100, 100], [90, 60]]) }),
    kpi('AE-5', 'Audit query closure within 7 WD', 'Compliance', '%', 'higher', 100, 'A', 15, 'Internal and external audit queries closed within 7 working days'),
    kpi('AE-6', 'MIS delivered by 7th', 'Customer', '%', 'higher', 100, 'E', 15, 'Monthly MIS pack delivered to management by the 7th', { steps: steps([[100, 100], [80, 60]]) }),
  ]),
  template('tpl_po', 'TPL-PO', 'Procurement Officer', ['PO'], 70, 'staff', 'gate', 'Savings, cycle time and supplier performance for procurement.', [
    kpi('PO-1', 'Cost saving vs last price', 'Financial', '%', 'higher', 3, 'B', 25, 'Weighted saving against the last purchase price on items bought'),
    kpi('PO-2', 'PO cycle time (local)', 'Operational', 'Days', 'lower', 5, 'B', 15, 'Average days from approved requisition to purchase order for local items'),
    kpi('PO-3', 'Supplier on-time delivery', 'Operational', '%', 'higher', 95, 'B', 15, 'PO lines delivered on or before the agreed date'),
    kpi('PO-4', 'Incoming rejection', 'Operational', '%', 'lower', 1, 'B', 10, 'Received quantity rejected at QC as a % of receipts'),
    kpi('PO-5', 'CS / 3-quotation compliance', 'Compliance', '%', 'higher', 100, 'E', 20, 'POs above the threshold backed by a comparative statement of three quotations', { steps: steps([[100, 100], [95, 60]]), isGate: true }),
    kpi('PO-6', 'Critical stock-outs', 'Customer', 'Nos', 'lower', 0, 'E', 15, 'Production stoppages caused by a critical item being out of stock', { steps: steps([[0, 100], [1, 50]]) }),
  ]),
  template('tpl_ps', 'TPL-PS', 'Production Supervisor', ['PS', 'PM', 'MO'], 70, 'staff', 'kpi', 'Output, quality, safety and attendance on the production floor.', [
    kpi('PS-1', 'Output vs plan', 'Operational', '%', 'higher', 98, 'B', 30, 'Good units produced as a % of the production plan'),
    kpi('PS-2', 'Rejection / rework', 'Operational', '%', 'lower', 1.5, 'B', 15, 'Units rejected or reworked as a % of output'),
    kpi('PS-3', 'OEE', 'Operational', '%', 'higher', 75, 'B', 15, 'Overall equipment effectiveness (availability × performance × quality)'),
    kpi('PS-4', 'Lost-time injuries', 'Compliance', 'Nos', 'lower', 0, 'E', 15, 'Injuries on the line causing lost working time', { steps: steps([[0, 100], [1, 50]]), isGate: true }),
    kpi('PS-5', 'Material wastage', 'Financial', '%', 'lower', 2, 'B', 10, 'Raw and packing material lost beyond the standard allowance'),
    kpi('PS-6', 'Attendance & punctuality', 'People', 'Score', 'higher', 100, 'A', 15, 'System score from monthly attendance and late marks', { source: 'attendance' }),
  ]),
  template('tpl_hro', 'TPL-HRO', 'HR Officer', ['HRO', 'HOH'], 70, 'staff', 'gate', 'Hiring, payroll accuracy, compliance and people development for HR.', [
    kpi('HR-1', 'Time-to-fill within SLA', 'Operational', '%', 'higher', 100, 'B', 20, 'Vacancies filled within the agreed hiring SLA'),
    kpi('HR-2', 'Payroll error lines', 'Operational', '%', 'lower', 0.2, 'B', 20, 'Payroll lines corrected after disbursement as a % of lines'),
    kpi('HR-3', 'Statutory compliance points closed', 'Compliance', '%', 'higher', 100, 'E', 20, 'Labour-law and inspection points closed by their due date', { steps: steps([[100, 100], [90, 60]]), isGate: true }),
    kpi('HR-4', 'Training hours per employee', 'People', 'Hours', 'higher', 16, 'A', 15, 'Average training hours delivered per employee in the period'),
    kpi('HR-5', 'Regret attrition', 'People', '%', 'lower', 12, 'B', 10, 'Regretted voluntary exits as a % of headcount'),
    kpi('HR-6', 'Grievance TAT ≤ 15 days', 'Customer', '%', 'higher', 100, 'A', 15, 'Grievances closed within 15 days'),
  ]),
  template('tpl_ito', 'TPL-ITO', 'IT Officer', ['ITO'], 70, 'staff', 'gate', 'Service levels, uptime, security hygiene and user satisfaction for IT.', [
    kpi('IT-1', 'Tickets resolved within SLA', 'Operational', '%', 'higher', 95, 'B', 25, 'Helpdesk tickets closed within their SLA'),
    kpi('IT-2', 'Core system uptime', 'Operational', '%', 'higher', 99.5, 'E', 20, 'Availability of ERP, mail and network during working hours', { steps: steps([[99.5, 100], [99, 70], [98, 40]]), isGate: true }),
    kpi('IT-3', 'Backup success & restore test', 'Compliance', '%', 'higher', 100, 'E', 15, 'Scheduled backups completed and quarterly restore tests passed', { steps: steps([[100, 100], [95, 50]]) }),
    kpi('IT-4', 'Patching ≤ 30 days', 'Compliance', '%', 'higher', 95, 'E', 15, 'Critical patches applied within 30 days of release', { steps: steps([[95, 100], [85, 60]]) }),
    kpi('IT-5', 'Asset inventory accuracy', 'Operational', '%', 'higher', 100, 'A', 10, 'IT assets found at the recorded location and user on audit'),
    kpi('IT-6', 'User CSAT', 'Customer', 'Score', 'higher', 4.2, 'A', 15, 'Average user satisfaction score (1–5) on closed tickets'),
  ]),
  template('tpl_drv', 'TPL-DRV', 'Driver', ['DRV'], 70, 'staff', 'kpi', 'Safety, vehicle care, punctuality and attendance for drivers.', [
    kpi('DRV-1', 'At-fault accidents & fines', 'Compliance', 'Nos', 'lower', 0, 'E', 25, 'Accidents and traffic fines attributable to the driver', { steps: steps([[0, 100], [1, 40]]), isGate: true }),
    kpi('DRV-2', 'Maintenance & daily checklist', 'Operational', '%', 'higher', 100, 'A', 15, 'Daily vehicle checklists and scheduled servicing completed'),
    kpi('DRV-3', 'Fuel efficiency', 'Financial', 'km/L', 'higher', 10, 'B', 15, 'Kilometres per litre against the vehicle standard'),
    kpi('DRV-4', 'On-time trips', 'Customer', '%', 'higher', 95, 'B', 15, 'Trips completed on schedule'),
    kpi('DRV-5', 'Documents & logbook valid', 'Compliance', '%', 'higher', 100, 'E', 15, 'Licence, fitness, tax token and logbook valid on inspection', { steps: steps([[100, 100], [90, 50]]) }),
    kpi('DRV-6', 'Attendance & punctuality', 'People', 'Score', 'higher', 100, 'A', 15, 'System score from monthly attendance and late marks', { source: 'attendance' }),
  ]),
  template('tpl_prob', 'TPL-PROB', 'Probation review', DESIGNATIONS.map((d) => d.code), 50, 'staff', 'gate', 'Onboarding and early delivery review for every probationer.', [
    kpi('PR-1', 'Onboarding & induction completed', 'People', 'Y/N', 'higher', 1, 'D', 30, 'Induction, policy briefing and system access completed'),
    kpi('PR-2', 'Core role processes learned', 'Operational', 'Score', 'higher', 5, 'C', 35, 'Manager rating of how well the core processes of the role are understood'),
    kpi('PR-3', 'Initial assignments delivered on time', 'Operational', 'Score', 'higher', 5, 'C', 35, 'Manager rating of delivery of the first assignments'),
  ], ['Probation']),
];

// ---------------------------------------------------------------------------
// Leave types (policy at or above the statutory minimum). Numeric fields are strings.

export const DEFAULT_LEAVE_TYPES = [
  { code: 'EL', name: 'Earned Leave', annualDays: '20', paid: true, accrues: true, carryForward: true, carryCap: '60', encashable: true, minServiceMonths: '12', maxConsecutive: '30', countCalendarDays: false, genderOnly: '', unlimited: false, statutoryRef: 's.117' },
  { code: 'CL', name: 'Casual Leave', annualDays: '10', paid: true, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '0', maxConsecutive: '3', countCalendarDays: false, genderOnly: '', unlimited: false, statutoryRef: 's.115' },
  { code: 'SL', name: 'Sick Leave', annualDays: '14', paid: true, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '0', maxConsecutive: '14', countCalendarDays: false, genderOnly: '', unlimited: false, statutoryRef: 's.116' },
  { code: 'ML', name: 'Maternity Leave', annualDays: '112', paid: true, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '6', maxConsecutive: '112', countCalendarDays: true, genderOnly: 'Female', unlimited: false, statutoryRef: 's.46' },
  { code: 'PL', name: 'Paternity Leave', annualDays: '5', paid: true, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '0', maxConsecutive: '5', countCalendarDays: false, genderOnly: 'Male', unlimited: false, statutoryRef: 'Policy' },
  { code: 'LWP', name: 'Leave Without Pay', annualDays: '0', paid: false, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '0', maxConsecutive: '90', countCalendarDays: false, genderOnly: '', unlimited: true, statutoryRef: 'Policy' },
];

// ---------------------------------------------------------------------------
// Calendar defaults (editable in Settings → Holidays & calendar).

export const DEFAULT_HOLIDAYS_2026 = [
  { date: '2026-02-21', name: 'Shaheed Day' },
  { date: '2026-03-19', name: 'Eid-ul-Fitr (approx.)' },
  { date: '2026-03-20', name: 'Eid-ul-Fitr (approx.), day 2' },
  { date: '2026-03-21', name: 'Eid-ul-Fitr (approx.), day 3' },
  { date: '2026-03-26', name: 'Independence Day' },
  { date: '2026-04-14', name: 'Pahela Baishakh' },
  { date: '2026-05-01', name: 'May Day' },
  { date: '2026-05-26', name: 'Eid-ul-Adha (approx.)' },
  { date: '2026-05-27', name: 'Eid-ul-Adha (approx.), day 2' },
  { date: '2026-05-28', name: 'Eid-ul-Adha (approx.), day 3' },
  { date: '2026-06-26', name: 'Ashura' },
  { date: '2026-08-26', name: 'Eid-e-Milad-un-Nabi' },
  { date: '2026-10-20', name: 'Durga Puja (Bijoya Dashami)' },
  { date: '2026-12-16', name: 'Victory Day' },
  { date: '2026-12-25', name: 'Christmas Day' },
];

// ---------------------------------------------------------------------------
// HR settings — Bangladesh Labour Act 2006 as amended 2026 defaults.
// Deep-merged with the stored copy by helpers.migrateHrSettings; a lower
// stored schemaVersion re-seeds every HR collection.

export const DEFAULT_HR_SETTINGS = {
  schemaVersion: 1,
  company: { name: 'Padma Consumer Industries Ltd.', address: 'Plot 12, Tejgaon I/A, Dhaka 1208', establishmentType: 'commercial' },
  // asOfDate blank = real clock (demo clock for replaying the seed).
  calendar: { asOfDate: '', weeklyOffs: ['Fri', 'Sat'], holidays: [...DEFAULT_HOLIDAYS_2026] },
  statutory: {
    lawVersion: 'auto', lawCutoverDate: '2025-11-17', applyToNonWorkers: true, daysPerMonth: 30, partialYearRounding: 'six_months',
    compWageBase: 'basic_da', countLastDayInclusive: false, continuousServiceDays: 240, retirementAge: 60,
  },
  // Notice days by separation type and employment type (s.20, s.26, s.27).
  notice: {
    employerPermanentMonthly: 120, employerPermanentOther: 60, employerTemporaryMonthly: 30, employerTemporaryOther: 14,
    workerPermanent: 60, workerTemporaryMonthly: 30, workerTemporaryOther: 14,
    probation: 0, contractExpiry: 0, retrenchment: 30, retrenchmentAfterLayoffExtraDays: 15, discharge: 0, dismissal: 0, retirement: 0, death: 0,
  },
  // Compensation days per completed year of service by separation type.
  compensation: {
    minServiceYears: 1, terminationDaysPerYear: 30, retrenchmentDaysPerYear: 30, dischargeDaysPerYear: 30, dismissalDaysPerYear: 15,
    retirementDaysPerYear: 30, deathDaysPerYear: 30, deathAtWorkDaysPerYear: 45, deathMinServiceYears: 1, deathMinServiceYearsPre2025: 2,
    // s.27(4) resignation benefit tiers; the first tier whose bound holds applies.
    resignationTiers: [{ upToYears: 3, inclusive: true, days: 7 }, { upToYears: 10, inclusive: false, days: 15 }, { upToYears: null, inclusive: false, days: 30 }],
    resignationTiersPre2025: [{ upToYears: 5, inclusive: false, days: 0 }, { upToYears: 10, inclusive: false, days: 14 }, { upToYears: null, inclusive: false, days: 30 }],
    resignationGratuityCompareAllTiers: true, forfeitOnMisconductClauses: ['23(4)(b)', '23(4)(g)'], permanentOnly: true,
  },
  gratuity: { schemeEnabled: false, daysPerYear: 30, daysPerYearAfter10: 45, wageBase: 'basic', compareWithCompensation: true, fundApproved: false },
  leave: { year: 2026, elAccrual: 'annual', elAccrualDivisor: 18, elCapDays: 60, encashOnExit: true, encashRateBase: 'gross', prorateOnExit: false, latesPerLeaveDay: 3 },
  pf: { enabled: true, eligibilityMonths: 12, employeeRatePct: 8, employerRatePct: 8, rateBase: 'basic', vestingYears: 2, vestOnDeath: true, forfeitOnDismissal: false, advanceSetoff: true, recognised: true },
  bonus: { countPerYear: 2, maxEachBasicMultiple: 1, prorataOnExit: 'none' },
  noticeShortfall: { base: 'basic_da', setoffAllowed: true },
  deductions: { assetRecoveryRequiresShowCause: true },
  // Income Tax Act 2023 estimate inputs (always labelled "estimate").
  tax: {
    exemptionDivisor: 3, exemptionCap: 500000, gratuityExemptCap: 25000000, minimumTax: 5000,
    thresholds: { general: 400000, female_senior: 450000, disabled: 525000, war_wounded: 550000 },
    slabs: [{ width: 300000, rate: 10 }, { width: 400000, rate: 15 }, { width: 500000, rate: 20 }, { width: 2000000, rate: 25 }, { width: null, rate: 30 }],
    fiscalYearStartMonth: 7,
  },
  settlement: { deadlineWorkingDays: 30, managementApprovalAbove: 500000, managementApprovalTypes: ['Termination', 'Retrenchment', 'Dismissal', 'Death'], managementApprovalGrades: ['G1', 'G2', 'G3'], issueServiceCertificate: true },
  probation: { monthsClerical: 6, monthsOther: 3, extensionMonths: 3, confirmScoreMin: 60, extendScoreMin: 45, attendanceMin: 90, extendAttendanceMin: 85, maxUnapproved: 2, maxAvgLates: 4 },
  appraisal: {
    maxCustomKpis: 2, minServiceDays: 90, proRataMonths: 9, ratingCommentMinChars: 50, hrAdjustMax: 1, pipDays: 90, pipDaysWorker: 60, ackDays: 7, managerialGrades: ['G1', 'G2', 'G3', 'G4'],
    // Grade bands by final score; guidedPct is the suggested distribution.
    bands: [
      { code: 'A+', name: 'Outstanding', min: 90, incrementPct: 12, bonusMultiplier: 1.5, promotionEligible: true, pip: false, guidedPct: 10, tone: 'green' },
      { code: 'A', name: 'Exceeds Expectations', min: 75, incrementPct: 9, bonusMultiplier: 1.25, promotionEligible: true, pip: false, guidedPct: 25, tone: 'blue' },
      { code: 'B', name: 'Meets Expectations', min: 60, incrementPct: 6, bonusMultiplier: 1, promotionEligible: true, pip: false, guidedPct: 50, tone: 'indigo' },
      { code: 'C', name: 'Needs Improvement', min: 45, incrementPct: 0, bonusMultiplier: 0.5, promotionEligible: false, pip: false, guidedPct: 10, tone: 'amber' },
      { code: 'D', name: 'Unsatisfactory', min: 0, incrementPct: 0, bonusMultiplier: 0, promotionEligible: false, pip: true, guidedPct: 5, tone: 'red' },
    ],
    // Grade caps triggered by discipline, integrity, attendance and gate KPIs.
    gates: { writtenWarningCap: 'B', finalWarningCap: 'C', integrityMaxRating: 2, integrityCap: 'C', attendanceBelowPct: 85, attendanceCap: 'B', unapprovedAbsenceDays: 3, unapprovedCap: 'B', gateKpiFailBelow: 50, gateKpiCap: 'C' },
    // System attendance KPI: weighted attendance % and punctuality step tables.
    attendance: {
      gracePeriodMin: 10, attendanceWeight: 0.6, unapprovedPenalty: 10,
      attendanceSteps: [{ min: 97, score: 100 }, { min: 95, score: 80 }, { min: 92, score: 60 }, { min: 90, score: 40 }, { min: 0, score: 0 }],
      punctualitySteps: [{ maxLates: 2, score: 100 }, { maxLates: 4, score: 70 }, { maxLates: 6, score: 40 }, { maxLates: null, score: 0 }],
    },
  },
};

// ---------------------------------------------------------------------------
// Misc constants.

// Pseudo-entity that settings, cycle and leave-year audit entries anchor to.
export const HR_SYSTEM = { id: 'hr_system', code: 'HR', name: 'HR System' };

export const BD_BANKS = ['BRAC Bank', 'Eastern Bank', 'Dutch-Bangla Bank', 'City Bank', 'Islami Bank Bangladesh', 'Prime Bank', 'Mutual Trust Bank', 'bKash', 'Nagad'];

export const WORK_LOCATIONS = ['Dhaka HQ', 'Narayanganj Factory', 'Gazipur Factory', 'Chattogram Office', 'Cumilla Depot', 'Field'];

export const RELATIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'];

// Static configuration for the KYC module: roles, statuses, customer types,
// required documents per customer type, and risk criteria.

export const ROLES = {
  FIELD_OFFICER: 'Field Officer',
  REVIEWER: 'Reviewer / Supervisor',
  APPROVER: 'KYC Approver',
  CREDIT_MANAGER: 'Credit Manager',
  ADMIN: 'Administrator',
};

export const USERS = [
  { id: 'u1', name: 'Rafiq Ahmed', role: ROLES.FIELD_OFFICER, territory: 'Dhaka North' },
  { id: 'u2', name: 'Shirin Akter', role: ROLES.FIELD_OFFICER, territory: 'Chattogram' },
  { id: 'u3', name: 'Mahbub Hasan', role: ROLES.REVIEWER, territory: 'Dhaka' },
  { id: 'u4', name: 'Nasrin Sultana', role: ROLES.APPROVER, territory: 'Head Office' },
  { id: 'u5', name: 'Kamal Uddin', role: ROLES.CREDIT_MANAGER, territory: 'Head Office' },
  { id: 'u6', name: 'System Admin', role: ROLES.ADMIN, territory: 'Head Office' },
];

export const STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  VERIFICATION: 'Verification',
  APPROVAL: 'Approval',
  ACTIVE: 'Active',
  RETURNED: 'Returned for Correction',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

export const STATUS_COLORS = {
  [STATUS.DRAFT]: 'gray',
  [STATUS.SUBMITTED]: 'blue',
  [STATUS.VERIFICATION]: 'indigo',
  [STATUS.APPROVAL]: 'purple',
  [STATUS.ACTIVE]: 'green',
  [STATUS.RETURNED]: 'amber',
  [STATUS.REJECTED]: 'red',
  [STATUS.SUSPENDED]: 'red',
};

export const CREDIT_STATUS = {
  NONE: 'Not Requested',
  REQUESTED: 'Requested',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  SUSPENDED: 'Suspended',
};

export const RISK = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export const DOC_TYPES = {
  NID: 'National ID (NID)',
  PASSPORT: 'Passport',
  TRADE_LICENSE: 'Trade License',
  TIN: 'TIN Certificate',
  BIN: 'BIN / VAT Registration',
  INCORPORATION: 'Certificate of Incorporation',
  BANK_STATEMENT: 'Bank Statement',
  OUTLET_PHOTO: 'Outlet Photograph',
  DEALERSHIP_AGREEMENT: 'Dealership Agreement',
  OTHER: 'Other',
};

// Documents that carry an expiry date.
export const EXPIRING_DOCS = [DOC_TYPES.TRADE_LICENSE, DOC_TYPES.PASSPORT, DOC_TYPES.DEALERSHIP_AGREEMENT];

// Default customer-type configuration. Editable from Settings.
export const DEFAULT_CUSTOMER_TYPES = [
  {
    code: 'RETAILER',
    name: 'Retailer',
    description: 'Small retail outlet; verified by field officer and supervisor.',
    requiredDocs: [DOC_TYPES.NID, DOC_TYPES.TRADE_LICENSE, DOC_TYPES.OUTLET_PHOTO],
    requireBank: false,
    requireLocation: true,
    requireBusinessReg: false,
    minReferences: 1,
    reviewMonths: 12,
  },
  {
    code: 'DEALER',
    name: 'Dealer',
    description: 'Authorised dealer; full business verification and bank details required.',
    requiredDocs: [DOC_TYPES.NID, DOC_TYPES.TRADE_LICENSE, DOC_TYPES.TIN, DOC_TYPES.BIN, DOC_TYPES.BANK_STATEMENT, DOC_TYPES.OUTLET_PHOTO, DOC_TYPES.DEALERSHIP_AGREEMENT],
    requireBank: true,
    requireLocation: true,
    requireBusinessReg: true,
    minReferences: 2,
    reviewMonths: 12,
  },
  {
    code: 'CORPORATE',
    name: 'Corporate / Project Customer',
    description: 'Companies and construction projects buying direct.',
    requiredDocs: [DOC_TYPES.NID, DOC_TYPES.TRADE_LICENSE, DOC_TYPES.TIN, DOC_TYPES.BIN, DOC_TYPES.INCORPORATION, DOC_TYPES.BANK_STATEMENT],
    requireBank: true,
    requireLocation: false,
    requireBusinessReg: true,
    minReferences: 2,
    reviewMonths: 24,
  },
];

export const RISK_CRITERIA = [
  { key: 'newBusiness', label: 'Business operating less than 2 years', weight: 2 },
  { key: 'noTradeLicense', label: 'Trade license missing or expired', weight: 3 },
  { key: 'cashOnly', label: 'No verifiable bank account', weight: 2 },
  { key: 'addressMismatch', label: 'Outlet address differs from license address', weight: 2 },
  { key: 'duplicateFlag', label: 'Duplicate identity or contact flagged', weight: 3 },
  { key: 'highVolume', label: 'Requested credit over BDT 20 lakh', weight: 2 },
  { key: 'adverseHistory', label: 'Adverse payment history with us or other suppliers', weight: 4 },
];

export const PAYMENT_TERMS = ['Advance', 'Cash on Delivery', 'Net 7', 'Net 15', 'Net 30', 'Net 45'];

export const DIVISIONS = ['Dhaka', 'Chattogram', 'Rajshahi', 'Khulna', 'Barishal', 'Sylhet', 'Rangpur', 'Mymensingh'];

// Which roles can perform which workflow actions.
export const PERMISSIONS = {
  create: [ROLES.FIELD_OFFICER, ROLES.ADMIN],
  edit: [ROLES.FIELD_OFFICER, ROLES.ADMIN],
  submit: [ROLES.FIELD_OFFICER, ROLES.ADMIN],
  verify: [ROLES.REVIEWER, ROLES.ADMIN],
  returnForCorrection: [ROLES.REVIEWER, ROLES.APPROVER, ROLES.ADMIN],
  approve: [ROLES.APPROVER, ROLES.ADMIN],
  reject: [ROLES.REVIEWER, ROLES.APPROVER, ROLES.ADMIN],
  suspend: [ROLES.APPROVER, ROLES.ADMIN],
  reinstate: [ROLES.APPROVER, ROLES.ADMIN],
  creditDecide: [ROLES.CREDIT_MANAGER, ROLES.ADMIN],
  creditRequest: [ROLES.FIELD_OFFICER, ROLES.REVIEWER, ROLES.ADMIN],
  viewSensitive: [ROLES.REVIEWER, ROLES.APPROVER, ROLES.CREDIT_MANAGER, ROLES.ADMIN],
  viewDocuments: [ROLES.FIELD_OFFICER, ROLES.REVIEWER, ROLES.APPROVER, ROLES.CREDIT_MANAGER, ROLES.ADMIN],
  settings: [ROLES.ADMIN],
  audit: [ROLES.REVIEWER, ROLES.APPROVER, ROLES.ADMIN],
  review: [ROLES.REVIEWER, ROLES.APPROVER, ROLES.ADMIN],
};

export const can = (role, action) => (PERMISSIONS[action] || []).includes(role);

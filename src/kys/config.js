// KYS (Know Your Supplier) configuration: roles, statuses, supplier types,
// required documents per type, risk criteria and permissions.
import { ROLES } from '../data/config';

export const KYS_ROLES = {
  PROC_OFFICER: 'Procurement Officer',
  EVALUATOR: 'Supplier Evaluator',
  PROC_HEAD: 'Procurement Head',
  FINANCE: 'Finance Manager',
  ADMIN: ROLES.ADMIN,
};

export const KYS_USERS = [
  { id: 's1', name: 'Tanim Chowdhury', role: KYS_ROLES.PROC_OFFICER, territory: 'Procurement' },
  { id: 's2', name: 'Rumana Islam', role: KYS_ROLES.EVALUATOR, territory: 'Quality & Compliance' },
  { id: 's3', name: 'Arif Mahmud', role: KYS_ROLES.PROC_HEAD, territory: 'Head Office' },
  { id: 's4', name: 'Shila Das', role: KYS_ROLES.FINANCE, territory: 'Finance' },
];

export const SUPPLIER_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  EVALUATION: 'Evaluation',
  APPROVAL: 'Approval',
  ACTIVE: 'Active',
  RETURNED: 'Returned for Correction',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
  BLACKLISTED: 'Blacklisted',
};

export const SUPPLIER_FLOW = [SUPPLIER_STATUS.DRAFT, SUPPLIER_STATUS.SUBMITTED, SUPPLIER_STATUS.EVALUATION, SUPPLIER_STATUS.APPROVAL, SUPPLIER_STATUS.ACTIVE];

export const SUPPLIER_STATUS_COLORS = {
  [SUPPLIER_STATUS.DRAFT]: 'gray',
  [SUPPLIER_STATUS.SUBMITTED]: 'blue',
  [SUPPLIER_STATUS.EVALUATION]: 'indigo',
  [SUPPLIER_STATUS.APPROVAL]: 'purple',
  [SUPPLIER_STATUS.ACTIVE]: 'green',
  [SUPPLIER_STATUS.RETURNED]: 'amber',
  [SUPPLIER_STATUS.REJECTED]: 'red',
  [SUPPLIER_STATUS.SUSPENDED]: 'red',
  [SUPPLIER_STATUS.BLACKLISTED]: 'red',
};

// Commercial terms approval (the supplier-side counterpart of credit approval).
export const TERMS_STATUS = {
  NONE: 'Not Requested',
  REQUESTED: 'Requested',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  SUSPENDED: 'Suspended',
};

export const SUPPLIER_DOC_TYPES = {
  TRADE_LICENSE: 'Trade License',
  TIN: 'TIN Certificate',
  BIN: 'BIN / VAT Registration',
  INCORPORATION: 'Certificate of Incorporation',
  IRC: 'Import Registration (IRC)',
  ISO: 'ISO / Quality Certificate',
  FACTORY_LICENSE: 'Factory License',
  ENV_CLEARANCE: 'Environmental Clearance',
  BANK_STATEMENT: 'Bank Statement',
  AUDITED_FINANCIALS: 'Audited Financial Statements',
  OWNER_ID: 'Owner / Director NID or Passport',
  SITE_PHOTO: 'Site / Facility Photograph',
  SAMPLE_TEST: 'Sample Test Report',
  INSURANCE: 'Insurance Certificate',
  OTHER: 'Other',
};

export const EXPIRING_SUPPLIER_DOCS = [
  SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.IRC, SUPPLIER_DOC_TYPES.ISO, SUPPLIER_DOC_TYPES.FACTORY_LICENSE,
  SUPPLIER_DOC_TYPES.ENV_CLEARANCE, SUPPLIER_DOC_TYPES.INSURANCE,
];

export const SUPPLY_CATEGORIES = ['Raw materials', 'Packaging', 'Spare parts & consumables', 'Machinery & equipment', 'Transport & logistics', 'IT & professional services', 'Construction & civil works', 'Office & facility supplies', 'Other'];

export const COUNTRIES = ['Bangladesh', 'India', 'China', 'Vietnam', 'Thailand', 'Malaysia', 'UAE', 'Turkey', 'Germany', 'Other'];

export const DEFAULT_SUPPLIER_TYPES = [
  {
    code: 'MANUFACTURER',
    name: 'Manufacturer',
    description: 'Produces goods in its own facility; site audit and quality certification expected.',
    requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN, SUPPLIER_DOC_TYPES.BIN, SUPPLIER_DOC_TYPES.FACTORY_LICENSE, SUPPLIER_DOC_TYPES.OWNER_ID, SUPPLIER_DOC_TYPES.BANK_STATEMENT, SUPPLIER_DOC_TYPES.SITE_PHOTO],
    requireSiteAudit: true,
    requireFinancials: true,
    requireBank: true,
    minReferences: 2,
    reviewMonths: 12,
  },
  {
    code: 'TRADER',
    name: 'Trader / Importer',
    description: 'Supplies goods sourced from others; import registration required for foreign goods.',
    requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN, SUPPLIER_DOC_TYPES.BIN, SUPPLIER_DOC_TYPES.OWNER_ID, SUPPLIER_DOC_TYPES.BANK_STATEMENT],
    requireSiteAudit: false,
    requireFinancials: true,
    requireBank: true,
    minReferences: 2,
    reviewMonths: 12,
  },
  {
    code: 'LOGISTICS',
    name: 'Transport & Logistics',
    description: 'Fleet operators and freight forwarders; insurance and vehicle details matter.',
    requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN, SUPPLIER_DOC_TYPES.OWNER_ID, SUPPLIER_DOC_TYPES.INSURANCE, SUPPLIER_DOC_TYPES.BANK_STATEMENT],
    requireSiteAudit: false,
    requireFinancials: false,
    requireBank: true,
    minReferences: 1,
    reviewMonths: 12,
  },
  {
    code: 'SERVICE',
    name: 'Service Provider',
    description: 'Professional, IT, maintenance and facility services.',
    requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN, SUPPLIER_DOC_TYPES.OWNER_ID, SUPPLIER_DOC_TYPES.BANK_STATEMENT],
    requireSiteAudit: false,
    requireFinancials: false,
    requireBank: true,
    minReferences: 1,
    reviewMonths: 24,
  },
  {
    code: 'CONTRACTOR',
    name: 'Works Contractor',
    description: 'Civil, mechanical and electrical works; safety and insurance evidence required.',
    requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN, SUPPLIER_DOC_TYPES.BIN, SUPPLIER_DOC_TYPES.OWNER_ID, SUPPLIER_DOC_TYPES.INSURANCE, SUPPLIER_DOC_TYPES.BANK_STATEMENT],
    requireSiteAudit: true,
    requireFinancials: true,
    requireBank: true,
    minReferences: 2,
    reviewMonths: 12,
  },
];

export const SUPPLIER_RISK_CRITERIA = [
  { key: 'newSupplier', label: 'Operating less than 3 years', weight: 2 },
  { key: 'singleSource', label: 'Single-source item (no alternative supplier)', weight: 3 },
  { key: 'noCertification', label: 'No quality / ISO certification', weight: 2 },
  { key: 'adverseAudit', label: 'Site audit score below 60 or major non-conformance', weight: 4 },
  { key: 'financialWeak', label: 'Declining turnover or weak financials', weight: 3 },
  { key: 'complianceGap', label: 'Missing or expired statutory registration', weight: 3 },
  { key: 'sanctionsPep', label: 'Sanctions / PEP / adverse media match', weight: 5 },
  { key: 'foreignJurisdiction', label: 'Foreign supplier with limited recourse', weight: 2 },
  { key: 'relatedParty', label: 'Related party or conflict of interest declared', weight: 3 },
];

export const SUPPLIER_PAYMENT_TERMS = ['Advance', 'Cash on Delivery', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'LC at sight', 'LC 90 days'];

export const AUDIT_GRADES = ['A (Excellent)', 'B (Good)', 'C (Acceptable with actions)', 'D (Unacceptable)'];

export const KYS_PERMISSIONS = {
  create: [KYS_ROLES.PROC_OFFICER, KYS_ROLES.ADMIN],
  edit: [KYS_ROLES.PROC_OFFICER, KYS_ROLES.ADMIN],
  submit: [KYS_ROLES.PROC_OFFICER, KYS_ROLES.ADMIN],
  evaluate: [KYS_ROLES.EVALUATOR, KYS_ROLES.ADMIN],
  returnForCorrection: [KYS_ROLES.EVALUATOR, KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  approve: [KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  reject: [KYS_ROLES.EVALUATOR, KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  suspend: [KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  blacklist: [KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  reinstate: [KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  termsDecide: [KYS_ROLES.FINANCE, KYS_ROLES.ADMIN],
  termsRequest: [KYS_ROLES.PROC_OFFICER, KYS_ROLES.EVALUATOR, KYS_ROLES.ADMIN],
  viewSensitive: [KYS_ROLES.EVALUATOR, KYS_ROLES.PROC_HEAD, KYS_ROLES.FINANCE, KYS_ROLES.ADMIN],
  viewDocuments: Object.values(KYS_ROLES),
  settings: [KYS_ROLES.ADMIN],
  audit: [KYS_ROLES.EVALUATOR, KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
  review: [KYS_ROLES.EVALUATOR, KYS_ROLES.PROC_HEAD, KYS_ROLES.ADMIN],
};

export const canKys = (role, action) => (KYS_PERMISSIONS[action] || []).includes(role);

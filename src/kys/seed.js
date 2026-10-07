import { RISK } from '../data/config';
import { SUPPLIER_DOC_TYPES, SUPPLIER_STATUS, TERMS_STATUS } from './config';
import { emptySupplier, migrateSupplier } from './helpers';
import { addDays, addMonths, emptyBankAccount, today, uid } from '../utils/helpers';

const t = today();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const by = 'Tanim Chowdhury';

const doc = (type, { expiry = '', version = 1, current = true, uploadedBy = by, ago = 10, fileName, verified = false, verifiedBy = '', note = '' } = {}) => ({
  id: uid('doc'), type, fileName: fileName || `${type.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_v${version}.pdf`, issuedOn: '', expiry, version, current,
  uploadedBy, uploadedAt: daysAgo(ago), verified, verifiedBy, verifiedAt: verified ? daysAgo(ago - 2) : '', note,
});
const ref = (type, name, organisation, designation, mobile, email, relationship, yearsKnown, remarks, outcome = 'Not contacted', contactedBy = '', contactedAt = '', feedback = '') =>
  ({ id: uid('ref'), type, name, organisation, designation, mobile, email, relationship, yearsKnown, remarks, outcome, contactedBy, contactedAt, feedback });
const cert = (name, issuer, number, expiry) => ({ id: uid('cert'), name, issuer, number, expiry });
const prod = (item, category, unit, monthlyCapacity, committedToUs, leadTimeDays, minOrder, unitPrice) => ({ id: uid('prod'), item, category, unit, monthlyCapacity, committedToUs, leadTimeDays, minOrder, unitPrice });
const plant = (name, location, capacity, ownedOrRented = 'Owned') => ({ id: uid('plant'), name, location, capacity, ownedOrRented });
const owner = (name, designation, idNumber, nationality, share) => ({ id: uid('sown'), name, designation, idNumber, nationality, share });
const sig = (name, designation, mobile, email, canQuote = true, canInvoice = true) => ({ id: uid('sig'), name, designation, mobile, email, canQuote, canInvoice });

const make = (o) => migrateSupplier({ ...emptySupplier(by), ...o });

export const seedSuppliers = () => [
  make({
    id: 'sup_sample',
    code: 'SUP-1000',
    status: SUPPLIER_STATUS.ACTIVE,
    supplierType: 'MANUFACTURER',
    name: 'Meghna Polymers Ltd.',
    tradeName: 'Meghna Poly',
    country: 'Bangladesh',
    address: 'Plot 22, BSCIC Industrial Estate, Narayanganj',
    city: 'Narayanganj',
    website: 'https://meghnapoly.example',
    contactName: 'Md. Jahangir Alam',
    contactDesignation: 'Head of Sales',
    mobile: '01711000111',
    email: 'sales@meghnapoly.example',
    mobileVerified: true,
    emailVerified: true,
    registration: { ownershipType: 'Private Limited', establishedYear: '2009', yearsInBusiness: '17', employees: '240', tradeLicenseNo: 'NGJ-TL-77812', tradeLicenseExpiry: addMonths(t, 7), tin: '778899001122', bin: '000778899-0505', regNo: 'C-77812/09', regDate: '2009-05-12', ircNo: 'BA-0123456', ircExpiry: addMonths(t, 5) },
    compliance: {
      certifications: [cert('ISO 9001:2015', 'Bureau Veritas', 'BV-BD-9001-4471', addMonths(t, 14)), cert('ISO 14001:2015', 'Bureau Veritas', 'BV-BD-14001-1182', addMonths(t, 14)), cert('BSTI Product Certification', 'BSTI', 'BSTI-PC-2231', addMonths(t, 3))],
      codeOfConductSigned: true, noSanctionsDeclared: true, noPepDeclared: true, noChildLabourDeclared: true, environmentalCompliant: true, conflictOfInterest: '',
    },
    capability: {
      categories: ['Packaging', 'Raw materials'],
      products: [prod('PP woven sacks 50 kg', 'Packaging', 'pieces', '2500000', '900000', '12', '50000', '14.5'), prod('HDPE liner bags', 'Packaging', 'pieces', '1200000', '300000', '10', '20000', '6.2'), prod('Polypropylene granules', 'Raw materials', 'tons', '1800', '400', '21', '20', '128000')],
      plants: [plant('Narayanganj Plant', 'BSCIC Estate, Narayanganj', '3.7 million sacks / month'), plant('Gazipur Extrusion Unit', 'Kaliakoir, Gazipur', '1,800 tons granules / month', 'Leased')],
      majorClients: 'Three national cement companies, two fertiliser importers, Bangladesh Sugar & Food Industries Corporation',
      exportMarkets: 'Nepal, Bhutan',
      qualityProcess: 'In-line weight and tensile testing every 2 hours; batch retention samples kept 90 days.',
    },
    financials: { turnoverY1: '2850000000', turnoverY2: '2600000000', turnoverY3: '2100000000', netWorth: '1450000000', paidUpCapital: '500000000', loansOutstanding: '620000000', auditedBy: 'Rahman Rahman Huq', lastAuditedYear: '2025', insuranceCover: 'Fire & marine, BDT 1.2 billion' },
    bankAccounts: [
      { ...emptyBankAccount(true), bankName: 'Eastern Bank', branch: 'Narayanganj', accountType: 'Current', accountName: 'Meghna Polymers Ltd.', accountNo: '1051340009876', routingNo: '095671182', purpose: 'Supplier payments', verified: true, verifiedBy: 'Rumana Islam', verifiedAt: daysAgo(70) },
      { ...emptyBankAccount(false), bankName: 'HSBC', branch: 'Gulshan', accountType: 'Current', accountName: 'Meghna Polymers Ltd.', accountNo: '001-234567-001', routingNo: '110261725', purpose: 'LC settlements', verified: true, verifiedBy: 'Rumana Islam', verifiedAt: daysAgo(70) },
    ],
    owners: [owner('Md. Jahangir Alam', 'Managing Director', '1978123456789', 'Bangladesh', '55'), owner('Salma Alam', 'Director', '1981123456790', 'Bangladesh', '45')],
    signatories: [sig('Md. Jahangir Alam', 'Managing Director', '01711000111', 'md@meghnapoly.example'), sig('Kamrul Hasan', 'Manager, Accounts', '01811000222', 'accounts@meghnapoly.example', false, true)],
    references: [
      ref('Customer', 'Mr. Shafiq Rahman', 'Delta Cement Ltd.', 'Head of Procurement', '01713300100', 'shafiq@deltacement.example', 'Buys sacks for 6 years', '6', '', 'Positive', 'Rumana Islam', daysAgo(72), 'Consistent quality; two minor rejections in six years, both replaced within a week.'),
      ref('Bank', 'Ms. Nazia Karim', 'Eastern Bank, Narayanganj', 'Relationship Manager', '01713300200', '', 'Banker', '9', '', 'Positive', 'Rumana Islam', daysAgo(72), 'Facilities regular; no overdue.'),
      ref('Trade / supplier', 'Mr. Lee Wen', 'Sinopec Trading', 'Regional Sales', '+8613800001234', 'lee.wen@sinopec.example', 'Raw material supplier', '5', '', 'Positive', 'Rumana Islam', daysAgo(71), 'Pays LC on time.'),
    ],
    siteAudit: { done: true, date: addDays(t, -68), auditor: 'Rumana Islam', score: '86', grade: 'A (Excellent)', findings: 'Modern extrusion lines, calibrated weigh scales, good housekeeping. Minor: PPE compliance at loading bay.', correctiveActions: 'PPE signage and toolbox talk at loading bay.', dueDate: addDays(t, -40), closed: true },
    documents: [
      doc(SUPPLIER_DOC_TYPES.TRADE_LICENSE, { expiry: addMonths(t, 7), ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.TIN, { ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.BIN, { ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.INCORPORATION, { ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.IRC, { expiry: addMonths(t, 5), ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.ISO, { expiry: addMonths(t, 14), ago: 75, verified: true, verifiedBy: 'Rumana Islam', fileName: 'iso_9001_14001.pdf' }),
      doc(SUPPLIER_DOC_TYPES.FACTORY_LICENSE, { expiry: addMonths(t, 9), ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.ENV_CLEARANCE, { expiry: addMonths(t, 2), ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.OWNER_ID, { ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.BANK_STATEMENT, { ago: 75, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.AUDITED_FINANCIALS, { ago: 75, verified: true, verifiedBy: 'Rumana Islam', fileName: 'audited_fs_2025.pdf' }),
      doc(SUPPLIER_DOC_TYPES.SITE_PHOTO, { ago: 68, verified: true, verifiedBy: 'Rumana Islam', fileName: 'plant_lines.jpg' }),
      doc(SUPPLIER_DOC_TYPES.SAMPLE_TEST, { ago: 70, verified: true, verifiedBy: 'Rumana Islam', fileName: 'sack_tensile_test.pdf', note: 'Passed 1,200 N tensile' }),
    ],
    risk: { category: RISK.LOW, score: 0, criteria: [], reason: 'Established manufacturer, certified, strong audit, growing turnover, verified banking.', evaluatorComment: 'Recommended as preferred packaging supplier.' },
    terms: { status: TERMS_STATUS.APPROVED, requestedPaymentTerms: 'Net 45', creditDaysOffered: '45', annualCap: '180000000', securityDeposit: '0', justification: 'Primary sack supplier; annual requirement about 10 million sacks.', approvedPaymentTerms: 'Net 45', approvedCap: '180000000', rating: 'Preferred', decisionBy: 'Shila Das', decisionAt: daysAgo(62), decisionNote: 'Approved. Review cap with annual volume contract.' },
    reviewDue: addMonths(t, 10),
    lastReviewed: addMonths(t, -2),
    assignedEvaluator: 'Rumana Islam',
    createdAt: daysAgo(78),
    activatedAt: daysAgo(64),
    updatedAt: daysAgo(62),
  }),
  make({
    id: 'sup_seed2',
    code: 'SUP-1001',
    status: SUPPLIER_STATUS.EVALUATION,
    supplierType: 'TRADER',
    name: 'Orion Trade International',
    tradeName: 'Orion Trade',
    country: 'Bangladesh',
    address: '45 Motijheel C/A, Dhaka',
    city: 'Dhaka',
    contactName: 'Nusrat Jahan',
    contactDesignation: 'Director',
    mobile: '01819000333',
    email: 'nusrat@oriontrade.example',
    mobileVerified: true,
    emailVerified: false,
    registration: { ownershipType: 'Partnership', establishedYear: '2021', yearsInBusiness: '5', employees: '18', tradeLicenseNo: 'DSCC-TL-55120', tradeLicenseExpiry: addMonths(t, 4), tin: '551200334455', bin: '000551200-0606', ircNo: 'BA-0998877', ircExpiry: addDays(t, 20) },
    compliance: { certifications: [], codeOfConductSigned: true, noSanctionsDeclared: true, noPepDeclared: true, noChildLabourDeclared: true, environmentalCompliant: false, conflictOfInterest: '' },
    capability: {
      categories: ['Spare parts & consumables', 'Machinery & equipment'],
      products: [prod('Conveyor belts (imported)', 'Spare parts & consumables', 'metres', '4000', '1500', '45', '200', '3200'), prod('Bearings SKF', 'Spare parts & consumables', 'pieces', '6000', '1200', '30', '50', '1850')],
      plants: [],
      majorClients: 'Two steel re-rolling mills, one textile group',
      exportMarkets: '',
      qualityProcess: 'Supplies OEM certificates of conformity with each lot.',
    },
    financials: { turnoverY1: '95000000', turnoverY2: '110000000', turnoverY3: '70000000', netWorth: '28000000', paidUpCapital: '10000000', loansOutstanding: '21000000', auditedBy: '', lastAuditedYear: '', insuranceCover: '' },
    bankAccounts: [{ ...emptyBankAccount(true), bankName: 'City Bank', branch: 'Motijheel', accountType: 'Current', accountName: 'Orion Trade International', accountNo: '3101234567001', routingNo: '225271180', verified: false }],
    owners: [owner('Nusrat Jahan', 'Managing Partner', '1990555666777', 'Bangladesh', '60'), owner('Imtiaz Ahmed', 'Partner', '1988555666778', 'Bangladesh', '40')],
    signatories: [sig('Nusrat Jahan', 'Managing Partner', '01819000333', 'nusrat@oriontrade.example')],
    references: [
      ref('Customer', 'Mr. Habib Ullah', 'Karnaphuli Steel', 'Maintenance Manager', '01713400100', '', 'Spares buyer', '3', '', 'Positive', 'Rumana Islam', daysAgo(3), 'Delivers on time; prices competitive.'),
      ref('Bank', 'Mr. Rafiqul Islam', 'City Bank, Motijheel', 'Branch Manager', '01713400200', '', 'Banker', '4', ''),
    ],
    siteAudit: { done: false },
    documents: [
      doc(SUPPLIER_DOC_TYPES.TRADE_LICENSE, { expiry: addMonths(t, 4), ago: 6, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.TIN, { ago: 6, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.BIN, { ago: 6 }),
      doc(SUPPLIER_DOC_TYPES.IRC, { expiry: addDays(t, 20), ago: 6 }),
      doc(SUPPLIER_DOC_TYPES.OWNER_ID, { ago: 6 }),
      doc(SUPPLIER_DOC_TYPES.BANK_STATEMENT, { ago: 6 }),
    ],
    terms: { status: TERMS_STATUS.REQUESTED, requestedPaymentTerms: 'Net 30', creditDaysOffered: '30', annualCap: '40000000', securityDeposit: '0', justification: 'Alternative source for imported spares.' },
    assignedEvaluator: 'Rumana Islam',
    createdAt: daysAgo(8),
    updatedAt: daysAgo(3),
  }),
  make({
    id: 'sup_seed3',
    code: 'SUP-1002',
    status: SUPPLIER_STATUS.APPROVAL,
    supplierType: 'LOGISTICS',
    name: 'Padma Carriers Ltd.',
    country: 'Bangladesh',
    address: 'Tongi Road, Gazipur',
    city: 'Gazipur',
    contactName: 'Abdul Mannan',
    contactDesignation: 'Operations Manager',
    mobile: '01911000444',
    email: 'ops@padmacarriers.example',
    mobileVerified: true,
    emailVerified: true,
    registration: { ownershipType: 'Private Limited', establishedYear: '2014', yearsInBusiness: '12', employees: '85', tradeLicenseNo: 'GZP-TL-33210', tradeLicenseExpiry: addMonths(t, 10), tin: '332100998877', bin: '', regNo: 'C-33210/14', regDate: '2014-02-02' },
    compliance: { certifications: [], codeOfConductSigned: true, noSanctionsDeclared: true, noPepDeclared: true, noChildLabourDeclared: true, environmentalCompliant: true, conflictOfInterest: '' },
    capability: {
      categories: ['Transport & logistics'],
      products: [prod('Covered truck 10-ton (trip)', 'Transport & logistics', 'units', '600', '250', '1', '1', '18000'), prod('Trailer 20-ton (trip)', 'Transport & logistics', 'units', '200', '60', '2', '1', '32000')],
      plants: [plant('Fleet yard', 'Tongi, Gazipur', '38 trucks, 12 trailers')],
      majorClients: 'Two FMCG distributors, one steel mill',
      exportMarkets: '',
      qualityProcess: 'GPS tracking on all vehicles; delivery challan reconciliation daily.',
    },
    financials: { turnoverY1: '210000000', turnoverY2: '190000000', turnoverY3: '175000000', netWorth: '95000000', paidUpCapital: '30000000', loansOutstanding: '60000000', auditedBy: 'ACNABIN', lastAuditedYear: '2025', insuranceCover: 'Fleet comprehensive + goods in transit BDT 50 lakh/vehicle' },
    bankAccounts: [{ ...emptyBankAccount(true), bankName: 'Mutual Trust Bank', branch: 'Tongi', accountType: 'Current', accountName: 'Padma Carriers Ltd.', accountNo: '0020012345678', routingNo: '145330946', verified: true, verifiedBy: 'Rumana Islam', verifiedAt: daysAgo(4) }],
    owners: [owner('Abdul Mannan', 'Managing Director', '1975111222333', 'Bangladesh', '100')],
    signatories: [sig('Abdul Mannan', 'Managing Director', '01911000444', 'ops@padmacarriers.example')],
    references: [ref('Customer', 'Ms. Rokeya Begum', 'FreshMart Distribution', 'Logistics Head', '01713500100', '', 'Transport customer', '4', '', 'Positive', 'Rumana Islam', daysAgo(4), 'Reliable; damage claims below 0.2%.')],
    siteAudit: { done: false },
    documents: [
      doc(SUPPLIER_DOC_TYPES.TRADE_LICENSE, { expiry: addMonths(t, 10), ago: 12, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.TIN, { ago: 12, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.OWNER_ID, { ago: 12, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.INSURANCE, { expiry: addMonths(t, 6), ago: 12, verified: true, verifiedBy: 'Rumana Islam' }),
      doc(SUPPLIER_DOC_TYPES.BANK_STATEMENT, { ago: 12, verified: true, verifiedBy: 'Rumana Islam' }),
    ],
    risk: { category: RISK.LOW, score: 2, criteria: ['noCertification'], reason: 'Established fleet operator, insured.', evaluatorComment: 'Fit for domestic haulage.' },
    terms: { status: TERMS_STATUS.REQUESTED, requestedPaymentTerms: 'Net 30', creditDaysOffered: '30', annualCap: '60000000', securityDeposit: '0', justification: 'Secondary transporter for the northern route.' },
    assignedEvaluator: 'Rumana Islam',
    createdAt: daysAgo(14),
    updatedAt: daysAgo(4),
  }),
  make({
    id: 'sup_seed4',
    code: 'SUP-1003',
    status: SUPPLIER_STATUS.RETURNED,
    statusReason: 'Factory license has expired and the uploaded bank statement is older than six months.',
    supplierType: 'MANUFACTURER',
    name: 'Sunrise Chemicals',
    country: 'Bangladesh',
    address: 'Sitakunda, Chattogram',
    city: 'Chattogram',
    contactName: 'Rezaul Karim',
    contactDesignation: 'Proprietor',
    mobile: '01611000555',
    email: 'sunrisechem@example.com',
    mobileVerified: true,
    registration: { ownershipType: 'Sole Proprietorship', establishedYear: '2019', yearsInBusiness: '7', employees: '32', tradeLicenseNo: 'CTG-TL-88123', tradeLicenseExpiry: addMonths(t, 3), tin: '881230011223', bin: '000881230-0707' },
    compliance: { certifications: [], codeOfConductSigned: true, noSanctionsDeclared: true, noPepDeclared: true, noChildLabourDeclared: false, environmentalCompliant: false, conflictOfInterest: '' },
    capability: { categories: ['Raw materials'], products: [prod('Industrial grade caustic soda', 'Raw materials', 'tons', '300', '80', '7', '5', '68000')], plants: [plant('Sitakunda unit', 'Sitakunda', '300 tons / month')], majorClients: 'Local soap makers', exportMarkets: '', qualityProcess: '' },
    financials: { turnoverY1: '48000000', turnoverY2: '52000000', turnoverY3: '39000000', netWorth: '15000000', paidUpCapital: '', loansOutstanding: '19000000', auditedBy: '', lastAuditedYear: '', insuranceCover: '' },
    bankAccounts: [{ ...emptyBankAccount(true), bankName: 'Islami Bank', branch: 'Sitakunda', accountType: 'Current', accountName: 'Sunrise Chemicals', accountNo: '2050123400011', routingNo: '125152676', verified: false }],
    owners: [owner('Rezaul Karim', 'Proprietor', '1985999888777', 'Bangladesh', '100')],
    signatories: [sig('Rezaul Karim', 'Proprietor', '01611000555', 'sunrisechem@example.com')],
    references: [ref('Customer', 'Mr. Anis', 'Keya Soap Works', 'Owner', '01713600100', '', 'Buyer', '3', ''), ref('Bank', 'Mr. Salam', 'Islami Bank, Sitakunda', 'Officer', '01713600200', '', 'Banker', '5', '')],
    siteAudit: { done: true, date: addDays(t, -9), auditor: 'Rumana Islam', score: '54', grade: 'D (Unacceptable)', findings: 'No fume extraction in reactor hall; chemical storage without bunding; PPE not in use.', correctiveActions: 'Install extraction, bund storage area, enforce PPE; re-audit required.', dueDate: addDays(t, 50), closed: false },
    documents: [
      doc(SUPPLIER_DOC_TYPES.TRADE_LICENSE, { expiry: addMonths(t, 3), ago: 11 }), doc(SUPPLIER_DOC_TYPES.TIN, { ago: 11 }), doc(SUPPLIER_DOC_TYPES.BIN, { ago: 11 }),
      doc(SUPPLIER_DOC_TYPES.FACTORY_LICENSE, { expiry: addMonths(t, -2), ago: 11 }), doc(SUPPLIER_DOC_TYPES.OWNER_ID, { ago: 11 }), doc(SUPPLIER_DOC_TYPES.BANK_STATEMENT, { ago: 11, note: 'Statement dated 9 months ago' }),
      doc(SUPPLIER_DOC_TYPES.SITE_PHOTO, { ago: 9, fileName: 'reactor_hall.jpg' }),
    ],
    risk: { category: RISK.HIGH, score: 9, criteria: ['adverseAudit', 'complianceGap', 'noCertification'], reason: 'Failed site audit; expired factory license.', evaluatorComment: 'Returned pending corrective actions.' },
    assignedEvaluator: 'Rumana Islam',
    createdAt: daysAgo(15),
    updatedAt: daysAgo(6),
  }),
  make({
    id: 'sup_seed5',
    code: '',
    status: SUPPLIER_STATUS.DRAFT,
    supplierType: 'SERVICE',
    name: 'Bytecraft Solutions Ltd.',
    country: 'Bangladesh',
    address: 'House 9, Road 4, Dhanmondi, Dhaka',
    city: 'Dhaka',
    contactName: 'Farhan Siddiqui',
    contactDesignation: 'CEO',
    mobile: '01511000666',
    email: 'farhan@bytecraft.example',
    registration: { ownershipType: 'Private Limited', establishedYear: '2020', yearsInBusiness: '6', employees: '40', tradeLicenseNo: 'DNCC-TL-91001', tin: '910010011223' },
    capability: { categories: ['IT & professional services'], products: [prod('ERP support (annual)', 'IT & professional services', 'units', '10', '1', '30', '1', '2400000')], plants: [], majorClients: '', exportMarkets: '', qualityProcess: '' },
    owners: [owner('Farhan Siddiqui', 'CEO', '1992111000999', 'Bangladesh', '70')],
    signatories: [],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  }),
  make({
    id: 'sup_seed6',
    code: 'SUP-1004',
    status: SUPPLIER_STATUS.BLACKLISTED,
    statusReason: 'Supplied counterfeit bearings in March; forensic test confirmed non-OEM parts. Legal notice issued.',
    supplierType: 'TRADER',
    name: 'Quickparts Enterprise',
    country: 'Bangladesh',
    address: 'Nawabpur Road, Dhaka',
    city: 'Dhaka',
    contactName: 'Masud Rana',
    contactDesignation: 'Owner',
    mobile: '01311000777',
    email: 'quickparts@example.com',
    mobileVerified: true,
    registration: { ownershipType: 'Sole Proprietorship', establishedYear: '2017', yearsInBusiness: '9', employees: '6', tradeLicenseNo: 'DSCC-TL-40022', tradeLicenseExpiry: addMonths(t, 6), tin: '400220099887' },
    compliance: { certifications: [], codeOfConductSigned: true, noSanctionsDeclared: true, noPepDeclared: true, noChildLabourDeclared: true, environmentalCompliant: true, conflictOfInterest: '' },
    capability: { categories: ['Spare parts & consumables'], products: [prod('Bearings (assorted)', 'Spare parts & consumables', 'pieces', '5000', '800', '7', '10', '1500')], plants: [], majorClients: '', exportMarkets: '', qualityProcess: '' },
    bankAccounts: [{ ...emptyBankAccount(true), bankName: 'Janata Bank', branch: 'Nawabpur', accountType: 'Current', accountName: 'Quickparts Enterprise', accountNo: '0100123456789', routingNo: '135273794', verified: true, verifiedBy: 'Rumana Islam' }],
    owners: [owner('Masud Rana', 'Owner', '1986777888999', 'Bangladesh', '100')],
    signatories: [sig('Masud Rana', 'Owner', '01311000777', 'quickparts@example.com')],
    references: [ref('Customer', 'Mr. Kabir', 'Dhaka Textiles', 'Store Manager', '01713700100', '', 'Buyer', '2', '', 'Neutral', 'Rumana Islam', daysAgo(300), '')],
    documents: [doc(SUPPLIER_DOC_TYPES.TRADE_LICENSE, { expiry: addMonths(t, 6), ago: 320, verified: true, verifiedBy: 'Rumana Islam' }), doc(SUPPLIER_DOC_TYPES.TIN, { ago: 320, verified: true, verifiedBy: 'Rumana Islam' }), doc(SUPPLIER_DOC_TYPES.OWNER_ID, { ago: 320, verified: true, verifiedBy: 'Rumana Islam' }), doc(SUPPLIER_DOC_TYPES.BANK_STATEMENT, { ago: 320, verified: true, verifiedBy: 'Rumana Islam' })],
    risk: { category: RISK.HIGH, score: 8, criteria: ['sanctionsPep', 'complianceGap'], reason: 'Counterfeit supply incident.', evaluatorComment: 'Blacklisted.' },
    terms: { status: TERMS_STATUS.DECLINED, requestedPaymentTerms: 'Net 30', creditDaysOffered: '30', annualCap: '5000000', approvedPaymentTerms: 'Net 30', approvedCap: '', decisionBy: 'Shila Das', decisionAt: daysAgo(190), decisionNote: 'Facility withdrawn after counterfeit incident.' },
    reviewDue: addDays(t, -30),
    lastReviewed: addMonths(t, -13),
    createdAt: daysAgo(330),
    activatedAt: daysAgo(310),
    updatedAt: daysAgo(190),
  }),
];

export const seedSupplierAudit = (suppliers) => {
  const entries = [];
  const push = (s, action, who, at, detail = '') =>
    entries.push({ id: uid('aud'), portal: 'kys', customerId: s.id, customerCode: s.code || '(draft)', businessName: s.name, action, by: who, at, detail });
  suppliers.forEach((s) => {
    push(s, 'Created', s.createdBy, s.createdAt, 'Supplier application created');
    if (s.status !== SUPPLIER_STATUS.DRAFT) push(s, 'Submitted', s.createdBy, s.createdAt, 'Submitted for evaluation');
    const activatedAt = s.activatedAt || new Date(new Date(s.updatedAt).getTime() - 86400000).toISOString();
    if ([SUPPLIER_STATUS.APPROVAL, SUPPLIER_STATUS.ACTIVE, SUPPLIER_STATUS.SUSPENDED, SUPPLIER_STATUS.BLACKLISTED].includes(s.status)) push(s, 'Evaluated', 'Rumana Islam', activatedAt, 'Documents, site and references evaluated');
    if ([SUPPLIER_STATUS.ACTIVE, SUPPLIER_STATUS.SUSPENDED, SUPPLIER_STATUS.BLACKLISTED].includes(s.status)) push(s, 'Approved', 'Arif Mahmud', activatedAt, 'Supplier approved');
    if (s.status === SUPPLIER_STATUS.RETURNED) push(s, 'Returned for Correction', 'Rumana Islam', s.updatedAt, s.statusReason);
    if (s.status === SUPPLIER_STATUS.BLACKLISTED) push(s, 'Blacklisted', 'Arif Mahmud', s.updatedAt, s.statusReason);
    if (s.terms.status === TERMS_STATUS.APPROVED) push(s, 'Terms Approved', s.terms.decisionBy, s.terms.decisionAt, `${s.terms.approvedPaymentTerms}, cap ${s.terms.approvedCap}`);
    if (s.terms.status === TERMS_STATUS.DECLINED) push(s, 'Terms Declined', s.terms.decisionBy, s.terms.decisionAt, s.terms.decisionNote);
  });
  return entries.sort((a, b) => new Date(b.at) - new Date(a.at));
};

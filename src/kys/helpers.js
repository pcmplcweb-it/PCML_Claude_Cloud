// Supplier (KYS) data model, validation, duplicate detection and insights.
import { EXPIRING_SUPPLIER_DOCS, SUPPLIER_DOC_TYPES, SUPPLIER_RISK_CRITERIA, SUPPLIER_STATUS, TERMS_STATUS } from './config';
import { RISK } from '../data/config';
import { daysUntil, emptyReference, fmtDate, fmtMoney, normalizeId, normalizePhone, nowIso, uid } from '../utils/helpers';

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

export const emptyCertification = () => ({ id: uid('cert'), name: '', issuer: '', number: '', expiry: '' });
export const emptyProduct = () => ({ id: uid('prod'), item: '', category: 'Raw materials', unit: 'units', monthlyCapacity: '', committedToUs: '', leadTimeDays: '', minOrder: '', unitPrice: '' });
export const emptyPlant = () => ({ id: uid('plant'), name: '', location: '', capacity: '', ownedOrRented: 'Owned' });
export const emptyOwner = () => ({ id: uid('sown'), name: '', designation: 'Owner', idNumber: '', nationality: 'Bangladesh', share: '' });
export const emptySignatory = () => ({ id: uid('sig'), name: '', designation: '', mobile: '', email: '', canQuote: true, canInvoice: true });

export const emptySupplier = (createdBy) => ({
  id: uid('sup'),
  code: '',
  status: SUPPLIER_STATUS.DRAFT,
  supplierType: 'MANUFACTURER',
  name: '',            // legal name
  tradeName: '',
  country: 'Bangladesh',
  address: '',
  city: '',
  website: '',
  contactName: '',
  contactDesignation: '',
  mobile: '',
  email: '',
  mobileVerified: false,
  emailVerified: false,
  registration: {
    ownershipType: 'Private Limited', establishedYear: '', yearsInBusiness: '', employees: '',
    tradeLicenseNo: '', tradeLicenseExpiry: '', tin: '', bin: '', regNo: '', regDate: '', ircNo: '', ircExpiry: '',
  },
  compliance: {
    certifications: [],
    codeOfConductSigned: false,
    noSanctionsDeclared: false,
    noPepDeclared: false,
    noChildLabourDeclared: false,
    environmentalCompliant: false,
    conflictOfInterest: '',
  },
  capability: {
    categories: [],
    products: [],
    plants: [],
    majorClients: '',
    exportMarkets: '',
    qualityProcess: '',
  },
  financials: {
    turnoverY1: '', turnoverY2: '', turnoverY3: '', // most recent first
    netWorth: '', paidUpCapital: '', loansOutstanding: '', auditedBy: '', lastAuditedYear: '', insuranceCover: '',
  },
  bankAccounts: [],
  owners: [],
  signatories: [],
  references: [],
  siteAudit: { done: false, date: '', auditor: '', score: '', grade: '', findings: '', correctiveActions: '', dueDate: '', closed: false },
  documents: [],
  risk: { category: '', score: 0, criteria: [], reason: '', evaluatorComment: '' },
  terms: {
    status: TERMS_STATUS.NONE, requestedPaymentTerms: 'Net 30', creditDaysOffered: '', annualCap: '', securityDeposit: '',
    justification: '', approvedPaymentTerms: '', approvedCap: '', rating: '', decisionBy: '', decisionAt: '', decisionNote: '',
  },
  reviewDue: '',
  lastReviewed: '',
  assignedEvaluator: '',
  createdBy,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  activatedAt: '',
  statusReason: '',
});

// Fill in any keys missing from stored records.
export const migrateSupplier = (raw) => {
  const base = emptySupplier(raw.createdBy || '');
  const deep = (k) => ({ ...base[k], ...(raw[k] || {}) });
  return {
    ...base,
    ...raw,
    registration: deep('registration'),
    compliance: { ...deep('compliance'), certifications: Array.isArray(raw.compliance?.certifications) ? raw.compliance.certifications : [] },
    capability: { ...deep('capability'), categories: raw.capability?.categories || [], products: raw.capability?.products || [], plants: raw.capability?.plants || [] },
    financials: deep('financials'),
    siteAudit: deep('siteAudit'),
    risk: deep('risk'),
    terms: deep('terms'),
    bankAccounts: Array.isArray(raw.bankAccounts) ? raw.bankAccounts : [],
    owners: Array.isArray(raw.owners) ? raw.owners : [],
    signatories: Array.isArray(raw.signatories) ? raw.signatories : [],
    references: (Array.isArray(raw.references) ? raw.references : []).map((r) => ({ ...emptyReference(), ...r })),
    documents: Array.isArray(raw.documents) ? raw.documents : [],
  };
};

export const validateSupplier = (s, typeCfg) => {
  const e = [];
  if (!s.name.trim()) e.push('Legal name of the supplier is required.');
  if (!s.address.trim()) e.push('Registered address is required.');
  if (!s.contactName.trim()) e.push('Primary contact person is required.');
  if (!/^01[0-9]{9}$/.test(normalizePhone(s.mobile)) && !/^\+?[0-9]{8,15}$/.test(s.mobile.replace(/[\s-]/g, ''))) e.push('A valid contact mobile number is required.');
  if (!s.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) e.push('A valid email address is required.');
  if (!s.mobileVerified) e.push('Contact mobile must be verified via OTP.');
  const r = s.registration;
  if (!r.tradeLicenseNo.trim()) e.push('Trade license number is required.');
  if (!r.tin.trim()) e.push('TIN is required.');
  if (r.tradeLicenseExpiry && daysUntil(r.tradeLicenseExpiry) < 0) e.push(`Trade license expired on ${fmtDate(r.tradeLicenseExpiry)}.`);
  if (s.country !== 'Bangladesh' && !r.ircNo.trim() && typeCfg?.code === 'TRADER') e.push('Import registration (IRC) is required for foreign-sourced goods.');
  const c = s.compliance;
  if (!c.codeOfConductSigned) e.push('Supplier code of conduct must be acknowledged.');
  if (!c.noSanctionsDeclared || !c.noPepDeclared) e.push('Sanctions and PEP declarations must be completed.');
  c.certifications.forEach((x, i) => { if (!x.name.trim()) e.push(`Certification ${i + 1}: name is required.`); });
  if (s.capability.categories.length === 0) e.push('Select at least one supply category.');
  if (s.capability.products.length === 0) e.push('Record at least one product or service supplied.');
  s.capability.products.forEach((p, i) => { if (!p.item.trim()) e.push(`Product ${i + 1}: item name is required.`); });
  if (typeCfg?.requireFinancials && !s.financials.turnoverY1) e.push('Latest annual turnover is required for this supplier type.');
  const banks = s.bankAccounts || [];
  if (typeCfg?.requireBank && !banks.some((b) => b.accountNo.trim())) e.push('At least one bank account is required.');
  banks.forEach((b, i) => { if (!b.bankName.trim() || !b.accountNo.trim() || !b.accountName.trim()) e.push(`Bank account ${i + 1}: bank name, account name and account number are required.`); });
  if (banks.length > 0 && !banks.some((b) => b.primary)) e.push('Mark one bank account as primary.');
  if (s.owners.length === 0) e.push('At least one owner or director must be recorded.');
  s.owners.forEach((o, i) => { if (!o.name.trim()) e.push(`Owner / director ${i + 1}: name is required.`); });
  if (s.signatories.length === 0) e.push('At least one authorised signatory must be recorded.');
  s.signatories.forEach((o, i) => { if (!o.name.trim()) e.push(`Signatory ${i + 1}: name is required.`); });
  const minRefs = typeCfg?.minReferences ?? 0;
  if (s.references.length < minRefs) e.push(`At least ${minRefs} reference${minRefs === 1 ? '' : 's'} required (${s.references.length} recorded).`);
  s.references.forEach((x, i) => { if (!x.name.trim() || !(x.mobile.trim() || x.email.trim())) e.push(`Reference ${i + 1}: name and a mobile number or email are required.`); });
  if (typeCfg?.requireSiteAudit && !s.siteAudit.done) e.push('A site audit is required for this supplier type.');
  const present = new Set(s.documents.filter((d) => d.current).map((d) => d.type));
  (typeCfg?.requiredDocs || []).forEach((t) => { if (!present.has(t)) e.push(`Required document missing: ${t}.`); });
  s.documents.filter((d) => d.current && d.expiry && daysUntil(d.expiry) < 0).forEach((d) => e.push(`Document expired: ${d.type} (${fmtDate(d.expiry)}).`));
  return e;
};

export const supplierCompleteness = (s, typeCfg) => {
  const banks = s.bankAccounts || [];
  const checks = [
    !!s.name, !!s.address, !!s.contactName, !!s.mobile, !!s.email, s.mobileVerified,
    !!s.registration.tradeLicenseNo, !!s.registration.tin,
    s.compliance.codeOfConductSigned && s.compliance.noSanctionsDeclared && s.compliance.noPepDeclared,
    s.capability.categories.length > 0, s.capability.products.length > 0 && s.capability.products.every((p) => !!p.item),
    !typeCfg?.requireFinancials || !!s.financials.turnoverY1,
    (!typeCfg?.requireBank || banks.some((b) => !!b.accountNo)) && banks.every((b) => !!b.bankName && !!b.accountName && !!b.accountNo) && (banks.length === 0 || banks.some((b) => b.primary)),
    s.owners.length > 0 && s.owners.every((o) => !!o.name),
    s.signatories.length > 0 && s.signatories.every((o) => !!o.name),
    s.references.length >= (typeCfg?.minReferences ?? 0) && s.references.every((x) => !!x.name && (!!x.mobile || !!x.email)),
    !typeCfg?.requireSiteAudit || s.siteAudit.done,
    !s.documents.some((d) => d.current && d.expiry && daysUntil(d.expiry) < 0),
    ...(typeCfg?.requiredDocs || []).map((t) => s.documents.some((d) => d.current && d.type === t)),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

export const findSupplierDuplicates = (s, all) => {
  const hits = [];
  const tin = normalizeId(s.registration?.tin);
  const bin = normalizeId(s.registration?.bin);
  const tl = normalizeId(s.registration?.tradeLicenseNo);
  const mob = normalizePhone(s.mobile);
  const name = (s.name || '').trim().toLowerCase();
  const ownerIds = new Set((s.owners || []).map((o) => normalizeId(o.idNumber)).filter(Boolean));
  all.forEach((o) => {
    if (o.id === s.id || o.status === SUPPLIER_STATUS.REJECTED) return;
    const reasons = [];
    if (tin && normalizeId(o.registration?.tin) === tin) reasons.push('Same TIN');
    if (bin && normalizeId(o.registration?.bin) === bin) reasons.push('Same BIN');
    if (tl && normalizeId(o.registration?.tradeLicenseNo) === tl) reasons.push('Same trade license');
    if (mob && normalizePhone(o.mobile) === mob) reasons.push('Same contact mobile');
    if (name && (o.name || '').trim().toLowerCase() === name) reasons.push('Same legal name');
    if ((o.owners || []).some((x) => ownerIds.has(normalizeId(x.idNumber)))) reasons.push('Shared owner / director');
    if (reasons.length) hits.push({ supplier: o, reasons });
  });
  return hits;
};

export const supplierRiskFromScore = (score) => (score >= 8 ? RISK.HIGH : score >= 4 ? RISK.MEDIUM : RISK.LOW);
export const supplierRiskScore = (keys = []) => SUPPLIER_RISK_CRITERIA.filter((r) => keys.includes(r.key)).reduce((s, r) => s + r.weight, 0);

export const nextSupplierCode = (suppliers) => {
  const nums = suppliers.map((s) => parseInt((s.code || '').split('-')[1], 10)).filter((n) => !Number.isNaN(n));
  return `SUP-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

export const expiringSupplierDocuments = (suppliers, withinDays = 60) => {
  const out = [];
  suppliers.filter((s) => ![SUPPLIER_STATUS.REJECTED, SUPPLIER_STATUS.DRAFT].includes(s.status)).forEach((s) => {
    s.documents.filter((d) => d.current && d.expiry && EXPIRING_SUPPLIER_DOCS.includes(d.type)).forEach((d) => {
      const days = daysUntil(d.expiry);
      if (days <= withinDays) out.push({ supplier: s, doc: d, days });
    });
    s.compliance.certifications.filter((c) => c.expiry && daysUntil(c.expiry) <= withinDays).forEach((c) => {
      out.push({ supplier: s, doc: { id: c.id, type: `Certification: ${c.name}`, fileName: c.issuer, expiry: c.expiry, version: 1 }, days: daysUntil(c.expiry) });
    });
  });
  return out.sort((a, b) => a.days - b.days);
};

export const supplierReviewsDue = (suppliers) =>
  suppliers
    .filter((s) => s.status === SUPPLIER_STATUS.ACTIVE && s.reviewDue && daysUntil(s.reviewDue) <= 30)
    .map((s) => ({ supplier: s, days: daysUntil(s.reviewDue) }))
    .sort((a, b) => a.days - b.days);

// Derived metrics and advisory flags for evaluation and commercial-terms decisions.
export const supplierInsights = (s) => {
  const f = s.financials;
  const y1 = num(f.turnoverY1); const y2 = num(f.turnoverY2); const y3 = num(f.turnoverY3);
  const growth = y2 ? Math.round(((y1 - y2) / y2) * 100) : null;
  const threeYearTrend = y3 && y1 ? Math.round(((y1 - y3) / y3) * 100) : null;
  const leverage = num(f.netWorth) ? Math.round((num(f.loansOutstanding) / num(f.netWorth)) * 100) : null;
  const products = s.capability.products;
  const capacity = products.reduce((a, p) => a + num(p.monthlyCapacity), 0);
  const committed = products.reduce((a, p) => a + num(p.committedToUs), 0);
  const utilisation = capacity ? Math.round((committed / capacity) * 100) : null;
  const avgLead = products.length ? Math.round(products.reduce((a, p) => a + num(p.leadTimeDays), 0) / products.length) : null;
  const certs = s.compliance.certifications;
  const validCerts = certs.filter((c) => !c.expiry || daysUntil(c.expiry) >= 0).length;
  const auditScore = s.siteAudit.done ? num(s.siteAudit.score) : null;
  const annualCap = num(s.terms.annualCap);
  const capVsTurnover = y1 && annualCap ? Math.round((annualCap / y1) * 100) : null;
  const years = num(s.registration.yearsInBusiness) || (s.registration.establishedYear ? new Date().getFullYear() - num(s.registration.establishedYear) : 0);

  const flags = [];
  if (growth != null && growth < -10) flags.push({ tone: 'warn', text: `Turnover fell ${-growth}% in the latest year (${fmtMoney(y1)} vs ${fmtMoney(y2)}).` });
  if (growth != null && growth >= 10) flags.push({ tone: 'success', text: `Turnover grew ${growth}% in the latest year.` });
  if (leverage != null && leverage > 100) flags.push({ tone: 'danger', text: `Borrowings exceed net worth (leverage ${leverage}%).` });
  else if (leverage != null && leverage > 50) flags.push({ tone: 'warn', text: `Borrowings are ${leverage}% of net worth.` });
  if (utilisation != null && utilisation > 80) flags.push({ tone: 'warn', text: `Capacity is tight: ${utilisation}% of declared monthly capacity would be committed to us.` });
  if (utilisation != null && utilisation <= 40 && capacity) flags.push({ tone: 'success', text: `Ample headroom: our requirement is ${utilisation}% of declared capacity.` });
  if (certs.length === 0) flags.push({ tone: 'info', text: 'No quality or management-system certifications recorded.' });
  if (certs.length > validCerts) flags.push({ tone: 'warn', text: `${certs.length - validCerts} certification(s) have expired.` });
  if (auditScore != null && auditScore < 60) flags.push({ tone: 'danger', text: `Site audit score ${auditScore} is below the acceptable threshold of 60.` });
  if (auditScore != null && auditScore >= 80) flags.push({ tone: 'success', text: `Strong site audit score of ${auditScore}.` });
  if (s.siteAudit.done && s.siteAudit.correctiveActions && !s.siteAudit.closed) flags.push({ tone: 'warn', text: 'Corrective actions from the site audit are still open.' });
  if (capVsTurnover != null && capVsTurnover > 50) flags.push({ tone: 'warn', text: `Proposed annual cap is ${capVsTurnover}% of the supplier's turnover; we would be a dominant customer.` });
  if (s.country !== 'Bangladesh') flags.push({ tone: 'info', text: `Foreign supplier (${s.country}); consider LC terms and import documentation.` });
  if (s.compliance.conflictOfInterest) flags.push({ tone: 'warn', text: `Conflict of interest declared: ${s.compliance.conflictOfInterest}` });
  if (years && years < 3) flags.push({ tone: 'warn', text: `Supplier has been operating for only ${years} year(s).` });
  if (s.owners.length && !s.owners.some((o) => num(o.share) > 0)) flags.push({ tone: 'info', text: 'Ownership shares are not recorded; beneficial ownership cannot be confirmed.' });

  return { y1, y2, y3, growth, threeYearTrend, leverage, capacity, committed, utilisation, avgLead, certCount: certs.length, validCerts, auditScore, capVsTurnover, years, flags };
};

export const SUPPLIER_DOC_LIST = Object.values(SUPPLIER_DOC_TYPES);

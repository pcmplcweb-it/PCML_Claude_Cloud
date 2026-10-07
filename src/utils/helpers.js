import { DOC_TYPES, EXPIRING_DOCS, RISK, RISK_CRITERIA, STATUS } from '../data/config.js';

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const nowIso = () => new Date().toISOString();

const pad2 = (v) => String(v).padStart(2, '0');

// Local calendar date (Asia/Dhaka in production), not the UTC date from toISOString.
export const localDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const today = () => localDate();

// Date-only arithmetic is done in UTC on Y-M-D parts so the local offset never shifts the day.
const ymd = (dateStr) => String(dateStr).slice(0, 10).split('-').map(Number);
const fmtUtc = (t) => `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;

export const addDays = (dateStr, days) => {
  const [y, m, d] = ymd(dateStr);
  return fmtUtc(new Date(Date.UTC(y, m - 1, d + days)));
};

// Clamps to the last day of the target month: 31 Jan + 1 month → 28/29 Feb.
export const addMonths = (dateStr, months) => {
  const [y, m, d] = ymd(dateStr);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fmtUtc(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))));
};

export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const ms = new Date(dateStr) - new Date(today());
  return Math.round(ms / 86400000);
};

export const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export const fmtMoney = (n) =>
  n == null || n === '' ? '—' : `BDT ${Number(n).toLocaleString('en-BD')}`;

export const normalizePhone = (p = '') => String(p).replace(/[^0-9]/g, '').replace(/^880/, '0');
export const normalizeId = (s = '') => String(s).replace(/[^a-z0-9]/gi, '').toUpperCase();

export const maskValue = (v = '', visible = 4) => {
  if (!v) return '—';
  const s = String(v);
  if (s.length <= visible) return '•'.repeat(s.length);
  return '•'.repeat(s.length - visible) + s.slice(-visible);
};

export const BANK_ACCOUNT_TYPES = ['Current', 'Savings', 'SND', 'Mobile Wallet (bKash / Nagad / Rocket)'];

export const emptyBankAccount = (primary = false) => ({
  id: uid('bank'),
  bankName: '',
  branch: '',
  accountType: 'Current',
  accountName: '',
  accountNo: '',
  routingNo: '',
  purpose: 'Trade payments',
  primary,
  verified: false,
  verifiedBy: '',
  verifiedAt: '',
});

// Upgrade records saved with the older single-`bank` shape to `bankAccounts[]`.
export const migrateCustomer = (raw) => {
  const c = {
    ...raw,
    business: normalizeBusiness(raw.business),
    references: (Array.isArray(raw.references) ? raw.references : []).map((r) => ({ ...emptyReference(), ...r })),
    // Older records carry payment terms only; derive the credit period from them.
    credit: {
      requestedCreditDays: termsToDays(raw.credit?.paymentTerms),
      approvedCreditDays: raw.credit?.status === 'Approved' || raw.credit?.status === 'Suspended' ? termsToDays(raw.credit?.paymentTerms) : '',
      ...(raw.credit || {}),
    },
  };
  if (Array.isArray(c.bankAccounts)) return c;
  const accounts = [];
  if (c.bank?.accountNo || c.bank?.bankName) {
    accounts.push({ ...emptyBankAccount(true), bankName: c.bank.bankName || '', branch: c.bank.branch || '', accountName: c.bank.accountName || '', accountNo: c.bank.accountNo || '', routingNo: c.bank.routingNo || '', verified: !!c.bank.verified });
  }
  if (c.bank?.mobileWallet) {
    accounts.push({ ...emptyBankAccount(accounts.length === 0), accountType: BANK_ACCOUNT_TYPES[3], accountName: c.name, accountNo: c.bank.mobileWallet });
  }
  const { bank: _legacy, ...rest } = c;
  return { ...rest, bankAccounts: accounts };
};

// Credit period implied by a payment-terms label ("Net 30" → 30; Advance / Cash on Delivery → 0).
export const termsToDays = (terms = '') => {
  const m = /net\s*(\d+)/i.exec(terms);
  return m ? Number(m[1]) : 0;
};

export const primaryBank = (c) => c.bankAccounts.find((b) => b.primary) || c.bankAccounts[0] || null;

// ---------------------------------------------------------------------------
// Business profile: position, brand portfolio, investment & financing,
// other businesses of the owner.
// ---------------------------------------------------------------------------
export const OWNERSHIP_TYPES = ['Sole Proprietorship', 'Partnership', 'Private Limited', 'Public Limited', 'Cooperative', 'Other'];
export const PREMISES_TYPES = ['Owned', 'Rented', 'Leased', 'Family property'];
export const FUND_SOURCES = ['Own funds', 'Bank loan', 'Family / partners', 'Supplier credit', 'Mixed'];
export const VOLUME_UNITS = ['units', 'bags', 'tons', 'kg', 'litres', 'pieces', 'cartons', 'metres', 'sq ft'];

// A product line or brand the business deals in, and the supplier it is sourced from.
export const emptyBrand = () => ({ id: uid('brand'), brand: '', supplier: '', monthlyVolume: '', yearsWith: '', creditLimit: '', terms: 'Cash', note: '' });
export const emptyLoan = () => ({ id: uid('loan'), lender: '', type: 'Term loan', amount: '', outstanding: '', monthlyInstalment: '', purpose: '', security: '' });
// ---------------------------------------------------------------------------
// References: people or organisations who can vouch for the customer.
// ---------------------------------------------------------------------------
export const REFERENCE_TYPES = ['Trade / supplier', 'Bank', 'Customer', 'Existing dealer / retailer', 'Personal', 'Employer / institution'];
export const REFERENCE_OUTCOMES = ['Not contacted', 'Positive', 'Neutral', 'Negative', 'Unreachable'];

export const emptyReference = () => ({
  id: uid('ref'),
  type: REFERENCE_TYPES[0],
  name: '',
  organisation: '',
  designation: '',
  mobile: '',
  email: '',
  relationship: '',
  yearsKnown: '',
  remarks: '',
  // reviewer verification
  outcome: REFERENCE_OUTCOMES[0],
  contactedBy: '',
  contactedAt: '',
  feedback: '',
});

export const referenceSummary = (refs = []) => {
  const total = refs.length;
  const contacted = refs.filter((r) => r.outcome && r.outcome !== 'Not contacted').length;
  const positive = refs.filter((r) => r.outcome === 'Positive').length;
  const negative = refs.filter((r) => r.outcome === 'Negative').length;
  const unreachable = refs.filter((r) => r.outcome === 'Unreachable').length;
  return { total, contacted, positive, negative, unreachable, pending: total - contacted };
};

export const emptyOtherBusiness = () => ({ id: uid('ob'), name: '', nature: '', location: '', role: 'Owner', investment: '', annualTurnover: '', since: '' });

export const emptyBusiness = () => ({
  tradeLicenseNo: '', tradeLicenseExpiry: '', tin: '', bin: '', regNo: '', regDate: '', yearsInBusiness: '',
  // position
  ownershipType: 'Sole Proprietorship', establishedYear: '', employees: '', outletArea: '', storageCapacity: '',
  monthlyVolume: '', volumeUnit: 'units', annualTurnover: '', marketArea: '', retailersServed: '', vehicles: '', mainCustomers: '', mainProducts: '',
  // product lines / brands and the suppliers they are sourced from
  brands: [],
  // investment & financing
  investment: {
    capitalInvested: '', stockValue: '', fixedAssets: '', workingCapital: '', netWorth: '',
    premises: 'Rented', premisesValue: '', sourceOfFunds: 'Own funds', loans: [],
  },
  // other businesses of the owner
  otherBusinesses: [],
});

export const normalizeBusiness = (raw = {}) => {
  const base = emptyBusiness();
  // Map keys from earlier data shapes.
  const { godownCapacity, monthlyVolumeBags, ...b } = raw;
  return {
    ...base,
    ...b,
    storageCapacity: b.storageCapacity ?? godownCapacity ?? '',
    monthlyVolume: b.monthlyVolume ?? monthlyVolumeBags ?? '',
    brands: (Array.isArray(b.brands) ? b.brands : []).map(({ ours: _legacyOurs, monthlyBags, ...x }) => ({
      ...x,
      brand: x.brand || '',
      supplier: x.supplier ?? '',
      monthlyVolume: x.monthlyVolume ?? monthlyBags ?? '',
    })),
    investment: { ...base.investment, ...(b.investment || {}), loans: Array.isArray(b.investment?.loans) ? b.investment.loans : [] },
    otherBusinesses: Array.isArray(b.otherBusinesses) ? b.otherBusinesses : [],
  };
};

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

// Derived metrics and advisory flags used on the detail page and credit decision.
export const businessInsights = (c) => {
  const b = normalizeBusiness(c.business);
  const inv = b.investment;
  const unit = b.volumeUnit || 'units';
  const totalVolume = b.brands.reduce((s, x) => s + num(x.monthlyVolume), 0) || num(b.monthlyVolume);
  // Supplier concentration: group lines by supplier (or brand when no supplier is named).
  const bySupplier = {};
  b.brands.forEach((x) => {
    const key = (x.supplier || x.brand || 'Unnamed').trim();
    bySupplier[key] = bySupplier[key] || { name: key, volume: 0, credit: 0, lines: 0 };
    bySupplier[key].volume += num(x.monthlyVolume);
    bySupplier[key].credit += num(x.creditLimit);
    bySupplier[key].lines += 1;
  });
  const suppliers = Object.values(bySupplier).sort((x, y) => y.volume - x.volume);
  const topSupplier = suppliers[0] || null;
  const topShare = totalVolume && topSupplier ? Math.round((topSupplier.volume / totalVolume) * 100) : null;
  const supplierCredit = suppliers.reduce((s, x) => s + x.credit, 0);

  const capital = num(inv.capitalInvested);
  const totalInvestment = capital || num(inv.stockValue) + num(inv.fixedAssets) + num(inv.workingCapital);
  const loansOutstanding = inv.loans.reduce((s, l) => s + num(l.outstanding || l.amount), 0);
  const monthlyInstalments = inv.loans.reduce((s, l) => s + num(l.monthlyInstalment), 0);
  const leverage = totalInvestment ? Math.round((loansOutstanding / totalInvestment) * 100) : null;
  const turnover = num(b.annualTurnover);
  const monthlyTurnover = turnover / 12;
  const stockMonths = monthlyTurnover ? +(num(inv.stockValue) / monthlyTurnover).toFixed(1) : null;
  const otherInvestment = b.otherBusinesses.reduce((s, o) => s + num(o.investment), 0);
  const otherTurnover = b.otherBusinesses.reduce((s, o) => s + num(o.annualTurnover), 0);
  const requested = num(c.credit?.requestedLimit);
  const creditMonths = monthlyTurnover ? +(requested / monthlyTurnover).toFixed(1) : null;

  const flags = [];
  if (b.brands.length === 0) flags.push({ tone: 'info', text: 'No products or suppliers recorded; supplier mix cannot be assessed.' });
  if (topShare != null && topShare >= 70 && suppliers.length > 1) flags.push({ tone: 'warn', text: `Supply is concentrated: ${topSupplier.name} accounts for ${topShare}% of monthly volume.` });
  if (topShare != null && suppliers.length === 1) flags.push({ tone: 'info', text: `Single-supplier business (${topSupplier.name}); no alternative sourcing recorded.` });
  if (suppliers.length >= 3 && topShare != null && topShare < 50) flags.push({ tone: 'success', text: `Diversified sourcing across ${suppliers.length} suppliers; largest is ${topShare}% of volume.` });
  if (supplierCredit > 0 && requested > 0 && requested > supplierCredit * 2) flags.push({ tone: 'warn', text: `Requested limit is over twice the total credit existing suppliers extend (${fmtMoney(supplierCredit)}).` });
  if (supplierCredit > 0 && requested > 0 && requested <= supplierCredit) flags.push({ tone: 'success', text: `Requested limit is within the credit the customer already receives from suppliers (${fmtMoney(supplierCredit)}).` });
  if (leverage != null && leverage > 60) flags.push({ tone: 'danger', text: `Highly leveraged: loans outstanding are ${leverage}% of invested capital.` });
  else if (leverage != null && leverage > 35) flags.push({ tone: 'warn', text: `Moderate leverage: loans outstanding are ${leverage}% of invested capital.` });
  if (monthlyInstalments > 0 && monthlyTurnover > 0 && monthlyInstalments > monthlyTurnover * 0.15) flags.push({ tone: 'warn', text: 'Loan instalments exceed 15% of monthly turnover.' });
  if (creditMonths != null && creditMonths > 2) flags.push({ tone: 'warn', text: `Requested credit equals ${creditMonths} months of turnover (guideline: up to 2 months).` });
  if (stockMonths != null && stockMonths > 3) flags.push({ tone: 'warn', text: `Stock on hand covers ${stockMonths} months of sales; slow-moving inventory risk.` });
  if (inv.premises === 'Owned') flags.push({ tone: 'success', text: 'Premises are owned by the business, which supports stability.' });
  if (otherInvestment > 0 && totalInvestment > 0 && otherInvestment > totalInvestment) flags.push({ tone: 'info', text: 'Owner has larger investments in other businesses than in this one; this may not be the core activity.' });
  if (b.otherBusinesses.length > 0 && otherTurnover > 0) flags.push({ tone: 'info', text: `${b.otherBusinesses.length} other business(es) with combined turnover ${fmtMoney(otherTurnover)} provide alternative income.` });
  const impliedPrice = turnover > 0 && totalVolume > 0 ? Math.round(turnover / 12 / totalVolume) : null;
  if (impliedPrice != null) flags.push({ tone: 'info', text: `Turnover and volume imply an average of ${fmtMoney(impliedPrice)} per ${unit.replace(/s$/, '')}; verify this is realistic for the products sold.` });

  return { unit, impliedPrice, totalVolume, suppliers, topSupplier, topShare, supplierCredit, totalInvestment, loansOutstanding, monthlyInstalments, leverage, turnover, monthlyTurnover, stockMonths, otherInvestment, otherTurnover, creditMonths, flags };
};

// Blank customer record used for new applications.
export const emptyCustomer = (createdBy) => ({
  id: uid('cust'),
  code: '',
  status: STATUS.DRAFT,
  customerType: 'RETAILER',
  name: '',
  businessName: '',
  division: 'Dhaka',
  district: '',
  address: '',
  billingAddress: '',
  mobile: '',
  altMobile: '',
  email: '',
  mobileVerified: false,
  emailVerified: false,
  identity: { idType: DOC_TYPES.NID, idNumber: '', idName: '', dob: '', fatherName: '' },
  business: emptyBusiness(),
  bankAccounts: [],
  location: { lat: '', lng: '', outletAddress: '', visitDate: '', visitedBy: '', findings: '', verified: false },
  owners: [],
  representatives: [],
  references: [],
  documents: [],
  risk: { category: '', score: 0, criteria: [], reason: '', reviewerComment: '' },
  credit: {
    status: 'Not Requested', requestedLimit: '', proposedLimit: '', approvedLimit: '',
    paymentTerms: 'Advance', requestedCreditDays: 0, approvedCreditDays: '', references: '', justification: '', decisionBy: '', decisionAt: '', decisionNote: '',
  },
  reviewDue: '',
  lastReviewed: '',
  assignedReviewer: '',
  createdBy,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  statusReason: '',
});

// Validate mandatory fields based on customer-type configuration.
export const validateCustomer = (c, typeCfg) => {
  const errors = [];
  if (!c.name.trim()) errors.push('Customer / owner name is required.');
  if (!c.businessName.trim()) errors.push('Business name is required.');
  if (!c.address.trim()) errors.push('Business address is required.');
  if (!c.district.trim()) errors.push('District is required.');
  if (!/^01[0-9]{9}$/.test(normalizePhone(c.mobile))) errors.push('A valid 11-digit Bangladeshi mobile number is required.');
  if (c.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email)) errors.push('Email address format is invalid.');
  if (!c.identity.idNumber.trim()) errors.push('Owner identity number is required.');
  if (!c.identity.idName.trim()) errors.push('Name as on identity document is required.');
  if (!c.mobileVerified) errors.push('Mobile number must be verified via OTP.');
  if (typeCfg?.requireBusinessReg) {
    if (!c.business.tradeLicenseNo.trim()) errors.push('Trade license number is required for this customer type.');
    if (!c.business.tin.trim()) errors.push('TIN is required for this customer type.');
  }
  const banks = c.bankAccounts || [];
  if (typeCfg?.requireBank && !banks.some((b) => b.accountNo.trim())) errors.push('At least one bank account is required for this customer type.');
  banks.forEach((b, i) => {
    if (!b.bankName.trim() || !b.accountNo.trim() || !b.accountName.trim()) errors.push(`Bank account ${i + 1}: bank name, account name and account number are required.`);
  });
  if (banks.length > 0 && !banks.some((b) => b.primary)) errors.push('Mark one bank account as primary.');
  const accNos = banks.map((b) => normalizeId(b.accountNo)).filter(Boolean);
  if (new Set(accNos).size !== accNos.length) errors.push('Duplicate bank account numbers entered.');
  if (typeCfg?.requireLocation && (!c.location.lat || !c.location.lng)) errors.push('Outlet GPS coordinates are required for this customer type.');
  if (c.owners.length === 0) errors.push('At least one business owner must be recorded.');
  c.owners.forEach((o, i) => { if (!o.name.trim()) errors.push(`Owner ${i + 1}: name is required.`); });
  (c.representatives || []).forEach((r, i) => { if (!r.name.trim()) errors.push(`Representative ${i + 1}: name is required.`); });
  (c.business.otherBusinesses || []).forEach((o, i) => { if (!o.name.trim()) errors.push(`Other business ${i + 1}: name is required.`); });
  const refs = c.references || [];
  const minRefs = typeCfg?.minReferences ?? 0;
  if (refs.length < minRefs) errors.push(`At least ${minRefs} reference${minRefs === 1 ? '' : 's'} required for this customer type (${refs.length} recorded).`);
  refs.forEach((r, i) => {
    if (!r.name.trim() || !(r.mobile.trim() || r.email.trim())) errors.push(`Reference ${i + 1}: name and a mobile number or email are required.`);
  });
  const present = new Set(c.documents.filter((d) => d.current).map((d) => d.type));
  (typeCfg?.requiredDocs || []).forEach((t) => {
    if (!present.has(t)) errors.push(`Required document missing: ${t}.`);
  });
  c.documents.filter((d) => d.current && d.expiry).forEach((d) => {
    if (daysUntil(d.expiry) < 0) errors.push(`Document expired: ${d.type} (${fmtDate(d.expiry)}).`);
  });
  return errors;
};

// Completeness percentage for dashboards.
export const completeness = (c, typeCfg) => {
  // Mirrors validateCustomer so a record that reads 100% also passes submission.
  const banks = c.bankAccounts || [];
  const refs = c.references || [];
  const checks = [
    !!c.name, !!c.businessName, !!c.address, !!c.district, !!c.mobile, c.mobileVerified,
    !!c.identity.idNumber, !!c.identity.idName,
    c.owners.length > 0 && c.owners.every((o) => !!o.name),
    refs.length >= (typeCfg?.minReferences ?? 0) && refs.every((r) => !!r.name && (!!r.mobile || !!r.email)),
    banks.every((b) => !!b.bankName && !!b.accountName && !!b.accountNo) && (banks.length === 0 || banks.some((b) => b.primary)),
    !c.documents.some((d) => d.current && d.expiry && daysUntil(d.expiry) < 0),
    !typeCfg?.requireBusinessReg || (!!c.business.tradeLicenseNo && !!c.business.tin),
    !typeCfg?.requireBank || (c.bankAccounts || []).some((b) => !!b.accountNo),
    !typeCfg?.requireLocation || (!!c.location.lat && !!c.location.lng),
    ...(typeCfg?.requiredDocs || []).map((t) => c.documents.some((d) => d.current && d.type === t)),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

// Duplicate detection across identity numbers, mobiles, business registrations and names.
export const findDuplicates = (c, all) => {
  const hits = [];
  const idn = normalizeId(c.identity?.idNumber);
  const mob = normalizePhone(c.mobile);
  const tl = normalizeId(c.business?.tradeLicenseNo);
  const tin = normalizeId(c.business?.tin);
  const bin = normalizeId(c.business?.bin);
  const bname = (c.businessName || '').trim().toLowerCase();
  all.forEach((o) => {
    // Rejected records are closed cases; they should not keep flagging the surviving record.
    if (o.id === c.id || o.status === STATUS.REJECTED) return;
    const reasons = [];
    if (idn && normalizeId(o.identity?.idNumber) === idn) reasons.push('Same identity number');
    if (mob && [o.mobile, o.altMobile].map(normalizePhone).includes(mob)) reasons.push('Same mobile number');
    if (tl && normalizeId(o.business?.tradeLicenseNo) === tl) reasons.push('Same trade license');
    if (tin && normalizeId(o.business?.tin) === tin) reasons.push('Same TIN');
    if (bin && normalizeId(o.business?.bin) === bin) reasons.push('Same BIN');
    if (bname && (o.businessName || '').trim().toLowerCase() === bname) reasons.push('Same business name');
    if (reasons.length) hits.push({ customer: o, reasons });
  });
  return hits;
};

export const riskFromScore = (score) => (score >= 7 ? RISK.HIGH : score >= 3 ? RISK.MEDIUM : RISK.LOW);

export const computeRiskScore = (criteriaKeys = []) =>
  RISK_CRITERIA.filter((r) => criteriaKeys.includes(r.key)).reduce((s, r) => s + r.weight, 0);

// Documents expiring within N days (current versions only).
export const expiringDocuments = (customers, withinDays = 60) => {
  const out = [];
  // Closed or not-yet-submitted cases do not need renewal reminders.
  customers.filter((c) => ![STATUS.REJECTED, STATUS.DRAFT].includes(c.status)).forEach((c) => {
    c.documents
      .filter((d) => d.current && d.expiry && EXPIRING_DOCS.includes(d.type))
      .forEach((d) => {
        const days = daysUntil(d.expiry);
        if (days <= withinDays) out.push({ customer: c, doc: d, days });
      });
  });
  return out.sort((a, b) => a.days - b.days);
};

export const overdueReviews = (customers) =>
  customers
    .filter((c) => c.status === STATUS.ACTIVE && c.reviewDue && daysUntil(c.reviewDue) <= 30)
    .map((c) => ({ customer: c, days: daysUntil(c.reviewDue) }))
    .sort((a, b) => a.days - b.days);

export const nextCustomerCode = (customers, typeCode) => {
  const prefix = typeCode.slice(0, 3).toUpperCase();
  const nums = customers
    .map((c) => c.code)
    .filter((code) => code && code.startsWith(prefix + '-'))
    .map((code) => parseInt(code.split('-')[1], 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `${prefix}-${next}`;
};

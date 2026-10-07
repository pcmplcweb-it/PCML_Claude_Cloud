// HR calendar, service-length, money and final-settlement arithmetic
// (Bangladesh Labour Act 2006 as amended 2026). Pure functions; consumers
// import everything through './helpers'.
import { CLEARANCE_DEPARTMENTS, EMPLOYEE_STATUS, EMPLOYER_INITIATED, HR_ROLES, SEPARATION_SECTIONS, SETTLEMENT_OPEN, SETTLEMENT_STATUS, canHr } from './config.js';
import { addDays, nowIso, uid } from '../utils/helpers.js';

export const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad2 = (n) => String(n).padStart(2, '0');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DEFAULT_CALENDAR = { weeklyOffs: ['Fri', 'Sat'], holidays: [] };

// ---------------------------------------------------------------------------
// D.1 Dates, calendar, money

// Local date (never toISOString, which is UTC-based).
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Demo clock when set in HR Settings, otherwise the real local date.
export const hrToday = (settings) => settings?.calendar?.asOfDate || localToday();

const utc = (dateStr) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

// Whole days from a to b (YYYY-MM-DD parsed as UTC, so no DST drift).
export const daysBetween = (a, b) => (!a || !b ? 0 : Math.round((utc(b) - utc(a)) / 86400000));

export const monthKey = (date) => String(date).slice(0, 7);
export const daysInMonth = (ym) => {
  const [y, m] = String(ym).slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const monthLabel = (ym) => {
  const [y, m] = String(ym).slice(0, 7).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
// Previous n months before asOf's month, latest first.
export const lastMonths = (n, asOf) => {
  const [y, m] = String(asOf).slice(0, 7).split('-').map(Number);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`);
  }
  return out;
};
export const monthRange = (ym) => ({ from: `${String(ym).slice(0, 7)}-01`, to: `${String(ym).slice(0, 7)}-${pad2(daysInMonth(ym))}` });

export const weekdayOf = (date) => WEEKDAYS[new Date(utc(date)).getUTCDay()];
export const isWeeklyOff = (date, calendar) => (calendar?.weeklyOffs || DEFAULT_CALENDAR.weeklyOffs).includes(weekdayOf(date));
export const isHoliday = (date, calendar) => (calendar?.holidays || []).some((h) => (h?.date || h) === date);
export const isWorkingDay = (date, calendar) => !isWeeklyOff(date, calendar) && !isHoliday(date, calendar);

// Inclusive count of working days between two dates.
export const workingDaysBetween = (from, to, calendar) => {
  let count = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, calendar)) count++;
  return count;
};
export const workingDaysInMonth = (ym, calendar) => {
  const { from, to } = monthRange(ym);
  return workingDaysBetween(from, to, calendar);
};

// Step forward from date + 1 counting working days until n are reached.
export const addWorkingDays = (date, n, calendar) => {
  let d = date;
  let count = 0;
  let skipped = 0;
  // Guard: a calendar with every weekday off (e.g. a bad stored setting) would otherwise never terminate.
  let guard = num(n) * 7 + 3660;
  while (count < n && guard-- > 0) {
    d = addDays(d, 1);
    if (isWorkingDay(d, calendar)) count++;
    else skipped++;
  }
  return { date: d, skipped };
};

// Month arithmetic that clamps to the month end (Aug 31 + 6 months = Feb 28/29, not Mar 3).
const addMonthsClamped = (d, n) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(Math.min(day, last))}`;
};

// Calendar difference join → LWD (exclusive of the LWD unless inclusive).
export const serviceLength = (joinDate, lastWorkingDay, inclusive = false) => {
  if (!joinDate || !lastWorkingDay) return { years: 0, months: 0, days: 0, exactYears: 0, text: '—' };
  const end = inclusive ? addDays(lastWorkingDay, 1) : lastWorkingDay;
  if (end < joinDate) return { years: 0, months: 0, days: 0, exactYears: 0, text: '0y 0m 0d' };
  let years = 0;
  while (addMonthsClamped(joinDate, 12 * (years + 1)) <= end) years++;
  let months = 0;
  while (months < 11 && addMonthsClamped(joinDate, 12 * years + months + 1) <= end) months++;
  const days = Math.max(0, daysBetween(addMonthsClamped(joinDate, 12 * years + months), end));
  return { years, months, days, exactYears: years + months / 12 + days / 365, text: `${years}y ${months}m ${days}d` };
};

// Completed years for compensation: six_months rounds a part-year of more than six months up.
export const completedYears = (len, rounding = 'six_months') =>
  rounding === 'strict' ? len.years : len.years + (len.months > 6 || (len.months === 6 && len.days > 0) ? 1 : 0);

export const fmtMoney2 = (n) =>
  n == null || n === '' || Number.isNaN(Number(n)) ? '—' : `BDT ${Number(n).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtPct = (n, dp = 2) => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : `${Number(n).toFixed(dp)}%`);
export const fmtNum2 = (n) => Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Salary bases

export const grossSalary = (salary = {}) =>
  ['basic', 'houseRent', 'medical', 'conveyance', 'dearness', 'adhoc', 'otherAllowances'].reduce((s, k) => s + num(salary[k]), 0);

// Wage base for statutory compensation (s.2(45): basic + dearness + ad-hoc).
export const compMonthly = (salary = {}, settings) =>
  settings?.statutory?.compWageBase === 'gross' ? grossSalary(salary) : num(salary.basic) + num(salary.dearness) + num(salary.adhoc);

// ---------------------------------------------------------------------------
// D.5 Settlement

export const nextSettlementCode = (list = []) => {
  const nums = list.map((s) => parseInt((s.code || '').split('-')[1], 10)).filter((n) => !Number.isNaN(n));
  return `FS-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

export const defaultClearance = () =>
  CLEARANCE_DEPARTMENTS.map((d) => ({ dept: d.dept, label: d.label, items: [...d.items], status: 'Pending', signedBy: '', signedAt: '', remarks: '', recoverable: '' }));

export const emptySettlementInputs = () => ({
  elBalanceDays: '', finalMonthSalaryPaid: false, arrears: '', overtime: '', reimbursement: '', otherPayable: '', performanceBonus: '', bonusPaidThisYear: false,
  pfOwn: '', pfEmployer: '', pfInterest: '', pfAdvance: '', loanRecovery: '', assetRecovery: '', assetShowCauseIssued: false, absenceDays: '', otherDeduction: '',
  groupInsurance: '', ytdIncome: '', ytdTaxPaid: '', taxOverride: '', lawVersionOverride: '', roundingOverride: '',
});

// s.4(8): a probationer kept past the probation end without a decision is deemed permanent.
const probationEndOf = (emp) => {
  const p = emp?.employment?.probation || {};
  return (p.extended ? p.extendedTo : p.endDate) || '';
};
export const deemedPermanentOn = (emp, date) => {
  const end = probationEndOf(emp);
  return !!(end && date && date > end && !emp?.employment?.probation?.decision);
};

export const emptySettlement = (emp, by, settings, asOf) => ({
  id: uid('stl'),
  code: '',
  employeeId: emp?.id || '',
  type: 'Resignation',
  reason: '',
  misconductClause: '',
  deathAtWork: false,
  afterLayoff: false,
  workCompleted: false,
  probationer: emp?.status === EMPLOYEE_STATUS.PROBATION && !deemedPermanentOn(emp, asOf),
  noticeDate: asOf || '',
  lastWorkingDay: '',
  noticeRequiredDays: num(settings?.notice?.workerPermanent) || 60,
  noticeWaivedDays: '0',
  payInLieu: false,
  payInLieuDays: '',
  previousStatus: emp?.status || EMPLOYEE_STATUS.CONFIRMED,
  status: SETTLEMENT_STATUS.INITIATED,
  statusReason: '',
  clearance: defaultClearance(),
  inputs: emptySettlementInputs(),
  statement: null,
  inputsChangedAt: '',
  approvals: [],
  payment: { paidAt: '', mode: 'Bank Transfer', reference: '', amount: '', bankAccountNo: '', payee: 'Employee', payeeName: '', payeeRelation: '', payeeNid: '', pfPaidAt: '', pfReference: '', paidBy: '' },
  serviceCertificate: { issued: false, issuedAt: '', by: '' },
  exitInterviewDone: false,
  rehireEligible: true,
  nominee: { name: '', relation: '', nid: '', mobile: '', sharePct: '', ...(emp?.nominee || {}) },
  hold: { reason: '', at: '', by: '' },
  documents: [],
  history: [],
  createdBy: by,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

// Fill in any keys missing from stored settlements.
export const migrateSettlement = (raw) => {
  const base = emptySettlement(null, raw.createdBy || '', null, '');
  const deep = (k) => ({ ...base[k], ...(raw[k] || {}) });
  return {
    ...base,
    ...raw,
    clearance: Array.isArray(raw.clearance) && raw.clearance.length ? raw.clearance : base.clearance,
    inputs: deep('inputs'),
    payment: deep('payment'),
    serviceCertificate: deep('serviceCertificate'),
    nominee: deep('nominee'),
    hold: deep('hold'),
    approvals: Array.isArray(raw.approvals) ? raw.approvals : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    history: Array.isArray(raw.history) ? raw.history : [],
  };
};

// A.2 #11: statutory version applied to this separation.
export const lawVersionFor = (sep, settings) => {
  if (sep?.inputs?.lawVersionOverride) return sep.inputs.lawVersionOverride;
  const mode = settings?.statutory?.lawVersion || 'auto';
  if (mode !== 'auto') return mode;
  const cutover = settings?.statutory?.lawCutoverDate || '2025-11-17';
  return sep?.lastWorkingDay && sep.lastWorkingDay < cutover ? 'pre_2025' : 'bla2026';
};

// asOf (optional): a probationer flag past the probation end is overridden (s.4(8) deemed permanent).
export const isPermanent = (emp, sep, asOf) => emp?.employment?.employmentType === 'Permanent' && (!sep?.probationer || deemedPermanentOn(emp, asOf));

// Notice days the Act requires for the separation type (s.20, s.26, s.27).
export const noticeRequiredDays = (emp, type, settings, flags = {}) => {
  const n = settings?.notice || {};
  const monthly = (emp?.employment?.wageBasis || 'Monthly') === 'Monthly';
  const permanent = emp?.employment?.employmentType === 'Permanent';
  if (flags.probationer && ['Resignation', 'Termination'].includes(type)) return num(n.probation);
  switch (type) {
    case 'Resignation': return permanent ? num(n.workerPermanent) : monthly ? num(n.workerTemporaryMonthly) : num(n.workerTemporaryOther);
    case 'Deemed Resignation (s.27(3A))': return num(n.workerPermanent);
    case 'Termination':
      if (flags.workCompleted) return 0;
      if (permanent) return monthly ? num(n.employerPermanentMonthly) : num(n.employerPermanentOther);
      return monthly ? num(n.employerTemporaryMonthly) : num(n.employerTemporaryOther);
    case 'Retrenchment': return flags.afterLayoff ? 0 : num(n.retrenchment);
    case 'Discharge': return num(n.discharge);
    case 'Dismissal': return num(n.dismissal);
    case 'Retirement': return num(n.retirement);
    case 'Death': return num(n.death);
    case 'End of Contract': return num(n.contractExpiry);
    default: return 0;
  }
};

export const noticeServedDays = (noticeDate, lwd) => (!noticeDate || !lwd ? 0 : Math.max(0, daysBetween(noticeDate, lwd)));

// Notice served for the statement: an absconding worker (deemed resignation, s.27(3A)) has served none, so the full shortfall is recoverable.
export const effectiveNoticeServed = (sep) => (sep?.type === 'Deemed Resignation (s.27(3A))' ? 0 : noticeServedDays(sep?.noticeDate, sep?.lastWorkingDay));

export const settlementDeadline = (lwd, settings) =>
  (lwd ? addWorkingDays(lwd, num(settings?.settlement?.deadlineWorkingDays) || 30, settings?.calendar || DEFAULT_CALENDAR) : { date: '', skipped: 0 });

// Prefill of the dues inputs from the employee record (ctx.elBalance = EL balance days).
export const settlementInputsFrom = (emp, ctx = {}) => ({
  ...emptySettlementInputs(),
  elBalanceDays: ctx.elBalance == null ? '' : String(Math.max(0, ctx.elBalance)),
  pfOwn: emp.pf?.member ? String(num(emp.pf.ownBalance)) : '',
  pfEmployer: emp.pf?.member ? String(num(emp.pf.employerBalance)) : '',
  pfInterest: emp.pf?.member ? String(num(emp.pf.interestAccrued)) : '',
  pfAdvance: emp.pf?.member ? String(num(emp.pf.advanceOutstanding)) : '',
  loanRecovery: String((emp.loans || []).reduce((s, l) => s + num(l.outstanding), 0)),
  ytdIncome: emp.tax?.ytdIncome || '',
  ytdTaxPaid: emp.tax?.ytdTaxPaid || '',
  bonusPaidThisYear: !!emp.tax?.bonusPaidThisYear,
  groupInsurance: '',
});

export const ageAt = (dob, date) => (dob && date ? serviceLength(dob, date, false).years : null);

// A Dismissal Enquiry with both s.24 dates whose outcome does not clear the employee.
export const dismissalEnquiryOf = (emp) => (emp?.disciplinary || []).find((d) => d.type === 'Dismissal Enquiry' && d.showCauseDate && d.enquiryDate && !['Exonerated', 'Withdrawn'].includes(d.outcome));

// Pay modal checks; a zero payout is allowed only when net payable is nil or negative (balance recoverable from the employee).
export const validatePayment = (f, netPayable, asOf) => {
  const e = [];
  const amt = f.amount === '' || f.amount == null ? NaN : Number(f.amount);
  if (!f.paidAt) e.push('Enter the payment date.');
  else if (asOf && f.paidAt > asOf) e.push('Payment date cannot be in the future.');
  if (!String(f.reference || '').trim()) e.push(num(f.amount) === 0 ? 'Enter a reference (recovery memo / voucher number).' : 'Enter the payment reference (transfer / cheque number).');
  if (Number.isNaN(amt) || amt < 0) e.push('Enter the amount paid.');
  else if (amt === 0 && !(netPayable !== '' && netPayable != null && num(netPayable) <= 0)) e.push('Enter the amount paid; a nil payment is allowed only when the net payable is nil or negative.');
  if (f.payee === 'Nominee' && !String(f.payeeName || '').trim()) e.push('Enter the nominee name.');
  if (f.mode === 'Bank Transfer' && amt > 0 && !String(f.bankAccountNo || '').trim()) e.push('Enter the bank account credited.');
  return e;
};

export const validateSeparation = (sep, emp, settings, asOf, settlements = []) => {
  const e = [];
  if (!emp) { e.push('Select an employee.'); return e; }
  if (!sep.type) e.push('Select a separation type.');
  if (!['Retirement', 'End of Contract'].includes(sep.type) && (sep.reason || '').trim().length < 10) e.push('Reason must be at least 10 characters.');
  if (!sep.lastWorkingDay) e.push('Last working day is required.');
  if (sep.noticeDate && sep.lastWorkingDay && sep.lastWorkingDay < sep.noticeDate) e.push('Last working day must be on or after the notice date.');
  if (![EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.SUSPENDED].includes(emp.status)) e.push(`Employee is ${emp.status}; only active employees can be separated.`);
  if (settlements.some((s) => s.id !== sep.id && s.employeeId === emp.id && SETTLEMENT_OPEN.includes(s.status))) e.push('An open settlement already exists for this employee.');
  if (sep.type === 'Dismissal') {
    if (!dismissalEnquiryOf(emp)) e.push('Dismissal requires a Dismissal Enquiry record with show-cause and enquiry dates, not exonerated or withdrawn (s.24).');
    if (!sep.misconductClause) e.push('Select the s.23(4) misconduct clause for a dismissal.');
  }
  if (sep.type === 'Death') {
    if (typeof sep.deathAtWork !== 'boolean') e.push('State whether the death occurred in the course of employment (s.19).');
    if (!(sep.nominee?.name || emp.nominee?.name)) e.push('A nominee is required to receive the dues of a deceased employee.');
  }
  if (sep.type === 'End of Contract' && !emp.employment?.contractEndDate) e.push('End of Contract requires a contract end date on the employee record.');
  if (sep.type === 'Deemed Resignation (s.27(3A))' && !emp.absenceNotice?.secondNoticeOn) e.push('Deemed resignation requires the second s.27(3A) notice to have been issued.');
  const required = num(sep.noticeRequiredDays);
  // Pay in lieu covers only the notice not served (s.26(3), s.20(2)).
  const lieuMax = Math.max(0, required - effectiveNoticeServed(sep));
  if (sep.payInLieu && EMPLOYER_INITIATED.includes(sep.type) && sep.payInLieuDays !== '' && sep.payInLieuDays != null && num(sep.payInLieuDays) > lieuMax) {
    e.push(`Pay in lieu cannot exceed the ${lieuMax} notice days not served (${required} required); move the last working day back for an immediate release.`);
  }
  return e;
};

// Non-blocking warnings shown beside the errors.
export const separationWarnings = (sep, emp, settings) => {
  const w = [];
  if (sep.type === 'Retirement' && emp?.dob && sep.lastWorkingDay) {
    const age = ageAt(emp.dob, sep.lastWorkingDay);
    if (age < num(settings?.statutory?.retirementAge)) w.push(`Employee is ${age} at the last working day; retirement age is ${settings.statutory.retirementAge} (s.28).`);
  }
  return w;
};

export const requiresManagementApproval = (sep, emp, totals, settings) => {
  const s = settings?.settlement || {};
  return (s.managementApprovalTypes || []).includes(sep.type)
    || (s.managementApprovalGrades || []).includes(emp?.employment?.grade)
    || num(totals?.netPayable) > num(s.managementApprovalAbove);
};

export const nextSettlementStatus = (sep, emp, settings) => {
  const S = SETTLEMENT_STATUS;
  const totals = sep.statement?.totals || {};
  switch (sep.status) {
    case S.HR_APPROVAL: return S.FINANCE_APPROVAL;
    case S.FINANCE_APPROVAL: return requiresManagementApproval(sep, emp, totals, settings) ? S.MGMT_APPROVAL : S.APPROVED;
    case S.MGMT_APPROVAL: return S.APPROVED;
    default: return sep.status;
  }
};

export const canSignClearance = (row, sep, emp, user) => {
  const cfg = CLEARANCE_DEPARTMENTS.find((d) => d.dept === row.dept);
  if (!cfg || !user) return false;
  const role = user.role;
  if (!canHr(role, 'clearanceSignOff') || !cfg.signOffRoles.includes(role)) return false;
  if (cfg.managerOnly && role === HR_ROLES.LINE_MANAGER && user.employeeId !== emp?.employment?.reportingManagerId) return false;
  return true;
};

// settings (optional): when omitted, the frozen statement tells whether asset recovery was withheld for a show-cause.
export const settlementReady = (sep, emp, settings) => {
  const reasons = [];
  const warnings = [];
  const unsigned = (sep.clearance || []).filter((r) => r.status === 'Pending');
  if (unsigned.length) reasons.push(`Clearance pending: ${unsigned.map((r) => r.label).join(', ')}.`);
  if (!sep.statement) reasons.push('Dues have not been finalised.');
  else if (sep.statement.computedAt < (sep.inputsChangedAt || '')) reasons.push('Inputs changed after the dues were finalised; finalise again.');
  const showCauseRequired = settings
    ? settings.deductions?.assetRecoveryRequiresShowCause !== false
    : !(sep.statement && statementLine(sep.statement, 'assetRecovery') > 0);
  if (showCauseRequired && num(sep.inputs?.assetRecovery) > 0 && !sep.inputs?.assetShowCauseIssued) reasons.push('Asset recovery requires a show-cause notice (s.125(2)(c)).');
  if (sep.type === 'Death' && !(sep.nominee?.name || emp?.nominee?.name)) reasons.push('Nominee details are required for payment.');
  if (!emp?.bank?.verified && sep.type !== 'Death') warnings.push('Bank account is not verified.');
  return { ok: reasons.length === 0, reasons, warnings };
};

const STAGE_ACTION = { HR: 'settlementHrApprove', Finance: 'settlementFinanceApprove', Management: 'settlementManagementApprove', Pay: 'settlementPay' };

// Separation of duties (A.2 #10): the approver cannot be the preparer or a prior approver of this round.
export const canApproveStage = (sep, stage, user) => {
  if (!user || !canHr(user.role, STAGE_ACTION[stage] || '')) return { ok: false, reason: 'Your role cannot act on this stage.' };
  if (sep.statement?.computedBy === user.name) return { ok: false, reason: 'Separation of duties: the statement was prepared by you.' };
  const round = currentRound(sep);
  if (round.some((a) => a.decision === 'Approved' && a.by === user.name)) return { ok: false, reason: 'Separation of duties: you already approved a stage of this settlement.' };
  return { ok: true, reason: '' };
};

// Approvals since the last return to HR (a return starts a new round).
export const currentRound = (sep) => {
  const all = sep.approvals || [];
  let start = 0;
  all.forEach((a, i) => { if (a.decision === 'Returned') start = i + 1; });
  return all.slice(start);
};

// The stage the signed-in user can act on for a settlement, or null.
export const settlementAction = (sep, emp, user, settings) => {
  const S = SETTLEMENT_STATUS;
  if (!user || !emp) return null;
  if ([S.INITIATED, S.CLEARANCE].includes(sep.status)) {
    const row = (sep.clearance || []).find((r) => r.status === 'Pending' && canSignClearance(r, sep, emp, user));
    if (row) return { label: `Sign ${row.label} clearance`, stage: 'clearance' };
    if (sep.status === S.INITIATED && canHr(user.role, 'settlementEdit')) return { label: 'Start clearance', stage: 'edit' };
    if (canHr(user.role, 'settlementEdit') && !sep.statement) return { label: 'Finalise dues', stage: 'edit' };
    if (canHr(user.role, 'settlementEdit') && settlementReady(sep, emp, settings).ok) return { label: 'Submit for HR approval', stage: 'edit' };
    return null;
  }
  if (sep.status === S.RETURNED && canHr(user.role, 'settlementEdit')) return { label: 'Resubmit', stage: 'edit' };
  const stage = { [S.HR_APPROVAL]: 'HR', [S.FINANCE_APPROVAL]: 'Finance', [S.MGMT_APPROVAL]: 'Management', [S.APPROVED]: 'Pay' }[sep.status];
  if (stage && canApproveStage(sep, stage, user).ok) return { label: stage === 'Pay' ? 'Record payment' : `Approve (${stage})`, stage };
  return null;
};

export const mySettlementQueue = (settlements = [], employees = [], user, settings) =>
  settlements
    .map((s) => ({ settlement: s, employee: employees.find((e) => e.id === s.employeeId), action: null }))
    .map((r) => ({ ...r, action: settlementAction(r.settlement, r.employee, user, settings) }))
    .filter((r) => r.action);

export const settlementsOverdue = (settlements = [], settings, asOf) =>
  settlements
    .filter((s) => SETTLEMENT_OPEN.includes(s.status) && s.lastWorkingDay)
    .map((s) => ({ settlement: s, deadline: (s.statement?.meta?.deadline) || settlementDeadline(s.lastWorkingDay, settings).date }))
    .filter((r) => r.deadline < asOf)
    .map((r) => ({ ...r, days: daysBetween(r.deadline, asOf) }));

// Income Tax Act 2023 estimate: 1/3 exemption (capped), category threshold, slab walk, minimum tax.
export const estimateTds = ({ ytdIncome, settlementTaxable, ytdTaxPaid, category = 'general' }, settings) => {
  const t = settings?.tax || {};
  const income = round2(num(ytdIncome) + num(settlementTaxable));
  const exempt = round2(Math.min(income / (num(t.exemptionDivisor) || 3), num(t.exemptionCap) || Infinity));
  const taxable = round2(Math.max(0, income - exempt));
  const threshold = num(t.thresholds?.[category] ?? t.thresholds?.general);
  let above = Math.max(0, taxable - threshold);
  const lines = [{ label: `First ${fmtNum2(threshold)} (tax-free threshold)`, amount: 0, rate: 0, base: Math.min(taxable, threshold) }];
  let slabTax = 0;
  (t.slabs || []).forEach((s) => {
    if (above <= 0) return;
    const base = s.width == null ? above : Math.min(above, num(s.width));
    const amount = round2(base * num(s.rate) / 100);
    lines.push({ label: `${s.width == null ? 'Remaining' : `Next ${fmtNum2(s.width)}`} @ ${s.rate}%`, amount, rate: num(s.rate), base: round2(base) });
    slabTax += amount;
    above -= base;
  });
  const tax = taxable > threshold ? round2(Math.max(slabTax, num(t.minimumTax))) : 0;
  const tds = Math.max(0, round2(tax - num(ytdTaxPaid)));
  return { income, exempt, taxable, threshold, tax, slabTax: round2(slabTax), tds, paid: num(ytdTaxPaid), lines };
};

// Letter of the s.27(4) tier that applied (a, b, c …).
const tierLetter = (i) => String.fromCharCode(97 + i);

export const resignationTier = (exactYears, tiers = []) => {
  const i = tiers.findIndex((t) => t.upToYears == null || (t.inclusive ? exactYears <= num(t.upToYears) : exactYears < num(t.upToYears)));
  const idx = i < 0 ? tiers.length - 1 : i;
  return { ...(tiers[idx] || { days: 0 }), index: idx, letter: tierLetter(idx), last: idx === tiers.length - 1 };
};

// Months since the last festival bonus, approximated on a six-month festival rhythm.
const monthsSinceFestival = (lwd) => (Number(String(lwd).slice(5, 7)) % 6) || 6;

// ---------------------------------------------------------------------------
// computeSettlement — the statement (D.5 steps 1–10). Every line is rounded
// to the paisa first; totals are sums of the rounded lines.

export const computeSettlement = (emp, sep, settings, ctx = {}) => {
  const st = settings.statutory || {};
  const inputs = { ...emptySettlementInputs(), ...(sep.inputs || {}) };
  const asOf = ctx.asOf || localToday();
  const lwd = sep.lastWorkingDay;
  const joinDate = emp.employment?.joinDate || '';
  const salary = emp.salary || {};
  const type = sep.type;
  const sec = SEPARATION_SECTIONS[type] || '';

  // 1. Service
  const law = lawVersionFor(sep, settings);
  const rounding = inputs.roundingOverride || st.partialYearRounding || 'six_months';
  const len = serviceLength(joinDate, lwd, !!st.countLastDayInclusive);
  const CY = completedYears(len, rounding);
  const y = len.exactYears;

  // 2. Rates (unrounded until line level)
  const dpm = num(st.daysPerMonth) || 30;
  const compMonthlyAmt = compMonthly(salary, settings);
  const W = compMonthlyAmt / dpm;
  const gross = grossSalary(salary);
  const grossDaily = gross / dpm;
  const basic = num(salary.basic);
  const basicDaily = basic / dpm;
  const leaveDaily = (settings.leave?.encashRateBase || 'gross') === 'gross' ? grossDaily : W;
  const shortfallDaily = (settings.noticeShortfall?.base || 'basic_da') === 'gross' ? grossDaily : W;
  const gratuityDaily = (settings.gratuity?.wageBase || 'basic') === 'gross' ? grossDaily : basicDaily;

  // 3. Final month (Rule 114)
  const dim = lwd ? daysInMonth(lwd) : 30;
  const served = lwd ? Number(lwd.slice(8, 10)) : 0;
  const finalFactor = inputs.finalMonthSalaryPaid ? 0 : served / dim;
  const finalMonthComponents = {};
  ['basic', 'houseRent', 'medical', 'conveyance', 'dearness', 'adhoc', 'otherAllowances'].forEach((k) => { finalMonthComponents[k] = round2(num(salary[k]) * finalFactor); });

  // Notice
  const deemedPermanent = !!sep.probationer && deemedPermanentOn(emp, sep.noticeDate || asOf);
  const probationer = !!sep.probationer && !deemedPermanent;
  const permanent = isPermanent(emp, { ...sep, probationer });
  const required = sep.noticeRequiredDays === '' || sep.noticeRequiredDays == null
    ? noticeRequiredDays(emp, type, settings, { ...sep, probationer })
    : num(sep.noticeRequiredDays);
  const servedNotice = effectiveNoticeServed(sep);
  const waived = num(sep.noticeWaivedDays);
  const isResignation = type === 'Resignation' || type === 'Deemed Resignation (s.27(3A))';
  const shortfallDays = isResignation ? Math.max(0, required - servedNotice - waived) : 0;

  const flags = [];
  const flag = (tone, text) => flags.push({ tone, text });
  const workerCategory = emp.employment?.workerCategory || 'Worker';

  // 4. Earnings
  const E = [];
  const line = (arr, key, label, formula, cite, amount) => { arr.push({ key, label, formula, cite, amount: round2(amount) }); return round2(amount); };
  line(E, 'salary', `Salary 1–${served} ${lwd ? monthLabel(lwd) : ''} (pro-rata)`, inputs.finalMonthSalaryPaid ? 'Final month already paid' : `${fmtNum2(gross)} × ${served}/${dim}`, 'r.114', inputs.finalMonthSalaryPaid ? 0 : gross * served / dim);
  line(E, 'arrears', 'Salary arrears', 'As entered', '—', num(inputs.arrears));
  line(E, 'overtime', 'Overtime dues', 'As entered', 's.108', num(inputs.overtime));
  line(E, 'reimbursement', 'Expense reimbursement', 'As entered', '—', num(inputs.reimbursement));
  line(E, 'otherPayable', 'Other payable', 'As entered', '—', num(inputs.otherPayable));
  const elDays = settings.leave?.encashOnExit ? num(inputs.elBalanceDays) : 0;
  line(E, 'leaveEncash', 'Earned leave encashment', `${elDays} days × ${fmtNum2(leaveDaily)}`, 's.11, s.119', elDays * leaveDaily);
  const bonusMode = settings.bonus?.prorataOnExit || 'none';
  let bonus = 0;
  let bonusFormula = 'Not payable on exit (policy)';
  if (bonusMode === 'months_since_last') { const m = monthsSinceFestival(lwd); bonus = basic * m / 6; bonusFormula = `${fmtNum2(basic)} × ${m}/6`; }
  else if (bonusMode === 'accrual' && inputs.bonusPaidThisYear) bonusFormula = 'Festival bonuses already paid this year';
  else if (bonusMode === 'accrual') {
    const m = lwd ? Number(lwd.slice(5, 7)) : 0;
    const k = num(settings.bonus?.countPerYear || 2) * num(settings.bonus?.maxEachBasicMultiple || 1);
    bonus = k * basic / 12 * m; bonusFormula = `${k} × ${fmtNum2(basic)} / 12 × ${m} months`;
  }
  line(E, 'bonus', 'Festival bonus (pro-rata)', bonusFormula, 'r.111(5)', bonus);
  line(E, 'performanceBonus', 'Performance bonus', 'As entered', 'Policy', num(inputs.performanceBonus));
  const payInLieu = EMPLOYER_INITIATED.includes(type) && sep.payInLieu;
  // Only the notice not served is paid in lieu.
  const lieuMax = Math.max(0, required - servedNotice);
  const lieuEntered = sep.payInLieuDays !== '' && sep.payInLieuDays != null ? num(sep.payInLieuDays) : lieuMax;
  const lieuDays = payInLieu ? Math.min(lieuEntered, lieuMax) : 0;
  if (payInLieu && lieuEntered > lieuMax) flag('warn', `Pay in lieu limited to the ${lieuMax} notice days not served (${lieuEntered} entered, ${servedNotice} served).`);
  line(E, 'noticePay', 'Pay in lieu of notice', payInLieu ? `${lieuDays} days × ${fmtNum2(W)}` : 'Not applicable', 's.26(3), s.20(2)', lieuDays * W);

  // 5. Compensation
  const comp = settings.compensation || {};
  let compDays = 0;
  let compLabel = 'Statutory compensation';
  let compCite = sec;
  let compAmount = 0;
  let compFormula = '—';
  let tier = null;
  let eligible = true;
  if (comp.permanentOnly && !permanent) { eligible = false; flag('info', 'Compensation applies to permanent employees only; employee is not permanent (s.2(8)).'); }
  if (!st.applyToNonWorkers && workerCategory === 'Non-worker') { eligible = false; flag('info', 'Non-worker: statutory compensation not applied (policy floor).'); }
  if (probationer) eligible = false;
  if (deemedPermanent) flag('warn', `Probation ended ${probationEndOf(emp)} without a decision; employee treated as permanent (s.4(8)).`);
  const minYears = num(comp.minServiceYears);
  const forfeited = type === 'Dismissal' && (comp.forfeitOnMisconductClauses || []).includes(sep.misconductClause);
  if (eligible) {
    switch (type) {
      case 'Resignation':
      case 'Deemed Resignation (s.27(3A))':
        tier = resignationTier(y, law === 'pre_2025' ? comp.resignationTiersPre2025 : comp.resignationTiers);
        compDays = num(tier.days);
        compLabel = `Resignation benefit s.27(4)(${tier.letter})`;
        compCite = 's.27(4)';
        break;
      case 'Termination': compDays = num(comp.terminationDaysPerYear); compLabel = 'Termination compensation'; compCite = 's.26(4)'; break;
      case 'Retrenchment': compDays = y < minYears ? 0 : num(comp.retrenchmentDaysPerYear); compLabel = 'Retrenchment compensation'; compCite = 's.20(2)(c)'; break;
      case 'Discharge': compDays = y < minYears ? 0 : num(comp.dischargeDaysPerYear); compLabel = 'Discharge compensation'; compCite = 's.22(2)'; break;
      case 'Dismissal':
        compDays = y < minYears || forfeited ? 0 : num(comp.dismissalDaysPerYear); compLabel = 'Dismissal compensation'; compCite = 's.23(3)';
        if (forfeited) flag('warn', `Compensation forfeited: misconduct under s.${sep.misconductClause} (s.23(3)).`);
        break;
      case 'Retirement': compDays = num(comp.retirementDaysPerYear); compLabel = 'Retirement benefit'; compCite = 's.28(3) → s.26(4)'; break;
      case 'Death': {
        const minDeath = law === 'pre_2025' ? num(comp.deathMinServiceYearsPre2025) : num(comp.deathMinServiceYears);
        compDays = y < minDeath ? 0 : num(sep.deathAtWork ? comp.deathAtWorkDaysPerYear : comp.deathDaysPerYear);
        compLabel = sep.deathAtWork ? 'Death benefit (death in the course of employment)' : 'Death benefit'; compCite = 's.19';
        break;
      }
      default: compDays = 0;
    }
    compAmount = compDays * W * CY;
    compFormula = compDays ? `${compDays} × ${fmtNum2(W)} × ${CY}` : '—';
  }
  // Gratuity scheme compared with the statutory compensation (s.2(10)).
  const g = settings.gratuity || {};
  let gratAmount = 0;
  let gratuityWins = false;
  if (g.schemeEnabled && eligible && !forfeited) {
    const gDays = y > 10 ? num(g.daysPerYearAfter10) : num(g.daysPerYear);
    gratAmount = gDays * gratuityDaily * CY;
    const compare = g.compareWithCompensation && (!isResignation || comp.resignationGratuityCompareAllTiers || (tier && tier.last));
    gratuityWins = compare && gratAmount > compAmount;
  }
  line(E, 'compensation', compLabel, gratuityWins ? 'Replaced by gratuity' : compFormula, compCite, gratuityWins ? 0 : compAmount);
  line(E, 'gratuity', 'Gratuity (higher than statutory compensation)', gratuityWins ? `${y > 10 ? num(g.daysPerYearAfter10) : num(g.daysPerYear)} × ${fmtNum2(gratuityDaily)} × ${CY}` : '—', 's.2(10)', gratuityWins ? gratAmount : 0);
  const layoffExtra = type === 'Retrenchment' && sep.afterLayoff && eligible ? num(comp.retrenchmentAfterLayoffExtraDays || settings.notice?.retrenchmentAfterLayoffExtraDays) * W : 0;
  line(E, 'layoffExtra', 'Retrenchment after lay-off (extra days)', layoffExtra ? `${num(settings.notice?.retrenchmentAfterLayoffExtraDays)} × ${fmtNum2(W)}` : '—', 's.20(2)(b)', layoffExtra);
  line(E, 'groupInsurance', 'Group insurance (death)', type === 'Death' ? 'As entered' : 'Not applicable', 's.99', type === 'Death' ? num(inputs.groupInsurance) : 0);
  const earnings = round2(E.reduce((s, l) => s + l.amount, 0));
  const gratuityPart = E.find((l) => l.key === 'gratuity').amount;

  // 6. Deductions
  const D = [];
  const setoff = settings.noticeShortfall?.setoffAllowed !== false;
  line(D, 'noticeShortfall', 'Notice shortfall recovery', shortfallDays && setoff ? `${shortfallDays} × ${fmtNum2(shortfallDaily)}` : '—', 's.27(3), s.14(3)', setoff ? shortfallDays * shortfallDaily : 0);
  const pfMember = !!emp.pf?.member && settings.pf?.enabled !== false;
  const empRate = emp.pf?.employeeRatePct === '' || emp.pf?.employeeRatePct == null ? num(settings.pf?.employeeRatePct) : num(emp.pf.employeeRatePct);
  const erRate = emp.pf?.employerRatePct === '' || emp.pf?.employerRatePct == null ? num(settings.pf?.employerRatePct) : num(emp.pf.employerRatePct);
  const pfBase = (settings.pf?.rateBase || 'basic') === 'gross' ? gross : basic;
  const pfEmployeeLine = pfMember && !inputs.finalMonthSalaryPaid ? empRate / 100 * pfBase * served / dim : 0;
  const pfEmployerLine = pfMember && !inputs.finalMonthSalaryPaid ? erRate / 100 * pfBase * served / dim : 0;
  line(D, 'pfEmployee', 'Employee PF on final salary', pfMember ? `${empRate}% × ${fmtNum2(pfBase)} × ${served}/${dim}` : 'Not a member', 's.264(9)', pfEmployeeLine);
  line(D, 'loanRecovery', 'Salary advance / loan recovery', 'As entered', 's.125(2)', num(inputs.loanRecovery));
  const assetBlocked = num(inputs.assetRecovery) > 0 && settings.deductions?.assetRecoveryRequiresShowCause && !inputs.assetShowCauseIssued;
  if (assetBlocked) flag('danger', 'Asset recovery withheld: a show-cause notice must be issued before deducting for loss or damage (s.125(2)(c), s.127).');
  line(D, 'assetRecovery', 'Recovery for company property', assetBlocked ? 'Show-cause pending' : 'As entered', 's.125(2)(c), s.127', assetBlocked ? 0 : num(inputs.assetRecovery));
  line(D, 'absence', 'Unauthorised absence', num(inputs.absenceDays) ? `${num(inputs.absenceDays)} × ${fmtNum2(compMonthlyAmt / dpm)}` : '—', 'r.115', num(inputs.absenceDays) * compMonthlyAmt / dpm);
  line(D, 'otherDeduction', 'Other deduction', 'As entered', '—', num(inputs.otherDeduction));
  const taxable = earnings - (g.fundApproved ? Math.min(gratuityPart, num(settings.tax?.gratuityExemptCap)) : 0);
  const tax = estimateTds({ ytdIncome: inputs.ytdIncome, settlementTaxable: taxable, ytdTaxPaid: inputs.ytdTaxPaid, category: emp.tax?.category || 'general' }, settings);
  const taxAmount = inputs.taxOverride !== '' && inputs.taxOverride != null ? num(inputs.taxOverride) : tax.tds;
  line(D, 'tax', 'Income tax at source (estimate)', inputs.taxOverride !== '' && inputs.taxOverride != null ? 'Override entered' : `${fmtNum2(tax.income)} − ${fmtNum2(tax.exempt)} = ${fmtNum2(tax.taxable)}${tax.taxable > tax.threshold ? '' : ` < ${fmtNum2(tax.threshold)} → nil`}`, 'ITA 2023 s.86', taxAmount);
  const deductions = round2(D.reduce((s, l) => s + l.amount, 0));

  // 7. Provident fund
  const P = [];
  let vested = 0;
  const pfJoin = emp.pf?.joinDate || joinDate;
  const pfYears = serviceLength(pfJoin, lwd, !!st.countLastDayInclusive).exactYears;
  if (pfMember) {
    if (settings.pf?.vestOnDeath && type === 'Death') vested = 1;
    else vested = y >= num(settings.pf?.vestingYears) && pfYears >= 1 ? 1 : 0;
    if (type === 'Dismissal' && settings.pf?.forfeitOnDismissal) vested = 0;
    const pfEmpLineR = round2(pfEmployeeLine);
    line(P, 'pfOwn', 'PF own contributions', `${fmtNum2(num(inputs.pfOwn))} + ${fmtNum2(pfEmpLineR)}`, 'r.263', num(inputs.pfOwn) + pfEmpLineR);
    line(P, 'pfEmployer', `PF employer, ${vested * 100}% vested`, `(${fmtNum2(num(inputs.pfEmployer))} + ${fmtNum2(round2(pfEmployerLine))}) × ${vested}`, 'r.263(1)', (num(inputs.pfEmployer) + round2(pfEmployerLine)) * vested);
    line(P, 'pfInterest', 'PF interest accrued', 'As per fund ledger', 'r.261', num(inputs.pfInterest));
    line(P, 'pfAdvance', 'Less PF advance outstanding', settings.pf?.advanceSetoff === false ? 'Not set off' : 'As per fund ledger', 'r.266', settings.pf?.advanceSetoff === false ? 0 : -num(inputs.pfAdvance));
  }
  const pfNet = round2(P.reduce((s, l) => s + l.amount, 0));

  // 8. Totals
  const netPayable = round2(earnings - deductions);
  const totals = { earnings, deductions, netPayable, pfNet, totalToEmployee: round2(netPayable + pfNet) };

  // 9. Meta
  const deadline = settlementDeadline(lwd, settings);
  const meta = {
    serviceText: len.text, exactYears: round2(y), completedYears: CY, rounding, law, W: round2(W), grossDaily: round2(grossDaily), leaveDaily: round2(leaveDaily),
    compMonthly: compMonthlyAmt, gross, basic, finalMonthComponents, served, dim,
    noticeRequired: required, noticeServed: servedNotice, noticeWaived: waived, shortfallDays, payInLieuDays: lieuDays,
    permanent, workerCategory, section: sec, deadline: deadline.date, skippedDays: deadline.skipped,
    tax, gratuityAlt: gratuityWins ? 0 : round2(gratAmount), tier: tier ? tier.letter : '', vested, pfMember,
    payee: type === 'Death' ? 'Nominee' : 'Employee',
  };

  // 10. Flags
  if (shortfallDays > 0 && setoff) flag('info', `Notice shortfall of ${shortfallDays} days recovered from dues (s.27(3)).`);
  if (shortfallDays > 0 && !setoff) flag('info', `Notice shortfall of ${shortfallDays} days not set off (policy).`);
  if (taxAmount > 0 || tax.tds > 0) flag('info', 'Income tax at source is an estimate; confirm against the payroll tax computation.');
  (sep.clearance || []).filter((r) => r.status === 'Dues Found').forEach((r) => flag('info', `${r.label} reported dues${num(r.recoverable) ? ` of ${fmtMoney2(r.recoverable)}` : ''}${r.remarks ? `: ${r.remarks}` : '.'}`));
  const csMin = num(st.continuousServiceDays) || 240;
  const cs = ctx.continuousService;
  if (cs && cs.months >= 12 && cs.daysWorked < csMin) flag('warn', `Continuous service check: ${cs.daysWorked} days worked in the last 12 months (< ${csMin}, s.14).`);
  if (deadline.date && asOf > deadline.date && sep.status !== SETTLEMENT_STATUS.PAID) flag('danger', `Settlement deadline ${deadline.date} has passed (30 working days, s.123).`);
  if (ctx.proRataAppraisal) flag('info', 'Pro-rata appraisal closed with grade ≥ B: performance bonus line may be enabled.');
  if (type === 'Death') flag('info', 'Dues are payable to the nominee (s.19, s.32).');
  if (sep.type === 'Retirement' && emp.dob && ageAt(emp.dob, lwd) < num(st.retirementAge)) flag('warn', `Retirement before age ${st.retirementAge} (s.28).`);

  return { meta, lines: { earnings: E, deductions: D, pf: P }, totals, flags, lawVersion: law, skippedDays: deadline.skipped };
};

// Amount of one statement line by key (0 when absent).
export const statementLine = (statement, key) => {
  const all = [...(statement?.lines?.earnings || []), ...(statement?.lines?.deductions || []), ...(statement?.lines?.pf || [])];
  return all.find((l) => l.key === key)?.amount ?? 0;
};

// Freeze the statement onto a settlement (D.5 UPSERT_SETTLEMENT 'Dues Computed').
export const freezeStatement = (sep, emp, settings, ctx, by) => ({
  ...sep,
  statement: { ...computeSettlement(emp, sep, settings, ctx), computedAt: nowIso(), computedBy: by },
});

// HR (Know Your Employee) data model, validation, scope, reminders and
// insights. Settlement and appraisal arithmetic live in ./settlementCalc and
// ./appraisalCalc and are re-exported here so pages import only this module.
import { ACTIVE_EMPLOYEE_STATUSES, APPRAISAL_OPEN, DEFAULT_HR_SETTINGS, EMPLOYEE_STATUS, EXPIRING_EMPLOYEE_DOCS, HR_ROLES, HR_STAFF_ROLES, LEAVE_STATUS, REQUIRED_EMPLOYEE_DOCS, SETTLEMENT_OPEN, canHr, designationOf } from './config.js';
import { addMonths, fmtDate, localDate, normalizeId, normalizePhone, nowIso, uid } from '../utils/helpers.js';
import { daysBetween, grossSalary, lastMonths, localToday, mySettlementQueue, num, serviceLength, settlementDeadline, workingDaysBetween } from './settlementCalc.js';
import { activeDisciplinary, appraisalOverdue, appraisalOwner, attendanceSummary, myAppraisalQueue, probationEndDate } from './appraisalCalc.js';

export * from './settlementCalc.js';
export * from './appraisalCalc.js';
export { addDays, addMonths, daysUntil, fmtDate, fmtDateTime, fmtMoney, maskValue, nowIso, uid } from '../utils/helpers.js';

// Days from asOf to a date (negative when passed); the HR counterpart of utils.daysUntil.
export const daysUntilAsOf = (date, asOf) => (date ? daysBetween(asOf || localToday(), date) : null);

// ---------------------------------------------------------------------------
// D.2 Employee

export const emptyEmployee = (createdBy) => ({
  id: uid('emp'),
  code: '',
  status: EMPLOYEE_STATUS.DRAFT,
  statusReason: '',
  statusHistory: [],
  name: '', fatherName: '', motherName: '', dob: '', gender: 'Male', maritalStatus: 'Single', bloodGroup: '', nationality: 'Bangladeshi',
  nid: '', tin: '', passportNo: '', passportExpiry: '', mobile: '', altMobile: '', email: '', presentAddress: '', permanentAddress: '',
  emergencyContact: { name: '', relation: '', mobile: '', address: '' },
  nominee: { name: '', relation: '', nid: '', mobile: '', sharePct: '100' },
  employment: {
    department: '', designation: '', grade: '', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'commercial',
    joinDate: '', contractEndDate: '', confirmationDate: '', reportingManagerId: '', workLocation: 'Dhaka HQ',
    probation: { required: true, months: '6', endDate: '', extended: false, extendedTo: '', decision: '', decidedAt: '', decidedBy: '' },
  },
  salary: { basic: '', houseRent: '', medical: '', conveyance: '', dearness: '', adhoc: '', otherAllowances: '', effectiveFrom: '', payMode: 'Bank Transfer', history: [] },
  bank: { bankName: '', branch: '', accountType: 'Savings', accountName: '', accountNo: '', routingNo: '', verified: false, verifiedBy: '', verifiedAt: '' },
  pf: { member: false, joinDate: '', employeeRatePct: '8', employerRatePct: '8', ownBalance: '', employerBalance: '', interestAccrued: '', advanceOutstanding: '' },
  loans: [],
  tax: { category: 'general', ytdIncome: '', ytdTaxPaid: '', bonusPaidThisYear: false },
  leave: { opening: {}, entitlementOverride: {}, refusedBeyondCap: {} },
  disciplinary: [],
  absenceNotice: { firstNoticeOn: '', secondNoticeOn: '' },
  suspendedFrom: '',
  separationId: '',
  separatedAt: '',
  rehireEligible: true,
  lastAppraisal: { code: '', cycle: '', grade: '', final: '', at: '' },
  documents: [],
  createdBy,
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export const emptyLoan = () => ({ id: uid('loan'), type: 'Salary Advance', principal: '', outstanding: '', monthlyInstalment: '', note: '' });
export const emptyDisciplinary = (by) => ({ id: uid('dis'), type: 'Show Cause', date: '', reference: '', showCauseDate: '', replyDueDate: '', enquiryDate: '', outcome: '', misconductClause: '', note: '', documentId: '', by, at: nowIso() });

// Fill in any keys missing from stored employee records.
export const migrateEmployee = (raw) => {
  const base = emptyEmployee(raw.createdBy || '');
  const deep = (k) => ({ ...base[k], ...(raw[k] || {}) });
  return {
    ...base,
    ...raw,
    emergencyContact: deep('emergencyContact'),
    nominee: deep('nominee'),
    employment: { ...deep('employment'), probation: { ...base.employment.probation, ...(raw.employment?.probation || {}) } },
    salary: { ...deep('salary'), history: Array.isArray(raw.salary?.history) ? raw.salary.history : [] },
    bank: deep('bank'),
    pf: deep('pf'),
    tax: deep('tax'),
    leave: { opening: {}, entitlementOverride: {}, refusedBeyondCap: {}, ...(raw.leave || {}) },
    absenceNotice: deep('absenceNotice'),
    lastAppraisal: deep('lastAppraisal'),
    statusHistory: Array.isArray(raw.statusHistory) ? raw.statusHistory : [],
    loans: Array.isArray(raw.loans) ? raw.loans : [],
    disciplinary: Array.isArray(raw.disciplinary) ? raw.disciplinary : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
  };
};

// Deep merge of stored settings over the defaults, one level per top-level key; schemaVersion always from defaults.
export const migrateHrSettings = (raw) => {
  const out = { ...DEFAULT_HR_SETTINGS };
  Object.keys(DEFAULT_HR_SETTINGS).forEach((k) => {
    const d = DEFAULT_HR_SETTINGS[k];
    const r = raw?.[k];
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      out[k] = { ...d, ...(r && typeof r === 'object' ? r : {}) };
      // Nested objects (tax.thresholds, appraisal.gates/attendance) keep their own defaults.
      Object.keys(d).forEach((kk) => {
        if (d[kk] && typeof d[kk] === 'object' && !Array.isArray(d[kk]) && r?.[kk] && typeof r[kk] === 'object') out[k][kk] = { ...d[kk], ...r[kk] };
      });
    } else if (r !== undefined) out[k] = r;
  });
  out.schemaVersion = DEFAULT_HR_SETTINGS.schemaVersion;
  return out;
};

export const nextEmployeeCode = (list = []) => {
  const nums = list.map((e) => parseInt((e.code || '').split('-')[1], 10)).filter((n) => !Number.isNaN(n));
  return `EMP-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

const validNid = (v) => /^[0-9]{10}$|^[0-9]{13}$|^[0-9]{17}$/.test(String(v || '').replace(/\s/g, ''));
const validEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
const ageAtDate = (dob, date) => (dob && date ? serviceLength(dob, date).years : null);

export const validateEmployee = (e, settings) => {
  const errors = [];
  const emp = e.employment || {};
  if (!(e.name || '').trim()) errors.push('Employee name is required.');
  if (!e.dob) errors.push('Date of birth is required.');
  else if (emp.joinDate && ageAtDate(e.dob, emp.joinDate) < 18) errors.push('Employee must be at least 18 years old at the joining date (s.34).');
  if (!validNid(e.nid)) errors.push('NID must be 10, 13 or 17 digits.');
  if (!/^01[0-9]{9}$/.test(normalizePhone(e.mobile))) errors.push('A valid 11-digit Bangladeshi mobile number is required.');
  if (e.email && !validEmail(e.email)) errors.push('Email address format is invalid.');
  if (!emp.department || !emp.designation || !emp.grade) errors.push('Department, designation and grade are required.');
  if (!emp.joinDate) errors.push('Joining date is required.');
  if (!emp.reportingManagerId && emp.designation !== 'MD') errors.push('Reporting manager is required (except for the Managing Director).');
  if (num(e.salary?.basic) <= 0) errors.push('Basic salary must be greater than zero.');
  if (e.salary?.payMode !== 'Cash' && (!(e.bank?.bankName || '').trim() || !(e.bank?.accountNo || '').trim())) errors.push('Bank name and account number are required unless salary is paid in cash.');
  if (e.pf?.member && (!(e.nominee?.name || '').trim() || !(e.nominee?.relation || '').trim())) errors.push('Nominee name and relation are required for PF members.');
  if (emp.probation?.required && num(emp.probation?.months) <= 0) errors.push('Probation months are required when probation applies.');
  if (emp.employmentType === 'Contractual' && !emp.contractEndDate) errors.push('Contract end date is required for contractual employees.');
  if (!(e.emergencyContact?.name || '').trim() || !(e.emergencyContact?.mobile || '').trim()) errors.push('Emergency contact name and mobile are required.');
  void settings;
  return errors;
};

// Completeness percentage for dashboards; mirrors validateEmployee plus at least one document.
export const employeeCompleteness = (e) => {
  const emp = e.employment || {};
  const checks = [
    !!e.name, !!e.dob, validNid(e.nid), /^01[0-9]{9}$/.test(normalizePhone(e.mobile)), !e.email || validEmail(e.email),
    !!(emp.department && emp.designation && emp.grade), !!emp.joinDate, !!emp.reportingManagerId || emp.designation === 'MD',
    num(e.salary?.basic) > 0, e.salary?.payMode === 'Cash' || !!(e.bank?.bankName && e.bank?.accountNo),
    !e.pf?.member || !!(e.nominee?.name && e.nominee?.relation), !emp.probation?.required || num(emp.probation?.months) > 0,
    emp.employmentType !== 'Contractual' || !!emp.contractEndDate, !!(e.emergencyContact?.name && e.emergencyContact?.mobile),
    (e.documents || []).length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

// Duplicate detection on NID, TIN, mobile and bank account; Separated records are closed.
export const findEmployeeDuplicates = (e, all = []) => {
  const hits = [];
  const nid = normalizeId(e.nid);
  const tin = normalizeId(e.tin);
  const mob = normalizePhone(e.mobile);
  const acc = normalizeId(e.bank?.accountNo);
  all.forEach((o) => {
    if (o.id === e.id || o.status === EMPLOYEE_STATUS.SEPARATED) return;
    const reasons = [];
    if (nid && normalizeId(o.nid) === nid) reasons.push('Same NID');
    if (tin && normalizeId(o.tin) === tin) reasons.push('Same TIN');
    if (mob && [o.mobile, o.altMobile].map(normalizePhone).includes(mob)) reasons.push('Same mobile number');
    if (acc && normalizeId(o.bank?.accountNo) === acc) reasons.push('Same bank account');
    if (reasons.length) hits.push({ employee: o, reasons });
  });
  return hits;
};

export const probationsDue = (employees = [], withinDays = 30, asOf) =>
  employees
    .filter((e) => e.status === EMPLOYEE_STATUS.PROBATION && probationEndDate(e))
    .map((e) => ({ employee: e, days: daysUntilAsOf(probationEndDate(e), asOf) }))
    .filter((r) => r.days <= withinDays)
    .sort((a, b) => a.days - b.days);

export const contractsExpiring = (employees = [], withinDays = 60, asOf) =>
  employees
    .filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && e.employment?.employmentType === 'Contractual' && e.employment?.contractEndDate)
    .map((e) => ({ employee: e, days: daysUntilAsOf(e.employment.contractEndDate, asOf) }))
    .filter((r) => r.days <= withinDays)
    .sort((a, b) => a.days - b.days);

// Documents with an expiry inside the window (current versions only), plus the passport field itself.
export const expiringEmployeeDocuments = (employees = [], withinDays = 60, asOf) => {
  const out = [];
  employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)).forEach((e) => {
    (e.documents || []).filter((d) => d.current !== false && d.expiry && EXPIRING_EMPLOYEE_DOCS.includes(d.type)).forEach((d) => {
      const days = daysUntilAsOf(d.expiry, asOf);
      if (days <= withinDays) out.push({ employee: e, doc: d, days });
    });
    if (e.passportExpiry && !(e.documents || []).some((d) => d.type === 'Passport' && d.expiry)) {
      const days = daysUntilAsOf(e.passportExpiry, asOf);
      if (days <= withinDays) out.push({ employee: e, doc: { id: `${e.id}_passport`, type: 'Passport', fileName: e.passportNo || '', expiry: e.passportExpiry, version: 1 }, days });
    }
  });
  return out.sort((a, b) => a.days - b.days);
};

export const retirementDate = (e, settings) => (e.dob ? addMonths(e.dob, 12 * (num(settings?.statutory?.retirementAge) || 60)) : '');

export const retirementsDue = (employees = [], settings, withinDays = 365, asOf) =>
  employees
    .filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && e.dob)
    .map((e) => ({ employee: e, date: retirementDate(e, settings), days: daysUntilAsOf(retirementDate(e, settings), asOf) }))
    .filter((r) => r.days <= withinDays)
    .sort((a, b) => a.days - b.days);

// Non-members whose service has passed the PF eligibility period.
export const pfEligibilityDue = (employees = [], settings, asOf) =>
  employees
    .filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && settings?.pf?.enabled !== false && !e.pf?.member && e.employment?.joinDate)
    .map((e) => ({ employee: e, eligibleOn: addMonths(e.employment.joinDate, num(settings?.pf?.eligibilityMonths) || 12) }))
    .filter((r) => r.eligibleOn <= (asOf || localToday()))
    .map((r) => ({ ...r, days: daysUntilAsOf(r.eligibleOn, asOf) }));

// ---------------------------------------------------------------------------
// Scope and visibility (A.2 #17)

export const isHrRole = (role) => HR_STAFF_ROLES.includes(role);

export const directReports = (id, employees = []) => (id ? employees.filter((e) => e.employment?.reportingManagerId === id) : []);
export const managerOf = (emp, employees = []) => employees.find((e) => e.id === emp?.employment?.reportingManagerId) || null;
export const employeeName = (id, employees = []) => employees.find((e) => e.id === id)?.name || '';

export const hrScope = (user, employees = []) => {
  const role = user?.role;
  const employee = employees.find((e) => e.id === user?.employeeId) || null;
  if ([HR_ROLES.HR_OFFICER, HR_ROLES.HR_HEAD, HR_ROLES.FINANCE, HR_ROLES.MANAGEMENT, HR_ROLES.ADMIN].includes(role)) {
    return { kind: 'all', employee, ids: new Set(employees.map((e) => e.id)) };
  }
  if (role === HR_ROLES.LINE_MANAGER) {
    const ids = new Set(directReports(user.employeeId, employees).map((e) => e.id));
    if (user.employeeId) ids.add(user.employeeId);
    return { kind: 'team', employee, ids };
  }
  return { kind: 'self', employee, ids: new Set(user?.employeeId ? [user.employeeId] : []) };
};

export const visibleEmployees = (employees = [], user) => {
  const scope = hrScope(user, employees);
  return scope.kind === 'all' ? employees : employees.filter((e) => scope.ids.has(e.id));
};

export const canSeeSensitive = (user, emp) => canHr(user?.role, 'viewSensitive') || (!!user?.employeeId && user.employeeId === emp?.id);

export const designationName = (code) => designationOf(code)?.name || code || '';
export const departmentOf = (emp) => emp?.employment?.department || designationOf(emp?.employment?.designation)?.department || '';

// Derived metrics and advisory flags for the employee detail page.
export const employeeInsights = (e, ctx = {}) => {
  const asOf = ctx.asOf || localToday();
  const settings = ctx.settings || DEFAULT_HR_SETTINGS;
  const employees = ctx.employees || [];
  const flags = [];
  const end = e.status === EMPLOYEE_STATUS.SEPARATED ? e.separatedAt || asOf : asOf;
  const serviceText = e.employment?.joinDate ? serviceLength(e.employment.joinDate, end).text : '—';
  const pEnd = probationEndDate(e);
  const probationDaysLeft = e.status === EMPLOYEE_STATUS.PROBATION && pEnd ? daysUntilAsOf(pEnd, asOf) : null;
  const docsMissing = REQUIRED_EMPLOYEE_DOCS.filter((t) => !(e.documents || []).some((d) => d.type === t && d.current !== false));
  if (probationDaysLeft != null && probationDaysLeft >= 0 && probationDaysLeft <= 30) flags.push({ tone: 'warn', text: `Probation ends in ${probationDaysLeft} day(s) (${fmtDate(pEnd)}); record the decision.` });
  if (probationDaysLeft != null && probationDaysLeft < 0 && !e.employment?.probation?.decision) flags.push({ tone: 'danger', text: `Probation ended ${-probationDaysLeft} day(s) ago without a decision; the employee may be deemed permanent (s.4(8)).` });
  if (settings.pf?.enabled !== false && !e.pf?.member && e.employment?.joinDate && ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && addMonths(e.employment.joinDate, num(settings.pf?.eligibilityMonths) || 12) <= asOf) flags.push({ tone: 'info', text: 'Eligible for provident fund membership but not enrolled.' });
  expiringEmployeeDocuments([e], 60, asOf).forEach((r) => flags.push({ tone: r.days < 0 ? 'danger' : 'warn', text: `${r.doc.type} ${r.days < 0 ? 'expired' : 'expires'} ${fmtDate(r.doc.expiry)}.` }));
  const rd = retirementDate(e, settings);
  if (rd && ACTIVE_EMPLOYEE_STATUSES.includes(e.status) && daysUntilAsOf(rd, asOf) <= 365) flags.push({ tone: 'info', text: `Reaches retirement age on ${fmtDate(rd)} (s.28).` });
  if (findEmployeeDuplicates(e, employees).some((h) => h.reasons.includes('Same bank account'))) flags.push({ tone: 'danger', text: 'Bank account number is shared with another employee.' });
  if (!(e.nominee?.name || '').trim()) flags.push({ tone: 'warn', text: 'No nominee recorded.' });
  if (docsMissing.length) flags.push({ tone: 'info', text: `Required documents missing: ${docsMissing.join(', ')}.` });
  if (e.absenceNotice?.secondNoticeOn) flags.push({ tone: 'warn', text: `Second s.27(3A) absence notice issued ${fmtDate(e.absenceNotice.secondNoticeOn)}.` });
  return { serviceText, probationDaysLeft, docsMissing, flags };
};

// ---------------------------------------------------------------------------
// D.6 Reminders and nav counts

export const hrReminders = (state, user, asOf, windowDays = 60) => {
  const employees = state.employees || [];
  const settings = state.hrSettings || DEFAULT_HR_SETTINGS;
  const scope = hrScope(user, employees);
  const mine = (id) => scope.kind === 'all' || scope.ids.has(id);
  const out = [];
  const push = (r) => { if (mine(r.employeeId)) out.push(r); };
  const active = employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status));

  probationsDue(active, 30, asOf).forEach(({ employee, days }) => {
    const decided = !!employee.employment?.probation?.decision;
    if (days < 0 && !decided) push({ kind: 'deemedPermanent', tone: 'danger', text: `${employee.name}: probation ended ${-days} day(s) ago without a decision (deemed-permanent risk, s.4(8)).`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days });
    else push({ kind: 'probation', tone: days <= 7 ? 'danger' : 'warn', text: `${employee.name}: probation decision due ${days < 0 ? `${-days} day(s) ago` : `in ${days} day(s)`}.`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days });
  });
  contractsExpiring(active, windowDays, asOf).forEach(({ employee, days }) => push({ kind: 'contract', tone: days < 0 ? 'danger' : 'warn', text: `${employee.name}: contract ${days < 0 ? 'expired' : 'expires'} ${fmtDate(employee.employment.contractEndDate)}.`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days }));
  expiringEmployeeDocuments(active, windowDays, asOf).forEach(({ employee, doc, days }) => push({ kind: 'document', tone: days < 0 ? 'danger' : 'warn', text: `${employee.name}: ${doc.type} ${days < 0 ? 'expired' : 'expires'} ${fmtDate(doc.expiry)}.`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days }));
  (state.appraisals || []).filter((a) => APPRAISAL_OPEN.includes(a.status)).forEach((a) => {
    const days = appraisalOverdue(a, asOf);
    if (!days) return;
    const owner = appraisalOwner(a, employees);
    const emp = employees.find((e) => e.id === a.employeeId);
    push({ kind: 'appraisalOverdue', tone: 'warn', text: `${a.code} (${emp?.name || ''}): ${a.status} overdue by ${days} day(s)${owner ? ` — with ${owner.name}` : ''}.`, to: `/hr/appraisals/${a.id}`, employeeId: a.employeeId, days: -days });
  });
  (state.settlements || []).filter((s) => SETTLEMENT_OPEN.includes(s.status) && s.lastWorkingDay).forEach((s) => {
    const emp = employees.find((e) => e.id === s.employeeId);
    const deadline = s.statement?.meta?.deadline || settlementDeadline(s.lastWorkingDay, settings).date;
    const days = daysUntilAsOf(deadline, asOf);
    if (days <= 10) push({ kind: 'settlementDeadline', tone: days < 0 ? 'danger' : 'warn', text: `${s.code} (${emp?.name || ''}): settlement deadline ${days < 0 ? `passed ${-days} day(s) ago` : `in ${days} day(s)`} (${fmtDate(deadline)}).`, to: `/hr/settlements/${s.id}`, employeeId: s.employeeId, days });
    if (emp?.status === EMPLOYEE_STATUS.NOTICE && s.lastWorkingDay <= asOf) push({ kind: 'exitDatePassed', tone: 'warn', text: `${emp.name}: last working day ${fmtDate(s.lastWorkingDay)} has passed; confirm the exit.`, to: `/hr/employees/${emp.id}`, employeeId: emp.id, days: daysUntilAsOf(s.lastWorkingDay, asOf) });
  });
  (state.leaveRequests || []).filter((r) => r.status === LEAVE_STATUS.PENDING).forEach((r) => {
    const raw = String(r.requestedAt || '');
    const since = raw.length > 10 ? localDate(raw) : raw;
    const wd = since ? workingDaysBetween(since, asOf, settings.calendar) - 1 : 0;
    if (wd > 3) { const emp = employees.find((e) => e.id === r.employeeId); push({ kind: 'leavePending', tone: 'warn', text: `${r.code} (${emp?.name || ''}): leave request pending for ${wd} working days.`, to: `/hr/leave?status=Pending`, employeeId: r.employeeId, days: -wd }); }
  });
  pfEligibilityDue(active, settings, asOf).forEach(({ employee, eligibleOn }) => push({ kind: 'pfEligible', tone: 'info', text: `${employee.name}: eligible for PF membership since ${fmtDate(eligibleOn)}.`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days: daysUntilAsOf(eligibleOn, asOf) }));
  retirementsDue(active, settings, 365, asOf).forEach(({ employee, date, days }) => push({ kind: 'retirement', tone: days <= 90 ? 'warn' : 'info', text: `${employee.name}: reaches retirement age on ${fmtDate(date)}.`, to: `/hr/employees/${employee.id}`, employeeId: employee.id, days }));
  const lastMonth = lastMonths(1, asOf)[0];
  (state.attendance || []).filter((a) => a.month === lastMonth && num(a.unapprovedRun) >= 10).forEach((a) => {
    const emp = employees.find((e) => e.id === a.employeeId);
    if (emp && ACTIVE_EMPLOYEE_STATUSES.includes(emp.status) && !emp.absenceNotice?.firstNoticeOn) push({ kind: 'absenceNotice', tone: 'danger', text: `${emp.name}: ${a.unapprovedRun} consecutive days of unapproved absence in ${lastMonth}; issue the s.27(3A) notice.`, to: `/hr/employees/${emp.id}`, employeeId: emp.id, days: 0 });
  });
  (state.appraisals || []).filter((a) => a.hr?.pip && a.hr?.pipEndDate).forEach((a) => {
    const days = daysUntilAsOf(a.hr.pipEndDate, asOf);
    const emp = employees.find((e) => e.id === a.employeeId);
    if (days <= 14 && emp && ACTIVE_EMPLOYEE_STATUSES.includes(emp.status)) push({ kind: 'pipDue', tone: days < 0 ? 'danger' : 'warn', text: `${emp.name}: PIP checkpoint ${days < 0 ? `passed ${-days} day(s) ago` : `in ${days} day(s)`}.`, to: `/hr/appraisals/${a.id}`, employeeId: a.employeeId, days });
  });
  return out;
};

// Pending leave requests the user is expected to act on or can see.
export const pendingLeaveForUser = (requests = [], employees = [], user) => {
  const role = user?.role;
  const pending = requests.filter((r) => r.status === LEAVE_STATUS.PENDING);
  if (isHrRole(role)) return pending;
  if (role === HR_ROLES.EMPLOYEE) return pending.filter((r) => r.employeeId === user.employeeId);
  return pending.filter((r) => {
    const emp = employees.find((e) => e.id === r.employeeId);
    const approver = r.approverId || emp?.employment?.reportingManagerId || '';
    return r.employeeId === user.employeeId || (!!user.employeeId && approver === user.employeeId);
  });
};

export const hrNavCounts = (state, user, asOf) => {
  const employees = visibleEmployees(state.employees || [], user);
  const scope = hrScope(user, state.employees || []);
  return {
    employees: probationsDue(employees, 30, asOf).length + (scope.kind === 'all' ? employees.filter((e) => e.status === EMPLOYEE_STATUS.DRAFT).length : 0),
    appraisals: myAppraisalQueue(state.appraisals || [], state.employees || [], user, asOf).length,
    leave: pendingLeaveForUser(state.leaveRequests || [], state.employees || [], user).length,
    settlements: mySettlementQueue(state.settlements || [], state.employees || [], user, state.hrSettings || DEFAULT_HR_SETTINGS).length,
    reminders: hrReminders(state, user, asOf).length,
  };
};

// Attendance KPI over the last n months (detail page and attendance grid).
export const recentAttendance = (empId, attendance = [], asOf, n = 6) => attendanceSummary(empId, lastMonths(n, asOf || localToday()), attendance);

// Convenience for pages: deadline of a settlement from its frozen meta or live.
export const settlementDeadlineOf = (sep, settings) => sep.statement?.meta?.deadline || settlementDeadline(sep.lastWorkingDay, settings).date;

export const employeeStatusAt = (e, status) => (e.statusHistory || []).find((h) => h.status === status)?.at || '';

export const openAppraisalsOf = (empId, appraisals = []) => appraisals.filter((a) => a.employeeId === empId && APPRAISAL_OPEN.includes(a.status));

export const activeDisciplinaryCount = (e, from, to) => activeDisciplinary(e, from, to).length;

export const probationTemplateCode = (emp) => designationOf(emp?.employment?.designation)?.templateCode || '';

// Monthly payroll of the active headcount (dashboard tile, viewSensitive only).
export const monthlyPayroll = (employees = []) => employees.filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status)).reduce((s, e) => s + grossSalary(e.salary), 0);

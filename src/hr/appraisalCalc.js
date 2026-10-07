// Leave, attendance, KPI scoring and appraisal computation. Pure functions;
// consumers import everything through './helpers'.
import { ACTIVE_EMPLOYEE_STATUSES, APPRAISAL_FLOW, APPRAISAL_STATUS, COMPETENCIES, EMPLOYEE_STATUS, ESTABLISHMENT_TYPES, HR_ROLES, HR_STAFF_ROLES, LEAVE_STATUS, canHr, competencySet, designationOf } from './config.js';
import { addDays, addMonths, nowIso, uid } from '../utils/helpers.js';
import { daysBetween, daysInMonth, isWorkingDay, lastMonths, localToday, monthKey, monthRange, num, round2, workingDaysInMonth } from './settlementCalc.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const S = APPRAISAL_STATUS;

// ---------------------------------------------------------------------------
// D.3 Leave

export const emptyLeaveRequest = (empId, by) => ({
  id: uid('lvr'), code: '', employeeId: empId || '', typeCode: 'EL', from: '', to: '', halfDay: false, days: 0, reason: '', handoverTo: '', status: LEAVE_STATUS.PENDING,
  approverId: '', requestedBy: by, requestedAt: nowIso(), decision: { by: '', at: '', comment: '' }, updatedAt: nowIso(),
});

export const nextLeaveCode = (list = []) => {
  const nums = list.map((r) => parseInt((r.code || '').split('-')[1], 10)).filter((n) => !Number.isNaN(n));
  return `LV-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

// Calendar days for maternity-type leave, working days otherwise; half day only for a single date.
export const countLeaveDays = (from, to, halfDay, calendar, typeCfg) => {
  if (!from || !to || to < from) return 0;
  if (halfDay && from === to) return (typeCfg?.countCalendarDays || isWorkingDay(from, calendar)) ? 0.5 : 0;
  if (typeCfg?.countCalendarDays) return daysBetween(from, to) + 1;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkingDay(d, calendar)) n++;
  return n;
};

// Attendance is kept in working days, so calendar-day types (maternity) are walked as working days there.
const workingDayCfg = (t) => (t ? { ...t, countCalendarDays: false } : t);

const roundHalf = (n) => Math.round(n * 2) / 2;

// Annual entitlement for a leave type in a year (null = unlimited).
export const leaveEntitlement = (emp, typeCfg, year, settings, attendance = []) => {
  if (!typeCfg || typeCfg.unlimited) return null;
  const override = emp.leave?.entitlementOverride?.[typeCfg.code];
  if (override !== '' && override != null) return num(override);
  const annual = num(typeCfg.annualDays);
  const join = emp.employment?.joinDate;
  if (!join) return annual;
  const eligibleFrom = addMonths(join, num(typeCfg.minServiceMonths));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (eligibleFrom > yearEnd) return 0;
  if (typeCfg.code === 'EL' && settings?.leave?.elAccrual === 'perDaysWorked') {
    const worked = attendance.filter((a) => a.employeeId === emp.id && a.month.startsWith(String(year))).reduce((s, a) => s + num(a.present) + num(a.leave), 0);
    return Math.floor(worked / (num(settings.leave.elAccrualDivisor) || 18));
  }
  if (eligibleFrom <= yearStart) return annual;
  // Pro-rata from the month eligibility starts (joiners and service-qualified mid-year).
  const remainingMonths = 12 - (Number(eligibleFrom.slice(5, 7)) - 1);
  return roundHalf(annual * remainingMonths / 12);
};

const inYear = (r, year) => String(r.from || '').slice(0, 4) === String(year);

// Earned-leave cap: the lower of the settings cap and the establishment-type cap (s.117), plus refused-leave credit.
const elCap = (emp, settings) => {
  const est = ESTABLISHMENT_TYPES.find((t) => t.code === emp.employment?.establishmentType);
  const base = Math.min(num(settings?.leave?.elCapDays) || Infinity, est?.elCap ?? Infinity);
  return base === Infinity ? null : base + num(emp.leave?.refusedBeyondCap?.EL);
};

export const leaveBalance = (emp, typeCfg, year, requests = [], settings, asOf, attendance = []) => {
  const opening = num(emp.leave?.opening?.[typeCfg.code]);
  const entitlement = leaveEntitlement(emp, typeCfg, year, settings, attendance);
  const mine = requests.filter((r) => r.employeeId === emp.id && r.typeCode === typeCfg.code && inYear(r, year));
  const taken = mine.filter((r) => r.status === LEAVE_STATUS.APPROVED).reduce((s, r) => s + num(r.days), 0);
  const pending = mine.filter((r) => r.status === LEAVE_STATUS.PENDING).reduce((s, r) => s + num(r.days), 0);
  const cap = typeCfg.code === 'EL' ? elCap(emp, settings) : null;
  if (entitlement == null) return { opening, entitlement: null, taken, pending, balance: null, cap: null, unlimited: true };
  const credit = cap == null ? opening + entitlement : Math.min(opening + entitlement, cap);
  return { opening, entitlement, taken, pending, balance: round2(credit - taken), cap, unlimited: false };
};

export const allLeaveBalances = (emp, leaveTypes = [], year, requests, settings, asOf, attendance) =>
  leaveTypes.map((t) => ({ type: t, ...leaveBalance(emp, t, year, requests, settings, asOf, attendance) }));

export const leaveApproverFor = (emp) => emp?.employment?.reportingManagerId || '';

export const validateLeaveRequest = (req, emp, typeCfg, balance, requests = [], calendar) => {
  const e = [];
  if (!emp) { e.push('Select an employee.'); return e; }
  if (!ACTIVE_EMPLOYEE_STATUSES.includes(emp.status)) e.push(`Employee is ${emp.status}; leave can only be requested for active employees.`);
  if (!typeCfg) { e.push('Select a leave type.'); return e; }
  if (!req.from || !req.to) e.push('From and to dates are required.');
  else if (req.to < req.from) e.push('The to date must be on or after the from date.');
  const days = num(req.days);
  if (days <= 0) e.push('The request covers no working days.');
  if (typeCfg.genderOnly && emp.gender !== typeCfg.genderOnly) e.push(`${typeCfg.name} is available to ${typeCfg.genderOnly.toLowerCase()} employees only.`);
  if (num(typeCfg.maxConsecutive) > 0 && days > num(typeCfg.maxConsecutive)) e.push(`${typeCfg.name} cannot exceed ${typeCfg.maxConsecutive} consecutive days.`);
  if (!typeCfg.unlimited && balance && balance.balance != null && days > balance.balance) e.push(`Request of ${days} days exceeds the available ${typeCfg.code} balance of ${balance.balance}.`);
  if (!(req.reason || '').trim()) e.push('A reason is required.');
  const overlap = requests.find((r) => r.id !== req.id && r.employeeId === emp.id && [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED].includes(r.status) && r.from <= req.to && r.to >= req.from);
  if (overlap) e.push(`Overlaps with ${overlap.code || 'another request'} (${overlap.from} → ${overlap.to}).`);
  void calendar;
  return e;
};

// Approved leave days of an employee falling inside a month (attendance prefill).
export const approvedLeaveDaysInMonth = (empId, ym, requests = [], calendar, leaveTypes = []) => {
  const { from, to } = monthRange(ym);
  return requests
    .filter((r) => r.employeeId === empId && r.status === LEAVE_STATUS.APPROVED && r.from <= to && r.to >= from)
    .reduce((s, r) => {
      const t = leaveTypes.find((x) => x.code === r.typeCode);
      const a = r.from > from ? r.from : from;
      const b = r.to < to ? r.to : to;
      const d = countLeaveDays(a, b, r.halfDay && r.from === r.to, calendar, workingDayCfg(t));
      return s + (t && !t.paid ? 0 : d);
    }, 0);
};

// Leave-without-pay days inside a month (same walk, unpaid types only).
export const lwpDaysInMonth = (empId, ym, requests = [], calendar, leaveTypes = []) => {
  const { from, to } = monthRange(ym);
  return requests
    .filter((r) => r.employeeId === empId && r.status === LEAVE_STATUS.APPROVED && r.from <= to && r.to >= from)
    .reduce((s, r) => {
      const t = leaveTypes.find((x) => x.code === r.typeCode);
      if (!t || t.paid) return s;
      return s + countLeaveDays(r.from > from ? r.from : from, r.to < to ? r.to : to, false, calendar, workingDayCfg(t));
    }, 0);
};

// Year-end roll-over (pure): carry balances into next year's opening within carry caps.
export const closeLeaveYear = (employees = [], leaveTypes = [], requests = [], settings, asOf, attendance = []) => {
  const year = num(settings?.leave?.year);
  const details = {};
  const patched = employees.map((emp) => {
    if (!ACTIVE_EMPLOYEE_STATUSES.includes(emp.status)) return emp;
    const opening = { ...(emp.leave?.opening || {}) };
    const parts = [];
    leaveTypes.forEach((t) => {
      if (t.unlimited || (t.genderOnly && emp.gender !== t.genderOnly)) return;
      const b = leaveBalance(emp, t, year, requests, settings, asOf, attendance);
      const next = t.carryForward ? Math.max(0, Math.min(b.balance, num(t.carryCap) || Infinity)) : 0;
      opening[t.code] = String(next);
      parts.push(`${t.code} ${b.balance} → ${year + 1} opening ${next}`);
    });
    details[emp.id] = parts.join('; ');
    return { ...emp, leave: { ...emp.leave, opening }, updatedAt: nowIso() };
  });
  return { employees: patched, details };
};

// ---------------------------------------------------------------------------
// D.3 Attendance

export const emptyAttendance = (empId, ym, calendar) => ({
  id: uid('att'), employeeId: empId, month: ym, workingDays: workingDaysInMonth(ym, calendar), present: 0, absent: 0, unapproved: 0, unapprovedRun: 0,
  late: 0, earlyOut: 0, leave: 0, lwp: 0, overtimeHrs: '0', remarks: '', enteredBy: '', locked: false, updatedAt: nowIso(),
});

export const validateAttendance = (rec) => {
  const e = [];
  const wd = num(rec.workingDays);
  if (wd <= 0) e.push('Working days must be greater than zero.');
  if (num(rec.present) + num(rec.absent) + num(rec.leave) + num(rec.lwp) !== wd) e.push('Present + absent + leave + LWP must equal the working days.');
  if (num(rec.unapproved) > num(rec.absent)) e.push('Unapproved absence cannot exceed absent days.');
  if (num(rec.unapprovedRun) > num(rec.unapproved)) e.push('Longest unapproved run cannot exceed unapproved days.');
  if ([rec.present, rec.absent, rec.unapproved, rec.unapprovedRun, rec.late, rec.earlyOut, rec.leave, rec.lwp].some((v) => num(v) < 0)) e.push('Counts cannot be negative.');
  return e;
};

export const physicalAttendancePct = (rec) => (num(rec.workingDays) ? round2(num(rec.present) / num(rec.workingDays) * 100) : null);

// Months without a record are excluded from the summary.
export const attendanceSummary = (empId, months = [], attendance = []) => {
  const recs = months.map((m) => attendance.find((a) => a.employeeId === empId && a.month === m)).filter(Boolean);
  const sum = (k) => recs.reduce((s, r) => s + num(r[k]), 0);
  const workingDays = sum('workingDays');
  const present = sum('present');
  const leave = sum('leave');
  const n = recs.length;
  return {
    months: n, workingDays, present, leave, late: sum('late'), unapproved: sum('unapproved'), unapprovedRun: recs.reduce((m, r) => Math.max(m, num(r.unapprovedRun)), 0),
    // Approved leave counts as attended for the percentage (only absence hurts).
    pct: workingDays ? round2((present + leave) / workingDays * 100) : null,
    avgLates: n ? round2(sum('late') / n) : null,
  };
};

// System attendance KPI from the step tables.
export const attendanceKpi = (summary, settings) => {
  const cfg = settings?.appraisal?.attendance || {};
  if (!summary || summary.pct == null) return { attScore: null, punct: null, score: null };
  const attStep = (cfg.attendanceSteps || []).find((s) => summary.pct >= num(s.min));
  const attScore = attStep ? num(attStep.score) : 0;
  const lates = summary.avgLates == null ? 0 : summary.avgLates;
  const pStep = (cfg.punctualitySteps || []).find((s) => s.maxLates == null || lates <= num(s.maxLates));
  const punct = pStep ? num(pStep.score) : 0;
  const w = cfg.attendanceWeight == null ? 0.6 : num(cfg.attendanceWeight);
  const score = Math.max(0, round2(w * attScore + (1 - w) * punct - num(cfg.unapprovedPenalty) * num(summary.unapproved)));
  return { attScore, punct, score };
};

// Days worked in the last 12 attendance months (s.14 continuous service; warn only).
export const continuousServiceCheck = (emp, attendance = [], asOf, settings) => {
  const min = num(settings?.statutory?.continuousServiceDays) || 240;
  const months = lastMonths(12, asOf || localToday());
  const s = attendanceSummary(emp.id, months, attendance);
  return { months: s.months, daysWorked: s.present + s.leave, min, ok: s.months < 12 || s.present + s.leave >= min };
};

// ---------------------------------------------------------------------------
// D.4 KPI templates and scoring

export const validateTemplate = (t, settings) => {
  const e = [];
  if (!(t.code || '').trim()) e.push('Template code is required.');
  if (!(t.name || '').trim()) e.push('Template name is required.');
  const items = t.items || [];
  if (items.length < 1 || items.length > 10) e.push('A template needs between 1 and 10 KPIs.');
  const sum = items.reduce((s, i) => s + num(i.weight), 0);
  if (items.length && sum !== 100) e.push(`KPI weights must total 100 (currently ${sum}).`);
  items.forEach((i, idx) => {
    const tag = i.code || `KPI ${idx + 1}`;
    if (!(i.code || '').trim() || !(i.name || '').trim()) e.push(`${tag}: code and name are required.`);
    if (num(i.weight) < 5 || num(i.weight) > 40) e.push(`${tag}: weight must be between 5 and 40.`);
    if (!['D', 'E'].includes(i.method) && num(i.target) <= 0) e.push(`${tag}: target must be greater than zero.`);
    if (i.method === 'B' && !(num(i.thresholdPct) < 100 && 100 < num(i.stretchPct))) e.push(`${tag}: threshold % must be below 100 and stretch % above 100.`);
    if (i.method === 'E' && !(i.steps || []).length) e.push(`${tag}: step table needs at least one step.`);
  });
  if (items.filter((i) => i.source === 'attendance').length > 1) e.push('Only one KPI can be sourced from attendance.');
  if (num(t.weights?.kpi) + num(t.weights?.competency) !== 100) e.push('KPI and competency weights must total 100.');
  void settings;
  return e;
};

export const achievementPct = (item, actual) => {
  const a = num(actual);
  const target = num(item.target);
  if (item.direction === 'lower') {
    if (a === 0) return num(item.cap) || 120;
    return target / a * 100;
  }
  return target ? a / target * 100 : 0;
};

// Score 0–cap for one KPI line (methods A–E of KPI_METHODS).
export const scoreKpiLine = (item, actual, settings) => {
  void settings;
  if (actual === '' || actual == null) return { ach: null, score: null };
  const a = num(actual);
  const cap = num(item.cap) || 120;
  let ach = null;
  let raw = 0;
  switch (item.method) {
    case 'A': ach = achievementPct(item, a); raw = clamp(ach, 0, cap); break;
    case 'B': {
      ach = achievementPct(item, a);
      const thr = item.thresholdPct === '' || item.thresholdPct == null ? 80 : num(item.thresholdPct);
      const str = item.stretchPct === '' || item.stretchPct == null ? 120 : num(item.stretchPct);
      if (ach < thr) raw = 0;
      else if (ach < 100) raw = 50 + (ach - thr) / (100 - thr) * 50;
      else if (ach < str) raw = 100 + (ach - 100) / (str - 100) * 20;
      else raw = 120;
      raw = Math.min(raw, cap); // the curve never exceeds (or dips back to) the line cap
      break;
    }
    case 'C': raw = clamp(a, 0, 5) * 20; ach = raw; break;
    case 'D': raw = a >= 1 ? 100 : clamp(a * 100, 0, 100); ach = raw; break;
    case 'E': {
      const step = (item.steps || []).find((s) => (item.direction === 'lower' ? a <= num(s.bound) : a >= num(s.bound)));
      raw = step ? num(step.score) : 0;
      ach = num(item.target) ? round2(achievementPct(item, a)) : null;
      break;
    }
    default: raw = 0;
  }
  return { ach: ach == null ? null : round2(ach), score: round2(raw) };
};

export const bandFor = (final, bands = []) => (final == null ? null : bands.find((b) => final >= num(b.min)) || bands[bands.length - 1] || null);
const bandIndex = (code, bands) => bands.findIndex((b) => b.code === code);
// The lower of two grades (higher band index = lower grade).
export const capGrade = (code, cap, bands = []) => {
  if (!cap) return code;
  if (!code) return cap;
  return bandIndex(cap, bands) > bandIndex(code, bands) ? cap : code;
};
export const recommendationFor = (grade, bands = []) => {
  const b = bands.find((x) => x.code === grade);
  if (!b) return { recommendation: '', incrementPct: '', bonusMultiplier: 0, pip: false };
  return { recommendation: b.pip ? 'PIP' : num(b.incrementPct) > 0 ? 'Increment' : 'No Increment', incrementPct: String(b.incrementPct), bonusMultiplier: num(b.bonusMultiplier), pip: !!b.pip };
};
export const gradeFor = (final, bands = []) => bandFor(final, bands)?.code || '';

// Dated disciplinary records inside a period (never cleared by cycle close).
export const activeDisciplinary = (e, from, to) =>
  (e?.disciplinary || []).filter((d) => d.date && (!from || d.date >= from) && (!to || d.date <= to) && d.outcome !== 'Withdrawn');
const SEVERITY = ['Final Warning', 'Suspension', 'Written Warning'];
export const worstDisciplinary = (records = []) => SEVERITY.find((t) => records.some((r) => r.type === t)) || (records.length ? records[0].type : '');

// Grade caps from discipline, integrity, attendance and gate KPIs.
export const gateFlags = (apr, emp, settings) => {
  const g = settings?.appraisal?.gates || {};
  const out = [];
  const disc = activeDisciplinary(emp, apr.periodFrom, apr.periodTo);
  if (disc.some((d) => d.type === 'Final Warning' || d.type === 'Suspension')) out.push({ code: 'FINAL_WARNING', text: 'Final warning or suspension in the period', cap: g.finalWarningCap || 'C' });
  else if (disc.some((d) => d.type === 'Written Warning')) out.push({ code: 'WRITTEN_WARNING', text: 'Written warning in the period', cap: g.writtenWarningCap || 'B' });
  const integ = (apr.competencies || []).find((c) => c.code === 'INTEG');
  const integRating = integ ? num(integ.hrRating || integ.mgrRating) : 0;
  if (integ && (integ.hrRating || integ.mgrRating) && integRating <= num(g.integrityMaxRating)) out.push({ code: 'INTEGRITY', text: `Integrity rated ${integRating} (≤ ${g.integrityMaxRating})`, cap: g.integrityCap || 'C' });
  const att = apr.attendance || {};
  const pct = apr.hr?.attendanceOverridePct !== '' && apr.hr?.attendanceOverridePct != null ? num(apr.hr.attendanceOverridePct) : att.pct;
  if (pct != null && pct < num(g.attendanceBelowPct)) out.push({ code: 'ATTENDANCE', text: `Attendance ${pct}% below ${g.attendanceBelowPct}%`, cap: g.attendanceCap || 'B' });
  if (num(att.unapproved) > num(g.unapprovedAbsenceDays)) out.push({ code: 'UNAPPROVED', text: `${att.unapproved} unapproved absence days (> ${g.unapprovedAbsenceDays})`, cap: g.unapprovedCap || 'B' });
  (apr.kpis || []).filter((k) => k.isGate && k.score != null && k.score < num(g.gateKpiFailBelow)).forEach((k) => out.push({ code: `GATE_${k.code}`, text: `Gate KPI ${k.code} scored ${k.score} (< ${g.gateKpiFailBelow})`, cap: g.gateKpiCap || 'C' }));
  return out;
};

const strictestCap = (flags, bands) => flags.reduce((cap, f) => (!cap || bandIndex(f.cap, bands) > bandIndex(cap, bands) ? f.cap : cap), '');

// Returns a new appraisal with every line scored and the grade derived.
export const computeAppraisalScore = (apr, emp, settings) => {
  const bands = settings?.appraisal?.bands || [];
  const unapprovedFail = num(apr.attendance?.unapproved) > num(settings?.appraisal?.gates?.unapprovedAbsenceDays);
  const kpis = (apr.kpis || []).map((k) => {
    const actual = k.actualMgr !== '' && k.actualMgr != null ? k.actualMgr : '';
    let { ach, score } = scoreKpiLine(k, actual, settings);
    if (k.source === 'attendance' && unapprovedFail && score != null && (apr.attendanceMode || 'kpi') === 'kpi') score = 0;
    return { ...k, ach, score, weighted: score == null ? null : round2(score * num(k.weight) / 100) };
  });
  const anyKpi = kpis.some((k) => k.weighted != null);
  const kpi = anyKpi ? Math.min(100, round2(kpis.reduce((s, k) => s + (k.weighted || 0), 0))) : null;
  const comps = apr.competencies || [];
  const rated = comps.filter((c) => c.hrRating || c.mgrRating);
  const competency = rated.length ? round2(comps.reduce((s, c) => s + num(c.hrRating || c.mgrRating) * 20 * num(c.weight) / 100, 0)) : null;
  const wK = num(apr.weights?.kpi);
  const wC = num(apr.weights?.competency);
  const final = kpi == null && competency == null ? null : round2((kpi || 0) * wK / 100 + (competency || 0) * wC / 100);
  const scored = { ...apr, kpis };
  const flags = gateFlags(scored, emp, settings);
  const gradeOriginal = final == null ? '' : gradeFor(final, bands);
  const gradeFinal = apr.hr?.gradeOverride || (gradeOriginal ? capGrade(gradeOriginal, strictestCap(flags, bands), bands) : '');
  return { ...scored, gateFlags: flags, scores: { ...(apr.scores || {}), kpi, competency, final, gradeOriginal, gradeFinal, computedAt: nowIso() } };
};

// ---------------------------------------------------------------------------
// Appraisal lifecycle helpers

export const nextAppraisalCode = (list = []) => {
  const nums = list.map((a) => parseInt((a.code || '').split('-')[1], 10)).filter((n) => !Number.isNaN(n));
  return `APR-${(nums.length ? Math.max(...nums) : 1000) + 1}`;
};

export const nextCycleCode = (year, type) => `CYC-${year}${type === 'Half-yearly' ? '-MY' : ''}`;

export const emptyCycle = (by) => ({
  id: uid('cyc'), code: '', name: '', type: 'Annual', periodFrom: '', periodTo: '', status: 'Planned',
  due: { kpi: '', self: '', manager: '', hr: '', publish: '', ack: '' }, payout: { incrementEffective: '', bonusPayable: false },
  openedAt: '', closedAt: '', createdBy: by, createdAt: nowIso(), updatedAt: nowIso(),
});

export const emptyAppraisal = (by) => ({
  id: uid('apr'), code: '', employeeId: '', cycleId: '', type: 'Annual', templateId: '', templateCode: '', periodFrom: '', periodTo: '', managerId: '',
  status: S.KPI_SETTING, statusReason: '', proRata: false, weights: { kpi: 80, competency: 20 }, attendanceMode: 'kpi', kpis: [], competencies: [],
  self: { overallComment: '', achievements: '', submittedAt: '' },
  manager: { strengths: '', improvements: '', overallComment: '', recommendation: '', incrementPct: '', promotionTo: '', submittedAt: '', by: '' },
  hr: { gradeOverride: '', calibrationNote: '', recommendation: '', incrementPct: '', promotionTo: '', pip: false, pipEndDate: '', comment: '', attendanceOverridePct: '', attendanceOverrideReason: '', reviewedAt: '', by: '' },
  attendance: { pct: null, avgLates: null, unapproved: 0, months: 0, score: null, lockedAt: '' },
  gateFlags: [],
  scores: { kpi: null, competency: null, final: null, gradeOriginal: '', gradeFinal: '', computedAt: '' },
  probation: { decision: '', confirmationDate: '', note: '' },
  acknowledgement: { response: '', comment: '', at: '', by: '' },
  dispute: { comment: '', resolution: '', resolvedAt: '', resolvedBy: '' },
  due: { kpi: '', self: '', manager: '', hr: '', publish: '', ack: '' }, history: [], createdBy: by, createdAt: nowIso(), updatedAt: nowIso(),
});

export const migrateAppraisal = (raw) => {
  const base = emptyAppraisal(raw.createdBy || '');
  const deep = (k) => ({ ...base[k], ...(raw[k] || {}) });
  return {
    ...base, ...raw,
    weights: deep('weights'), self: deep('self'), manager: deep('manager'), hr: deep('hr'), attendance: deep('attendance'), scores: deep('scores'),
    probation: deep('probation'), acknowledgement: deep('acknowledgement'), dispute: deep('dispute'), due: deep('due'),
    kpis: Array.isArray(raw.kpis) ? raw.kpis : [], competencies: Array.isArray(raw.competencies) ? raw.competencies : [],
    gateFlags: Array.isArray(raw.gateFlags) ? raw.gateFlags : [], history: Array.isArray(raw.history) ? raw.history : [],
  };
};

// Competency set by grade (managerial grades use the manager set) unless the template fixes one.
export const competencySetFor = (emp, template, settings) =>
  template?.competencySet || ((settings?.appraisal?.managerialGrades || []).includes(emp?.employment?.grade) ? 'manager' : 'staff');

// Template for an employee: designation match, then department match, filtered by cycle type and active.
export const templateFor = (emp, templates = [], cycleType = 'Annual') => {
  const des = emp?.employment?.designation;
  const dept = designationOf(des)?.department || emp?.employment?.department;
  const usable = templates.filter((t) => t.active !== false && (!t.cycleTypes?.length || t.cycleTypes.includes(cycleType)));
  return usable.find((t) => (t.designationCodes || []).includes(des))
    || usable.find((t) => (t.departmentCodes || []).includes(dept))
    || (cycleType !== 'Probation' ? usable.find((t) => t.code === designationOf(des)?.templateCode) : undefined)
    || null;
};

export const probationEndDate = (e) => (e?.employment?.probation?.extended ? e.employment.probation.extendedTo : e?.employment?.probation?.endDate) || '';

// A fresh appraisal from a template for an employee in a cycle (or a Probation review).
export const buildAppraisal = (emp, cycle, type, template, settings, by, code, asOf) => {
  const base = emptyAppraisal(by);
  const probation = type === 'Probation';
  const periodFrom = probation ? emp.employment?.joinDate || asOf : cycle?.periodFrom || '';
  const periodTo = probation ? probationEndDate(emp) || addMonths(periodFrom, num(emp.employment?.probation?.months) || 6) : cycle?.periodTo || '';
  const due = cycle?.due ? { ...base.due, ...cycle.due } : { kpi: addDays(periodFrom, 14), self: addDays(periodTo, -20), manager: addDays(periodTo, -15), hr: addDays(periodTo, -7), publish: addDays(periodTo, -3), ack: periodTo };
  const set = competencySetFor(emp, template, settings);
  return {
    ...base,
    code, employeeId: emp.id, cycleId: cycle?.id || '', type, templateId: template?.id || '', templateCode: template?.code || '', periodFrom, periodTo,
    managerId: emp.employment?.reportingManagerId || '',
    weights: { ...(template?.weights || base.weights) },
    attendanceMode: template?.attendanceMode || 'kpi',
    kpis: (template?.items || []).map((i) => ({ ...i, steps: (i.steps || []).map((s) => ({ ...s })), actualSelf: '', selfComment: '', actualMgr: '', mgrComment: '', evidence: '', ach: null, score: null, weighted: null, custom: false })),
    competencies: competencySet(set).map((c) => ({ ...c, selfRating: '', mgrRating: '', mgrComment: '', hrRating: '', hrComment: '' })),
    due,
    history: [{ status: S.KPI_SETTING, at: asOf ? `${asOf}T09:00:00.000Z` : nowIso(), by, note: probation ? 'Probation review created' : `Created for ${cycle?.name || ''}` }],
    createdAt: nowIso(), updatedAt: nowIso(),
  };
};

export const generateAppraisals = (cycle, employees = [], templates = [], settings, existing = [], by, asOf) => {
  const appraisals = [];
  const skipped = [];
  const rawMin = settings?.appraisal?.minServiceDays;
  const minDays = rawMin === '' || rawMin == null ? 90 : Math.max(0, num(rawMin));
  const cutoff = addDays(cycle.periodTo, -minDays);
  let code = nextAppraisalCode(existing);
  const bump = (c) => `APR-${parseInt(c.split('-')[1], 10) + 1}`;
  employees.forEach((emp) => {
    if (emp.status === EMPLOYEE_STATUS.DRAFT) { skipped.push({ employee: emp, reason: 'draft' }); return; }
    if (emp.status === EMPLOYEE_STATUS.SEPARATED) { skipped.push({ employee: emp, reason: 'separated' }); return; }
    if (![EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.NOTICE].includes(emp.status)) { skipped.push({ employee: emp, reason: emp.status.toLowerCase() }); return; }
    if (!emp.employment?.joinDate || emp.employment.joinDate > cutoff) { skipped.push({ employee: emp, reason: `joined less than ${minDays} days before period end` }); return; }
    const template = templateFor(emp, templates, cycle.type);
    if (!template) { skipped.push({ employee: emp, reason: 'no KPI template for the designation' }); return; }
    if (existing.some((a) => a.employeeId === emp.id && a.cycleId === cycle.id)) { skipped.push({ employee: emp, reason: 'appraisal already exists for this cycle' }); return; }
    appraisals.push(buildAppraisal(emp, cycle, cycle.type, template, settings, by, code, asOf));
    code = bump(code);
  });
  return { appraisals, skipped };
};

// Months of the appraisal period that fall inside [periodFrom, periodTo].
export const periodMonths = (periodFrom, periodTo) => {
  const out = [];
  if (!periodFrom || !periodTo) return out;
  for (let m = monthKey(periodFrom); m <= monthKey(periodTo); m = monthKey(addDays(`${m}-${String(daysInMonth(m)).padStart(2, '0')}`, 1))) out.push(m);
  return out;
};

// Snapshot attendance into the appraisal and fill attendance-sourced KPI actuals.
export const applySystemActuals = (apr, attendance = [], settings, force = false) => {
  if (apr.attendance?.lockedAt && !force) return apr;
  const summary = attendanceSummary(apr.employeeId, periodMonths(apr.periodFrom, apr.periodTo), attendance);
  const kpiScore = attendanceKpi(summary, settings);
  const snap = { pct: summary.pct, avgLates: summary.avgLates, unapproved: summary.unapproved, months: summary.months, score: kpiScore.score, lockedAt: nowIso() };
  const val = kpiScore.score == null ? '' : String(kpiScore.score);
  return { ...apr, attendance: snap, kpis: (apr.kpis || []).map((k) => (k.source === 'attendance' ? { ...k, actualSelf: val, actualMgr: val } : k)) };
};

const STAGE_INDEX = (status) => APPRAISAL_FLOW.indexOf(status);
const beforePublished = (status) => [S.KPI_SETTING, S.AGREED, S.SELF, S.MANAGER, S.HR, S.RETURNED].includes(status);

export const appraisalOwner = (apr, employees = []) => {
  const find = (id) => employees.find((e) => e.id === id);
  if ([S.KPI_SETTING, S.MANAGER, S.RETURNED].includes(apr.status)) { const m = find(apr.managerId); return { stage: 'Manager', employeeId: apr.managerId, name: m?.name || 'Manager' }; }
  if ([S.AGREED, S.SELF, S.PUBLISHED].includes(apr.status)) { const e = find(apr.employeeId); return { stage: 'Employee', employeeId: apr.employeeId, name: e?.name || 'Employee' }; }
  if ([S.HR, S.DISPUTED].includes(apr.status)) return { stage: 'HR', employeeId: '', name: 'HR' };
  return null;
};

export const appraisalDueDate = (apr) => {
  const d = apr.due || {};
  switch (apr.status) {
    case S.KPI_SETTING: case S.AGREED: return d.kpi || '';
    case S.SELF: return d.self || '';
    case S.MANAGER: case S.RETURNED: return d.manager || '';
    case S.HR: return d.hr || d.publish || '';
    case S.PUBLISHED: case S.DISPUTED: return d.ack || d.publish || '';
    default: return '';
  }
};
export const appraisalOverdue = (apr, asOf) => {
  const due = appraisalDueDate(apr);
  return due && asOf > due ? daysBetween(due, asOf) : 0;
};

export const appraisalMode = (apr, user, employees = []) => {
  const role = user?.role;
  const isSelf = user?.employeeId === apr.employeeId;
  const isManager = user?.employeeId === apr.managerId;
  const HH = [HR_ROLES.HR_HEAD, HR_ROLES.ADMIN].includes(role);
  const senior = [HR_ROLES.HR_HEAD, HR_ROLES.MANAGEMENT, HR_ROLES.ADMIN].includes(role);
  let mode = 'read';
  if (apr.status === S.KPI_SETTING && (isManager || (HH && !isSelf))) mode = 'kpi';
  else if (apr.status === S.AGREED && isSelf) mode = 'agree';
  else if (apr.status === S.SELF && isSelf) mode = 'self';
  else if ([S.MANAGER, S.RETURNED].includes(apr.status) && (isManager || (senior && !isSelf))) mode = 'manager';
  else if (apr.status === S.HR && !isSelf && canHr(role, 'hrReview')) mode = 'hr';
  else if (apr.status === S.PUBLISHED && isSelf) mode = 'ack';
  else if (apr.status === S.DISPUTED && HH && !isSelf) mode = 'resolve';
  let onBehalf = false;
  // Nobody calibrates, rates or resolves their own appraisal (separation of duties).
  if (mode === 'read' && !isSelf && HR_STAFF_ROLES.includes(role)) {
    const due = appraisalDueDate(apr);
    const passed = due && (user?.asOf || localToday()) > due;
    // KPI setting on behalf once that deadline has passed (L.21: Farhana on apr_hasan_my).
    if (passed && apr.status === S.KPI_SETTING) { mode = 'kpi'; onBehalf = true; }
    else if (passed && apr.status === S.AGREED) { mode = 'agree'; onBehalf = true; }
    else if (passed && apr.status === S.SELF) { mode = 'self'; onBehalf = true; }
    else if (passed && [S.MANAGER, S.RETURNED].includes(apr.status)) { mode = 'manager'; onBehalf = true; }
  }
  void employees;
  return { mode, onBehalf, isSelf, isManager };
};

export const appraisalVisibility = (apr, user) => {
  const isSelf = user?.employeeId === apr.employeeId;
  const hr = HR_STAFF_ROLES.includes(user?.role);
  const ownPending = isSelf && beforePublished(apr.status); // A.2 #24, also for HR staff appraisees
  return {
    managerFields: !ownPending,
    hrFields: hr && !ownPending,
    selfFields: isSelf || STAGE_INDEX(apr.status) >= STAGE_INDEX(S.MANAGER) || apr.status === S.RETURNED || hr,
  };
};

export const myAppraisalQueue = (appraisals = [], employees = [], user, asOf) =>
  appraisals
    .filter((a) => appraisalMode(a, { ...user, asOf }, employees).mode !== 'read')
    .map((a) => ({ appraisal: a, employee: employees.find((e) => e.id === a.employeeId), days: appraisalOverdue(a, asOf) }))
    .sort((x, y) => y.days - x.days);

// Field-level diff for the audit trail.
export const appraisalDiff = (prev, next) => {
  const out = [];
  if (!prev || !next) return out;
  (next.kpis || []).forEach((k) => {
    const p = (prev.kpis || []).find((x) => x.code === k.code);
    if (!p) { out.push(`${k.code} added`); return; }
    if (String(p.actualMgr ?? '') !== String(k.actualMgr ?? '')) out.push(`${k.code} actual ${p.actualMgr || '—'} → ${k.actualMgr || '—'}`);
    if (p.score !== k.score && k.score != null) out.push(`${k.code} score ${p.score ?? '—'} → ${k.score}`);
  });
  (next.competencies || []).forEach((c) => {
    const p = (prev.competencies || []).find((x) => x.code === c.code);
    if (!p) return;
    if (String(p.mgrRating ?? '') !== String(c.mgrRating ?? '')) out.push(`${c.name} mgr ${p.mgrRating || '—'} → ${c.mgrRating || '—'}`);
    if (String(p.hrRating ?? '') !== String(c.hrRating ?? '')) out.push(`${c.name} hr ${p.hrRating || '—'} → ${c.hrRating || '—'}`);
  });
  if ((prev.hr?.gradeOverride || '') !== (next.hr?.gradeOverride || '')) out.push(`grade override ${prev.hr?.gradeOverride || '—'} → ${next.hr?.gradeOverride || '—'}`);
  if ((prev.scores?.gradeFinal || '') !== (next.scores?.gradeFinal || '')) out.push(`grade ${prev.scores?.gradeFinal || '—'} → ${next.scores?.gradeFinal || '—'}`);
  if ((prev.manager?.recommendation || '') !== (next.manager?.recommendation || '')) out.push(`recommendation ${prev.manager?.recommendation || '—'} → ${next.manager?.recommendation || '—'}`);
  if (String(prev.manager?.incrementPct ?? '') !== String(next.manager?.incrementPct ?? '')) out.push(`increment ${prev.manager?.incrementPct || '—'} → ${next.manager?.incrementPct || '—'}%`);
  if ((prev.hr?.recommendation || '') !== (next.hr?.recommendation || '')) out.push(`HR recommendation ${prev.hr?.recommendation || '—'} → ${next.hr?.recommendation || '—'}`);
  return out;
};

export const validateAppraisalStage = (apr, stage, settings) => {
  const e = [];
  const a = settings?.appraisal || {};
  const kpis = apr.kpis || [];
  const manual = kpis.filter((k) => k.source !== 'attendance');
  const minChars = num(a.ratingCommentMinChars) || 50;
  if (stage === 'kpi') {
    const sum = kpis.reduce((s, k) => s + num(k.weight), 0);
    if (sum !== 100) e.push(`KPI weights must total 100 (currently ${sum}).`);
    kpis.forEach((k) => { if (!['D', 'E'].includes(k.method) && num(k.target) <= 0) e.push(`${k.code}: target must be set.`); });
    if (kpis.filter((k) => k.custom).length > num(a.maxCustomKpis)) e.push(`At most ${a.maxCustomKpis} custom KPIs are allowed.`);
  }
  if (stage === 'self') {
    manual.forEach((k) => { if (k.actualSelf === '' || k.actualSelf == null) e.push(`${k.code}: enter your actual.`); });
    (apr.competencies || []).forEach((c) => { if (!c.selfRating) e.push(`${c.name}: self rating is required.`); });
  }
  if (stage === 'manager') {
    manual.forEach((k) => { if (k.actualMgr === '' || k.actualMgr == null) e.push(`${k.code}: actual is required.`); });
    (apr.competencies || []).forEach((c) => {
      if (!c.mgrRating) e.push(`${c.name}: manager rating is required.`);
      else if ([1, 5].includes(num(c.mgrRating)) && (c.mgrComment || '').trim().length < minChars) e.push(`${c.name}: a rating of ${c.mgrRating} needs a comment of at least ${minChars} characters.`);
    });
    if (!apr.manager?.recommendation && apr.type !== 'Probation') e.push('Select a recommendation.');
    if (apr.type === 'Probation' && !apr.probation?.decision) e.push('Record the probation decision recommendation.');
  }
  if (stage === 'hr') {
    if (apr.hr?.gradeOverride && !(apr.hr.calibrationNote || '').trim()) e.push('A calibration note is required when overriding the grade.');
    (apr.competencies || []).forEach((c) => {
      if (c.hrRating === '' || c.hrRating == null) return;
      if (Math.abs(num(c.hrRating) - num(c.mgrRating)) > num(a.hrAdjustMax)) e.push(`${c.name}: HR rating may differ from the manager rating by at most ${a.hrAdjustMax}.`);
      if (num(c.hrRating) !== num(c.mgrRating) && !(c.hrComment || '').trim()) e.push(`${c.name}: comment required for the HR adjustment.`);
    });
  }
  if (stage === 'publish') {
    if (apr.scores?.final == null) e.push('Scores have not been computed.');
    if (apr.type === 'Probation' && !apr.probation?.decision) e.push('Probation decision is required before publishing.');
  }
  return e;
};

// Probation decision support (ProbationDecisionModal).
export const probationOutcome = (emp, apr, summary, settings) => {
  const p = settings?.probation || {};
  const score = apr?.scores?.final;
  const published = apr && [S.PUBLISHED, S.ACKNOWLEDGED, S.CLOSED].includes(apr.status);
  const integ = (apr?.competencies || []).find((c) => c.code === 'INTEG');
  const integRated = integ?.hrRating || integ?.mgrRating; // unrated → null (pending), never 0
  const integRating = integRated ? num(integRated) : null;
  const pr1 = (apr?.kpis || []).find((k) => k.code === 'PR-1');
  const disc = activeDisciplinary(emp, emp?.employment?.joinDate, null);
  const checks = [
    { key: 'score', label: `Review score ≥ ${p.confirmScoreMin}`, ok: published && score != null && score >= num(p.confirmScoreMin), value: published ? score : null, pending: !published, hint: published ? '' : 'No published probation review' },
    { key: 'attendance', label: `Attendance ≥ ${p.attendanceMin}%`, ok: summary?.pct != null && summary.pct >= num(p.attendanceMin), value: summary?.pct, pending: summary?.pct == null },
    { key: 'unapproved', label: `Unapproved absence ≤ ${p.maxUnapproved}`, ok: num(summary?.unapproved) <= num(p.maxUnapproved), value: num(summary?.unapproved) },
    { key: 'lates', label: `Average lates ≤ ${p.maxAvgLates}`, ok: summary?.avgLates == null || summary.avgLates <= num(p.maxAvgLates), value: summary?.avgLates },
    { key: 'disciplinary', label: 'No disciplinary record', ok: disc.length === 0, value: disc.length },
    { key: 'integrity', label: 'Integrity rated ≥ 3', ok: integRating == null || integRating >= 3, value: integRating, pending: integRating == null },
    { key: 'induction', label: 'Induction completed (PR-1)', ok: !pr1 || num(pr1.actualMgr || pr1.actualSelf) >= 1, value: pr1 ? pr1.actualMgr || pr1.actualSelf : null },
  ];
  const allOk = checks.every((c) => c.ok);
  const extended = !!emp?.employment?.probation?.extended;
  let suggestion = 'Not confirm';
  if (allOk) suggestion = 'Confirm';
  else if (!extended && (score == null || score >= num(p.extendScoreMin)) && (summary?.pct == null || summary.pct >= num(p.extendAttendanceMin))) suggestion = 'Extend';
  return { checks, suggestion, extended, canExtend: !extended, score, published };
};

export const gradeDistribution = (appraisals = [], bands = [], key = 'gradeFinal') => {
  const graded = appraisals.filter((a) => a.scores?.[key]);
  return bands.map((b) => {
    const count = graded.filter((a) => a.scores[key] === b.code).length;
    return { code: b.code, name: b.name, count, pct: graded.length ? Math.round(count / graded.length * 100) : 0, guidedPct: num(b.guidedPct), tone: b.tone };
  });
};

export const competencyAnchors = (code) => COMPETENCIES.find((c) => c.code === code)?.anchors || [];

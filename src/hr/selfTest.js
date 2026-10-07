// Regression fixtures for the HR formulas (spec section I). Absolute dates,
// independent of the seed; run in DEV from main.jsx and from HR Settings.
import { DEFAULT_HR_SETTINGS, DEFAULT_KPI_TEMPLATES, DEFAULT_LEAVE_TYPES } from './config.js';
import { addWorkingDays, attendanceKpi, buildAppraisal, completedYears, computeAppraisalScore, computeSettlement, countLeaveDays, emptyEmployee, emptySettlement, estimateTds, migrateEmployee, requiresManagementApproval, resignationTier, serviceLength, statementLine } from './helpers.js';

const S = DEFAULT_HR_SETTINGS;
const CLOCK = '2026-10-06';
const sal = (basic, houseRent, medical, conveyance, otherAllowances, dearness = 0) =>
  ({ basic: String(basic), houseRent: String(houseRent), medical: String(medical), conveyance: String(conveyance), dearness: String(dearness), adhoc: '', otherAllowances: String(otherAllowances), effectiveFrom: '2026-01-01', payMode: 'Bank Transfer', history: [] });
const pf = (own, employer, interest, advance = 0, rate = '8') => ({ member: true, joinDate: '', employeeRatePct: rate, employerRatePct: rate, ownBalance: String(own), employerBalance: String(employer), interestAccrued: String(interest), advanceOutstanding: String(advance) });
const emp = (o) => migrateEmployee({ ...emptyEmployee('Self-test'), ...o });
const sep = (e, o) => ({ ...emptySettlement(e, 'Self-test', S, CLOCK), ...o, inputs: { ...emptySettlement(e, 'Self-test', S, CLOCK).inputs, ...(o.inputs || {}) } });
const withSettings = (patch) => {
  const out = structuredClone(S);
  Object.keys(patch).forEach((k) => { out[k] = { ...out[k], ...patch[k] }; });
  return out;
};

// --- Employees and separations -------------------------------------------

const jahangir = emp({
  id: 'fx_jahangir', code: 'EMP-1009', name: 'Jahangir Alam', status: 'On Notice', dob: '1990-05-12', gender: 'Male',
  employment: { department: 'SALES', designation: 'SO', grade: 'G6', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'commercial', joinDate: '2019-02-20', confirmationDate: '2019-08-20', reportingManagerId: 'x', workLocation: 'Chattogram Office', probation: { required: true, months: '6', endDate: '2019-08-20', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(40000, 15000, 2000, 2000, 1000), pf: pf(300000, 300000, 120000, 40000, '10'),
  loans: [{ id: 'fx_loan', type: 'Salary Advance', principal: '20000', outstanding: '10000', monthlyInstalment: '5000', note: '' }],
  tax: { category: 'general', ytdIncome: '180000', ytdTaxPaid: '0', bonusPaidThisYear: false },
  bank: { bankName: 'BRAC Bank', branch: 'Agrabad', accountType: 'Savings', accountName: 'Jahangir Alam', accountNo: '1234567890', routingNo: '', verified: true, verifiedBy: '', verifiedAt: '' },
});
const stlJahangir = sep(jahangir, {
  id: 'fx_stl_jahangir', code: 'FS-1001', type: 'Resignation', reason: 'Better opportunity', noticeDate: '2026-09-05', lastWorkingDay: '2026-10-20', noticeRequiredDays: 60, noticeWaivedDays: '0', status: 'Clearance in Progress',
  inputs: { elBalanceDays: '18', pfOwn: '300000', pfEmployer: '300000', pfInterest: '120000', pfAdvance: '40000', loanRecovery: '10000', ytdIncome: '180000', ytdTaxPaid: '0' },
});

const belal = emp({
  id: 'fx_belal', code: 'EMP-1010', name: 'Belal Ahmed', status: 'Separated', dob: '1995-02-01',
  employment: { department: 'PROD', designation: 'MO', grade: 'G8', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'factory', joinDate: '2021-01-11', confirmationDate: '2021-04-11', reportingManagerId: 'x', workLocation: 'Narayanganj Factory', probation: { required: true, months: '3', endDate: '2021-04-11', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(15000, 7500, 1500, 1500, 1000), pf: pf(60000, 60000, 9000), tax: { category: 'general', ytdIncome: '0', ytdTaxPaid: '0', bonusPaidThisYear: false },
});
const stlBelal = sep(belal, {
  id: 'fx_stl_belal', code: 'FS-1003', type: 'Termination', reason: 'Position abolished after line closure', noticeDate: '2026-07-31', lastWorkingDay: '2026-07-31', noticeRequiredDays: 120, payInLieu: true, payInLieuDays: '', status: 'Paid',
  inputs: { elBalanceDays: '11', pfOwn: '60000', pfEmployer: '60000', pfInterest: '9000', pfAdvance: '0', loanRecovery: '0', ytdIncome: '0', ytdTaxPaid: '0' },
});

const moushumi = emp({
  id: 'fx_moushumi', code: 'EMP-1011', name: 'Moushumi Das', status: 'Separated', gender: 'Female', dob: '1996-11-03',
  employment: { department: 'FIN', designation: 'AE', grade: 'G6', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'commercial', joinDate: '2022-03-01', confirmationDate: '2022-09-01', reportingManagerId: 'x', workLocation: 'Dhaka HQ', probation: { required: true, months: '6', endDate: '2022-09-01', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(30000, 15000, 2500, 3000, 2500), pf: pf(110000, 110000, 18000), tax: { category: 'general', ytdIncome: '53000', ytdTaxPaid: '0', bonusPaidThisYear: false },
});
const stlMoushumi = sep(moushumi, {
  id: 'fx_stl_moushumi', code: 'FS-1002', type: 'Resignation', reason: 'Relocating abroad', noticeDate: '2026-07-02', lastWorkingDay: '2026-08-31', noticeRequiredDays: 60, status: 'Pending Finance Approval',
  inputs: { elBalanceDays: '9', pfOwn: '110000', pfEmployer: '110000', pfInterest: '18000', pfAdvance: '0', loanRecovery: '0', ytdIncome: '53000', ytdTaxPaid: '0' },
});

const retiree = emp({
  id: 'fx_retiree', code: 'EMP-1901', name: 'Abdul Mannan', status: 'On Notice', gender: 'Male', dob: '1966-08-30',
  employment: { department: 'PROD', designation: 'MO', grade: 'G8', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'factory', joinDate: '2008-04-14', confirmationDate: '2008-07-14', reportingManagerId: 'x', workLocation: 'Narayanganj Factory', probation: { required: true, months: '3', endDate: '2008-07-14', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(14000, 7000, 0, 0, 0), pf: pf(400000, 400000, 95000), tax: { category: 'female_senior', ytdIncome: '21000', ytdTaxPaid: '0', bonusPaidThisYear: false },
});
const stlRetiree = sep(retiree, {
  id: 'fx_stl_retiree', code: 'FS-1901', type: 'Retirement', reason: '', noticeDate: '2026-08-30', lastWorkingDay: '2026-08-30', noticeRequiredDays: 0, status: 'Initiated',
  inputs: { elBalanceDays: '32', pfOwn: '400000', pfEmployer: '400000', pfInterest: '95000', pfAdvance: '0', assetRecovery: '500', assetShowCauseIssued: true, ytdIncome: '21000', ytdTaxPaid: '0' },
});

const deceased = emp({
  id: 'fx_deceased', code: 'EMP-1902', name: 'Rafiq Mia', status: 'On Notice', gender: 'Male', dob: '1980-01-15',
  nominee: { name: 'Salma Begum', relation: 'Spouse', nid: '1234567890', mobile: '01711111111', sharePct: '100' },
  employment: { department: 'PROD', designation: 'MO', grade: 'G8', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'factory', joinDate: '2016-05-10', confirmationDate: '2016-08-10', reportingManagerId: 'x', workLocation: 'Narayanganj Factory', probation: { required: true, months: '3', endDate: '2016-08-10', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(20000, 10000, 0, 0, 0), pf: pf(150000, 150000, 30000), tax: { category: 'general', ytdIncome: '0', ytdTaxPaid: '0', bonusPaidThisYear: false },
});
const stlDeath = sep(deceased, {
  id: 'fx_stl_death', code: 'FS-1902', type: 'Death', reason: 'Died in a road accident while on duty', deathAtWork: true, noticeDate: '2026-09-15', lastWorkingDay: '2026-09-15', noticeRequiredDays: 0, status: 'Initiated',
  inputs: { elBalanceDays: '20', pfOwn: '150000', pfEmployer: '150000', pfInterest: '30000', pfAdvance: '0', groupInsurance: '200000', ytdIncome: '0', ytdTaxPaid: '0' },
});

// --- Appraisals ------------------------------------------------------------

const rakib = emp({
  id: 'fx_rakib', code: 'EMP-1014', name: 'Rakib Hasan', status: 'Confirmed',
  employment: { department: 'SALES', designation: 'SO', grade: 'G6', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'commercial', joinDate: '2023-04-03', confirmationDate: '2023-10-03', reportingManagerId: 'x', workLocation: 'Dhaka HQ', probation: { required: true, months: '6', endDate: '2023-10-03', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(25000, 12500, 2500, 3000, 2000),
});
const cycle2025 = { id: 'fx_cyc_2025', code: 'CYC-2025', name: 'Annual Appraisal 2025', type: 'Annual', periodFrom: '2025-01-01', periodTo: '2025-12-31', status: 'Closed', due: { kpi: '2025-01-31', self: '2026-01-10', manager: '2026-01-20', hr: '2026-02-07', publish: '2026-02-10', ack: '2026-02-17' } };
const tplOf = (code) => DEFAULT_KPI_TEMPLATES.find((t) => t.code === code);

const fill = (apr, actuals, ratings) => ({
  ...apr,
  kpis: apr.kpis.map((k) => (actuals[k.code] == null ? k : { ...k, actualSelf: String(actuals[k.code]), actualMgr: String(actuals[k.code]) })),
  competencies: apr.competencies.map((c, i) => ({ ...c, selfRating: String(ratings[i]), mgrRating: String(ratings[i]) })),
});

const aprRakib = fill(buildAppraisal(rakib, cycle2025, 'Annual', tplOf('TPL-SO'), S, 'Self-test', 'APR-9001', CLOCK), { 'SO-1': 92, 'SO-2': 95, 'SO-3': 96.5, 'SO-4': 33, 'SO-5': 470, 'SO-6': 88 }, [4, 4, 3, 4, 4, 3]);

const shimul = emp({
  id: 'fx_shimul', code: 'EMP-1007', name: 'Shimul Barua', status: 'Confirmed',
  employment: { department: 'PROD', designation: 'PS', grade: 'G7', employmentType: 'Permanent', workerCategory: 'Non-worker', wageBasis: 'Monthly', establishmentType: 'factory', joinDate: '2018-11-12', confirmationDate: '2019-02-12', reportingManagerId: 'x', workLocation: 'Narayanganj Factory', probation: { required: true, months: '3', endDate: '2019-02-12', extended: false, extendedTo: '', decision: 'Confirm', decidedAt: '', decidedBy: '' } },
  salary: sal(30000, 15000, 2500, 2500, 2000),
});
const aprShimulBase = fill(buildAppraisal(shimul, cycle2025, 'Annual', tplOf('TPL-PS'), S, 'Self-test', 'APR-9002', CLOCK), { 'PS-1': 97.2, 'PS-2': 1.2, 'PS-3': 71, 'PS-4': 0, 'PS-5': 2.3, 'PS-6': 100 }, [4, 4, 3, 4, 3, 5]);
const aprShimul = { ...aprShimulBase, attendance: { pct: 97.5, avgLates: 1.3, unapproved: 0, months: 12, score: 100, lockedAt: '2026-01-05T09:00:00.000Z' } };
const shimulWarned = { ...shimul, disciplinary: [{ id: 'fx_dis', type: 'Written Warning', date: '2025-06-10', reference: 'HR/WL/2025-06', showCauseDate: '2025-06-02', replyDueDate: '2025-06-06', enquiryDate: '', outcome: 'Warning issued', misconductClause: '', note: '', documentId: '', by: 'Self-test', at: '' }] };

export const FIXTURES = {
  FX_RESIGNATION: { employee: jahangir, settlement: stlJahangir },
  FX_MOUSHUMI: { employee: moushumi, settlement: stlMoushumi },
  FX_TERMINATION: { employee: belal, settlement: stlBelal },
  FX_RETIREMENT: { employee: retiree, settlement: stlRetiree },
  FX_DEATH: { employee: deceased, settlement: stlDeath },
  FX_APPRAISAL_SO: { employee: rakib, appraisal: aprRakib, cycle: cycle2025 },
  FX_APPRAISAL_PS: { employee: shimul, employeeWarned: shimulWarned, appraisal: aprShimul, cycle: cycle2025 },
};

// --- Runner ---------------------------------------------------------------

export const runHrSelfTest = () => {
  const results = [];
  const check = (name, expected, actual) => {
    const ok = typeof expected === 'number' && typeof actual === 'number' ? Math.abs(expected - actual) < 0.005 : JSON.stringify(expected) === JSON.stringify(actual);
    results.push({ name, ok, expected, actual });
  };
  const ctx = { asOf: CLOCK };
  const line = (st, key) => statementLine(st, key);

  // I.1 Resignation (Jahangir)
  const r = computeSettlement(jahangir, stlJahangir, S, ctx);
  check('I.1 service text', '7y 8m 0d', r.meta.serviceText);
  check('I.1 completed years (six_months)', 8, r.meta.completedYears);
  check('I.1 exact years', 7.67, r.meta.exactYears);
  check('I.1 daily wage W', 1333.33, r.meta.W);
  check('I.1 notice served / shortfall', [45, 15], [r.meta.noticeServed, r.meta.shortfallDays]);
  check('I.1 law version', 'bla2026', r.lawVersion);
  check('I.1 deadline (30 working days)', '2026-12-01', r.meta.deadline);
  check('I.1 salary 1–20 Oct', 38709.68, line(r, 'salary'));
  check('I.1 leave encashment 18 × 2,000', 36000, line(r, 'leaveEncash'));
  check('I.1 resignation benefit tier (b)', 160000, line(r, 'compensation'));
  check('I.1 tier letter', 'b', r.meta.tier);
  check('I.1 earnings', 234709.68, r.totals.earnings);
  check('I.1 notice shortfall 15 × 1,333.33', 20000, line(r, 'noticeShortfall'));
  check('I.1 tax estimate nil', 0, line(r, 'tax'));
  check('I.1 employee PF on final salary', 2580.65, line(r, 'pfEmployee'));
  check('I.1 loan recovery', 10000, line(r, 'loanRecovery'));
  check('I.1 deductions', 32580.65, r.totals.deductions);
  check('I.1 net payable', 202129.03, r.totals.netPayable);
  check('I.1 PF own', 302580.65, line(r, 'pfOwn'));
  check('I.1 PF employer (100% vested)', 302580.65, line(r, 'pfEmployer'));
  check('I.1 PF interest', 120000, line(r, 'pfInterest'));
  check('I.1 PF advance', -40000, line(r, 'pfAdvance'));
  check('I.1 PF net', 685161.3, r.totals.pfNet);
  check('I.1 total to employee', 887290.33, r.totals.totalToEmployee);
  check('I.1 management approval not required', false, requiresManagementApproval(stlJahangir, jahangir, r.totals, S));
  // Alternates
  check('I.1 alt rounding strict → compensation', 140000, line(computeSettlement(jahangir, stlJahangir, withSettings({ statutory: { partialYearRounding: 'strict' } }), ctx), 'compensation'));
  check('I.1 alt encash base basic', 24000, line(computeSettlement(jahangir, stlJahangir, withSettings({ leave: { encashRateBase: 'basic' } }), ctx), 'leaveEncash'));
  check('I.1 alt shortfall base gross', 30000, line(computeSettlement(jahangir, stlJahangir, withSettings({ noticeShortfall: { base: 'gross' } }), ctx), 'noticeShortfall'));
  const grat = computeSettlement(jahangir, stlJahangir, withSettings({ gratuity: { schemeEnabled: true } }), ctx);
  check('I.1 alt gratuity scheme → gratuity line', [320000, 0], [line(grat, 'gratuity'), line(grat, 'compensation')]);
  check('I.1 alt pre_2025 law → 14 days', 149333.33, line(computeSettlement(jahangir, stlJahangir, withSettings({ statutory: { lawVersion: 'pre_2025' } }), ctx), 'compensation'));
  check('I.1 alt weekly off Fri only → deadline', '2026-11-24', computeSettlement(jahangir, stlJahangir, withSettings({ calendar: { weeklyOffs: ['Fri'] } }), ctx).meta.deadline);
  const incl = computeSettlement(jahangir, stlJahangir, withSettings({ statutory: { countLastDayInclusive: true } }), ctx);
  check('I.1 alt inclusive LWD → service', ['7y 8m 1d', 8], [incl.meta.serviceText, incl.meta.completedYears]);

  // H.5 Moushumi
  const m = computeSettlement(moushumi, stlMoushumi, S, { asOf: '2026-09-03' });
  // Spec H.5 prints exactYears as 4.49 (truncated); 4 + 5/12 + 30/365 = 4.4988 rounds to 4.50.
  check('H.5 Moushumi service / CY', ['4y 5m 30d', 4, 4.5], [m.meta.serviceText, m.meta.completedYears, m.meta.exactYears]);
  check('H.5 Moushumi notice served', 60, m.meta.noticeServed);
  check('H.5 Moushumi compensation 15 × 1,000 × 4', 60000, line(m, 'compensation'));
  check('H.5 Moushumi earnings', 128900, m.totals.earnings);
  check('H.5 Moushumi net', 126500, m.totals.netPayable);
  check('H.5 Moushumi PF net', 242800, m.totals.pfNet);
  check('H.5 Moushumi total', 369300, m.totals.totalToEmployee);

  // I.4 Termination (Belal)
  const b = computeSettlement(belal, stlBelal, S, { asOf: '2026-08-27' });
  check('I.4 Belal service / CY', ['5y 6m 20d', 6], [b.meta.serviceText, b.meta.completedYears]);
  check('I.4 Belal notice pay 120 × 500', 60000, line(b, 'noticePay'));
  check('I.4 Belal compensation 30 × 500 × 6', 90000, line(b, 'compensation'));
  check('I.4 Belal leave encashment', 9716.67, line(b, 'leaveEncash'));
  check('I.4 Belal earnings', 186216.67, b.totals.earnings);
  check('I.4 Belal net', 185016.67, b.totals.netPayable);
  check('I.4 Belal PF net', 131400, b.totals.pfNet);
  check('I.4 Belal total', 316416.67, b.totals.totalToEmployee);
  check('I.4 Belal management approval required', true, requiresManagementApproval(stlBelal, belal, b.totals, S));

  // I.5 Retirement
  const rt = computeSettlement(retiree, stlRetiree, S, { asOf: '2026-09-01' });
  check('I.5 retirement service / CY', ['18y 4m 16d', 18], [rt.meta.serviceText, rt.meta.completedYears]);
  check('I.5 retirement compensation', 252000, line(rt, 'compensation'));
  check('I.5 retirement salary 30/31', 20322.58, line(rt, 'salary'));
  check('I.5 retirement EL 32 × 700', 22400, line(rt, 'leaveEncash'));
  check('I.5 retirement earnings', 294722.58, rt.totals.earnings);
  check('I.5 retirement PF employee', 1083.87, line(rt, 'pfEmployee'));
  check('I.5 retirement asset recovery', 500, line(rt, 'assetRecovery'));
  check('I.5 retirement net', 293138.71, rt.totals.netPayable);
  check('I.5 retirement PF net', 897167.74, rt.totals.pfNet);
  check('I.5 retirement total', 1190306.45, rt.totals.totalToEmployee);
  const noSc = computeSettlement(retiree, { ...stlRetiree, inputs: { ...stlRetiree.inputs, assetShowCauseIssued: false } }, S, { asOf: '2026-09-01' });
  check('I.5 asset recovery withheld without show-cause', [0, true], [line(noSc, 'assetRecovery'), noSc.flags.some((f) => f.tone === 'danger')]);

  // I.6 Death
  const d = computeSettlement(deceased, stlDeath, S, { asOf: '2026-09-20' });
  check('I.6 death service / CY', ['10y 4m 5d', 10], [d.meta.serviceText, d.meta.completedYears]);
  check('I.6 death compensation 45 × 666.67 × 10', 300000, line(d, 'compensation'));
  check('I.6 death salary 15/30', 15000, line(d, 'salary'));
  check('I.6 death group insurance', 200000, line(d, 'groupInsurance'));
  check('I.6 death earnings', 535000, d.totals.earnings);
  check('I.6 death PF employee', 800, line(d, 'pfEmployee'));
  check('I.6 death net', 534200, d.totals.netPayable);
  check('I.6 death PF net (vestOnDeath)', 331600, d.totals.pfNet);
  check('I.6 death total', 865800, d.totals.totalToEmployee);
  check('I.6 death payee', 'Nominee', d.meta.payee);
  check('I.6 death not at work → 30 days', 200000, line(computeSettlement(deceased, { ...stlDeath, deathAtWork: false }, S, { asOf: '2026-09-20' }), 'compensation'));

  // I.2 Appraisal TPL-SO
  const a = computeAppraisalScore(aprRakib, rakib, S);
  const kv = (code) => { const k = a.kpis.find((x) => x.code === code); return [k.score, k.weighted]; };
  check('I.2 SO-1 (A) 92 → 92.00 / 27.60', [92, 27.6], kv('SO-1'));
  check('I.2 SO-2 (B) 95 → 87.50 / 13.13', [87.5, 13.13], kv('SO-2'));
  check('I.2 SO-3 (E) 96.5 → 80 / 12.00', [80, 12], kv('SO-3'));
  check('I.2 SO-4 (B) 33/35 → 85.71 / 12.86', [85.71, 12.86], kv('SO-4'));
  check('I.2 SO-5 (A) 470/450 → 104.44 / 15.67', [104.44, 15.67], kv('SO-5'));
  check('I.2 SO-6 (E) 88 → 70 / 7.00', [70, 7], kv('SO-6'));
  check('I.2 KPI score', 88.26, a.scores.kpi);
  check('I.2 competency score', 73, a.scores.competency);
  check('I.2 final score', 85.21, a.scores.final);
  check('I.2 grade A (original = final)', ['A', 'A'], [a.scores.gradeOriginal, a.scores.gradeFinal]);
  check('I.2 no gate flags', 0, a.gateFlags.length);

  // I.3 Appraisal TPL-PS
  const p = computeAppraisalScore(aprShimul, shimul, S);
  const pw = (code) => p.kpis.find((x) => x.code === code).weighted;
  check('I.3 PS lines weighted', [29.39, 18, 13, 15, 6.74, 15], ['PS-1', 'PS-2', 'PS-3', 'PS-4', 'PS-5', 'PS-6'].map(pw));
  check('I.3 KPI score', 97.13, p.scores.kpi);
  check('I.3 competency score', 78, p.scores.competency);
  check('I.3 final score', 91.39, p.scores.final);
  check('I.3 grade A+', ['A+', 'A+'], [p.scores.gradeOriginal, p.scores.gradeFinal]);
  const pw2 = computeAppraisalScore(aprShimul, shimulWarned, S);
  check('I.3 written warning → cap B', ['A+', 'B'], [pw2.scores.gradeOriginal, pw2.scores.gradeFinal]);

  // I.7 Other assertions
  const sl1 = serviceLength('2022-03-01', '2026-08-31');
  check('I.7 serviceLength 2022-03-01 → 2026-08-31', '4y 5m 30d', sl1.text);
  check('I.7 completedYears six_months / strict', [4, 4], [completedYears(sl1, 'six_months'), completedYears(sl1, 'strict')]);
  check('I.7 serviceLength inclusive', '4y 6m 0d', serviceLength('2022-03-01', '2026-08-31', true).text);
  const sl2 = serviceLength('2021-01-11', '2026-07-31');
  check('I.7 serviceLength 2021-01-11 → 2026-07-31', ['5y 6m 20d', 6], [sl2.text, completedYears(sl2)]);
  check('I.7 serviceLength 2019-02-20 → 2026-10-20 inclusive', '7y 8m 1d', serviceLength('2019-02-20', '2026-10-20', true).text);
  const tiers = S.compensation.resignationTiers;
  check('I.7 resignation tier days 3.0 / 3.01 / 9.99 / 10', [7, 15, 15, 30], [3, 3.01, 9.99, 10].map((y) => resignationTier(y, tiers).days));
  check('I.7 estimateTds nil', 0, estimateTds({ ytdIncome: 180000, settlementTaxable: 234709.68, ytdTaxPaid: 0, category: 'general' }, S).tds);
  const t2 = estimateTds({ ytdIncome: 900000, settlementTaxable: 300000, ytdTaxPaid: 20000 }, S);
  check('I.7 estimateTds 1.2M income', [1200000, 400000, 800000, 45000, 25000], [t2.income, t2.exempt, t2.taxable, t2.tax, t2.tds]);
  check('I.7 attendanceKpi 96% / 3 lates / 1 unapproved', 66, attendanceKpi({ pct: 96, avgLates: 3, unapproved: 1 }, S).score);
  check('I.7 addWorkingDays 2026-10-20 + 30', '2026-12-01', addWorkingDays('2026-10-20', 30, { weeklyOffs: ['Fri', 'Sat'], holidays: [] }).date);
  check('I.7 countLeaveDays Sun–Thu', 5, countLeaveDays('2026-10-11', '2026-10-15', false, S.calendar, DEFAULT_LEAVE_TYPES[0]));
  check('I.7 countLeaveDays maternity (calendar days)', 112, countLeaveDays('2026-01-01', '2026-04-22', false, S.calendar, DEFAULT_LEAVE_TYPES[3]));

  return { pass: results.every((x) => x.ok), results };
};

# HR Portal ("Know Your Employee") — Final Implementation Specification

Project: `E:/Claude_Projects/KYC` (Vite 8 + React 19 + react-router v7, no backend, single `useReducer` store persisted to `localStorage['kyc_kys_store_v3']`). Third portal at `/hr`, mirroring the KYS pattern. All paths below are relative to `E:/Claude_Projects/KYC/`.

Base design: the "domain" design (highest score), with grafts from "codebase" (modal signature contract, `link`-style audit ref, `rated()` seed helper, ApprovalModal with stage prop, rounding rules, citations in Field hints) and "journey" (SettlementNew wizard, `settlementReady`, per-row clearance sign-off roles, LWD ≤ today guard, retirement fixture, SettlementStatement component, mode-based AppraisalForm, SalaryRevisionModal/EntitlementModal, On Hold). Every judge weakness and cross-cutting issue is resolved in A.2.

---

## A. Overview and binding decisions

### A.1 Scope (four modules, one portal)

| Module | Routes | Pages |
|---|---|---|
| Employee master | `/hr/employees`, `/new`, `/:id`, `/:id/edit` | EmployeeList, EmployeeForm, EmployeeDetail |
| KPI & Evaluation | `/hr/kpi`, `/hr/cycles`, `/hr/appraisals`, `/hr/appraisals/:id` | KpiTemplates, AppraisalCycles, AppraisalList, AppraisalForm |
| Final Settlement | `/hr/settlements`, `/new`, `/:id` | SettlementQueue, SettlementNew, SettlementDetail (+ SettlementStatement component) |
| Leave & Attendance | `/hr/leave`, `/hr/attendance` | LeaveQueue (one component, `initialTab` prop) |
| Insight | `/hr`, `/hr/reminders`, `/hr/reports`, `/hr/audit`, `/hr/settings` | HrDashboard, HrReminders, HrReports, AuditLog(portal="hr"), HrSettings |

### A.2 Resolved contradictions and cross-cutting fixes (binding)

| # | Topic | Decision |
|---|---|---|
| 1 | Storage key | Keep `'kyc_kys_store_v3'`. `load()` adds per-collection `Array.isArray` guards with `migrateX`, deep-merges `hrSettings` through `migrateHrSettings`, and injects HR seed audit once when `parsed.employees` is absent. `hrSettings.schemaVersion = 1`; if a stored `hrSettings.schemaVersion` is missing or lower, `load()` replaces **all HR collections** with fresh seed (protects against partial intermediate builds). |
| 2 | Audit anchoring | Every HR audit entry anchors to the **employee** (`customerId` = employee id, `customerCode` = employee code, `businessName` = employee name) and carries optional `refId`/`refCode` (appraisal, settlement, leave request). Histories filter by `refId`, never by detail prefix. Settings/cycle/leave-year changes anchor to the pseudo-entity `HR_SYSTEM = { id: 'hr_system', code: 'HR', name: 'HR System' }`; AuditLog renders a non-link for `customerId === 'hr_system'`. |
| 3 | KYC audit flood | `src/pages/Dashboard.jsx` "Recent activity" and `src/pages/CustomerDetail.jsx` history add `(a.portal \|\| 'kyc') === 'kyc'`. Integration unit. |
| 4 | Audit `by` values | Seed audit `by` is always a name in `ALL_USERS` (HR users are mapped to employee records via `employeeId`). AuditLog's user dropdown is built from the entries (`[...new Set(entries.map((a) => a.by))]`) instead of `ALL_USERS`. |
| 5 | Audit growth | `audit()` caps the array at `AUDIT_CAP = 4000` entries (oldest dropped). Estimated HR seed blob ≈ 450 KB; total < 1 MB. |
| 6 | Dates / UTC | `src/utils/helpers.today()` is UTC-based. HR uses `hrToday(settings)` = `settings.calendar.asOfDate \|\| localToday()` (local date). A **demo clock** (`calendar.asOfDate`, blank = real clock) is editable in HR Settings → Holidays & calendar; every HR page computes `const asOf = hrToday(state.hrSettings)` once and passes it to helpers. Reducer never calls `today()` for HR dates; pages pass `asOf` in payloads where needed. |
| 7 | Seed date drift | Employment, separation and cycle dates in the seed are **absolute** (so the on-screen Jahangir statement reproduces the rule sheet to the paisa); attendance months, leave requests, `createdAt/updatedAt` and cycle due dates are **relative** to `localToday()`. Regression fixtures in `src/hr/selfTest.js` are absolute and independent of the seed. Presenters pin `asOfDate = '2026-10-06'` to replay the seed as designed. |
| 8 | Employee → Separated | Happens at the first of: (a) `SETTLEMENT_TRANSITION` to `Pending HR Approval` when `lastWorkingDay <= a.asOf`; (b) explicit `Confirm exit` (`EMPLOYEE_TRANSITION` → Separated, enabled only when LWD ≤ asOf) from EmployeeDetail or the Reminders card "Exit date passed"; (c) `SETTLEMENT_TRANSITION` → `Paid`. Submitting for HR approval before LWD is allowed (dues pre-computed) but leaves the employee `On Notice`. |
| 9 | Disciplinary | Dated records `employee.disciplinary[]` (type, date, show-cause, enquiry, outcome, clause, document). Never reset by `CLOSE_CYCLE`. Appraisal gates use `activeDisciplinary(emp, periodFrom, periodTo)`. A Dismissal separation requires a record of type `'Dismissal Enquiry'` with `showCauseDate` and `enquiryDate` (s.24) — `validateSeparation` blocks otherwise. |
| 10 | Separation of duties | `canApproveStage(sep, stage, user)`: the approver's name must differ from `statement.computedBy` and from every prior `approvals[].by`. Enforced in the reducer (`SETTLEMENT_TRANSITION` returns state unchanged when violated) and surfaced as a disabled button with hint. The single Admin user therefore cannot approve two stages of one settlement. |
| 11 | Law version | `statutory.lawVersion: 'auto'` → `lawVersionFor(sep, settings)` picks `'pre_2025'` when `lastWorkingDay < statutory.lawCutoverDate` (`'2025-11-17'`) else `'bla2026'`; `'bla2026'`/`'pre_2025'` force it; `sep.inputs.lawVersionOverride` wins. Shown on the statement header. |
| 12 | Field-level audit | `UPSERT_APPRAISAL` writes `appraisalDiff(prev, next)` (e.g. `SO-1 actual 92 → 90; Integrity mgr 4 → 3; grade A → B`) into `detail`. HR calibration stores `gradeOriginal` and `gradeFinal` with `calibrationNote`. |
| 13 | Death in service | Separation type `Death`: `deathAtWork` flag (45 days/yr), nominee copied to the settlement, `inputs.groupInsurance` line (s.99), PaymentModal `payee = 'Nominee'` with name/relation/NID, `deathMinServiceYears` by law version. Covered by fixture `FX_DEATH` and acceptance check L.27 (not seeded). |
| 14 | Leave accrual & year end | EL entitlement: `annual` (default) or `perDaysWorked` (1 per `elAccrualDivisor` present days from attendance). Cap `leave.elCapDays` (60 commercial / 40 factory by `establishmentType`), refused-leave credit beyond cap via `leave.refusedBeyondCap[typeCode]` per employee. `CLOSE_LEAVE_YEAR` action rolls balances into next year's opening with carry caps and bumps `leave.year`. |
| 15 | Working-day deadline | `calendar.weeklyOffs` (default `['Fri', 'Sat']`) + `calendar.holidays[]` feed `addWorkingDays`; the statement lists the skipped days count. Settings tab "Holidays & calendar". |
| 16 | Self-test | `src/hr/selfTest.js` → `runHrSelfTest()` returns `{ pass, results: [{ name, ok, expected, actual }] }`. `main.jsx` runs it in DEV and `console.assert`s; HR Settings → Statutory tab has a "Verify formulas" button showing the table. |
| 17 | Row visibility | One helper `hrScope(user, employees)` → `{ kind: 'all'\|'team'\|'self', employee, ids: Set }` used by Layout counts, dashboard tiles, every list and every detail page. |
| 18 | Layout | `PORTALS` descriptor hoisted to **module scope**; `portalUsers` identity stable, so the existing effect no longer re-runs per render. |
| 19 | Report helpers | New `src/components/reportBits.jsx` exporting `TONE`, `BarList`, `toCsv`, `exportCsv`; used only by HR pages (KYC/KYS untouched). |
| 20 | Print | `.no-print` convention, `.statement` CSS with page-break rules, and SettlementDetail adds `statement-print` to its root while the Statement tab is active so only the statement prints. Appraisal summary and service certificate print via `.no-print` + `window.print()`. |
| 21 | Probation | Entering `Probation` auto-creates a Probation-type appraisal (page passes a pre-built object; reducer inserts). `ProbationDecisionModal` shows `probationOutcome` checks (score, attendance, lates, unapproved, disciplinary, integrity) and Confirm/Extend-once/Not-confirm; Not confirm navigates to `/hr/settlements/new?employee=<id>&type=Termination&probation=1`. Deemed-permanent risk (s.4(8)) is a reminder, never auto-confirmed. |
| 22 | s.27(3A) | Attendance record carries `unapprovedRun` (longest consecutive unapproved absence). Reminder "Unapproved absence ≥ 10 days" → `Record s.27(3A) notice` (`HR_LOG 'Absence Notice Issued'`, stores `employee.absenceNotice { firstNoticeOn, secondNoticeOn }`); separation type `Deemed Resignation (s.27(3A))` available once `secondNoticeOn` is set and asOf ≥ secondNoticeOn + 7. |
| 23 | Continuous service | `continuousServiceCheck(emp, attendance, asOf)` → days worked in the last 12 months where attendance exists; `< 240` adds a **warn** flag on the statement (never blocks). |
| 24 | N+2 reviewer | Dropped. HR Review = HR Officer/HR Head stage with `hrRating` (±`hrAdjustMax` with comment) and grade calibration; employee never sees manager/HR fields before Published; manager never sees HR notes. |
| 25 | Appraisals on separation | `INITIATE_SEPARATION` cancels open appraisals **unless** the employee served ≥ `appraisal.proRataMonths` (9) of the cycle period at LWD — those stay open with flag `proRata: true`; performance bonus line in the statement is enabled only for a Closed appraisal with grade ≥ B. `rehireEligible` defaults `false` for Dismissal and for `Unsatisfactory` last grade. |
| 26 | Status strings | Shared with other portals and same tone: `Draft`, `Closed`, `Cancelled`, `Pending`, `Approved`, `Rejected`. All other HR strings are unique. `ui.jsx` spreads `HR_STATUS_COLORS` last; no HR key overrides an existing key with a different tone. |
| 27 | Bonus | `inputs.bonusPaidThisYear` captured (prevents double pay and feeds the tax estimate); `bonus.prorataOnExit` default `'none'` with `'months_since_last'` and `'accrual'` alternatives. |
| 28 | TDS | Data-driven estimate (`estimateTds`) with YTD income/paid, category threshold, 1/3 exemption, slab table, minimum tax, `inputs.taxOverride` wins; always labelled "estimate". Withholding statement is a printable block on the statement ("Salary & tax certificate" section). |
| 29 | Multi-user | README and the HR dashboard "Demo note" alert state that queues and separation of duties are demonstrated by switching the signed-in user. |
| 30 | hrQuickActions ownership | No single shared modal file. Each page unit owns its own `src/components/hr*Modals.jsx`; cross-unit imports are limited to the fixed signatures in J. |

---

## B. Domain model

### B.1 Enumerations (all in `src/hr/config.js`; strings are displayed verbatim, used as badge keys and as audit action labels)

```js
export const EMPLOYEE_STATUS = { DRAFT: 'Draft', PROBATION: 'Probation', CONFIRMED: 'Confirmed', NOTICE: 'On Notice', SUSPENDED: 'Under Suspension', SEPARATED: 'Separated' };
export const EMPLOYEE_FLOW = [DRAFT, PROBATION, CONFIRMED, NOTICE, SEPARATED];           // Under Suspension renders off-track
export const ACTIVE_EMPLOYEE_STATUSES = [PROBATION, CONFIRMED, NOTICE, SUSPENDED];

export const CYCLE_STATUS = { PLANNED: 'Planned', OPEN: 'Open', CLOSED: 'Closed' };
export const CYCLE_TYPES = ['Annual', 'Half-yearly'];
export const APPRAISAL_TYPES = ['Annual', 'Half-yearly', 'Probation'];

export const APPRAISAL_STATUS = { KPI_SETTING: 'KPI Setting', AGREED: 'Goals Agreed', SELF: 'Self-Assessment', MANAGER: 'Manager Review', HR: 'HR Review', RETURNED: 'Returned to Manager', PUBLISHED: 'Published', ACKNOWLEDGED: 'Acknowledged', DISPUTED: 'Disputed', CLOSED: 'Closed', CANCELLED: 'Cancelled' };
export const APPRAISAL_FLOW = [KPI_SETTING, AGREED, SELF, MANAGER, HR, PUBLISHED, ACKNOWLEDGED, CLOSED];
export const APPRAISAL_OPEN = [KPI_SETTING, AGREED, SELF, MANAGER, HR, RETURNED, PUBLISHED, DISPUTED];

export const SETTLEMENT_STATUS = { INITIATED: 'Initiated', CLEARANCE: 'Clearance in Progress', HR_APPROVAL: 'Pending HR Approval', FINANCE_APPROVAL: 'Pending Finance Approval', MGMT_APPROVAL: 'Pending Management Approval', APPROVED: 'Approved for Payment', PAID: 'Paid', ON_HOLD: 'On Hold', RETURNED: 'Returned to HR', WITHDRAWN: 'Withdrawn' };
export const SETTLEMENT_FLOW = [INITIATED, CLEARANCE, HR_APPROVAL, FINANCE_APPROVAL, MGMT_APPROVAL, APPROVED, PAID];
export const SETTLEMENT_OPEN = [INITIATED, CLEARANCE, HR_APPROVAL, FINANCE_APPROVAL, MGMT_APPROVAL, APPROVED, ON_HOLD, RETURNED];

export const LEAVE_STATUS = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', CANCELLED: 'Cancelled' };
export const CLEARANCE_STATUS = { PENDING: 'Pending', CLEARED: 'Cleared', DUES: 'Dues Found' };

export const SEPARATION_TYPES = ['Resignation', 'Termination', 'Retrenchment', 'Discharge', 'Dismissal', 'Retirement', 'Death', 'End of Contract', 'Deemed Resignation (s.27(3A))'];
export const SEPARATION_SECTIONS = { Resignation: 's.27', Termination: 's.26', Retrenchment: 's.20', Discharge: 's.22', Dismissal: 's.23', Retirement: 's.28', Death: 's.19', 'End of Contract': 's.26(2)', 'Deemed Resignation (s.27(3A))': 's.27(3A)' };
export const EMPLOYER_INITIATED = ['Termination', 'Retrenchment', 'Discharge', 'Dismissal'];
export const MISCONDUCT_CLAUSES = ['', '23(4)(a)', '23(4)(b)', '23(4)(c)', '23(4)(d)', '23(4)(e)', '23(4)(f)', '23(4)(g)', '23(4)(h)', '23(4)(i)', '23(4)(j)'];

export const DISCIPLINARY_TYPES = ['Show Cause', 'Written Warning', 'Final Warning', 'Suspension', 'Dismissal Enquiry'];
export const RECOMMENDATIONS = ['', 'Increment', 'Increment & Promotion', 'Promotion', 'No Increment', 'PIP', 'Separation'];
export const PROBATION_DECISIONS = ['', 'Confirm', 'Extend', 'Not confirm'];
export const EMPLOYMENT_TYPES = ['Permanent', 'Contractual', 'Temporary', 'Casual'];
export const WORKER_CATEGORIES = ['Worker', 'Non-worker'];
export const WAGE_BASIS = ['Monthly', 'Daily', 'Piece'];
export const ESTABLISHMENT_TYPES = [{ code: 'commercial', name: 'Commercial / office', elDivisor: 18, elCap: 60 }, { code: 'factory', name: 'Factory', elDivisor: 18, elCap: 40 }, { code: 'shop', name: 'Shop', elDivisor: 18, elCap: 60 }, { code: 'road_transport', name: 'Road transport', elDivisor: 18, elCap: 40 }, { code: 'tea', name: 'Tea plantation', elDivisor: 22, elCap: 60 }, { code: 'newspaper', name: 'Newspaper', elDivisor: 11, elCap: 60 }];
export const TAX_CATEGORIES = [{ code: 'general', name: 'General' }, { code: 'female_senior', name: 'Female / aged 65+' }, { code: 'disabled', name: 'Disabled / third gender' }, { code: 'war_wounded', name: 'Gazetted war-wounded' }];
export const PAY_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Mobile Wallet'];
export const LOAN_TYPES = ['Salary Advance', 'Staff Loan', 'PF Loan', 'Other'];
export const KPI_CATEGORIES = ['Financial', 'Operational', 'Customer', 'People', 'Compliance'];
export const KPI_UNITS = ['BDT', 'BDT lakh', 'BDT crore', '%', 'Nos', 'Days', 'Hours', 'Score', 'Y/N', 'km/L'];
export const KPI_METHODS = [{ code: 'A', name: 'Linear achievement %' }, { code: 'B', name: 'Threshold / target / stretch' }, { code: 'C', name: 'Rating 1–5' }, { code: 'D', name: 'Binary / milestone %' }, { code: 'E', name: 'Step table' }];
export const KPI_DIRECTIONS = ['higher', 'lower'];
export const KPI_SOURCES = ['manual', 'attendance'];
```

`HR_STATUS_COLORS` (one object): Draft gray · Probation blue · Confirmed green · On Notice amber · Under Suspension red · Separated gray · Planned gray · Open blue · Closed gray · KPI Setting blue · Goals Agreed indigo · Self-Assessment indigo · Manager Review purple · HR Review purple · Returned to Manager amber · Published green · Acknowledged green · Disputed red · Cancelled red · Initiated blue · Clearance in Progress indigo · Pending HR Approval purple · Pending Finance Approval purple · Pending Management Approval purple · Approved for Payment green · Paid green · On Hold amber · Returned to HR amber · Withdrawn gray · Pending amber · Approved green · Rejected red · Cleared green · Dues Found amber.

### B.2 Employee record (`emptyEmployee(createdBy)`; all numeric fields are strings, `''` = empty)

```js
{ id: uid('emp'), code: '', status: 'Draft', statusReason: '', statusHistory: [],                 // [{ status, at, by, reason }]
  name: '', fatherName: '', motherName: '', dob: '', gender: 'Male', maritalStatus: 'Single', bloodGroup: '', nationality: 'Bangladeshi',
  nid: '', tin: '', passportNo: '', passportExpiry: '', mobile: '', altMobile: '', email: '', presentAddress: '', permanentAddress: '',
  emergencyContact: { name: '', relation: '', mobile: '', address: '' },
  nominee: { name: '', relation: '', nid: '', mobile: '', sharePct: '100' },
  employment: { department: '', designation: '', grade: '', employmentType: 'Permanent', workerCategory: 'Worker', wageBasis: 'Monthly', establishmentType: 'commercial',
    joinDate: '', contractEndDate: '', confirmationDate: '', reportingManagerId: '', workLocation: 'Dhaka',
    probation: { required: true, months: '6', endDate: '', extended: false, extendedTo: '', decision: '', decidedAt: '', decidedBy: '' } },
  salary: { basic: '', houseRent: '', medical: '', conveyance: '', dearness: '', adhoc: '', otherAllowances: '', effectiveFrom: '', payMode: 'Bank Transfer', history: [] },
  //  history: [{ id: uid('sal'), effectiveFrom, basic, houseRent, medical, conveyance, dearness, adhoc, otherAllowances, gross, reason, by, at }]
  bank: { bankName: '', branch: '', accountType: 'Savings', accountName: '', accountNo: '', routingNo: '', verified: false, verifiedBy: '', verifiedAt: '' },
  pf: { member: false, joinDate: '', employeeRatePct: '8', employerRatePct: '8', ownBalance: '', employerBalance: '', interestAccrued: '', advanceOutstanding: '' },
  loans: [],                                      // [{ id: uid('loan'), type: 'Salary Advance', principal: '', outstanding: '', monthlyInstalment: '', note: '' }]
  tax: { category: 'general', ytdIncome: '', ytdTaxPaid: '', bonusPaidThisYear: false },
  leave: { opening: {}, entitlementOverride: {}, refusedBeyondCap: {} },   // keyed by leave type code, string numbers
  disciplinary: [],                               // [{ id: uid('dis'), type, date, reference, showCauseDate, replyDueDate, enquiryDate, outcome, misconductClause, note, documentId, by, at }]
  absenceNotice: { firstNoticeOn: '', secondNoticeOn: '' },
  separationId: '', separatedAt: '', rehireEligible: true,
  lastAppraisal: { code: '', cycle: '', grade: '', final: '', at: '' },
  documents: [], createdBy, createdAt: nowIso(), updatedAt: nowIso() }
```

### B.3 KPI template, cycle, appraisal

```js
// kpiTemplates[]
{ id: 'tpl_so', code: 'TPL-SO', name: 'Sales Officer', designationCodes: ['SO'], departmentCodes: [], cycleTypes: ['Annual', 'Half-yearly'],
  weights: { kpi: 80, competency: 20 }, competencySet: 'staff' | 'manager', attendanceMode: 'kpi' | 'gate', active: true, description: '',
  items: [{ id: uid('kpi'), code: 'SO-1', name, description, category, unit, direction: 'higher', method: 'A', target: '100', thresholdPct: '80', stretchPct: '120', cap: '120', weight: '30', isGate: false, source: 'manual', steps: [] }] }
//  steps (method E): [{ bound: '98', score: '100' }, …] — higher: first step with actual >= bound; lower: first step with actual <= bound; none → 0

// appraisalCycles[]
{ id: uid('cyc'), code: 'CYC-2026-MY', name, type: 'Annual' | 'Half-yearly', periodFrom, periodTo, status: 'Planned',
  due: { kpi: '', self: '', manager: '', hr: '', publish: '', ack: '' }, payout: { incrementEffective: '', bonusPayable: false },
  openedAt: '', closedAt: '', createdBy, createdAt, updatedAt }

// appraisals[]
{ id: uid('apr'), code: 'APR-1001', employeeId, cycleId: '' , type: 'Annual' | 'Half-yearly' | 'Probation', templateId, templateCode, periodFrom, periodTo, managerId,
  status: 'KPI Setting', statusReason: '', proRata: false, weights: { kpi: 80, competency: 20 }, attendanceMode: 'kpi',
  kpis: [{ ...templateItem, actualSelf: '', selfComment: '', actualMgr: '', mgrComment: '', evidence: '', ach: null, score: null, weighted: null, custom: false }],
  competencies: [{ code: 'TEAM', name: 'Teamwork', weight: 15, selfRating: '', mgrRating: '', mgrComment: '', hrRating: '', hrComment: '' }],
  self: { overallComment: '', achievements: '', submittedAt: '' },
  manager: { strengths: '', improvements: '', overallComment: '', recommendation: '', incrementPct: '', promotionTo: '', submittedAt: '', by: '' },
  hr: { gradeOverride: '', calibrationNote: '', recommendation: '', incrementPct: '', promotionTo: '', pip: false, pipEndDate: '', comment: '', attendanceOverridePct: '', attendanceOverrideReason: '', reviewedAt: '', by: '' },
  attendance: { pct: null, avgLates: null, unapproved: 0, months: 0, score: null, lockedAt: '' },
  gateFlags: [],                                   // [{ code: 'WRITTEN_WARNING', text, cap: 'B' }]
  scores: { kpi: null, competency: null, final: null, gradeOriginal: '', gradeFinal: '', computedAt: '' },
  probation: { decision: '', confirmationDate: '', note: '' },
  acknowledgement: { response: '', comment: '', at: '', by: '' },
  dispute: { comment: '', resolution: '', resolvedAt: '', resolvedBy: '' },
  due: { kpi, self, manager, hr, publish, ack }, history: [{ status, at, by, note }], createdBy, createdAt, updatedAt }
```

### B.4 Leave types, requests, attendance

```js
// leaveTypes[] (DEFAULT_LEAVE_TYPES)
{ code: 'EL', name: 'Earned Leave', annualDays: '20', paid: true, accrues: true, carryForward: true, carryCap: '60', encashable: true, minServiceMonths: '12', maxConsecutive: '30', countCalendarDays: false, genderOnly: '', statutoryRef: 's.117' }
// EL 20 (s.117; policy ≥ statutory), CL 'Casual Leave' 10 (s.115, no carry), SL 'Sick Leave' 14 (s.116, no carry), ML 'Maternity Leave' 112 (s.46, genderOnly 'Female', countCalendarDays true, minServiceMonths 6),
// PL 'Paternity Leave' 5 (policy), LWP 'Leave Without Pay' 0 (unlimited: annualDays '0', unlimited: true, paid false)

// leaveRequests[]
{ id: uid('lvr'), code: 'LV-1001', employeeId, typeCode: 'EL', from, to, halfDay: false, days: 3, reason: '', handoverTo: '', status: 'Pending',
  approverId: '' /* employee id of manager; '' → HR Head */, requestedBy, requestedAt, decision: { by: '', at: '', comment: '' }, updatedAt }

// attendance[] — one row per employee per month
{ id: uid('att'), employeeId, month: '2026-09', workingDays: 22, present: 20, absent: 0, unapproved: 0, unapprovedRun: 0, late: 1, earlyOut: 0, leave: 2, lwp: 0, overtimeHrs: '0', remarks: '', enteredBy, locked: false, updatedAt }
// invariant: present + absent + leave + lwp === workingDays; unapproved <= absent; unapprovedRun <= unapproved
```

### B.5 Settlement (`settlements[]`)

```js
{ id: uid('stl'), code: 'FS-1001', employeeId, type: 'Resignation', reason: '', misconductClause: '', deathAtWork: false, afterLayoff: false, workCompleted: false, probationer: false,
  noticeDate: '', lastWorkingDay: '', noticeRequiredDays: 60, noticeWaivedDays: '0', payInLieu: false, payInLieuDays: '',
  previousStatus: 'Confirmed', status: 'Initiated', statusReason: '',
  clearance: [{ dept: 'IT', label: 'IT', items: ['Laptop & accessories', 'Email & system access revoked', 'Software licences'], status: 'Pending', signedBy: '', signedAt: '', remarks: '', recoverable: '' }, /* ADMIN, FINANCE, HR, LINE */],
  inputs: { elBalanceDays: '', finalMonthSalaryPaid: false, arrears: '', overtime: '', reimbursement: '', otherPayable: '', performanceBonus: '', bonusPaidThisYear: false,
    pfOwn: '', pfEmployer: '', pfInterest: '', pfAdvance: '', loanRecovery: '', assetRecovery: '', assetShowCauseIssued: false, absenceDays: '', otherDeduction: '',
    groupInsurance: '', ytdIncome: '', ytdTaxPaid: '', taxOverride: '', lawVersionOverride: '', roundingOverride: '' },
  statement: null,     // frozen output of computeSettlement: { meta, lines, totals, flags, computedAt, computedBy, lawVersion, skippedDays }
  approvals: [],       // [{ stage: 'HR' | 'Finance' | 'Management', decision: 'Approved' | 'Returned', by, at, comment }]
  payment: { paidAt: '', mode: 'Bank Transfer', reference: '', amount: '', bankAccountNo: '', payee: 'Employee', payeeName: '', payeeRelation: '', payeeNid: '', pfPaidAt: '', pfReference: '', paidBy: '' },
  serviceCertificate: { issued: false, issuedAt: '', by: '' }, exitInterviewDone: false, rehireEligible: true, nominee: { name: '', relation: '', nid: '', mobile: '', sharePct: '' },
  hold: { reason: '', at: '', by: '' }, documents: [], history: [{ status, at, by, note }], createdBy, createdAt, updatedAt }
```

`CLEARANCE_DEPARTMENTS` (config): `IT` (signOffRoles HR Officer, Admin — IT signs through HR Officer in the demo), `ADMIN` (HR Officer, Admin), `FINANCE` (Finance Manager, Admin), `HR` (HR Officer, HR Head, Admin), `LINE` (Line Manager — must be the employee's reporting manager — plus HR Head, Admin). Items per dept listed in config.

### B.6 Workflows

**Employee**: Draft → (Activate) → Probation | Confirmed → (Confirm / Extend / Not confirm) → Confirmed → (Initiate separation) → On Notice → (exit) → Separated. Suspend/Reinstate: any active status ↔ Under Suspension (`previousStatus` stored in `statusReason`-independent field `suspendedFrom`).

**Appraisal** (owner → next): KPI Setting (manager; HR Head) → *Send for agreement* → Goals Agreed (employee accepts or objects once → back to KPI Setting) → *Accept goals* → Self-Assessment (employee) → *Submit self-assessment* → Manager Review (manager) → *Submit manager review* → HR Review (HR Officer / HR Head) → *Publish* (HR Head) → Published → *Acknowledge* → Acknowledged | *Dispute* → Disputed → *Resolve* → Published → … → `CLOSE_CYCLE` → Closed. Returned to Manager (from HR Review, reason) → *Resubmit* → HR Review. Cancelled (HR, reason, before Published). Probation type has no cycle; Published probation appraisal is closed by the probation decision.

**Settlement**: Initiated → *Start clearance* → Clearance in Progress → (all 5 rows signed, statement frozen, `settlementReady`) *Submit for HR approval* → Pending HR Approval → *HR approve* → Pending Finance Approval → *Finance approve* → (if `requiresManagementApproval`) Pending Management Approval → *Management approve* → Approved for Payment → *Record payment* → Paid → *Issue service certificate*. Returns: any approval stage → Returned to HR (reason) → *Resubmit* → Pending HR Approval (approvals history kept, new round). On Hold ↔ (from Initiated/Clearance/Returned) with reason. Withdrawn (from Initiated/Clearance/Returned; employee reverts to `previousStatus`).

**Leave**: Pending → Approved | Rejected; Pending/Approved(future) → Cancelled by requester or HR.

### B.7 HR Settings (`DEFAULT_HR_SETTINGS`) — Bangladesh Labour Act 2006 as amended 2026 defaults

```js
export const DEFAULT_HR_SETTINGS = {
  schemaVersion: 1,
  company: { name: 'Padma Consumer Industries Ltd.', address: 'Plot 12, Tejgaon I/A, Dhaka 1208', establishmentType: 'commercial' },
  calendar: { asOfDate: '', weeklyOffs: ['Fri', 'Sat'], holidays: [ /* { date, name } — 2026 list in C.7 */ ] },
  statutory: { lawVersion: 'auto', lawCutoverDate: '2025-11-17', applyToNonWorkers: true, daysPerMonth: 30, partialYearRounding: 'six_months', compWageBase: 'basic_da', countLastDayInclusive: false, continuousServiceDays: 240, retirementAge: 60 },
  notice: { employerPermanentMonthly: 120, employerPermanentOther: 60, employerTemporaryMonthly: 30, employerTemporaryOther: 14, workerPermanent: 60, workerTemporaryMonthly: 30, workerTemporaryOther: 14, probation: 0, contractExpiry: 0, retrenchment: 30, retrenchmentAfterLayoffExtraDays: 15, discharge: 0, dismissal: 0, retirement: 0, death: 0 },
  compensation: { minServiceYears: 1, terminationDaysPerYear: 30, retrenchmentDaysPerYear: 30, dischargeDaysPerYear: 30, dismissalDaysPerYear: 15, retirementDaysPerYear: 30, deathDaysPerYear: 30, deathAtWorkDaysPerYear: 45, deathMinServiceYears: 1, deathMinServiceYearsPre2025: 2,
    resignationTiers: [{ upToYears: 3, inclusive: true, days: 7 }, { upToYears: 10, inclusive: false, days: 15 }, { upToYears: null, inclusive: false, days: 30 }],
    resignationTiersPre2025: [{ upToYears: 5, inclusive: false, days: 0 }, { upToYears: 10, inclusive: false, days: 14 }, { upToYears: null, inclusive: false, days: 30 }],
    resignationGratuityCompareAllTiers: true, forfeitOnMisconductClauses: ['23(4)(b)', '23(4)(g)'], permanentOnly: true },
  gratuity: { schemeEnabled: false, daysPerYear: 30, daysPerYearAfter10: 45, wageBase: 'basic', compareWithCompensation: true, fundApproved: false },
  leave: { year: 2026, elAccrual: 'annual', elAccrualDivisor: 18, elCapDays: 60, encashOnExit: true, encashRateBase: 'gross', prorateOnExit: false, latesPerLeaveDay: 3 },
  pf: { enabled: true, eligibilityMonths: 12, employeeRatePct: 8, employerRatePct: 8, rateBase: 'basic', vestingYears: 2, vestOnDeath: true, forfeitOnDismissal: false, advanceSetoff: true, recognised: true },
  bonus: { countPerYear: 2, maxEachBasicMultiple: 1, prorataOnExit: 'none' },
  noticeShortfall: { base: 'basic_da', setoffAllowed: true },
  deductions: { assetRecoveryRequiresShowCause: true },
  tax: { exemptionDivisor: 3, exemptionCap: 500000, gratuityExemptCap: 25000000, minimumTax: 5000, thresholds: { general: 400000, female_senior: 450000, disabled: 525000, war_wounded: 550000 },
    slabs: [{ width: 300000, rate: 10 }, { width: 400000, rate: 15 }, { width: 500000, rate: 20 }, { width: 2000000, rate: 25 }, { width: null, rate: 30 }], fiscalYearStartMonth: 7 },
  settlement: { deadlineWorkingDays: 30, managementApprovalAbove: 500000, managementApprovalTypes: ['Termination', 'Retrenchment', 'Dismissal', 'Death'], managementApprovalGrades: ['G1', 'G2', 'G3'], issueServiceCertificate: true },
  probation: { monthsClerical: 6, monthsOther: 3, extensionMonths: 3, confirmScoreMin: 60, extendScoreMin: 45, attendanceMin: 90, extendAttendanceMin: 85, maxUnapproved: 2, maxAvgLates: 4 },
  appraisal: { maxCustomKpis: 2, minServiceDays: 90, proRataMonths: 9, ratingCommentMinChars: 50, hrAdjustMax: 1, pipDays: 90, pipDaysWorker: 60, ackDays: 7, managerialGrades: ['G1', 'G2', 'G3', 'G4'],
    bands: [{ code: 'A+', name: 'Outstanding', min: 90, incrementPct: 12, bonusMultiplier: 1.5, promotionEligible: true, pip: false, guidedPct: 10, tone: 'green' },
            { code: 'A', name: 'Exceeds Expectations', min: 75, incrementPct: 9, bonusMultiplier: 1.25, promotionEligible: true, pip: false, guidedPct: 25, tone: 'blue' },
            { code: 'B', name: 'Meets Expectations', min: 60, incrementPct: 6, bonusMultiplier: 1, promotionEligible: true, pip: false, guidedPct: 50, tone: 'indigo' },
            { code: 'C', name: 'Needs Improvement', min: 45, incrementPct: 0, bonusMultiplier: 0.5, promotionEligible: false, pip: false, guidedPct: 10, tone: 'amber' },
            { code: 'D', name: 'Unsatisfactory', min: 0, incrementPct: 0, bonusMultiplier: 0, promotionEligible: false, pip: true, guidedPct: 5, tone: 'red' }],
    gates: { writtenWarningCap: 'B', finalWarningCap: 'C', integrityMaxRating: 2, integrityCap: 'C', attendanceBelowPct: 85, attendanceCap: 'B', unapprovedAbsenceDays: 3, unapprovedCap: 'B', gateKpiFailBelow: 50, gateKpiCap: 'C' },
    attendance: { gracePeriodMin: 10, attendanceWeight: 0.6, unapprovedPenalty: 10, attendanceSteps: [{ min: 97, score: 100 }, { min: 95, score: 80 }, { min: 92, score: 60 }, { min: 90, score: 40 }, { min: 0, score: 0 }], punctualitySteps: [{ maxLates: 2, score: 100 }, { maxLates: 4, score: 70 }, { maxLates: 6, score: 40 }, { maxLates: null, score: 0 }] } },
};
```

---

## C. `src/hr/config.js` — exports

### C.1 Roles, users, permissions

```js
import { ROLES } from '../data/config';
export const HR_ROLES = { HR_OFFICER: 'HR Officer', HR_HEAD: 'HR Head', LINE_MANAGER: 'Line Manager', FINANCE: 'Finance Manager', MANAGEMENT: 'Managing Director', EMPLOYEE: 'Employee', ADMIN: ROLES.ADMIN };
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
```
`employeeId` is additive; KYC/KYS users have none (treated as `''`). Tahmina (h5) is also the employee `emp_tahmina` so Finance clearance and Finance approval are exercised by a real person; `'Finance Manager'` equals the KYS role string by design (separate user ids).

```js
const { HR_OFFICER: HO, HR_HEAD: HH, LINE_MANAGER: LM, FINANCE: FM, MANAGEMENT: MD, EMPLOYEE: EM, ADMIN: AD } = HR_ROLES;
const ALL = Object.values(HR_ROLES);
export const HR_PERMISSIONS = {
  create: [HO, HH, AD], edit: [HO, HH, AD], editSalary: [HH, AD], activate: [HO, HH, AD], confirm: [HH, AD], suspend: [HH, AD], disciplinary: [HO, HH, AD], markExit: [HO, HH, AD],
  viewSensitive: [HO, HH, FM, MD, AD], viewDocuments: ALL,
  manageKpi: [HO, HH, AD], manageCycles: [HH, AD], kpiSet: [LM, HH, MD, AD], selfAssess: ALL, managerReview: [LM, HH, MD, AD], hrReview: [HO, HH, AD], publish: [HH, AD], acknowledge: ALL, cancelAppraisal: [HH, AD],
  leaveRequest: ALL, leaveApprove: [LM, HH, MD, AD], leaveAdminister: [HO, HH, AD], attendanceEntry: [HO, HH, AD], closeLeaveYear: [HH, AD],
  separationInitiate: [HO, HH, AD], settlementEdit: [HO, HH, AD], clearanceSignOff: [HO, HH, LM, FM, AD], settlementHrApprove: [HH, AD], settlementFinanceApprove: [FM, AD], settlementManagementApprove: [MD, AD], settlementPay: [FM, AD], settlementHold: [HH, AD], issueCertificate: [HO, HH, AD],
  reports: [HO, HH, FM, MD, AD], audit: [HH, FM, MD, AD], settings: [HH, AD],
};
export const HR_ACTION_LABELS = { create: 'Create employee record', edit: 'Edit employee record', editSalary: 'Revise salary', activate: 'Activate employee', confirm: 'Decide probation', suspend: 'Suspend / reinstate', disciplinary: 'Record disciplinary action', markExit: 'Confirm exit', viewSensitive: 'View salary, NID, bank', viewDocuments: 'View documents', manageKpi: 'Manage KPI templates', manageCycles: 'Create / open / close cycles', kpiSet: 'Set KPIs for reports', selfAssess: 'Self-assessment (own)', managerReview: 'Manager review (reports)', hrReview: 'HR review & calibration', publish: 'Publish results', acknowledge: 'Acknowledge result (own)', cancelAppraisal: 'Cancel appraisal', leaveRequest: 'Request leave', leaveApprove: 'Approve leave (reports)', leaveAdminister: 'Administer leave for anyone', attendanceEntry: 'Enter monthly attendance', closeLeaveYear: 'Close leave year', separationInitiate: 'Initiate separation', settlementEdit: 'Edit settlement inputs', clearanceSignOff: 'Sign clearance', settlementHrApprove: 'Approve settlement (HR)', settlementFinanceApprove: 'Approve settlement (Finance)', settlementManagementApprove: 'Approve settlement (Management)', settlementPay: 'Record payment', settlementHold: 'Hold / release settlement', issueCertificate: 'Issue service certificate', reports: 'View reports', audit: 'View audit trail', settings: 'Edit HR settings' };
export const canHr = (role, action) => (HR_PERMISSIONS[action] || []).includes(role);
export const HR_STAFF_ROLES = [HO, HH, AD];                 // "isHrRole"
```

### C.2 Org structure

```js
export const DEPARTMENTS = [{ code: 'MGMT', name: 'Management' }, { code: 'HR', name: 'Human Resources & Admin' }, { code: 'SALES', name: 'Sales' }, { code: 'FIN', name: 'Finance & Accounts' }, { code: 'PROD', name: 'Production' }, { code: 'SCM', name: 'Supply Chain' }, { code: 'IT', name: 'IT' }, { code: 'ADMIN', name: 'Admin & Transport' }];
export const GRADES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];   // G1 = MD … G8 = operator/driver
export const DESIGNATIONS = [   // { code, name, department, grade, workerCategory, probationMonths, templateCode }
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
```

### C.3 Documents

```js
export const EMPLOYEE_DOC_TYPES = { NID: 'National ID (NID)', TIN: 'TIN Certificate', PHOTO: 'Photograph', CV: 'CV / Resume', APPOINTMENT: 'Appointment Letter', CONFIRMATION: 'Confirmation Letter', EDU: 'Educational Certificate', EXPERIENCE: 'Experience Certificate', BANK: 'Bank Account Proof', PASSPORT: 'Passport', LICENCE: 'Driving Licence', CONTRACT: 'Employment Contract', NOMINEE: 'Nominee Form', MEDICAL: 'Medical Fitness Certificate', OTHER: 'Other' };
export const EXPIRING_EMPLOYEE_DOCS = [PASSPORT, LICENCE, CONTRACT, MEDICAL];
export const REQUIRED_EMPLOYEE_DOCS = [NID, PHOTO, APPOINTMENT, EDU];
export const SEPARATION_DOC_TYPES = { RESIGNATION: 'Resignation Letter', ACCEPTANCE: 'Acceptance of Resignation', TERMINATION: 'Termination / Retrenchment Notice', SHOW_CAUSE: 'Show-cause Notice', ENQUIRY: 'Enquiry Report', MEDICAL: 'Medical Certificate', DEATH: 'Death Certificate', CLEARANCE: 'Signed Clearance Form', STATEMENT: 'Signed Settlement Statement', CERTIFICATE: 'Service Certificate', OTHER: 'Other' };
export const DISCIPLINARY_DOC_TYPES = ['Show-cause Notice', 'Reply', 'Enquiry Report', 'Warning Letter', 'Other'];
```

### C.4 Clearance departments

```js
export const CLEARANCE_DEPARTMENTS = [
  { dept: 'IT', label: 'IT', items: ['Laptop & accessories', 'Email & system access revoked', 'Software licences released'], signOffRoles: [HO, AD] },
  { dept: 'ADMIN', label: 'Admin', items: ['ID & access card', 'Keys / locker', 'Vehicle / fuel card', 'Mobile SIM & handset'], signOffRoles: [HO, AD] },
  { dept: 'FINANCE', label: 'Finance', items: ['Advances & loans', 'Expense claims settled', 'Petty cash / imprest', 'Tax & PF ledger reconciled'], signOffRoles: [FM, AD] },
  { dept: 'HR', label: 'HR', items: ['Leave record reconciled', 'Exit interview', 'Personal file complete'], signOffRoles: [HO, HH, AD] },
  { dept: 'LINE', label: 'Line manager', items: ['Handover of work & files', 'Customer / distributor handover', 'Company property'], signOffRoles: [LM, HH, AD], managerOnly: true },
];
```

### C.5 Competencies

```js
export const COMPETENCIES = [  // weightStaff / weightManager; anchors[0..4] for ratings 1..5
  { code: 'TEAM', name: 'Teamwork', weightStaff: 15, weightManager: 10, anchors: ['Withholds information, conflicts unresolved', 'Cooperates when asked', 'Shares information, supports colleagues, completes shared tasks', 'Proactively helps other teams, resolves conflicts', 'Builds cross-team collaboration; others seek them out'] },
  { code: 'INTEG', name: 'Integrity & Ethics', weightStaff: 20, weightManager: 15, gate: true, anchors: ['Proven breach of policy or honesty', 'Bends rules, needs monitoring', 'Follows policy, honest reporting, declares conflicts', 'Challenges unethical practice, protects company assets', 'Sets the ethical standard; zero audit findings in area'] },
  { code: 'COMM', name: 'Communication', weightStaff: 15, weightManager: 10, anchors: ['Unclear, frequent misunderstandings', 'Communicates reactively', 'Clear written/verbal updates, reports on time', 'Tailors message to audience, presents well', 'Influences stakeholders, represents company externally'] },
  { code: 'INIT', name: 'Initiative & Ownership', weightStaff: 15, weightManager: 10, anchors: ['Waits for instruction, blames others', 'Needs follow-up', 'Completes assigned work without follow-up, flags problems', 'Proposes improvements, implements at least one', 'Drives measurable improvements beyond own role'] },
  { code: 'CUST', name: 'Customer / Service Focus', weightStaff: 15, weightManager: 10, anchors: ['Complaints unresolved, discourteous', 'Slow responses', 'Responds within SLA, courteous', 'Anticipates needs, reduces complaints', 'Creates service standards adopted by others'] },
  { code: 'KNOW', name: 'Job Knowledge & Quality', weightStaff: 20, weightManager: 10, anchors: ['Repeated errors, cannot work unsupervised', 'Basic knowledge, errors need correction', 'Competent, accurate, meets quality standard', 'Expert, trains others, near-zero errors', 'Recognised subject expert across company'] },
  { code: 'LEAD', name: 'Leadership & People Development', weightStaff: 0, weightManager: 20, managerial: true, anchors: ['Team attrition high, no 1:1s', 'Delegates poorly', 'Sets goals, reviews on time, develops a successor', 'Team exceeds targets, retains talent', 'Builds leaders; team is the benchmark'] },
  { code: 'PLAN', name: 'Planning & Decision Making', weightStaff: 0, weightManager: 15, managerial: true, anchors: ['Misses deadlines, decisions reversed', 'Reactive planning', 'Realistic plans, timely sound decisions', 'Anticipates risks, data-driven decisions', 'Strategic contribution beyond department'] },
];
export const competencySet = (set) => COMPETENCIES.filter((c) => (set === 'manager' ? c.weightManager : c.weightStaff) > 0).map((c) => ({ code: c.code, name: c.name, weight: set === 'manager' ? c.weightManager : c.weightStaff }));
```

### C.6 KPI templates (`DEFAULT_KPI_TEMPLATES`, fixed ids; every weight set sums to 100; item defaults `thresholdPct '80'`, `stretchPct '120'`, `cap '120'`, `isGate false`, `source 'manual'`, `steps []`, `description` = one sentence stating the formula)

| id / code | name · designations | kpi/comp · set · attendanceMode | items: code · name · cat · unit · dir · target · method · weight · extra |
|---|---|---|---|
| tpl_so / TPL-SO | Sales Officer · SO | 80/20 · staff · kpi | SO-1 Primary sales value vs target · Financial · % · higher · 100 · A · 30; SO-2 Secondary sales vs target · Financial · % · higher · 100 · B · 15; SO-3 Collection within credit days · Financial · % · higher · 98 · E · 15 · steps [98→100, 95→80, 90→60]; SO-4 Productive calls per day · Operational · Nos · higher · 35 · B · 15; SO-5 Active outlets · Customer · Nos · higher · 450 · A · 15; SO-6 Market hygiene & reporting audit · Compliance · Score · higher · 90 · E · 10 · steps [90→100, 80→70, 70→40] |
| tpl_asm / TPL-ASM | Area Sales Manager · ASM, HOS | 60/40 · manager · gate | ASM-1 Area sales value vs target · Financial · BDT crore · higher · 36 · A · 30; ASM-2 Overdue > 60 days (% of sales) · Financial · % · lower · 1 · E · 15 · steps [1→100, 2→70, 3→40]; ASM-3 Team productivity (% SOs ≥ 90% target) · People · % · higher · 70 · B · 15; ASM-4 Distributor health · Operational · Score · higher · 5 · C · 15; ASM-5 Active outlet growth · Customer · % · higher · 8 · A · 15; ASM-6 Team attrition · People · % · lower · 10 · E · 10 · steps [10→100, 15→60, 20→30] |
| tpl_ae / TPL-AE | Accounts Executive · AE, HOF | 70/30 · staff (HOF → manager via `competencySetFor`) · gate | AE-1 Month-end closing (working day) · Operational · Days · lower · 5 · E · 20 · steps [5→100, 6→70, 7→40]; AE-2 Statutory filings on time · Compliance · % · higher · 100 · E · 20 · steps [100→100, 90→50] · isGate; AE-3 Voucher error rate · Operational · % · lower · 0.5 · B · 15; AE-4 Bank reconciliation by 5th · Operational · % · higher · 100 · E · 15 · steps [100→100, 90→60]; AE-5 Audit query closure within 7 WD · Compliance · % · higher · 100 · A · 15; AE-6 MIS delivered by 7th · Customer · % · higher · 100 · E · 15 · steps [100→100, 80→60] |
| tpl_po / TPL-PO | Procurement Officer · PO | 70/30 · staff · gate | PO-1 Cost saving vs last price · Financial · % · higher · 3 · B · 25; PO-2 PO cycle time (local) · Operational · Days · lower · 5 · B · 15; PO-3 Supplier on-time delivery · Operational · % · higher · 95 · B · 15; PO-4 Incoming rejection · Operational · % · lower · 1 · B · 10; PO-5 CS / 3-quotation compliance · Compliance · % · higher · 100 · E · 20 · steps [100→100, 95→60] · isGate; PO-6 Critical stock-outs · Customer · Nos · lower · 0 · E · 15 · steps [0→100, 1→50] |
| tpl_ps / TPL-PS | Production Supervisor · PS, PM, MO | 70/30 · staff · kpi | PS-1 Output vs plan · Operational · % · higher · 98 · B · 30; PS-2 Rejection / rework · Operational · % · lower · 1.5 · B · 15; PS-3 OEE · Operational · % · higher · 75 · B · 15; PS-4 Lost-time injuries · Compliance · Nos · lower · 0 · E · 15 · steps [0→100, 1→50] · isGate; PS-5 Material wastage · Financial · % · lower · 2 · B · 10; PS-6 Attendance & punctuality · People · Score · higher · 100 · A · 15 · source 'attendance' |
| tpl_hro / TPL-HRO | HR Officer · HRO, HOH | 70/30 · staff · gate | HR-1 Time-to-fill within SLA · Operational · % · higher · 100 · B · 20; HR-2 Payroll error lines · Operational · % · lower · 0.2 · B · 20; HR-3 Statutory compliance points closed · Compliance · % · higher · 100 · E · 20 · steps [100→100, 90→60] · isGate; HR-4 Training hours per employee · People · Hours · higher · 16 · A · 15; HR-5 Regret attrition · People · % · lower · 12 · B · 10; HR-6 Grievance TAT ≤ 15 days · Customer · % · higher · 100 · A · 15 |
| tpl_ito / TPL-ITO | IT Officer · ITO | 70/30 · staff · gate | IT-1 Tickets resolved within SLA · Operational · % · higher · 95 · B · 25; IT-2 Core system uptime · Operational · % · higher · 99.5 · E · 20 · steps [99.5→100, 99→70, 98→40] · isGate; IT-3 Backup success & restore test · Compliance · % · higher · 100 · E · 15 · steps [100→100, 95→50]; IT-4 Patching ≤ 30 days · Compliance · % · higher · 95 · E · 15 · steps [95→100, 85→60]; IT-5 Asset inventory accuracy · Operational · % · higher · 100 · A · 10; IT-6 User CSAT · Customer · Score · higher · 4.2 · A · 15 |
| tpl_drv / TPL-DRV | Driver · DRV | 70/30 · staff · kpi | DRV-1 At-fault accidents & fines · Compliance · Nos · lower · 0 · E · 25 · steps [0→100, 1→40] · isGate; DRV-2 Maintenance & daily checklist · Operational · % · higher · 100 · A · 15; DRV-3 Fuel efficiency · Financial · km/L · higher · 10 · B · 15; DRV-4 On-time trips · Customer · % · higher · 95 · B · 15; DRV-5 Documents & logbook valid · Compliance · % · higher · 100 · E · 15 · steps [100→100, 90→50]; DRV-6 Attendance & punctuality · People · Score · higher · 100 · A · 15 · source 'attendance' |
| tpl_prob / TPL-PROB | Probation review · all (cycleTypes ['Probation']) | 50/50 · staff · gate | PR-1 Onboarding & induction completed · People · Y/N · higher · 1 · D · 30; PR-2 Core role processes learned · Operational · Score · higher · 5 · C · 35; PR-3 Initial assignments delivered on time · Operational · Score · higher · 5 · C · 35 |

`templateFor(emp, templates, type)`: `type === 'Probation'` → the active template whose `cycleTypes` includes `'Probation'`; otherwise the active template whose `designationCodes` includes `emp.employment.designation` and `cycleTypes` includes `type`, else one whose `departmentCodes` includes the department, else `null`. `competencySetFor(emp, template, settings)` → `'manager'` when `settings.appraisal.managerialGrades` includes the grade, else `template.competencySet`.

### C.7 Calendar defaults (`DEFAULT_HOLIDAYS_2026`, editable)

`2026-02-21 Shaheed Day`, `2026-03-26 Independence Day`, `2026-03-19 Eid-ul-Fitr (approx.)`, `2026-03-20`, `2026-03-21`, `2026-04-14 Pahela Baishakh`, `2026-05-01 May Day`, `2026-05-26 Eid-ul-Adha (approx.)`, `2026-05-27`, `2026-05-28`, `2026-06-26 Ashura`, `2026-08-26 Eid-e-Milad-un-Nabi`, `2026-10-20 Durga Puja (Bijoya Dashami)`, `2026-12-16 Victory Day`, `2026-12-25 Christmas Day`. None falls on a counted day between 21 Oct and 1 Dec 2026, so the Jahangir deadline below is `2026-12-01`.

### C.8 Misc constants
`HR_SYSTEM = { id: 'hr_system', code: 'HR', name: 'HR System' }` (also exported from config so seed and store share it); `BD_BANKS = ['BRAC Bank', 'Eastern Bank', 'Dutch-Bangla Bank', 'City Bank', 'Islami Bank Bangladesh', 'Prime Bank', 'Mutual Trust Bank', 'bKash', 'Nagad']`; `WORK_LOCATIONS = ['Dhaka HQ', 'Narayanganj Factory', 'Gazipur Factory', 'Chattogram Office', 'Cumilla Depot', 'Field']`; `RELATIONS = ['Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other']`.

---

## D. `src/hr/helpers.js` — functions (signatures and algorithms)

Imports allowed: `../utils/helpers` (`uid, nowIso, addDays, addMonths, daysUntil, fmtDate, maskValue, emptyBankAccount`), `./config`. Private `num`, `round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100`, `pad2`.

### D.1 Dates, calendar, money

| Function | Returns / algorithm |
|---|---|
| `localToday()` | `YYYY-MM-DD` from local `getFullYear/getMonth/getDate` (never `toISOString`) |
| `hrToday(settings)` | `settings?.calendar?.asOfDate \|\| localToday()` |
| `daysBetween(a, b)` | `Math.round((Date.UTC(b) − Date.UTC(a)) / 86400000)` parsing `YYYY-MM-DD` as UTC (no DST drift) |
| `monthKey(date)` → `'2026-09'`; `daysInMonth(ym)`; `monthLabel(ym)` → `'Sep 2026'`; `lastMonths(n, asOf)` → previous `n` months, latest first; `monthRange(ym)` → `{ from, to }` | |
| `weekdayOf(date)` → `'Fri'` etc.; `isWeeklyOff(date, calendar)`; `isHoliday(date, calendar)`; `isWorkingDay(date, calendar)` | |
| `workingDaysInMonth(ym, calendar)` | count of working days |
| `addWorkingDays(date, n, calendar)` | step forward one day at a time from `date + 1`, counting working days, until `n` reached; returns `{ date, skipped }` |
| `workingDaysBetween(from, to, calendar)` | inclusive count of working days |
| `serviceLength(joinDate, lastWorkingDay, inclusive = false)` | `end = inclusive ? addDays(lwd, 1) : lwd`; Y/M/D = calendar difference from `joinDate` to `end` (years while `addMonths(join, 12y) <= end`, then months, then days). Returns `{ years, months, days, exactYears: years + months/12 + days/365, text: '7y 8m 0d' }`. Fixtures: join 2019-02-20 → LWD 2026-10-20, exclusive → 7y 8m 0d (inclusive → 7y 8m 1d); 2022-03-01 → 2026-08-31 exclusive → 4y 5m 30d (inclusive → 4y 6m 0d). |
| `completedYears(len, rounding)` | `'six_months'`: `years + (months > 6 \|\| (months === 6 && days > 0) ? 1 : 0)`; `'strict'`: `years` |
| `fmtMoney2(n)` | `'BDT 1,234.56'` (`toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`), `'—'` for `null/''` |
| `fmtPct(n, dp = 2)` | |

### D.2 Employee

| Function | Behaviour |
|---|---|
| `emptyEmployee(createdBy)` | B.2 |
| `migrateEmployee(raw)` | `base = emptyEmployee(raw.createdBy \|\| '')`; deep-merge each object key (`emergencyContact, nominee, employment (+probation), salary, bank, pf, tax, leave, absenceNotice, lastAppraisal`), arrays guarded with `Array.isArray` (`statusHistory, loans, disciplinary, documents, salary.history`) |
| `grossSalary(salary)` | sum of the 7 components |
| `compMonthly(salary, settings)` | `compWageBase === 'gross' ? gross : basic + dearness + adhoc` |
| `nextEmployeeCode(list)` | `EMP-${(max parsed \|\| 1000) + 1}` |
| `validateEmployee(e, settings)` | sentences: name, dob (age ≥ 18 at join), NID 10/13/17 digits, mobile 11 digits starting `01`, email format if present, department/designation/grade, joinDate, reporting manager (required unless designation MD), basic > 0, bank name + account no (unless payMode Cash), nominee name+relation when PF member, probation months when required, contractEndDate when Contractual, emergency contact name + mobile |
| `employeeCompleteness(e)` | % of 14 checks mirroring validate + ≥ 1 document |
| `findEmployeeDuplicates(e, all)` | `[{ employee, reasons }]` on NID, TIN, mobile, bank accountNo; skips self and Separated |
| `probationEndDate(e)` | `employment.probation.extended ? extendedTo : endDate` |
| `probationsDue(employees, withinDays, asOf)` | Probation employees with `daysUntil(end) <= withinDays` (incl. negative), sorted asc, `[{ employee, days }]` |
| `contractsExpiring(employees, withinDays, asOf)`; `expiringEmployeeDocuments(employees, withinDays, asOf)` → `[{ employee, doc, days }]`; `retirementsDue(employees, settings, withinDays, asOf)` (dob + retirementAge); `pfEligibilityDue(employees, settings, asOf)` (non-members past `eligibilityMonths`) | |
| `activeDisciplinary(e, from, to)` | records with `date` in `[from, to]` and `outcome !== 'Withdrawn'`; `worst(records)` → `'Final Warning' > 'Suspension' > 'Written Warning'` |
| `continuousServiceCheck(e, attendance, asOf)` | `{ months, daysWorked, ok: months < 12 \|\| daysWorked >= 240 }` over the last 12 attendance months (present + leave counted as worked) |
| `isHrRole(role)`; `hrScope(user, employees)` | HO/HH/FM/MD/AD → `all`; LM → `team` = self + `directReports(user.employeeId)`; EM → `self` |
| `canSeeSensitive(user, emp)` | `canHr(role,'viewSensitive') \|\| user.employeeId === emp.id` |
| `managerOf(emp, employees)`, `directReports(id, employees)`, `employeeName(id, employees)`, `visibleEmployees(employees, user)` | |
| `employeeInsights(e, ctx)` | `{ serviceText, probationDaysLeft, docsMissing, flags: [{ tone, text }] }` (probation ending, deemed-permanent risk when past end without decision, PF eligible but not member, passport/licence expiring, retirement within 12 months, duplicate bank, no nominee) |

### D.3 Leave & attendance

| Function | Behaviour |
|---|---|
| `countLeaveDays(from, to, halfDay, calendar, typeCfg)` | `typeCfg.countCalendarDays` ? calendar days : working days (skips offs/holidays); `halfDay` → 0.5 (from === to only) |
| `leaveEntitlement(emp, typeCfg, year, settings, attendance)` | `unlimited` → `null`; `entitlementOverride[code]` wins; service < `minServiceMonths` at 1 Jan → pro-rata from eligibility date (`annualDays × remainingMonths / 12`, round to 0.5); EL with `elAccrual === 'perDaysWorked'` → `floor(Σ present-days-in-year / elAccrualDivisor)`; joiners mid-year pro-rated by months |
| `leaveBalance(emp, typeCfg, year, requests, settings, asOf, attendance)` | `{ opening, entitlement, taken (Approved, overlapping year), pending, balance = min(opening + entitlement, cap) − taken, cap }`; EL cap `elCapDays` + `refusedBeyondCap[EL]` |
| `allLeaveBalances(emp, leaveTypes, …)`; `leaveApproverFor(emp)` → `reportingManagerId` or `''`; `nextLeaveCode(list)` → `LV-1001…` | |
| `validateLeaveRequest(req, emp, typeCfg, balance, requests, calendar)` | from ≤ to; days > 0; balance sufficient (unless `unlimited`); overlap with Pending/Approved; `maxConsecutive`; `genderOnly`; employee active |
| `approvedLeaveDaysInMonth(empId, ym, requests, calendar, leaveTypes)` | prefill for attendance |
| `emptyAttendance(empId, ym, calendar)`; `validateAttendance(rec)` (invariant B.4); `physicalAttendancePct(rec)` → `present / workingDays × 100` | |
| `attendanceSummary(empId, months[], attendance)` | `{ months, workingDays, present, late, unapproved, unapprovedRun, pct, avgLates }` (months without records excluded) |
| `attendanceKpi(summary, settings)` | `attScore` from `attendanceSteps` (first `pct >= min`), `punct` from `punctualitySteps` (first `avgLates <= maxLates`), `score = max(0, round2(w × attScore + (1−w) × punct − penalty × unapproved))` |
| `closeLeaveYear(employees, leaveTypes, requests, settings, asOf)` | pure: for each active employee and type with `carryForward`: `next = min(balance, carryCap)`; returns `{ employees: patched (leave.opening[code] = String(next)), details: { [empId]: 'EL 23 → 2027 opening 23; CL 4 → 0' } }` |

### D.4 KPI & appraisal

| Function | Behaviour |
|---|---|
| `validateTemplate(t)` | code/name; 1–10 items; weights 5–40 each, Σ = 100; target > 0 or method D/E; `thresholdPct < 100 < stretchPct`; method E ≥ 1 step; at most 1 `source: 'attendance'` item; `weights.kpi + weights.competency === 100` |
| `achievementPct(item, actual)` | `higher`: `actual / target × 100`; `lower`: `actual === 0 ? cap : target / actual × 100`; target 0 with `lower` → handled by method E |
| `scoreKpiLine(item, actual, settings)` | `actual === ''` → `{ ach: null, score: null }`. **A**: `clamp(ach, 0, cap)`. **B**: `ach < thr → 0; thr..100 → 50 + (ach − thr)/(100 − thr) × 50; 100..str → 100 + (ach − 100)/(str − 100) × 20; ≥ str → min(120, cap)`. **C**: `rating × 20`. **D**: `actual >= 1 ? 100 : clamp(actual × 100, 0, 100)` (0–1 fraction = milestone %). **E**: first step matching (higher `actual >= bound`, lower `actual <= bound`) → `score`; none → 0. `score = round2(raw)` |
| `buildAppraisal(emp, cycle, type, template, settings, by, code, asOf)` | copies template items (`kpis`), `competencySet(competencySetFor(...))`, `weights`, `attendanceMode`, period from cycle or `[joinDate, probationEnd]` (Probation), `due` from cycle or (`manager: end − 15d, hr: end − 7d, publish: end − 3d`), `managerId = reportingManagerId`, status `KPI Setting`, history entry |
| `generateAppraisals(cycle, employees, templates, settings, existing, by, asOf)` | eligible = active (Probation/Confirmed/On Notice) ∧ `joinDate <= periodTo − minServiceDays` ∧ template found ∧ no existing appraisal for `(employeeId, cycleId)`; returns `{ appraisals, skipped: [{ employee, reason }] }` with sequential codes |
| `applySystemActuals(apr, attendance, settings, force = false)` | if `!attendance.lockedAt \|\| force`: snapshot `attendanceSummary` over the period months → `apr.attendance`, and set `actualMgr = actualSelf = attendanceKpi.score` on `source === 'attendance'` items |
| `gateFlags(apr, emp, settings)` | from `activeDisciplinary` (Written → cap B, Final/Suspension → cap C), integrity effective rating ≤ `integrityMaxRating` → cap C, attendance pct < `attendanceBelowPct` → cap B, `unapproved > unapprovedAbsenceDays` → cap B (+ attendance item score 0 in kpi mode), any `isGate` item with score < `gateKpiFailBelow` → cap C |
| `bandFor(final, bands)`; `capGrade(code, cap, bands)` (lower of the two by band index); `recommendationFor(grade, bands)` → `{ recommendation, incrementPct, bonusMultiplier, pip }` | |
| `computeAppraisalScore(apr, emp, settings)` | returns a new appraisal: each kpi `{ ach, score, weighted: round2(score × weight / 100) }`; `kpi = min(100, round2(Σ weighted))` (sum of the **rounded** lines); competency effective rating = `hrRating \|\| mgrRating`; `competency = round2(Σ rating × 20 × weight / 100)`; `final = round2(kpi × weights.kpi/100 + competency × weights.competency/100)`; `gradeOriginal = bandFor(final)`; `gateFlags`; `gradeFinal = hr.gradeOverride \|\| capGrade(gradeOriginal, strictest cap)`; `computedAt` |
| `appraisalOwner(apr, employees)` | `{ stage, employeeId, name }`: KPI Setting/Manager Review/Returned → manager; Goals Agreed/Self/Published → employee; HR Review/Disputed → HR; else null |
| `appraisalDueDate(apr)`; `appraisalOverdue(apr, asOf)` → days > 0 or 0 | |
| `appraisalMode(apr, user, employees)` | `'kpi'` (KPI Setting ∧ (user is manager ∨ HH/AD)), `'agree'` (Goals Agreed ∧ self), `'self'` (Self-Assessment ∧ self), `'manager'` (Manager Review/Returned ∧ manager ∨ HH/MD/AD), `'hr'` (HR Review ∧ hrReview), `'ack'` (Published ∧ self), `'resolve'` (Disputed ∧ HH/AD), else `'read'`; `onBehalf` variant when HR role ∧ stage due passed ∧ mode would be agree/self/manager |
| `appraisalVisibility(apr, user)` | `{ managerFields: !(isSelf && status before Published), hrFields: isHrRole, selfFields: isSelf \|\| status ≥ Manager Review \|\| isHrRole }` |
| `myAppraisalQueue(appraisals, employees, user, asOf)` | appraisals whose owner is the user (self or managed) plus HR-stage ones for HR roles; `[{ appraisal, employee, days }]` |
| `appraisalDiff(prev, next)` | string[] of changed `actualMgr`, `score`, `mgrRating`, `hrRating`, `gradeOverride`, `recommendation`, `incrementPct` (`'SO-1 actual 92 → 90'`) |
| `validateAppraisalStage(apr, stage, settings)` | `kpi`: weights Σ 100, targets set, custom ≤ max; `self`: all manual actuals + self ratings; `manager`: all actuals, all mgr ratings, comment ≥ minChars for rating 1/5, recommendation; `hr`: calibrationNote when gradeOverride, hrRating within ±`hrAdjustMax` of mgrRating with hrComment; `publish`: scores computed, Probation → `probation.decision` |
| `probationOutcome(emp, apr, summary, settings)` | checks: score ≥ confirmScoreMin, pct ≥ attendanceMin, unapproved ≤ maxUnapproved, avgLates ≤ maxAvgLates, no disciplinary, integrity ≥ 3, PR-1 done; `suggestion`: all ok → `'Confirm'`; score ≥ extendScoreMin ∧ pct ≥ extendAttendanceMin ∧ !extended → `'Extend'`; else `'Not confirm'` |
| `gradeDistribution(appraisals, bands, key = 'gradeFinal')` → `[{ code, count, pct, guidedPct }]`; `nextAppraisalCode(list)` → `APR-1001…`; `nextCycleCode(year, type)` | |

### D.5 Settlement

| Function | Behaviour |
|---|---|
| `nextSettlementCode(list)` → `FS-1001…`; `defaultClearance()` from `CLEARANCE_DEPARTMENTS`; `emptySettlement(emp, by, settings, asOf)` (B.5, nominee copied, `previousStatus = emp.status`); `migrateSettlement(raw)` | |
| `lawVersionFor(sep, settings)` | A.2 #11 |
| `isPermanent(emp, sep)` | `employmentType === 'Permanent' && !sep.probationer` (a probationer kept past probation end is deemed permanent: `asOf > probationEnd` → permanent) |
| `noticeRequiredDays(emp, type, settings, flags)` | Resignation: permanent → `workerPermanent`; temporary/contract → monthly/other; probationer → `notice.probation`. Termination: permanent monthly → 120 / other → 60; temporary → 30/14; `workCompleted` → 0; probationer → `notice.probation`. Retrenchment → `afterLayoff ? 0 : retrenchment`. Discharge/Dismissal/Retirement/Death → the respective setting. End of Contract → `contractExpiry`. Deemed Resignation → `workerPermanent` (shortfall = full) |
| `noticeServedDays(noticeDate, lwd)` | `max(0, daysBetween(noticeDate, lwd))`; `''` → 0 |
| `settlementDeadline(lwd, settings)` | `addWorkingDays(lwd, deadlineWorkingDays, calendar)` |
| `settlementInputsFrom(emp, ctx)` | prefill: `elBalanceDays` from EL balance, PF fields from `emp.pf`, `loanRecovery = Σ loans.outstanding`, `ytdIncome/ytdTaxPaid/bonusPaidThisYear` from `emp.tax`, `groupInsurance ''` |
| `validateSeparation(sep, emp, settings, asOf)` | type; reason (≥ 10 chars) except Retirement/End of Contract; LWD ≥ noticeDate; employee active and no open settlement; Dismissal → disciplinary record `'Dismissal Enquiry'` with showCause + enquiry dates and `misconductClause`; Death → `deathAtWork` boolean set, nominee name; Retirement → age ≥ retirementAge at LWD (warn only); End of Contract → `contractEndDate`; Deemed Resignation → `absenceNotice.secondNoticeOn` set; `payInLieuDays ≤ required` |
| `requiresManagementApproval(sep, emp, totals, settings)` | type ∈ `managementApprovalTypes` ∨ grade ∈ `managementApprovalGrades` ∨ `totals.netPayable > managementApprovalAbove` |
| `nextSettlementStatus(sep, emp, settings)` | HR_APPROVAL → FINANCE_APPROVAL → (MGMT_APPROVAL if required) → APPROVED |
| `canSignClearance(row, sep, emp, user)` | `canHr(role,'clearanceSignOff') && row.signOffRoles.includes(role) && (!row.managerOnly \|\| role !== LM \|\| user.employeeId === emp.employment.reportingManagerId)` |
| `settlementReady(sep, emp, settings)` | `{ ok, reasons }`: all 5 rows signed; statement frozen and `computedAt >= last input change (updatedAt)`; `inputs.assetRecovery > 0 → assetShowCauseIssued`; Death → payee nominee present; bank verified (warn only) |
| `canApproveStage(sep, stage, user)` | permission for stage ∧ `user.name !== statement.computedBy` ∧ not in `approvals.filter(Approved).map(by)` for this round |
| `mySettlementQueue(settlements, employees, user, settings)` | rows whose current stage the user can act on (clearance rows signable, approval stage permitted, pay permitted) |
| `settlementsOverdue(settlements, settings, asOf)` | open ∧ `deadline < asOf` |
| `estimateTds({ ytdIncome, settlementTaxable, ytdTaxPaid, category }, settings)` | `income = ytd + taxable`; `exempt = min(income / exemptionDivisor, exemptionCap)`; `taxable = max(0, income − exempt)`; `threshold = thresholds[category]`; `above = max(0, taxable − threshold)`; walk slabs; `tax = above > 0 ? max(slabTax, minimumTax) : 0`; `tds = max(0, round2(tax − ytdTaxPaid))`; returns `{ income, exempt, taxable, tax, tds, lines }` |

**`computeSettlement(emp, sep, settings, ctx = { asOf, attendance, leaveBalances })`** → `{ meta, lines, totals, flags, lawVersion, skippedDays }`:

1. `law = lawVersionFor(sep, settings)`; `rounding = inputs.roundingOverride || statutory.partialYearRounding`; `len = serviceLength(joinDate, lwd, countLastDayInclusive)`; `CY = completedYears(len, rounding)`; `y = len.exactYears`.
2. Rates (unrounded until line level): `compMonthlyAmt = compMonthly(salary)`; `W = compMonthlyAmt / daysPerMonth`; `gross`; `grossDaily = gross / daysPerMonth`; `basicDaily = basic / daysPerMonth`; `leaveDaily = encashRateBase === 'gross' ? grossDaily : W`; `shortfallDaily = noticeShortfall.base === 'gross' ? grossDaily : W`; `gratuityDaily = gratuity.wageBase === 'gross' ? grossDaily : basicDaily`.
3. Final month: `dim = daysInMonth(lwd)`, `served = day(lwd)`; `salary = finalMonthSalaryPaid ? 0 : gross × served / dim` (Rule 114). Each component is also reported in `meta.finalMonthComponents`.
4. Earnings lines (key · label · citation): `salary` · `Salary 1–${served} ${monthLabel} (pro-rata)` · r.114; `arrears`, `overtime`, `reimbursement`, `otherPayable` · as entered; `leaveEncash` · `${days} days × ${leaveDaily}` · s.11, s.119 (0 unless `leave.encashOnExit`; days = `inputs.elBalanceDays`); `bonus` · per `bonus.prorataOnExit` (`none` → 0; `months_since_last` → `basic × monthsSinceLastFestival / 6`; `accrual` → `2 × basic / 12 × monthsServedInYear`) · r.111(5), 0 if `bonusPaidThisYear` and mode `none`; `performanceBonus` · as entered (page enables only with Closed appraisal grade ≥ B); `noticePay` · employer-initiated ∧ `payInLieu` → `(payInLieuDays || required) × W` · s.26(3)/s.20(2); `compensation` (see 5); `groupInsurance` · Death only · s.99.
5. Compensation (`permanentOnly` ∧ !isPermanent → 0 with flag; `!applyToNonWorkers` ∧ Non-worker → 0 with flag; `y < minServiceYears` → 0 for Retrenchment/Discharge/Dismissal; Death uses `deathMinServiceYears[law]`):
   - Resignation / Deemed: tier = first of `(law === 'pre_2025' ? resignationTiersPre2025 : resignationTiers)` where `upToYears == null || (inclusive ? y <= upToYears : y < upToYears)`; `days = tier.days`; `comp = days × W × CY`; label `Resignation benefit s.27(4)(${tierLetter})`.
   - Termination 30 · s.26(4); Retrenchment 30 (+`retrenchmentAfterLayoffExtraDays × W` as separate line `layoffExtra` when `afterLayoff`) · s.20(2)(c); Discharge 30 · s.22(2); Dismissal 15 · s.23(3) **unless** `misconductClause ∈ forfeitOnMisconductClauses` → 0 with flag; Retirement 30 · s.28(3); Death `deathAtWork ? 45 : 30` · s.19; End of Contract 0; probationer 0.
   - Gratuity: if `gratuity.schemeEnabled`: `gDays = y > 10 ? daysPerYearAfter10 : daysPerYear`; `grat = gDays × gratuityDaily × CY` (0 when Dismissal with forfeiting clause). If `compareWithCompensation` ∧ (type ≠ Resignation ∨ `resignationGratuityCompareAllTiers` ∨ tier is last) ∧ `grat > comp` → line becomes `Gratuity (higher than statutory compensation)` · s.2(10); else compensation line with `meta.gratuityAlt = grat`.
6. Deductions: `noticeShortfall` · `max(0, required − served − waived) × shortfallDaily` only for Resignation/Deemed (0 when `!setoffAllowed`) · s.27(3), s.14(3); `pfEmployee` · `member ? employeeRatePct% × basic × served/dim : 0` (0 if `finalMonthSalaryPaid`) · s.264(9); `loanRecovery` · as entered · s.125(2); `assetRecovery` · as entered (0 + danger flag when `assetRecoveryRequiresShowCause` ∧ !showCauseIssued) · s.125(2)(c), s.127; `absence` · `absenceDays × compMonthly/30` · r.115; `otherDeduction`; `tax` · `taxOverride !== '' ? taxOverride : estimateTds({ ytdIncome, settlementTaxable: Σ earnings − (fundApproved ? gratuityPart : 0), ytdTaxPaid, category }).tds` · ITA 2023 s.86.
7. PF section (shown only if `pf.member`): `pfOwn = ownBalance + pfEmployeeLine`; `vested = vestOnDeath && Death ? 1 : (y >= vestingYears && pfMembershipYears >= 1 ? 1 : 0)`; `vested = 0` additionally when Dismissal ∧ `forfeitOnDismissal`; `pfEmployer = (employerBalance + pfEmployeeLine) × vested` (employer matches at `employerRatePct`; when rates differ use `employerRatePct% × basic × served/dim`); `pfInterest`; `pfAdvance = −advanceOutstanding` when `advanceSetoff`; `pfNet`.
8. Totals: `earnings`, `deductions`, `netPayable = earnings − deductions`, `pfNet`, `totalToEmployee = netPayable + pfNet` — every line `round2` first, totals summed from rounded lines.
9. `meta`: `{ serviceText, exactYears, completedYears, rounding, law, W, grossDaily, leaveDaily, noticeRequired, noticeServed, noticeWaived, shortfallDays, permanent, workerCategory, deadline, skippedDays, tax: estimate object, payee }`.
10. `flags` (`{ tone, text }`): non-worker policy floor (info); shortfall recovered (info); TDS is an estimate (info); clearance dues found (info, from `clearance[].recoverable`); show-cause missing (danger); dismissal forfeiture (warn); continuous-service < 240 days (warn); deadline passed (danger when `asOf > deadline` and not Paid); pro-rata appraisal bonus eligible (info); death → payee nominee (info).

### D.6 Reminders and nav counts

`hrReminders(state, user, asOf)` → `[{ kind, tone, text, to, employeeId, days }]` kinds: `probation` (due ≤ 30 d or overdue → danger), `deemedPermanent` (past end, no decision), `contract`, `document`, `appraisalOverdue`, `settlementDeadline`, `exitDatePassed` (On Notice ∧ LWD ≤ asOf), `leavePending` (> 3 working days), `pfEligible`, `retirement` (≤ 365 d), `absenceNotice` (`unapprovedRun >= 10` last month ∧ no notice), `pipDue`. Filtered by `hrScope`.

`hrNavCounts(state, user, asOf)` → `{ employees: probationsDue(30) + drafts, appraisals: myAppraisalQueue.length, leave: pending visible to me (approver = my employee, or all for HO/HH/AD, own for EM), settlements: mySettlementQueue.length, reminders: hrReminders.length }`.

---

## E. Store — `src/store/StoreContext.jsx`

### E.1 Imports, users, initial state, load
```js
import { HR_SYSTEM, HR_USERS } from '../hr/config';
import { appraisalDiff, closeLeaveYear, migrateAppraisal, migrateEmployee, migrateHrSettings, migrateSettlement, nextAppraisalCode, nextEmployeeCode, nextLeaveCode, nextSettlementCode } from '../hr/helpers';
import { seedHr, seedHrAudit } from '../hr/seed';
export const ALL_USERS = [...USERS, ...KYS_USERS, ...HR_USERS];
const AUDIT_CAP = 4000;
const byAtDesc = (a, b) => new Date(b.at) - new Date(a.at);
```
`buildInitial()`: `const hr = seedHr();` → returns `{ currentUserId: 'u1', customers, customerTypes, suppliers, supplierTypes, ...hr, audit: [...seedAudit(customers), ...seedSupplierAudit(suppliers), ...seedHrAudit(hr)].sort(byAtDesc) }` where `hr = { employees, kpiTemplates, appraisalCycles, appraisals, leaveTypes, leaveRequests, attendance, settlements, hrSettings }`.

`load()` — inside the existing `if (parsed && Array.isArray(parsed.customers))` block, after the supplier lines:
```js
const hrStale = !parsed.hrSettings || (parsed.hrSettings.schemaVersion || 0) < fresh.hrSettings.schemaVersion;
const hrPart = hrStale ? { employees: fresh.employees, kpiTemplates: fresh.kpiTemplates, appraisalCycles: fresh.appraisalCycles, appraisals: fresh.appraisals, leaveTypes: fresh.leaveTypes, leaveRequests: fresh.leaveRequests, attendance: fresh.attendance, settlements: fresh.settlements, hrSettings: fresh.hrSettings }
  : { employees: Array.isArray(parsed.employees) ? parsed.employees.map(migrateEmployee) : fresh.employees,
      kpiTemplates: Array.isArray(parsed.kpiTemplates) ? parsed.kpiTemplates : fresh.kpiTemplates,
      appraisalCycles: Array.isArray(parsed.appraisalCycles) ? parsed.appraisalCycles : fresh.appraisalCycles,
      appraisals: Array.isArray(parsed.appraisals) ? parsed.appraisals.map(migrateAppraisal) : fresh.appraisals,
      leaveTypes: Array.isArray(parsed.leaveTypes) ? parsed.leaveTypes : fresh.leaveTypes,
      leaveRequests: Array.isArray(parsed.leaveRequests) ? parsed.leaveRequests : fresh.leaveRequests,
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : fresh.attendance,
      settlements: Array.isArray(parsed.settlements) ? parsed.settlements.map(migrateSettlement) : fresh.settlements,
      hrSettings: migrateHrSettings(parsed.hrSettings) };
const audit = hrStale ? [...(parsed.audit || []).filter((a) => a.portal !== 'hr'), ...seedHrAudit(hrPart)].sort(byAtDesc) : parsed.audit;
return { ...fresh, ...parsed, customers: …, suppliers: …, supplierTypes: …, ...hrPart, audit };
```

### E.2 Audit helpers
```js
const audit = (state, entity, action, by, detail = '', portal = 'kyc', extra = {}) => [
  { id: uid('aud'), portal, customerId: entity.id, customerCode: entity.code || '(draft)', businessName: portal === 'kyc' ? entity.businessName : entity.name, action, by, at: nowIso(), detail, ...extra },
  ...state.audit,
].slice(0, AUDIT_CAP);
const hrAudit = (state, emp, action, by, detail = '', ref = null) => audit(state, { id: emp.id, code: emp.code, name: emp.name }, action, by, detail, 'hr', ref ? { refId: ref.id, refCode: ref.code } : {});
const empOf = (state, id) => state.employees.find((e) => e.id === id);
const pushHistory = (rec, status, by, note = '') => ({ ...rec, history: [...(rec.history || []), { status, at: nowIso(), by, note }] });
```
Entry fields are unchanged for KYC/KYS (`businessName` ternary now `portal === 'kyc' ? … : …`, same result). `refId`/`refCode` are additive.

### E.3 Reducer — `// ------------------------------------------------------------------ HR`

| type | payload | behaviour | audit |
|---|---|---|---|
| `UPSERT_EMPLOYEE` | `employee, by, action?, detail?` | insert head / `replaceIn`, `updatedAt`; if existing ∧ status ≠ Draft ∧ any salary component changed → push `salary.history` entry `{ id: uid('sal'), effectiveFrom: employee.salary.effectiveFrom, …components, gross, reason: a.detail, by, at }` | `exists ? a.action \|\| 'Updated' : 'Created'`; detail default `'Record updated'` / `'Employee record created'` |
| `DELETE_EMPLOYEE` | `id, by` | only Draft | `'Deleted'`, `'Draft discarded'` |
| `EMPLOYEE_TRANSITION` | `id, status, by, label?, reason?, detail?, patch?, appraisal?, asOf` | `next = { ...cur, status, statusReason: reason \|\| '', updatedAt }`, push `statusHistory`; leaving Draft → `code = nextEmployeeCode`, `employment.probation.endDate = addMonths(joinDate, months)` when → Probation, `confirmationDate = joinDate` when Draft → Confirmed; → Confirmed from Probation: `confirmationDate = patch?.confirmationDate \|\| probationEnd`, `probation.decision = 'Confirm'`; → Under Suspension: `suspendedFrom = cur.status`; reinstate → `patch.status` provided by page (= `suspendedFrom`); → Separated: `separatedAt = patch?.separatedAt \|\| asOf`; apply `patch` last. If `a.appraisal` present (page-built Probation appraisal) insert it at head of `appraisals` | `a.label \|\| a.status`, detail `a.reason \|\| a.detail \|\| ''`; plus `'Probation Review Created'` (ref = appraisal) when inserted |
| `HR_LOG` | `employeeId, action, by, detail, ref?` | audit only (employeeId `'hr_system'` allowed) | `a.action` |
| `SET_KPI_TEMPLATES` | `kpiTemplates, by` | replace | HR_SYSTEM `'KPI Templates Changed'`, detail `` `${n} templates` `` |
| `SET_LEAVE_TYPES` | `leaveTypes, by` | replace | HR_SYSTEM `'Leave Types Changed'` |
| `SET_HR_SETTINGS` | `hrSettings, by, detail?` | replace (keeps `schemaVersion`) | HR_SYSTEM `'Settings Changed'`, detail = page-computed list of changed keys |
| `UPSERT_CYCLE` | `cycle, by` | insert/replace, `updatedAt` | HR_SYSTEM `'Cycle Saved'`, detail `` `${code}: ${name} (${status})` `` |
| `OPEN_CYCLE` | `id, by, appraisals` | cycle `status: Open, openedAt`; prepend `a.appraisals` | per appraisal `'Appraisal Created'` (emp, ref) detail `` `${code}: ${cycle.name}` ``; HR_SYSTEM `'Cycle Opened'` |
| `CLOSE_CYCLE` | `id, by` | cycle Closed, `closedAt`; appraisals of cycle with status Published/Acknowledged → Closed (+history); copy `lastAppraisal = { code, cycle: cycle.code, grade: scores.gradeFinal, final: scores.final, at }` to each employee; if `gradeFinal === 'D'` → `rehireEligible: false`. **Never touches `disciplinary`.** | per appraisal `'Appraisal Closed'`; HR_SYSTEM `'Cycle Closed'` |
| `UPSERT_APPRAISAL` | `appraisal, by, detail?` | replace (`updatedAt`); the page passes an already-computed object (`computeAppraisalScore`) | `'Appraisal Updated'` (emp, ref), detail `a.detail \|\| appraisalDiff(prev, next).join('; ') \|\| 'Lines saved'` |
| `APPRAISAL_TRANSITION` | `id, status, by, label?, reason?, patch?, detail?, onBehalf?` | `next = { ...cur, ...patch, status, statusReason: reason \|\| '' }`, push `history { status, at, by, note: reason \|\| detail }`; stamps: → Manager Review `self.submittedAt`; → HR Review `manager.submittedAt/by`; → Published `hr.reviewedAt/by`; → Acknowledged/Disputed `acknowledgement.at/by`; Disputed → Published `dispute.resolvedAt/by`. No cross-collection effect. | `a.label \|\| a.status` (emp, ref), detail `` `${code}: ${reason \|\| detail \|\| ''}${onBehalf ? ' (on behalf — deadline passed)' : ''}` `` |
| `UPSERT_LEAVE_REQUEST` | `request, by` | new → `code = nextLeaveCode`, status Pending, `requestedAt`; existing (Pending only) replace | `'Leave Requested'` / `'Leave Request Updated'` (emp, ref), detail `` `${code}: ${typeCode} ${from} → ${to} (${days}d)` `` |
| `LEAVE_DECISION` | `id, status, by, comment?` | set status + `decision { by, at, comment }` | `'Leave Approved'` / `'Leave Rejected'` / `'Leave Cancelled'`, detail `` `${code}: ${comment}` `` |
| `UPSERT_ATTENDANCE` | `records: [], by, reason?` | for each record replace by `(employeeId, month)` else insert; `enteredBy, updatedAt`; records with `locked` need `a.reason` (reducer appends reason to detail) | one entry per record `'Attendance Recorded'`, detail `` `${month}: WD${workingDays} P${present} A${absent} L${late} Lv${leave}${reason ? ' — ' + reason : ''}` `` |
| `CLOSE_LEAVE_YEAR` | `by, asOf` | `closeLeaveYear(...)` → replace employees, `hrSettings.leave.year += 1` | per employee `'Leave Carried Forward'` with details; HR_SYSTEM `'Leave Year Closed'` |
| `INITIATE_SEPARATION` | `settlement, by, asOf` | `code = nextSettlementCode`, status Initiated, history; employee → `status: On Notice` (statusHistory, `separationId`, `rehireEligible: settlement.rehireEligible`); open appraisals of the employee: cancel (`statusReason 'Separation initiated'`) unless pro-rata rule (A.2 #25) → set `proRata: true` | `'Separation Initiated'` (emp, ref) detail `` `${code}: ${type}, LWD ${lwd}` ``; `'Appraisal Cancelled'` per cancelled |
| `UPSERT_SETTLEMENT` | `settlement, by, action?, detail?` | replace, `updatedAt` (used for inputs edits `'Settlement Updated'`, clearance `'Clearance Signed'`, freezing `'Dues Computed'`, certificate `'Service Certificate Issued'`, documents `'Document Changed'`) | `a.action \|\| 'Settlement Updated'` (emp, ref) |
| `SETTLEMENT_TRANSITION` | `id, status, by, label?, reason?, patch?, detail?, approval?, asOf` | guard: if `a.approval` and `canApproveStage` fails → return `state`. `next = { ...cur, ...patch, status, statusReason }`, history; `approval` → push `{ ...approval, by, at }`; → Pending HR Approval ∧ employee On Notice ∧ `lwd <= asOf` → employee Separated (`separatedAt = lwd`); → Paid → `payment = patch.payment`, employee Separated if not yet; → Withdrawn → employee `previousStatus`, `separationId ''`; → On Hold → `hold { reason, at, by }` | `a.label \|\| a.status` (emp, ref), detail `` `${code}: ${reason \|\| detail \|\| ''}` ``; plus `'Exit Completed'` / `'Separation Withdrawn'` when the employee changes |
| `RESET` | — | unchanged |

Provider value unchanged. Persist effect unchanged.

---

## F. Routes, navigation and shared files

### F.1 `src/App.jsx`
`import { canHr } from './hr/config';` Guard: `const ok = portal === 'kys' ? canKys(role, action) : portal === 'hr' ? canHr(role, action) : can(role, action);`. Imports (HR group, alphabetical): `AppraisalCycles, AppraisalForm, AppraisalList, EmployeeDetail, EmployeeForm, EmployeeList, HrDashboard, HrReminders, HrReports, HrSettings, KpiTemplates, LeaveQueue, SettlementDetail, SettlementNew, SettlementQueue` from `./pages/hr/*`.
```jsx
<Route path="hr" element={<Layout portal="hr" />}>
  <Route index element={<HrDashboard />} />
  <Route path="employees" element={<EmployeeList />} />
  <Route path="employees/new" element={<Guard portal="hr" action="create"><EmployeeForm /></Guard>} />
  <Route path="employees/:id" element={<EmployeeDetail />} />
  <Route path="employees/:id/edit" element={<Guard portal="hr" action="edit"><EmployeeForm /></Guard>} />
  <Route path="kpi" element={<KpiTemplates />} />
  <Route path="cycles" element={<AppraisalCycles />} />
  <Route path="appraisals" element={<AppraisalList />} />
  <Route path="appraisals/:id" element={<AppraisalForm />} />
  <Route path="leave" element={<LeaveQueue initialTab="requests" />} />
  <Route path="attendance" element={<LeaveQueue initialTab="attendance" />} />
  <Route path="settlements" element={<SettlementQueue />} />
  <Route path="settlements/new" element={<Guard portal="hr" action="separationInitiate"><SettlementNew /></Guard>} />
  <Route path="settlements/:id" element={<SettlementDetail />} />
  <Route path="reminders" element={<HrReminders />} />
  <Route path="reports" element={<Guard portal="hr" action="reports"><HrReports /></Guard>} />
  <Route path="audit" element={<Guard portal="hr" action="audit"><AuditLog portal="hr" /></Guard>} />
  <Route path="settings" element={<Guard portal="hr" action="settings"><HrSettings /></Guard>} />
  <Route path="*" element={<Navigate to="/hr" replace />} />
</Route>
```

### F.2 `src/components/Layout.jsx`
- `TITLES.hr = { '': 'Dashboard', employees: 'Employees', kpi: 'KPI Templates', cycles: 'Appraisal Cycles', appraisals: 'Appraisals', leave: 'Leave', attendance: 'Attendance', settlements: 'Final Settlement', reminders: 'Reminders & Due Dates', reports: 'Reports', audit: 'Audit Trail', settings: 'HR Settings' }`.
- Module scope: `const ADMINS = USERS.filter((u) => u.role === ROLES.ADMIN); const PORTALS = { kyc: { title: 'KYC Portal', sub: 'Customer onboarding & verification', users: USERS, can, fallback: 'KYC' }, kys: { title: 'KYS Portal', sub: 'Supplier qualification & monitoring', users: [...KYS_USERS, ...ADMINS], can: canKys, fallback: 'KYS' }, hr: { title: 'HR Portal', sub: 'Know your employee · KPI · leave · settlement', users: [...HR_USERS, ...ADMINS], can: canHr, fallback: 'HR' } };`
- In component: `const P = PORTALS[portal]; const portalUsers = P.users; const allow = (action) => P.can(role, action);` keep `isKys` for the existing KYC/KYS nav JSX (wrapped in `{portal !== 'hr' && (<>…</>)}`); HR nav block exactly:
```jsx
{portal === 'hr' && (<>
  <NavLink to={base} end>📊 Dashboard</NavLink>
  <NavLink to={`${base}/employees`} end>🧑‍💼 Employees{hc.employees > 0 && <span className="nav-count">{hc.employees}</span>}</NavLink>
  {allow('create') && <NavLink to={`${base}/employees/new`}>➕ New Employee</NavLink>}
  <div className="nav-section">Performance</div>
  <NavLink to={`${base}/kpi`}>🎯 KPI Templates</NavLink>
  <NavLink to={`${base}/cycles`}>📅 Appraisal Cycles</NavLink>
  <NavLink to={`${base}/appraisals`}>📝 Appraisals{hc.appraisals > 0 && <span className="nav-count">{hc.appraisals}</span>}</NavLink>
  <div className="nav-section">Workflows</div>
  <NavLink to={`${base}/leave`}>🏖️ Leave{hc.leave > 0 && <span className="nav-count">{hc.leave}</span>}</NavLink>
  <NavLink to={`${base}/attendance`}>🕒 Attendance</NavLink>
  <NavLink to={`${base}/settlements`}>🧾 Final Settlement{hc.settlements > 0 && <span className="nav-count">{hc.settlements}</span>}</NavLink>
  <NavLink to={`${base}/reminders`}>🔔 Reminders{hc.reminders > 0 && <span className="nav-count">{hc.reminders}</span>}</NavLink>
  <div className="nav-section">Insight</div>
  {allow('reports') && <NavLink to={`${base}/reports`}>📈 Reports</NavLink>}
  {allow('audit') && <NavLink to={`${base}/audit`}>🧾 Audit Trail</NavLink>}
  {allow('settings') && <NavLink to={`${base}/settings`}>⚙️ HR Settings</NavLink>}
  <div className="nav-section">Portal</div><NavLink to="/">⇄ Switch portal</NavLink>
</>)}
```
`const hc = portal === 'hr' ? hrNavCounts(state, currentUser, hrToday(state.hrSettings)) : null;` (computed in a `useMemo` on `[state, currentUser, portal]`). Portal switch: three buttons `KYC / KYS / HR`, `on` when `portal === key`. Brand `P.title` / `P.sub`; `title = TITLES[portal][segment] || P.fallback`; role chip `role === ROLES.ADMIN ? 'Full access' : role`; reset confirm `'Reset all demo data (all portals) to the seeded sample?'`.

### F.3 `src/pages/Portal.jsx`
Third card `{ to: '/hr', icon: '🧑‍💼', title: 'HR · Know Your Employee', text: 'Employee master files, KPI-based appraisal cycles, leave and attendance, and Labour Act-compliant final settlement with clearance and approvals.', stats: [`${active} employees`, `${openAppraisals} appraisals open`, `${settlementsOpen} settlements open`], tone: 'var(--purple)' }`; `grid-2` → `grid-3`; `maxWidth: 1180`; subtitle "All three portals share the same roles framework, document handling, audit trail and scheduling."

### F.4 `src/components/ui.jsx`
- `import { HR_STATUS_COLORS } from '../hr/config'; const ALL_STATUS_COLORS = { ...STATUS_COLORS, ...SUPPLIER_STATUS_COLORS, ...HR_STATUS_COLORS };`
- New exports: `GradeBadge({ grade, bands })` (tone from `bands.find(code).tone`, empty → gray `Not graded`, text `` `${code} · ${name}` ``); `RatingPills({ value, onChange, disabled, anchors = [] })` (`.rating-pills` of five `.chip` buttons, `on` when `String(value) === String(n)`, `title = anchors[n-1]`, keyboard: ArrowLeft/Right change value, `role="radiogroup"`); `ScoreBar({ value, max = 100 })`; `ReasonModal({ title, label = 'Reason (recorded in the audit trail)', danger, confirmLabel = 'Confirm', onConfirm, onClose })` (generic reason capture: textarea required, `onConfirm(reason)`).

### F.5 `src/pages/AuditLog.jsx`
`const base = { kyc: '/kyc/customers', kys: '/kys/suppliers', hr: '/hr/employees' }[portal]; const entityLabel = { kyc: 'Customer', kys: 'Supplier', hr: 'Employee' }[portal];` user select options from `[...new Set(entries.map((a) => a.by))].sort()`; cell: `a.customerId === 'hr_system' ? <span>{a.businessName}</span> : <Link …>`; show `a.refCode` as a second `small mono` line when present; search also matches `refCode`.

### F.6 Other shared edits (integration unit)
- `src/pages/Dashboard.jsx` line 130: `audit.filter((a) => (a.portal || 'kyc') === 'kyc').slice(0, 7)`; `src/pages/CustomerDetail.jsx` line 46: add `(a.portal || 'kyc') === 'kyc' &&`.
- `src/main.jsx`: `import { runHrSelfTest } from './hr/selfTest'; if (import.meta.env.DEV) { const r = runHrSelfTest(); r.results.filter((x) => !x.ok).forEach((x) => console.assert(false, `HR self-test failed: ${x.name}`, x)); }`
- `src/components/reportBits.jsx` (new): `export const TONE = { gray:'#5b6675', blue:'#2a62c7', indigo:'#4b4fc4', purple:'#7a3fb3', green:'#1e7e4b', amber:'#b26a00', red:'#c62828' }; export const BarList({ rows, color })` (same markup as KYS); `export const toCsv(rows)`; `export const exportCsv(rows, fileName)`.
- `index.html` title `KYC / KYS / HR Portal`. `README.md`: HR portal section (modules, roles & users table, Labour Act defaults, demo clock, self-test, "switch user to act as another role").
- `src/styles.css` (append only):
```css
.stat.tone-purple .stat-value { color: var(--purple); } .stat.tone-indigo .stat-value { color: var(--indigo); }
.rating-pills { display: flex; gap: 6px; } .rating-pills .chip { min-width: 34px; justify-content: center; cursor: pointer; }
.att-grid input { width: 64px; text-align: right; }
.statement { background: #fff; padding: 32px; max-width: 860px; margin: 0 auto; border: 1px solid var(--border); border-radius: var(--radius); color: #111; }
.statement h2 { margin: 0 0 4px; } .statement .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 18px; font-size: 13px; margin: 14px 0 18px; }
.statement table { width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 14px; } .statement th, .statement td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.statement td.amount, .statement th.amount { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.statement tr.section td { background: var(--surface-2); font-weight: 600; } .statement tr.total td { font-weight: 700; border-top: 2px solid #111; }
.statement tr.zero td { color: var(--muted); } .statement .cite { color: var(--muted); font-size: 12px; }
.statement .sign { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 40px; font-size: 12px; page-break-inside: avoid; } .statement .sign div { border-top: 1px solid #111; padding-top: 6px; }
.statement .box { border: 1px solid var(--border); padding: 10px 12px; margin: 10px 0; font-size: 12.5px; page-break-inside: avoid; }
@media print { .statement { border: none; box-shadow: none; padding: 0; max-width: none; } .statement tr.zero { display: none; } .statement table { page-break-inside: auto; } .statement tr { page-break-inside: avoid; }
  .no-print, .tabs, .page-head, .alert { display: none !important; } .statement-print .card:not(.statement-wrap) { display: none !important; } .statement-wrap { border: none; box-shadow: none; } }
```

---

## G. Pages (`src/pages/hr/`)

Conventions: `const { state, dispatch, currentUser, notify } = useStore(); const role = currentUser.role; const by = currentUser.name; const settings = state.hrSettings; const asOf = hrToday(settings); const scope = useMemo(() => hrScope(currentUser, state.employees), …);`. Wrapper `stack → page-head → cards`; absolute links; `useSearchParams` for primary filters; hooks before early returns; `notify(msg, 'error')` for validation; `window.confirm` for destructive confirms; `useNavigate` for redirects. Role-gated buttons use `canHr(role, action)` plus scope. `kv(rows)` helper copied per page.

### G.1 `HrDashboard.jsx` — `/hr`
Greeting `Welcome, {first name}`; `Alert kind="info"` "Demo note: switch the signed-in user (top bar) to act as manager, HR, Finance or Management." (dismiss stored in `localStorage` key `hr_demo_note`, try/catch). Tiles (`grid grid-4`, `card stat tone-x`, clickable): Headcount (`ACTIVE_EMPLOYEE_STATUSES`, `/hr/employees?status=active`), On probation (`?status=Probation`, amber when any due ≤ 30 d), Appraisals awaiting me (`/hr/appraisals?queue=mine`, purple), Leave pending for me (`/hr/leave?status=Pending`), Settlements open (`/hr/settlements`, red when overdue), Reminders (`/hr/reminders`), Payroll / month (sum gross of active, `viewSensitive` only), Documents expiring (60 d). Cards: "My queue · {role}" (rows from `myAppraisalQueue`, pending leave for me, `mySettlementQueue`, each a `Link`); "Alerts" (`hrReminders` top 8 as `.alert-{tone}` with link); "Open cycle" (status funnel bars of appraisals in the Open cycle + overdue count); "Headcount by department" (`BarList`); "Recent activity" (`state.audit.filter((a) => a.portal === 'hr').slice(0, 7)` timeline, link to `/hr/audit` when `audit`). Employee role: profile card, leave balances, my open appraisal, my requests only.

### G.2 `EmployeeList.jsx` — `/hr/employees`
Rows = `visibleEmployees` filtered by `?status=` (`''`, `active`, `probation-due`, each status), department select, search (code, name, nid, mobile, email, designation name). Sorted by `updatedAt` desc. Columns: Code (mono / `draft`), Employee (name + designation · department), Grade, Joined, Manager, Status badge, Updated, `RowMenu`. Row actions: Open record; Edit (Draft or `edit`, not Separated); Request leave (`leaveRequest` ∧ (self ∨ `leaveAdminister`)) → `LeaveRequestModal`; Initiate separation (`separationInitiate`, active, no `separationId`) → `nav('/hr/settlements/new?employee=' + id)`; Open settlement (if `separationId`). Header `+ New employee` (`create`), `Export CSV` (`reports`). Empty state "No employees match these filters.".

### G.3 `EmployeeForm.jsx` — `/hr/employees/new`, `/:id/edit`
`SECTIONS = ['Personal & identity', 'Employment', 'Salary & bank', 'PF, loans & tax', 'Documents']`; draft `structuredClone(existing) || emptyEmployee(by)`; reset effects as KYS. `editable = !existing || existing.status === Draft || canHr(role, 'edit')`; salary inputs disabled for existing non-Draft unless `editSalary` (Alert "Salary revision requires HR Head — use Revise salary on the record"). Section fields: (1) personal/identity/contact, emergency contact, nominee; (2) department select → filters designations; designation change auto-fills grade, workerCategory, `probation.months` (from `DESIGNATIONS`), employmentType, workerCategory, wageBasis, establishmentType, joinDate, contractEndDate (Contractual), probation required/months, reportingManagerId (select of active employees ≠ self, grouped by department, "— none (reports to Board) —"), workLocation; (3) seven salary components + computed Gross (read-only `grossSalary`), effectiveFrom, payMode, bank fields; (4) PF member toggle + fields, loans editable table (add/remove), tax category + YTD fields; (5) `DocumentManager documents={e.documents} requiredDocs={REQUIRED_EMPLOYEE_DOCS} docTypes={Object.values(EMPLOYEE_DOC_TYPES)} expiringTypes={EXPIRING_EMPLOYEE_DOCS} uploadedBy={by} canUpload canVerify={isHrRole(role)} onChange={(docs) => set({ documents: docs })}`. Header: `Progress` (`employeeCompleteness`), error Alert list, duplicate Alert (`findEmployeeDuplicates`). Footer: `← Previous / Next →`; `Save draft` (`UPSERT_EMPLOYEE` → nav detail); new/Draft: `Save & activate` → `validateEmployee` → duplicates `window.confirm` → `UPSERT_EMPLOYEE` then `EMPLOYEE_TRANSITION { status: probation.required ? PROBATION : CONFIRMED, label: 'Activated', asOf, appraisal: probation.required && templateFor(e, state.kpiTemplates, 'Probation') ? buildAppraisal(e, null, 'Probation', tpl, settings, by, nextAppraisalCode(state.appraisals), asOf) : undefined }`; existing non-Draft: `Save changes` (`UPSERT_EMPLOYEE`, detail from a required "Change note" field when salary changed).

### G.4 `EmployeeDetail.jsx` — `/hr/employees/:id`
`TABS = [profile, employment 'Employment & Salary', documents, leave 'Leave & Attendance', appraisals, discipline 'Discipline', separation, history]`. Not found → Alert + back link; not in scope → `Alert kind="warn"` "You do not have access to this employee's file." Masking `show = (v) => canSeeSensitive(currentUser, e) ? v || '—' : maskValue(v)` for nid, tin, passportNo, accountNo; salary block hidden entirely for users without `viewSensitive` unless self. Action bar (imperative array): Edit; Activate (Draft, `activate`) → `window.confirm` then same dispatch as form; Decide probation (Probation, `confirm`) → `ProbationDecisionModal`; Revise salary (`editSalary`, active) → `SalaryRevisionModal`; Record disciplinary (`disciplinary`) → `DisciplinaryModal`; Suspend / Reinstate (`suspend`) → `ReasonModal` → `EMPLOYEE_TRANSITION`; Initiate separation (`separationInitiate`, active, no separationId) → wizard; Open settlement; Confirm exit (`markExit`, On Notice ∧ `lastWorkingDay <= asOf`) → `EMPLOYEE_TRANSITION { status: SEPARATED, label: 'Exit Completed', asOf }`; Request leave; Enter attendance (`attendanceEntry`) → `AttendanceEntryModal`; Record s.27(3A) notice (`disciplinary`, reminder kind absenceNotice) → `ReasonModal` → `UPSERT_EMPLOYEE` action `'Absence Notice Issued'` patching `absenceNotice`. `WorkflowSteps status={e.status} steps={EMPLOYEE_FLOW}`; status-reason Alert; insights flags. Tabs: Profile (`kv` identity/contact/emergency/nominee); Employment & Salary (employment kv, probation box with days left and decision, manager link, salary table + gross + history table, bank kv with `Mark verified` (`isHrRole`) → `UPSERT_EMPLOYEE` action `'Bank Verified'`, PF kv + eligibility flag, loans table, tax kv); Documents (`DocumentManager` `canUpload={isHrRole(role) || isSelf}` `canVerify={isHrRole(role)}` `onChange={(docs, detail) => patchEmployee({ documents: docs }, detail, 'Document Changed')}`); Leave & Attendance (balances table for `settings.leave.year`, requests table, attendance by month with pct/late/unapproved, `attendanceKpi` over last 6 months); Appraisals (table: code, type, cycle/period, status, KPI/comp/final, `GradeBadge`, recommendation, link; last appraisal card); Discipline (dated records table with show-cause/enquiry/outcome; add via modal); Separation (summary kv + link, or EmptyState + Initiate); History (`statusHistory` + audit timeline `state.audit.filter((a) => a.portal === 'hr' && a.customerId === id)`).

### G.5 `KpiTemplates.jsx` — `/hr/kpi`
Left list (code, name, designations, items, Σ weight badge, active); right editor (`manageKpi`, else read-only). Local draft `structuredClone(state.kpiTemplates)` + sync effect; `Save changes` → `validateTemplate` all + unique codes → `SET_KPI_TEMPLATES`; `Restore defaults`; `Add template`; `Duplicate`; delete blocked when any appraisal references `templateId` (toggle `active` instead). Item editor: editable table (code, name, category, unit, direction, target, thr%, str%, cap, weight, method, gate, source) + steps sub-editor (method E) + weight-sum badge (`badge-green` at 100). Weights (kpi/competency) + competency set + attendance mode selects. "Preview score" box: sample actual per item → `scoreKpiLine` result.

### G.6 `AppraisalCycles.jsx` — `/hr/cycles`
Table: code, name, type, period, status, appraisals by status (mini chips), progress. `New cycle` (`manageCycles`) → `CycleModal`; row actions: Edit (Planned); Open (Planned, `manageCycles`) → `OpenCycleModal` (lists eligible with checkboxes and skipped with reasons from `generateAppraisals`, then `OPEN_CYCLE`); Close (Open, `publish`; Alert listing non-terminal appraisals blocks; `window.confirm` → `CLOSE_CYCLE`); View appraisals (`/hr/appraisals?cycle=`). Open-cycle card: funnel + overdue count.

### G.7 `AppraisalList.jsx` — `/hr/appraisals`
Filters `?cycle=` (incl. `probation`), `?status=`, `?queue=mine`, department, search. Visibility via scope (`team` = own + direct reports). Tiles: In my queue, Overdue, Awaiting HR, Published not acknowledged. Columns: code, employee (name · designation), type / cycle, period, status, owner stage (`appraisalOwner`), due / overdue badge, final, `GradeBadge`, RowMenu (Open; Cancel (`cancelAppraisal`, before Published) → `ReasonModal` → `APPRAISAL_TRANSITION`).

### G.8 `AppraisalForm.jsx` — `/hr/appraisals/:id`
`mode = appraisalMode(apr, currentUser, state.employees)`, `vis = appraisalVisibility(apr, currentUser)`. Local draft `const [a, setA] = useState(() => apr && structuredClone(apr))` with reset on `[id, apr?.updatedAt]`; not found → `Alert warn` after hooks. Live preview `computeAppraisalScore(a, emp, settings)` in `useMemo`. Header: employee link, type, cycle/period, manager, `WorkflowSteps steps={APPRAISAL_FLOW}`, due/overdue badge, reason Alert, gate flags Alerts (`vis.managerFields`). Cards: (1) KPIs table — targets editable in `kpi` mode (`+ Add custom KPI` ≤ `maxCustomKpis`); Self actual + comment (`self`; shown to manager only from Manager Review); Actual + comment + evidence (`manager`; `source: 'attendance'` cells read-only with "auto" hint); Score/Weighted/Gate (preview); weight-sum badge; footer KPI score. (2) Competencies: anchors tooltip, Self `RatingPills` (`self`), Manager rating + comment (required ≥ `ratingCommentMinChars` for 1/5), HR rating ±`hrAdjustMax` + comment (`hr`, visible to HR only); footer competency score. (3) Attendance snapshot (pct, lates, unapproved, months, score) + HR override pct/reason (`hr`). (4) Employee comments (`self`). (5) Manager assessment: strengths, improvements, overallComment, recommendation, incrementPct (default from band), promotionTo; probation → `probation.decision` + note. (6) HR review & calibration (`vis.hrFields`): grade override select (requires `calibrationNote`), recommendation/increment/promotion/pip + pipEndDate (default `addDays(asOf, pipDays)`), comment; guided-distribution chip for the department (`gradeDistribution`); summary kv (kpi, competency, final, grade original → final, flags). (7) Result (Published+, employee-visible): final, grade, manager comments, recommendation; Acknowledge / Dispute (`ack`). (8) History timeline (`history` + audit by `refId`). Action bar (each: `UPSERT_APPRAISAL` with the computed draft, then `APPRAISAL_TRANSITION`): `Save` · `Send for agreement` · `Accept goals` / `Object` (comment, once) · `Submit self-assessment` · `Submit manager review` · `Return to manager` (reason) · `Resubmit to HR` · `Publish result` · `Acknowledge` / `Raise dispute` (comment) · `Resolve dispute` (resolution) · `Cancel appraisal` (reason) · `Print summary` (`window.print()`). On-behalf variants (`mode.onBehalf`) labelled `… on behalf` and dispatched with `onBehalf: true`. Validation via `validateAppraisalStage` → `notify` + Alert + scroll top. Probation type: Publish requires decision; after Publish an Alert links to the employee file to record the decision.

### G.9 `LeaveQueue.jsx` — `/hr/leave`, `/hr/attendance` (`initialTab`)
Tabs **Requests · Balances · Attendance** (state initialised from prop, synced on prop change). Tiles: Pending for me, Approved this month, On leave today, Unapproved absence last month. Requests: toolbar (search, `?status=`, type, month), table (code, employee, type, from → to, days, reason, status, applied, decision, RowMenu: Approve / Reject (`leaveApprove` ∧ approver is me, or HH/MD/AD) → `LeaveDecisionModal`; Cancel (requester, HR, Pending or future Approved) → `ReasonModal` → `LEAVE_DECISION Cancelled`; Open employee). `+ Request leave` → `LeaveRequestModal`. Balances: year select, matrix employee × leave type (balance / taken / pending), `EntitlementModal` for HO/HH/AD (opening & override), `Close leave year` (`closeLeaveYear`; confirm → `CLOSE_LEAVE_YEAR`), CSV. Attendance (`attendanceEntry` edit, others read-only for scope): month picker (default last month), `.att-grid` table of active employees (workingDays prefilled `workingDaysInMonth`, present, absent, unapproved, unapprovedRun, late, earlyOut, leave prefilled from approved requests, lwp, OT, remarks), row validation, locked rows require a reason (textarea above `Save month`), `Save month` → `UPSERT_ATTENDANCE { records: changed, by, reason }`; "Attendance KPI" column (last 6 months); CSV export.

### G.10 `SettlementQueue.jsx` — `/hr/settlements`
Tiles: Awaiting me, Clearance in progress, Approved for payment (Σ net), Overdue vs deadline. Table (`?status=`, type, search): code, employee (designation), type (+ section), LWD, deadline (red badge if past), clearance `x/5`, net payable, status, my action (`btn btn-sm` → detail), RowMenu (Open; Place on hold / Release (`settlementHold`); Withdraw (`separationInitiate`, before HR approval) → `ReasonModal`). Header `+ Initiate separation` → `/hr/settlements/new`.

### G.11 `SettlementNew.jsx` — `/hr/settlements/new?employee=&type=&probation=`
Wizard with `tabs` as steps: **1 Employee & type** (select of active employees without `separationId`; type; reason; type-specific flags: misconductClause, afterLayoff, deathAtWork, workCompleted; `Alert info` showing the statutory section and notice rule for the type and worker category) → **2 Notice & dates** (noticeDate default asOf, LWD default `addDays(noticeDate, noticeRequiredDays)`, computed required / served / shortfall, `noticeWaivedDays`, payInLieu + days for employer-initiated, Retirement prefills LWD = 60th birthday, deadline preview) → **3 Dues inputs** (`settlementInputsFrom` prefill; EL days with balance hint; PF fields; loans; assets + show-cause flag; bonus paid flag; group insurance (Death); YTD tax; overrides) → **4 Review** (live `computeSettlement` totals + flags; `validateSeparation` errors). `Initiate` → `INITIATE_SEPARATION` → nav detail. Draft lives in local state.

### G.12 `SettlementDetail.jsx` — `/hr/settlements/:id`
Root `className={`stack ${tab === 'statement' ? 'statement-print' : ''}`}`. Header: employee link, code, type (+ section), LWD, deadline badge, `StatusBadge`, `WorkflowSteps steps={SETTLEMENT_FLOW}` (On Hold / Returned / Withdrawn off-track; a skipped Management step renders done), hold/return reason Alert. Action bar: `Start clearance` · `Finalise dues` (`settlementEdit`; freezes `statement` via `UPSERT_SETTLEMENT` action `'Dues Computed'`, detail `` `${code}: net ${fmtMoney2(net)}` ``, `computedBy = by`) · `Submit for HR approval` (disabled with hint from `settlementReady`) · `Approve (HR)` / `Return to HR` · `Approve (Finance)` · `Approve (Management)` → `ApprovalModal` with `stage` (disabled with hint when `canApproveStage` fails) · `Record payment` (`PaymentModal`) · `Issue service certificate` (after Paid) · `Place on hold` / `Release` · `Withdraw` · `Print statement`. Tabs: **Separation** (kv + editable form while Initiated/Clearance/Returned; documents `DocumentManager docTypes={Object.values(SEPARATION_DOC_TYPES)}`), **Clearance** (table per row: dept, items, status badge, signed by/at, remarks, recoverable; `Sign off` when `canSignClearance` → `ClearanceSignOffModal`; progress bar), **Inputs** (editable `inputs` form, service/notice kv, `Recompute` preview), **Statement** (`<SettlementStatement statement={sep.statement || live} employee sep settings />` inside `card statement-wrap`; `Export CSV`), **Approvals & payment** (approvals timeline, payment kv, certificate status, exit-interview/rehire toggles), **History** (audit by `refId` + `history`). Employee/LM: read-only, scope-limited.

### G.13 `HrReminders.jsx` — `/hr/reminders`
Window select (30/60/90). Cards from `hrReminders` grouped by kind: Probation decisions due (`Decide` → `ProbationDecisionModal`), Deemed-permanent risk, Contracts expiring, Documents expiring, Overdue appraisals (stage owner), Settlements vs deadline, Exit date passed (`Confirm exit`), Leave pending > 3 WD, PF eligibility, Retirements, Unapproved absence ≥ 10 days (`Record s.27(3A) notice`), PIP checkpoints. `Send reminder` → `HR_LOG { action: 'Reminder Sent' }` + `notify(..., 'info')`.

### G.14 `HrReports.jsx` — `/hr/reports`
Imports `reportBits`. Tabs: **Headcount & payroll** (by dept/grade/status BarLists; payroll table for `viewSensitive`; CSV `hr_employees_${date}.csv`), **Appraisals** (cycle select; grade distribution original vs final vs guided; dept averages kpi/comp/final; cycle completion funnel; top/bottom 5 (HR/MD); increment simulation: editable % per band × Σ basic × 12 vs budget input), **Leave & attendance** (month select; attendance % by dept; leave taken by type; employees < 90 %), **Settlements** (by type/status; Σ net payable & PF; avg days to pay; overdue list; CSV `hr_settlements_${date}.csv`). `Print`.

### G.15 `HrSettings.jsx` — `/hr/settings`
Local drafts of `hrSettings` and `leaveTypes` (structuredClone + sync effects; `Restore defaults`; `Save changes` → validation → `SET_HR_SETTINGS` (detail = changed top-level keys) / `SET_LEAVE_TYPES`). Tabs: **Statutory & settlement** (law version, cutover, non-worker policy, days/month, rounding, wage base, inclusive LWD, notice table, compensation days per type, resignation tiers editor (both laws), gratuity, PF, bonus, shortfall, deadline, management approval; every Field `hint` carries the citation; `Verify formulas` button → `runHrSelfTest()` results table), **Leave types** (table editor; cannot remove a type with non-cancelled requests; EL accrual mode/divisor/cap), **Grades & gates** (bands table, gates, probation thresholds, attendance steps, appraisal limits), **Tax** (thresholds by category, exemption, slabs table, minimum tax), **Holidays & calendar** (company, weekly offs chips, holidays table, **demo clock** `asOfDate` with "Use real date"), **Roles & permissions** (read-only matrix `HR_PERMISSIONS` × `HR_ACTION_LABELS`). Validation: bands descending unique `min` with last 0; tiers ascending; slabs widths > 0 with last null; weights 100; thresholds > 0.

### G.16 Modal files (named exports; each follows `quickActions.jsx`: own `useStore`, local `f`, `notify(..., 'error'); return;`, dispatch, `notify`, `onClose`; footer Cancel + primary)

| File (owner) | Export | Props → dispatch |
|---|---|---|
| `hrEmployeeModals.jsx` (U2) | `ProbationDecisionModal` | `{ employee, onClose }` → shows `probationOutcome` checks; `Confirm` (date) → `EMPLOYEE_TRANSITION CONFIRMED 'Probation Confirmed' patch { employment.confirmationDate }` + if Published probation appraisal → `APPRAISAL_TRANSITION Closed`; `Extend` (disabled if extended; reason) → same status, label `'Probation Extended'`, patch `probation.extended/extendedTo`; `Not confirm` (reason) → `nav('/hr/settlements/new?employee=&type=Termination&probation=1')` |
| | `SalaryRevisionModal` | `{ employee, onClose }` → components, effectiveFrom, reason (required) → `UPSERT_EMPLOYEE` action `'Salary Revised'` detail reason |
| | `DisciplinaryModal` | `{ employee, record?, onClose }` → fields of B.2 record → `UPSERT_EMPLOYEE` action `'Disciplinary Recorded'` detail `` `${type} dated ${date}` `` |
| `hrAppraisalModals.jsx` (U3) | `CycleModal` | `{ cycle?, onClose }` → `UPSERT_CYCLE` |
| | `OpenCycleModal` | `{ cycle, onClose }` → `generateAppraisals` → checklist → `OPEN_CYCLE` |
| `hrLeaveModals.jsx` (U4) | `LeaveRequestModal` | `{ employee?, onClose }` (employee select limited by scope) → `UPSERT_LEAVE_REQUEST` |
| | `LeaveDecisionModal` | `{ request, onClose }` → `LEAVE_DECISION` (Reject requires comment; Approve checks balance) |
| | `EntitlementModal` | `{ employee, onClose }` → `UPSERT_EMPLOYEE` action `'Leave Entitlement Adjusted'` detail `'EL opening 6 → 8'` |
| | `AttendanceEntryModal` | `{ employee, month?, onClose }` → `UPSERT_ATTENDANCE { records: [rec] }` (reason when locked) |
| `hrSettlementModals.jsx` (U5) | `ClearanceSignOffModal` | `{ settlement, row, onClose }` → status Cleared / Dues Found, remarks, recoverable → `UPSERT_SETTLEMENT` action `'Clearance Signed'` detail `` `${label}: ${status}` `` |
| | `ApprovalModal` | `{ settlement, stage: 'hr' \| 'finance' \| 'management', onClose }` → totals summary + comment; `Approve` → `SETTLEMENT_TRANSITION` to `nextSettlementStatus` label `'HR Approved' \| 'Finance Approved' \| 'Management Approved'` with `approval`; `Return to HR` (comment required) → `RETURNED` |
| | `PaymentModal` | `{ settlement, employee, onClose }` → paidAt (≤ asOf, warn if > deadline), mode, reference (required), amount (default net), bank account, payee (Nominee for Death) → `SETTLEMENT_TRANSITION PAID 'Settlement Paid'` detail `` `${fmtMoney2(amount)} by ${mode} ref ${reference}` `` |
| `SettlementStatement.jsx` (U5) | default export | `{ statement, employee, settlement, settings }` → `.statement`: header meta (company, employee, code, designation, dept, grade, DOJ, confirmation, LWD, type + section, notice required/served/waived, service text, basic/gross, law version, deadline + skipped days), Earnings table (label · formula · citation · amount), Deductions, Net payable row, PF table, Net PF, Total to employee, Tax computation `.box`, flags list, clearance summary, salary & tax certificate `.box`, signature grid (Prepared by HR · Checked by Finance · Approved by MD · Received by employee / nominee), payment details when Paid |

---

## H. Seed data — `src/hr/seed.js`

Exports: `seedHr()` → `{ employees, kpiTemplates, appraisalCycles, appraisals, leaveTypes, leaveRequests, attendance, settlements, hrSettings }` and `seedHrAudit(hr)`. Helpers at top: `const t = localToday(); const daysAgo = (n) => new Date(Date.now() − n × 86400000).toISOString(); const by = 'Farhana Rahman'; doc(type, opts)` (as KYS seed), `make = (o) => migrateEmployee({ ...emptyEmployee(by), ...o })`, `sal = (basic, hr, med, conv, other, dearness = 0) => ({ …as strings, effectiveFrom: '2026-01-01', payMode: 'Bank Transfer', history: [] })`, `bank = (bankName, branch, accountName, accountNo)` (verified by Farhana), `rated(appraisal, emp, { ach = 0.95, rating = 4, hr = null, actuals = null })` → sets each manual KPI `actualSelf = actualMgr = actuals?.[code] ?? (direction === 'lower' ? target / ach : target × ach)` (method C → `rating`, D → 1), all `selfRating = mgrRating = rating`, then stores `computeAppraisalScore(apr, emp, DEFAULT_HR_SETTINGS)` and `gradeFinal = hr || gradeOriginal`. `hrSettings = structuredClone(DEFAULT_HR_SETTINGS)` (holidays C.7), `leaveTypes = DEFAULT_LEAVE_TYPES`, `kpiTemplates = DEFAULT_KPI_TEMPLATES`.

### H.1 Employees (18; PF member 8/8 unless noted; all `nationality 'Bangladeshi'`, 11-digit `01…` mobiles, 10/13-digit NIDs, 12-digit TINs)

| id | code | name | designation (dept, grade) | join | status | manager | basic / HRA / med / conv / other → gross | notes |
|---|---|---|---|---|---|---|---|---|
| emp_anisur | EMP-1001 | Anisur Rahman | MD (MGMT, G1) | 2014-01-01 | Confirmed | '' | 250,000/100,000/15,000/15,000/20,000 → 400,000 | Non-worker; PF 10/10 2,400,000/2,400,000/700,000; Gulshan |
| emp_sabbir | EMP-1002 | Sabbir Hossain | HOH (HR, G2) | 2016-04-01 | Confirmed | emp_anisur | 90,000/45,000/7,500/10,000/7,500 → 160,000 | Non-worker; PF 10/10 980,000/980,000/310,000; passport (expires `addDays(t, 400)`) |
| emp_nusrat | EMP-1003 | Nusrat Jahan | HOS (SALES, G2) | 2017-03-01 | Confirmed | emp_anisur | 110,000/55,000/10,000/10,000/15,000 → 200,000 | Non-worker; Female; passport expiring `addDays(t, 40)` |
| emp_mizan | EMP-1004 | Mizanur Rahman | PM (PROD, G2) | 2015-06-15 | Confirmed | emp_anisur | 100,000/50,000/8,000/10,000/12,000 → 180,000 | Non-worker; establishmentType factory; Narayanganj Factory |
| emp_tahmina | EMP-1005 | Tahmina Akter | HOF (FIN, G2) | 2019-01-10 | Confirmed | emp_anisur | 95,000/47,500/7,500/10,000/10,000 → 170,000 | Non-worker; Female; tax category female_senior |
| emp_kamrul | EMP-1006 | Kamrul Islam | ASM (SALES, G4) | 2020-02-01 | Confirmed | emp_nusrat | 50,000/25,000/4,000/6,000/5,000 → 90,000 | Non-worker; lastAppraisal A (CYC-2025) |
| emp_shimul | EMP-1007 | Shimul Barua | PS (PROD, G7) | 2018-11-12 | Confirmed | emp_mizan | 30,000/15,000/2,500/2,500/2,000 → 52,000 | Non-worker; factory |
| emp_hasan | EMP-1008 | Hasan Mahmud | DRV (ADMIN, G8) | 2019-03-04 | Confirmed | emp_sabbir | 16,000/8,000/1,500/1,500/1,000 → 28,000 | Worker; probation 3 m; LICENCE doc expiring `addDays(t, 20)`; disciplinary `[{ type: 'Written Warning', date: '2026-03-10', reference: 'HR/WL/2026-03', showCauseDate: '2026-03-02', replyDueDate: '2026-03-06', outcome: 'Warning issued', note: 'Unauthorised vehicle use' }]` |
| emp_jahangir | EMP-1009 | Jahangir Alam | SO (SALES, G6) | 2019-02-20 | **On Notice** | emp_kamrul | 40,000/15,000/2,000/2,000/1,000 → 60,000 | Worker; confirmationDate 2019-08-20; PF 10/10 300,000/300,000/120,000, advance 40,000; loan Salary Advance outstanding 10,000; tax ytdIncome 180,000 (Jul–Sep), ytdTaxPaid 0; **leave.opening EL '0'**; separationId stl_jahangir; Chattogram Office |
| emp_belal | EMP-1010 | Belal Ahmed | MO (PROD, G8) | 2021-01-11 | **Separated** (separatedAt 2026-07-31) | emp_shimul | 15,000/7,500/1,500/1,500/1,000 → 26,500 | Worker; factory; PF 60,000/60,000/9,000; separationId stl_belal; rehireEligible true |
| emp_moushumi | EMP-1011 | Moushumi Das | AE (FIN, G6) | 2022-03-01 | **Separated** (2026-08-31) | emp_tahmina | 30,000/15,000/2,500/3,000/2,500 → 53,000 | Worker; Female; PF 110,000/110,000/18,000; tax ytdIncome 53,000; separationId stl_moushumi |
| emp_jahid | EMP-1012 | Jahid Hossain | PO (SCM, G6) | 2021-09-01 | Confirmed | emp_mizan | 32,000/16,000/2,500/3,000/2,500 → 56,000 | Worker |
| emp_farhana | EMP-1013 | Farhana Rahman | HRO (HR, G6) | 2022-01-17 | Confirmed | emp_sabbir | 30,000/15,000/2,500/3,000/2,500 → 53,000 | Worker; Female; HR Officer persona |
| emp_rakib | EMP-1014 | Rakib Hasan | SO (SALES, G6) | 2023-04-03 | Confirmed (2023-10-03) | emp_kamrul | 25,000/12,500/2,500/3,000/2,000 → 45,000 | Worker; lastAppraisal A 85.21 (CYC-2025); leave.opening EL '6'; employee persona |
| emp_rafiqul | EMP-1015 | Rafiqul Islam | ITO (IT, G6) | 2024-07-01 | Confirmed | emp_tahmina | 30,000/15,000/2,500/3,000/2,500 → 53,000 | Worker |
| emp_sumaiya | EMP-1016 | Sumaiya Khatun | AE (FIN, G6) | 2026-05-04 | **Probation** (endDate 2026-11-04) | emp_tahmina | 28,000/14,000/2,500/3,000/2,500 → 50,000 | Worker; Female; PF not member; probation appraisal apr_sumaiya_prob; employee persona |
| emp_abdul | EMP-1017 | Abdul Karim | MO (PROD, G8) | 2026-08-18 | **Probation** (3 m → 2026-11-18) | emp_shimul | 14,000/7,000/1,500/1,500/1,000 → 25,000 | Worker; factory; PF not member; bank bKash (`accountType 'Mobile Wallet (bKash / Nagad / Rocket)'`); probation appraisal apr_abdul_prob |
| emp_draft | '' | Nabila Noor | HRO (HR, G6) | `addDays(t, 7)` | Draft | emp_sabbir | 30,000/15,000/2,500/3,000/2,500 | no code, no documents, `createdAt: daysAgo(2)` |

Every non-draft employee: docs NID (verified by Farhana), PHOTO, APPOINTMENT, EDU; `statusHistory` consistent (`Created`→`Probation`→`Confirmed` with dates = join / confirmation); nominee filled; emergency contact; banks from `BD_BANKS` with branches Gulshan, Motijheel, Mirpur, Agrabad, Narayanganj; addresses Dhaka, Narayanganj, Gazipur, Chattogram, Cumilla.

### H.2 Cycles & appraisals (codes APR-1001…; `managerId` = reporting manager; `history` built to current status with dates spread between due dates)

- `cyc_2025` CYC-2025 'Annual Appraisal 2025', Annual, 2025-01-01 → 2025-12-31, **Closed** (`closedAt '2026-02-10'`), due kpi 2025-01-31 / self 2026-01-10 / manager 01-20 / hr 02-07 / publish 02-10 / ack 02-17, payout incrementEffective 2026-01-01. Appraisals all **Closed**, acknowledged `'Agree'`: apr_rakib_2025 (**explicit actuals, I.2**, A 85.21), apr_kamrul_2025 (TPL-ASM manager set, `rated ach 1.0 rating 4` → A), apr_jahid_2025 (`ach 0.9 rating 3` → B), apr_shimul_2025 (`ach 0.97 rating 4` → A), apr_farhana_2025 (`ach 0.92 rating 3` → B), apr_hasan_2025 (`ach 0.85 rating 3`, Written Warning dated 2026-03-10 is outside the 2025 period → no gate; C by `ach 0.78`), apr_jahangir_2025 (`ach 0.88 rating 3` → B; acknowledgement `'Disagree'` with comment 'Collection target was revised mid-year' → Disputed → resolved 'Target revision confirmed, score retained' → Published → Acknowledged 'Agree'), apr_moushumi_2025 (B), apr_belal_2025 (`ach 0.7 rating 2` → D, `hr.pip true`, pipEndDate 2026-05-10). `employee.lastAppraisal` copied from each.
- `cyc_2026my` CYC-2026-MY 'Mid-Year Review 2026', Half-yearly, 2026-01-01 → 2026-06-30, **Open** (`openedAt addDays(t, −97)`), due self `addDays(t, −88)`, manager `addDays(t, −78)`, hr `addDays(t, −67)`, publish `addDays(t, −57)`, ack `addDays(t, −50)` (all overdue → reminders). Appraisals: apr_rakib_my **Manager Review** (self submitted, self actuals filled); apr_kamrul_my **Self-Assessment**; apr_jahid_my **HR Review** (manager submitted, `rated ach 0.97 rating 4`, recommendation Increment 9); apr_shimul_my **Published** (not acknowledged, A); apr_farhana_my **Goals Agreed**; apr_hasan_my **KPI Setting** (overdue); apr_jahangir_my **Cancelled** (`statusReason 'Separation initiated'` — LWD 20 Oct < 9 months of the H1 period rule is irrelevant: period already ended; cancelled because status was pre-Published at initiation); apr_rafiqul_my **Returned to Manager** (`statusReason 'Evidence missing for uptime KPI'`); apr_moushumi_my **Cancelled**; apr_belal_my **Cancelled**; apr_tahmina_my, apr_nusrat_my, apr_mizan_my, apr_sabbir_my **HR Review** (manager set, managerId emp_anisur).
- Probation: apr_sumaiya_prob (APR-1030, TPL-PROB, 2026-05-04 → 2026-11-04, due manager 10-20 / hr 10-28 / publish 11-01, **Manager Review**, self filled PR-1 1, PR-2 4, PR-3 4, ratings 4); apr_abdul_prob (APR-1031, 2026-08-18 → 2026-11-18, **KPI Setting**).

### H.3 Leave requests (relative dates; `days` via `countLeaveDays`)
LV-1001 rakib EL `addDays(t,−22)`→`−20` Approved by Kamrul Islam; LV-1002 sumaiya CL `+2` Pending (approver emp_tahmina); LV-1003 jahid SL `−48`→`−47` Approved by Mizanur Rahman; LV-1004 kamrul EL `+6`→`+10` Pending (approver emp_nusrat → not a user; decided by Sabbir Hossain as HR Head in demo); LV-1005 hasan CL `−33`→`−32` Rejected by Sabbir Hossain ('Driver roster full'); LV-1006 farhana EL `−57`→`−54` Approved by Sabbir Hossain; LV-1007 jahangir EL `−92`→`−91` (2 d) Approved by Kamrul Islam; LV-1008 abdul LWP `−12` Pending (approver emp_shimul → decided by Mizanur Rahman); LV-1009 nusrat EL `−127`→`−123` Approved by Anisur Rahman; LV-1010 hasan EL `+15`→`+17` Pending (approver emp_sabbir).

### H.4 Attendance — months `lastMonths(3, t)` for every non-Draft employee whose status at that month was active (belal: none of the 3; moushumi: only months ≤ 2026-08). `workingDays = workingDaysInMonth(month, hrSettings.calendar)`; leave = approved days in month; pattern table: default `absent 0, late 1`; hasan `absent 2 (unapproved 2, run 2) in month −2, late 5/6/5` (gate example); rakib month −1 `late 1`; jahangir month −1 `late 3, absent 1`; sumaiya/abdul clean; kamrul month −3 `late 2`. `present = workingDays − absent − leave − lwp`, `enteredBy 'Farhana Rahman'`, `locked: true` for months −2, −3.

### H.5 Settlements (statement numbers come from `computeSettlement` at build; H.5 states the inputs)
- `stl_jahangir` FS-1001 — Resignation, reason 'Better opportunity', `noticeDate '2026-09-05'`, `lastWorkingDay '2026-10-20'`, `noticeRequiredDays 60`, status **Clearance in Progress**; clearance IT & ADMIN Cleared (Farhana Rahman), FINANCE Dues Found (Tahmina Akter, remarks 'Salary advance BDT 10,000 outstanding — recover in settlement', recoverable '10000'), HR & LINE Pending; `inputs` = `settlementInputsFrom` (elBalanceDays '18', pf 300000/300000/120000/40000, loanRecovery '10000', ytdIncome '180000'); `statement: null` (live preview = I.1). `previousStatus 'Confirmed'`.
- `stl_moushumi` FS-1002 — Resignation, noticeDate 2026-07-02, LWD 2026-08-31 (60 served), status **Pending Finance Approval**; all Cleared; inputs elBalanceDays '9', pf 110000/110000/18000/0, ytdIncome '53000'; `statement` frozen (`computedAt '2026-09-03'`, `computedBy 'Farhana Rahman'`); approvals `[{ stage: 'HR', decision: 'Approved', by: 'Sabbir Hossain', at: '2026-09-05…' }]`. Expected: service 4y 5m 30d (exactYears 4.49) → CY 4; tier (b) → 15 × 1,000 × 4 = 60,000; salary Aug 53,000; EL 9 × 1,766.67 = 15,900; earnings 128,900; PF employee 2,400; net **126,500**; PF 112,400 + 112,400 + 18,000 = **242,800**; total 369,300.
- `stl_belal` FS-1003 — Termination (s.26), reason 'Position abolished after line closure', `payInLieu true`, noticeDate = LWD 2026-07-31, status **Paid**; all Cleared; approvals HR (Sabbir 08-05) / Finance (Tahmina 08-08) / Management (Anisur 08-12); payment `paidAt '2026-08-27'`, Bank Transfer, ref 'FS-1003/EBL/0827', amount = net; `serviceCertificate.issued true`. Expected: service 5y 6m 20d → CY 6; W 500; notice pay 120 × 500 = 60,000; compensation 30 × 500 × 6 = 90,000; salary Jul 26,500; EL 11 × 883.33 = 9,716.67; earnings 186,216.67; PF employee 1,200; net **185,016.67**; PF 61,200 + 61,200 + 9,000 = **131,400**; total 316,416.67. Management approval because type ∈ `managementApprovalTypes`.

### H.6 `seedHrAudit(hr)` — entries `{ id: uid('aud'), portal: 'hr', customerId: emp.id, customerCode: emp.code || '(draft)', businessName: emp.name, action, by, at, detail, refId?, refCode? }`, `by` only from `HR_USERS` names (+ 'System Admin'). Per employee: `'Created'` (createdAt, by Farhana), `'Activated'` (joinDate, detail `code assigned`), `'Confirmed'` (confirmationDate, by Sabbir); per disciplinary record `'Disciplinary Recorded'`; per settlement: `'Separation Initiated'`, `'Clearance Signed'` per signed row, `'Dues Computed'`, `'HR Approved'`/`'Finance Approved'`/`'Management Approved'`, `'Settlement Paid'`, `'Exit Completed'`, `'Service Certificate Issued'`; per appraisal: `'Appraisal Created'` + one entry per `history` item (stage label); per leave: `'Leave Requested'` + decision; cycles: HR_SYSTEM `'Cycle Opened'`/`'Cycle Closed'`. Sorted desc by `at`.

---

## I. Worked examples (regression fixtures in `src/hr/selfTest.js`; all asserted to the paisa)

### I.1 `FX_RESIGNATION` = `computeSettlement(emp_jahangir, stl_jahangir, DEFAULT_HR_SETTINGS, { asOf: '2026-10-06' })`
Inputs: basic 40,000, gross 60,000, DA 0; joined 2019-02-20; LWD 2026-10-20; notice 2026-09-05 → served 45 / required 60 / waived 0; EL 18; PF 10/10, 300,000 / 300,000 / 120,000, advance 40,000; loan 10,000; ytd 180,000 / paid 0; general category. Derived: service **7y 8m 0d**, exactYears 7.67, CY **8**; W 1,333.33; grossDaily 2,000; dim 31, served 20; tier (b); permanent; vested 100 %; law `bla2026`; deadline **2026-12-01** (30 working days, Fri+Sat off, default holidays).

| key | label | formula | BDT |
|---|---|---|---|
| salary | Salary 1–20 Oct 2026 (pro-rata) | 60,000 × 20/31 — r.114 | 38,709.68 |
| leaveEncash | Earned leave encashment | 18 × 2,000.00 — s.11, s.119 | 36,000.00 |
| compensation | Resignation benefit s.27(4)(b) | 15 × 1,333.33 × 8 | 160,000.00 |
| arrears, overtime, reimbursement, otherPayable, bonus, performanceBonus, noticePay, groupInsurance | — | — | 0.00 |
| **earnings** | | | **234,709.68** |
| noticeShortfall | Notice shortfall recovery | 15 × 1,333.33 — s.27(3), s.14(3) | 20,000.00 |
| tax | Income tax at source (estimate) | 414,709.68 − 138,236.56 = 276,473.12 < 400,000 → nil — ITA 2023 s.86 | 0.00 |
| pfEmployee | Employee PF on final salary | 10 % × 40,000 × 20/31 — s.264(9) | 2,580.65 |
| loanRecovery | Salary advance recovery | s.125(2) | 10,000.00 |
| assetRecovery, absence, otherDeduction | — | — | 0.00 |
| **deductions** | | | **32,580.65** |
| **netPayable** | | 234,709.68 − 32,580.65 | **202,129.03** |
| pfOwn | PF own contributions | 300,000 + 2,580.65 | 302,580.65 |
| pfEmployer | PF employer, 100 % vested | 300,000 + 2,580.65 — r.263(1) | 302,580.65 |
| pfInterest | | r.261 | 120,000.00 |
| pfAdvance | Less PF advance | r.266 | −40,000.00 |
| **pfNet** | | | **685,161.30** |
| **totalToEmployee** | | | **887,290.33** |

Asserted alternates: `partialYearRounding 'strict'` → compensation 140,000.00; `leave.encashRateBase 'basic'` → 24,000.00; `noticeShortfall.base 'gross'` → 30,000.00; `gratuity.schemeEnabled true` → line `gratuity` 320,000.00 (30 × 1,333.33 × 8) replaces compensation; `statutory.lawVersion 'pre_2025'` → 14 × 1,333.33 × 8 = 149,333.33; `calendar.weeklyOffs ['Fri']` → deadline 2026-11-24; `statutory.countLastDayInclusive true` → service 7y 8m 1d (CY unchanged).

### I.2 `FX_APPRAISAL_SO` = `computeAppraisalScore(apr_rakib_2025, emp_rakib, DEFAULT_HR_SETTINGS)` — TPL-SO (80/20)

| KPI | method | target | actual | score | w | weighted |
|---|---|---|---|---|---|---|
| SO-1 | A | 100 | 92 | 92.00 | 30 | 27.60 |
| SO-2 | B | 100 | 95 | 87.50 | 15 | 13.13 |
| SO-3 | E | 98 | 96.5 | 80.00 | 15 | 12.00 |
| SO-4 | B | 35 | 33 | 85.71 | 15 | 12.86 |
| SO-5 | A | 450 | 470 | 104.44 | 15 | 15.67 |
| SO-6 | E | 90 | 88 | 70.00 | 10 | 7.00 |

KPI = **88.26**; competencies (staff) mgr ratings TEAM 4, INTEG 4, COMM 3, INIT 4, CUST 4, KNOW 3 → (80×15 + 80×20 + 60×15 + 80×15 + 80×15 + 60×20)/100 = **73.00**; final = 88.26 × 0.8 + 73.00 × 0.2 = **85.21** → A (original = final); recommendation Increment 9 %.

### I.3 `FX_APPRAISAL_PS` — TPL-PS (70/30), attendance snapshot pct 97.5 / avgLates 1.3 / unapproved 0 → attendance item score 100
PS-1 97.2/98 → ach 99.18 → 97.96 → 29.39; PS-2 (lower) 1.2 vs 1.5 → 125 → cap 120 → 18.00; PS-3 71/75 → 94.67 → 86.67 → 13.00; PS-4 0 → 100 → 15.00; PS-5 (lower) 2.3 vs 2 → 86.96 → 67.39 → 6.74; PS-6 attendance 100 → 15.00. KPI **97.13**; competencies 4,4,3,4,3,5 → **78.00**; final **91.39** → A+; no gates. With a Written Warning record dated inside the period → `gradeFinal` **B** (cap), `gradeOriginal` A+.

### I.4 `FX_TERMINATION` (Belal, H.5): net **185,016.67**, PF **131,400.00**, total **316,416.67**, `requiresManagementApproval === true`.

### I.5 `FX_RETIREMENT`: worker, basic 14,000, gross 21,000, joined 2008-04-14, DOB 1966-08-30, Retirement, LWD 2026-08-30, EL 32, PF 8/8 400,000/400,000/95,000, assets 500 with show-cause issued, ytdIncome 21,000, category female_senior. Service 18y 4m 16d → CY 18; compensation 30 × 466.67 × 18 = 252,000.00 (s.28(3) → s.26(4)); salary 21,000 × 30/31 = 20,322.58; EL 32 × 700 = 22,400.00; earnings 294,722.58; pfEmployee 8 % × 14,000 × 30/31 = 1,083.87; assetRecovery 500; tax 0; net **293,138.71**; PF 401,083.87 + 401,083.87 + 95,000 = **897,167.74**; total 1,190,306.45. With `assetShowCauseIssued false` → assetRecovery 0 and a danger flag.

### I.6 `FX_DEATH`: worker, basic 20,000, gross 30,000, joined 2016-05-10, Death on 2026-09-15 (`deathAtWork true`), EL 20, PF 8/8 150,000/150,000/30,000, groupInsurance 200,000, nominee spouse. Service 10y 4m 5d → CY 10; compensation 45 × 666.67 × 10 = 300,000.00 (s.19); salary 30,000 × 15/30 = 15,000.00; EL 20 × 1,000 = 20,000.00; groupInsurance 200,000.00; earnings 535,000.00; pfEmployee 800.00; tax 0; net **534,200.00**; PF 150,800 + 150,800 (vestOnDeath) + 30,000 = **331,600.00**; total 865,800.00; `meta.payee === 'Nominee'`; `deathAtWork false` → 200,000.00 compensation.

### I.7 Other assertions
`serviceLength('2022-03-01', '2026-08-31')` → 4y 5m 30d, `completedYears` six_months → 4, strict → 4; `('2021-01-11', '2026-07-31')` → 5y 6m 20d → 6; resignation tier for exactYears 3.0 → 7 days, 3.01 → 15, 9.99 → 15, 10 → 30; `estimateTds({ ytdIncome: 180000, settlementTaxable: 234709.68, ytdTaxPaid: 0, category: 'general' })` → 0; `estimateTds({ ytdIncome: 900000, settlementTaxable: 300000, ytdTaxPaid: 20000 })` → income 1,200,000, exempt 400,000, taxable 800,000, above 400,000: 300,000 × 10 % + 100,000 × 15 % = 45,000 → tds 25,000; `attendanceKpi({ pct: 96, avgLates: 3, unapproved: 1 })` → 0.6×80 + 0.4×70 − 10 = 66; `addWorkingDays('2026-10-20', 30, { weeklyOffs: ['Fri','Sat'], holidays: [] })` → 2026-12-01; `countLeaveDays('2026-10-11', '2026-10-15', false, defaultCalendar, EL)` → 5 (Sun–Thu).

---

## J. Implementation units (parallel plan)

Dependency order: **U0 → U1**, then **U2–U6 in parallel** (they import only from U0 exports, U1 shared components and the fixed cross-unit modal signatures below). No two units edit the same file. Each unit runs `npm run lint` and `npm run build` before hand-off.

### U0 — FOUNDATION (one engineer; lands first)
Files: `src/hr/config.js`, `src/hr/helpers.js`, `src/hr/seed.js`, `src/hr/selfTest.js`.
Must export — config: everything in B.1, B.7, C.1–C.8 (`HR_ROLES, HR_USERS, HR_PERMISSIONS, HR_ACTION_LABELS, canHr, HR_STAFF_ROLES, EMPLOYEE_STATUS, EMPLOYEE_FLOW, ACTIVE_EMPLOYEE_STATUSES, CYCLE_STATUS, CYCLE_TYPES, APPRAISAL_TYPES, APPRAISAL_STATUS, APPRAISAL_FLOW, APPRAISAL_OPEN, SETTLEMENT_STATUS, SETTLEMENT_FLOW, SETTLEMENT_OPEN, LEAVE_STATUS, CLEARANCE_STATUS, HR_STATUS_COLORS, SEPARATION_TYPES, SEPARATION_SECTIONS, EMPLOYER_INITIATED, MISCONDUCT_CLAUSES, DISCIPLINARY_TYPES, RECOMMENDATIONS, PROBATION_DECISIONS, EMPLOYMENT_TYPES, WORKER_CATEGORIES, WAGE_BASIS, ESTABLISHMENT_TYPES, TAX_CATEGORIES, PAY_MODES, LOAN_TYPES, KPI_CATEGORIES, KPI_UNITS, KPI_METHODS, KPI_DIRECTIONS, KPI_SOURCES, DEPARTMENTS, GRADES, DESIGNATIONS, designationOf, EMPLOYEE_DOC_TYPES, EXPIRING_EMPLOYEE_DOCS, REQUIRED_EMPLOYEE_DOCS, SEPARATION_DOC_TYPES, DISCIPLINARY_DOC_TYPES, CLEARANCE_DEPARTMENTS, COMPETENCIES, competencySet, DEFAULT_KPI_TEMPLATES, DEFAULT_LEAVE_TYPES, DEFAULT_HR_SETTINGS, DEFAULT_HOLIDAYS_2026, HR_SYSTEM, BD_BANKS, WORK_LOCATIONS, RELATIONS`); helpers: every function in D (plus `migrateAppraisal`, `migrateHrSettings` (deep merge per top-level key, preserves `schemaVersion` from defaults), `emptyLeaveRequest(empId, by)`, `emptyCycle(by)`); seed: `seedHr`, `seedHrAudit`; selfTest: `runHrSelfTest`, `FIXTURES`.
May import: `../utils/helpers`, `../data/config` (`ROLES`). Nothing else.
Done when: `runHrSelfTest().pass === true`; `seedHr()` returns 18 employees, 8+1 templates, 2 cycles, 24 appraisals, 10 leave requests, attendance rows, 3 settlements; every seed statement/score equals the helper output.

### U1 — INTEGRATION (one engineer; after U0)
Files (modify): `src/store/StoreContext.jsx` (E), `src/App.jsx` (F.1), `src/components/Layout.jsx` (F.2), `src/pages/Portal.jsx` (F.3), `src/components/ui.jsx` (F.4), `src/pages/AuditLog.jsx` (F.5), `src/pages/Dashboard.jsx` + `src/pages/CustomerDetail.jsx` (portal filter), `src/main.jsx` (self-test), `src/styles.css`, `index.html`, `README.md`. Files (create): `src/components/reportBits.jsx`.
Must export: `ALL_USERS` (extended), all E.3 reducer actions; `GradeBadge, RatingPills, ScoreBar, ReasonModal` from `ui.jsx` (existing exports unchanged); `TONE, BarList, toCsv, exportCsv` from `reportBits.jsx`; CSS classes in F.6.
May import: U0 exports. Until U2–U6 land, `App.jsx` imports placeholder pages that render `<EmptyState>Coming soon</EmptyState>` so the build passes (placeholders are replaced, not merged).

### U2 — EMPLOYEE module
Files: `src/pages/hr/EmployeeList.jsx`, `EmployeeForm.jsx`, `EmployeeDetail.jsx`, `src/components/hrEmployeeModals.jsx` (exports `ProbationDecisionModal, SalaryRevisionModal, DisciplinaryModal`).
May import: U0; U1 (`useStore`, `ui.jsx`, `DocumentManager`, `quickActions.RowMenu`, `reportBits`); **cross-unit**: `LeaveRequestModal`, `AttendanceEntryModal` from `../../components/hrLeaveModals` (U4 signatures in G.16). Until U4 lands, U2 stubs them locally behind the same names (file `hrLeaveModals.jsx` is created by U4 only; U2 may create a temporary `hrLeaveModals.jsx` stub **only if U4 has not started** — otherwise import and wait).
Dispatches: `UPSERT_EMPLOYEE, DELETE_EMPLOYEE, EMPLOYEE_TRANSITION, APPRAISAL_TRANSITION (probation close), HR_LOG`.

### U3 — PERFORMANCE module
Files: `src/pages/hr/KpiTemplates.jsx`, `AppraisalCycles.jsx`, `AppraisalList.jsx`, `AppraisalForm.jsx`, `src/components/hrAppraisalModals.jsx` (exports `CycleModal, OpenCycleModal`).
May import: U0; U1. No cross-unit modal imports.
Dispatches: `SET_KPI_TEMPLATES, UPSERT_CYCLE, OPEN_CYCLE, CLOSE_CYCLE, UPSERT_APPRAISAL, APPRAISAL_TRANSITION`.

### U4 — LEAVE & ATTENDANCE module
Files: `src/pages/hr/LeaveQueue.jsx`, `src/components/hrLeaveModals.jsx` (exports `LeaveRequestModal({ employee?, onClose }), LeaveDecisionModal({ request, onClose }), EntitlementModal({ employee, onClose }), AttendanceEntryModal({ employee, month?, onClose })`).
May import: U0; U1.
Dispatches: `UPSERT_LEAVE_REQUEST, LEAVE_DECISION, UPSERT_ATTENDANCE, UPSERT_EMPLOYEE (entitlement), CLOSE_LEAVE_YEAR`.

### U5 — SETTLEMENT module
Files: `src/pages/hr/SettlementQueue.jsx`, `SettlementNew.jsx`, `SettlementDetail.jsx`, `src/components/hrSettlementModals.jsx` (exports `ClearanceSignOffModal, ApprovalModal, PaymentModal`), `src/components/SettlementStatement.jsx` (default export).
May import: U0; U1 (`DocumentManager`, `ReasonModal`, `reportBits`).
Dispatches: `INITIATE_SEPARATION, UPSERT_SETTLEMENT, SETTLEMENT_TRANSITION, EMPLOYEE_TRANSITION (Confirm exit)`.

### U6 — INSIGHT module
Files: `src/pages/hr/HrDashboard.jsx`, `HrReminders.jsx`, `HrReports.jsx`, `HrSettings.jsx`.
May import: U0 (incl. `runHrSelfTest`); U1; **cross-unit**: `ProbationDecisionModal` from `hrEmployeeModals` (U2), `LeaveRequestModal` from `hrLeaveModals` (U4).
Dispatches: `HR_LOG, SET_HR_SETTINGS, SET_LEAVE_TYPES, EMPLOYEE_TRANSITION (Confirm exit from reminder), UPSERT_EMPLOYEE (absence notice)`.

Rules for all page units: page files export only the default component (oxlint `only-export-components`); constants allowed. Imports limited to `../../hr/*`, `../../components/*`, `../../store/StoreContext`, `../../utils/helpers`, `react`, `react-router-dom`. Never edit U1 files; request additions from the integrator.

---

## K. Risks, open questions, decisions

1. **STORAGE_KEY stays v3** with `hrSettings.schemaVersion` gating (A.2 #1); bumping `schemaVersion` in a later build wipes HR data only. "Reset demo data" remains the escape hatch.
2. **Reducer side-effects** are limited to: probation appraisal insert (pre-built by page), `OPEN_CYCLE` insert (pre-generated), `CLOSE_CYCLE` copy to employees, `INITIATE_SEPARATION`/`SETTLEMENT_TRANSITION` employee status changes, appraisal cancellation on separation. Everything else is page-driven through `UPSERT_*`.
3. **Audit `by` for seed stage actions** by non-user managers (Nusrat, Shimul) is attributed to the HR Head "on behalf" so AuditLog filters stay consistent.
4. **Worked-example drift**: Jahangir's LWD 2026-10-20 is absolute; after that date the "Confirm exit"/Separated path unlocks and "due in N days" badges change. Mitigation: demo clock; fixtures are date-independent.
5. **Service length** default exclusive of the LWD (`countLastDayInclusive: false`), exposed in Settings with help text; fixtures assert both.
6. **Leave-encashment base** default gross/30 (practice); basic/30 available; the literal s.119 "÷ days worked" variant is not implemented.
7. **EL accrual** default `annual` 20 days (policy ≥ statutory); `perDaysWorked` uses attendance present+leave days.
8. **TDS** is an estimate (no investment rebate); `taxOverride` always wins; gratuity exemption only when `fundApproved`.
9. **Continuous service (240 days)** is a warning flag only; the demo has 3 attendance months.
10. **Reviewer N+2** dropped (A.2 #24). Calibration committee reduced to HR Head + guided-distribution chip.
11. **Status strings shared** with other portals (`Draft, Closed, Cancelled, Pending, Approved, Rejected`) keep identical tones; search/audit views are per-portal so no ambiguity in practice.
12. **IT/Admin clearance** signed by HR Officer (no IT/Admin personas).
13. **PIP** is `hr.pip` + `pipEndDate` + reminder; no PIP entity, no checkpoint workflow. Increment/bonus letters are not generated (report simulation only).
14. **Holidays** list is approximate 2026 dates; editable.
15. **Festival bonus pro-rata** default `none`; the `bonusPaidThisYear` flag prevents double payment and feeds the tax estimate.
16. **Performance**: all computations run in `useMemo`; `computeSettlement` is O(lines); attendance grid ≤ 20 rows.
17. **Accessibility**: `RatingPills` keyboard-navigable; chips are buttons; tables scroll in `.table-wrap` at narrow widths; no new breakpoints added.
18. **Open**: whether Finance clearance should be required before HR approval (currently yes — all 5 rows); whether `leave.prorateOnExit` should default true for Separations.

---

## L. Acceptance checklist (run with seed loaded: Reset demo data → `/hr`)

**Build & persistence**
1. `npm run lint` passes with no new warnings beyond pre-existing; `npm run build` succeeds.
2. DEV console shows no `HR self-test failed` assertions; HR Settings → Statutory → `Verify formulas` lists all fixtures ✓ (I.1–I.7).
3. Reload the page: HR state persists (edit Rakib's mobile, reload → change kept). Clear `localStorage`, reload → seed restored. Open DevTools, set `hrSettings.schemaVersion` to 0 in the stored blob, reload → HR collections re-seeded while KYC/KYS data stays.
4. "Reset demo data" in the HR sidebar (confirm text mentions all portals) restores 18 employees, 3 settlements, 2 cycles, and the HR audit entries.
5. KYC Dashboard "Recent activity" shows only KYC entries; KYS dashboard only KYS; `/hr/audit` only HR, with `HR System` rows rendered without a link and `refCode` shown under the employee.

**Navigation & roles**
6. `/` shows three cards in `grid-3`; HR card stats read "16 employees · 14 appraisals open · 2 settlements open" (On Notice counted active; Separated excluded).
7. Switching to `/hr` while signed in as a KYC user auto-selects Farhana Rahman (HR Officer); the user dropdown lists 8 HR users + System Admin; role chip shows "Full access" only for Admin.
8. Nav badges as Farhana: Employees = probations due ≤ 30 d (1: Sumaiya) + drafts (1) = 2; Leave = 4 pending; Settlements = 1 (Jahangir: IT/Admin/HR rows signable); Reminders > 0.
9. As Rakib Hasan (Employee): sidebar has no New Employee / Reports / Audit / Settings; `/hr/employees` lists only himself; `/hr/employees/emp_kamrul` shows "You do not have access"; `/hr/settings` shows the role-denied alert.
10. As Kamrul Islam (Line Manager): employee list = Kamrul, Jahangir, Rakib; Appraisals "In my queue" = 1 (apr_rakib_my in Manager Review); leave list shows LV-1001 (Rakib) only among non-own requests.
11. As Tahmina Akter (Finance Manager): salary figures visible; `/hr/settlements/stl_moushumi` shows `Approve (Finance)` enabled; `/hr/settlements/stl_jahangir` FINANCE row already signed by her.

**Employee module**
12. New employee → Save & activate with missing NID → error Alert lists "NID…"; fill valid data with Rakib's mobile → duplicate Alert; confirm → status Probation, code EMP-1018, `/hr/appraisals` shows a new APR-10xx Probation appraisal in KPI Setting, audit has `Created`, `Activated`, `Probation Review Created`.
13. Sumaiya → Decide probation (as Sabbir): modal shows checks (score — pending because appraisal not Published → "No published probation review" warning), attendance ≥ 90 ✓, lates ✓; `Extend` once → status stays Probation, `extendedTo = 2027-02-04`; second visit shows Extend disabled with hint.
14. Hasan → Record disciplinary `Final Warning` dated inside 2026 → appears in Discipline tab; his H1 appraisal (when computed) shows gate cap C.
15. Revise salary (as Sabbir) on Rakib: basic 25,000 → 27,000 with reason → Employment tab shows history row, audit `Salary Revised`; as Farhana the button is absent.
16. Suspend Jahid with reason → status Under Suspension (off-track in WorkflowSteps); Reinstate → Confirmed.

**KPI & appraisal**
17. `/hr/kpi`: TPL-SO weights badge green (100); set SO-1 weight 35 → badge amber and Save shows "weights must total 100".
18. `/hr/cycles` → New cycle "Annual 2026" → Open (as Sabbir): modal lists eligible employees and skips Abdul Karim ("joined less than 90 days before period end"), Belal/Moushumi ("separated"), Nabila ("draft"); confirm → appraisals created in KPI Setting with audit `Appraisal Created`.
19. apr_rakib_my as Kamrul: Self actual column visible (status Manager Review); enter actuals (SO-1 92, SO-2 95, SO-3 96.5, SO-4 33, SO-5 470, SO-6 88), ratings 4/4/3/4/4/3 → live KPI 88.26, competency 73.00, final 85.21, grade A; rating 5 without a 50-char comment → validation error; Submit manager review → HR Review; audit detail lists `SO-1 actual … → 92` diffs.
20. Same appraisal as Rakib (Employee) before Publish: manager ratings/scores hidden; after Sabbir publishes: Result card visible, Acknowledge → Acknowledged; Dispute path → Disputed → Sabbir Resolve → Published.
21. apr_hasan_my is overdue: as Farhana (HR Officer) the `Send for agreement on behalf` button appears and the audit detail ends with "(on behalf — deadline passed)".
22. Close CYC-2026-MY with non-terminal appraisals → blocked Alert listing them; cancel stragglers with reason → Close succeeds; Shimul's `lastAppraisal` updates; Hasan's disciplinary record still present.

**Leave & attendance**
23. As Rakib: Request leave EL 3 days next week → balance hint "23 available"; request 30 days → "exceeds balance / maxConsecutive" error. As Kamrul: Approve → LV code, audit `Leave Approved`; Rakib's balance drops by 3.
24. `/hr/attendance` as Farhana: last month grid prefilled; set Rakib present so that present + absent + leave + lwp ≠ workingDays → row error; fix and Save month → audit `Attendance Recorded` with `WD…P…` detail; editing a locked month requires a reason.
25. Balances tab → Close leave year (as Sabbir) → `leave.year` becomes 2027, Rakib's EL opening = previous balance (≤ carry cap 60), audit `Leave Carried Forward` + `Leave Year Closed`.

**Final settlement**
26. `/hr/settlements/stl_jahangir` Statement tab (live): rows exactly I.1 — earnings 234,709.68, deductions 32,580.65, **net 202,129.03**, PF net 685,161.30, total 887,290.33; deadline 2026-12-01; flags include "Finance reported dues". Set HR Settings rounding `strict` → compensation 140,000.00; restore.
27. Initiate separation wizard for Jahid: type Dismissal → Review step error "Dismissal requires a Dismissal Enquiry record with show-cause and enquiry dates"; type Death with `deathAtWork` → compensation at 45 days/yr, group-insurance input visible, Review flags "payee: nominee"; cancel wizard.
28. Jahangir: sign HR and LINE rows (LINE as Kamrul — as Farhana the LINE `Sign off` is disabled with hint); `Submit for HR approval` disabled until `Finalise dues` (hint lists reasons); Finalise (as Farhana) → statement frozen, audit `Dues Computed`; Submit → Pending HR Approval; employee stays On Notice while asOf < 2026-10-20 (set demo clock to 2026-10-21 → resubmission path not needed: `Confirm exit` button appears on the employee and the Reminders card "Exit date passed").
29. Separation of duties: as Farhana (who finalised) `Approve (HR)` is disabled with hint "prepared by you"; as Sabbir approve → Pending Finance Approval; as Admin, Finance approve → Approved for Payment (no Management step: Resignation, G6, net < 500,000; WorkflowSteps shows Management as done/skipped); as Admin `Record payment` disabled ("already approved a stage"); as Tahmina record payment → Paid, employee Separated, `Issue service certificate` available.
30. stl_moushumi: as Tahmina `Return to HR` with comment → Returned to HR; as Farhana Resubmit → Pending HR Approval with a new approval round visible in Approvals tab.
31. Print statement: browser print preview shows only the statement (no sidebar, tabs, buttons), zero-amount rows hidden, four signature blocks, citation per line, law version `bla2026`, "30 working days (Fri, Sat and 0 holidays skipped)".
32. Place on hold / Release on stl_jahangir (as Sabbir) toggles status with reason; Withdraw → employee back to Confirmed, `separationId` cleared, audit `Separation Withdrawn`.

**Reminders, reports, settings**
33. `/hr/reminders`: cards for Sumaiya (probation due), Nusrat (passport ≤ 60 d), Hasan (licence ≤ 60 d), overdue H1 appraisals, Jahangir (settlement vs deadline), pending leave > 3 WD; `Send reminder` → toast + audit `Reminder Sent`.
34. `/hr/reports` → Appraisals tab CYC-2025: grade distribution original vs final; increment simulation default cost = Σ basic × band % × 12 and changes when a band % is edited; CSV export downloads `hr_employees_<date>.csv`.
35. `/hr/settings` (as Sabbir): change `notice.workerPermanent` to 30 → Save → audit `Settings Changed` with detail `notice`; Jahangir's live statement shortfall becomes 0; Restore defaults → 60. As Farhana the route shows the role-denied alert.
36. Demo clock: set `asOfDate = 2026-12-02` → Jahangir statement flags "deadline passed" (deadline is 2026-12-01); clear → real date.

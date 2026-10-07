# KYC / KYS Portal — front-end demo

A React (Vite) single-page application with two portals: **KYC** (Know Your Customer) for dealer, retailer and corporate customer onboarding, and **KYS** (Know Your Supplier) for supplier qualification and monitoring. A landing page at / lets the user choose a portal; the sidebar switches between them. There is no backend: all data lives in the browser's localStorage and is seeded with sample customers and suppliers on first load.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use **Reset demo data** in the sidebar footer to restore the seed data.

## Roles

Switch the signed-in user from the top bar. Permissions are defined in `src/data/config.js` (`PERMISSIONS`).

| Role | Can |
|---|---|
| Field Officer | Create / edit applications, upload documents, verify OTP, submit, request credit |
| Reviewer / Supervisor | Start verification, verify documents, location and bank, assess risk, return or reject, record periodic reviews |
| KYC Approver | Approve / activate, suspend, reinstate, reopen rejected cases |
| Credit Manager | Approve or decline credit limits and payment terms (only for Active customers) |
| Administrator | Everything, plus customer-type configuration |

Identity, tax and bank numbers are masked for roles without "view sensitive data".

## Workflow

`Draft → Submitted → Verification → Approval → Active`, with side states **Returned for Correction**, **Rejected** and **Suspended**, each requiring a recorded reason. KYC approval and credit approval are separate decisions.

## Features

- Customer profile, identity, business registration, outlet location (GPS / device location), owners and authorised representatives
- Business profile with insight: business position (ownership, scale, volumes, turnover, market area), products and suppliers dealt in with supplier concentration and the credit each supplier extends, investment and financing (capital, stock, assets, premises, loans with leverage and debt-service ratios), and the owner's other businesses. Derived flags feed the credit decision screen.
- References: trade, bank, customer, dealer, personal or institutional referees with contact details, a configurable minimum per customer type, reviewer contact outcomes (positive / neutral / negative / unreachable) with feedback, and a summary on the credit decision screen
- Multiple bank / payment accounts per customer (bank, SND, savings, mobile wallet) with one primary account, a purpose per account and separate reviewer verification of each
- Mobile OTP and email-link verification (simulated; the OTP is shown in a toast)
- Document upload with versioning, expiry tracking and reviewer verification
- Mandatory-field and required-document validation per customer type
- Duplicate detection on identity number, mobile, trade license, TIN, BIN and business name
- Weighted risk scoring with reviewer comments
- Credit request → decision with proposed / approved limit and payment terms
- Periodic review scheduling, expiry reminders, overdue alerts
- Full audit trail, dashboard, reports with CSV export
- Settings: required documents, verification depth and review cycle per customer type; role permission matrix

## Structure

```
src/
  data/config.js        roles, statuses, customer types, permissions, risk criteria
  data/seed.js          sample customers and audit entries
  store/StoreContext.jsx reducer + localStorage persistence
  utils/helpers.js      validation, duplicate detection, risk, date helpers
  components/           Layout, DocumentManager, shared UI
  pages/                Dashboard, CustomerList, CustomerForm, CustomerDetail,
                        CreditQueue, Reviews, Reports, AuditLog, Settings
```

## KYS portal (Know Your Supplier)

Routes live under `/kys`. Roles: Procurement Officer (creates and submits), Supplier Evaluator (documents, site audit, references, risk), Procurement Head (approve, suspend, blacklist, reinstate), Finance Manager (commercial terms), Administrator (shared with KYC).

Workflow: `Draft → Submitted → Evaluation → Approval → Active`, with Returned for Correction, Rejected, Suspended and Blacklisted. Commercial terms (payment terms, annual spend cap, supplier rating) are a separate Finance decision available once the supplier is Active.

Supplier record: profile and verified contacts, registration (trade license, TIN, BIN, incorporation, IRC), certifications and compliance declarations (code of conduct, sanctions, PEP, child labour, environment, conflict of interest), capability (supply categories, products with capacity, committed volume, lead time and price, facilities, major clients), three-year financials with trend and leverage, multiple bank accounts, owners and directors with shares, authorised signatories, references with evaluator outcomes, site audit with score, grade and corrective actions, documents with expiry, weighted risk scoring, periodic review and audit trail.

Files: `src/kys/config.js`, `src/kys/helpers.js`, `src/kys/seed.js`, `src/pages/kys/*`.

## HR portal (Know Your Employee)

Routes live under `/hr`. Four modules in one portal: **Employee master** (`/hr/employees`), **KPI & Evaluation** (`/hr/kpi`, `/hr/cycles`, `/hr/appraisals`), **Leave & Attendance** (`/hr/leave`, `/hr/attendance`) and **Final Settlement** (`/hr/settlements`), plus reminders, reports, audit trail and HR settings.

### Roles & users

| User | Role | Can |
|---|---|---|
| Farhana Rahman | HR Officer | Create / edit employee records, documents, attendance, leave administration, settlement preparation and clearance (IT, Admin, HR) |
| Sabbir Hossain | HR Head | Everything the HR Officer can, plus probation decisions, salary revision, disciplinary records, cycle management, publishing results and HR approval of settlements |
| Kamrul Islam, Mizanur Rahman | Line Manager | KPI setting and manager review for direct reports, leave approval, line clearance sign-off |
| Tahmina Akter | Finance Manager | Finance clearance and Finance approval of settlements |
| Anisur Rahman | Managing Director | Management approval of settlements above the threshold, reports |
| Rakib Hasan, Sumaiya Khatun | Employee | Own file, self-assessment, leave requests, acknowledging results |
| System Admin | Administrator | Everything (shared with KYC / KYS) |

Permissions are defined in `src/hr/config.js` (`HR_PERMISSIONS`). Queues and separation of duties are demonstrated by **switching the signed-in user** from the top bar: the person who prepared a settlement statement cannot approve it, and an approver cannot approve a second stage of the same settlement.

### Labour Act defaults

`DEFAULT_HR_SETTINGS` (`src/hr/config.js`) carries the Bangladesh Labour Act 2006 (as amended 2026) rules used by the settlement engine: notice periods per separation type and worker category, compensation and gratuity days per year of service (with resignation tiers for both the pre-2025 and 2026 law versions), earned-leave encashment and caps, provident fund rules, festival bonus, notice-shortfall set-off, the tax slab table for the TDS estimate and the 30-working-day payment deadline. Every figure is editable in **HR Settings** and every statement line cites its section.

### Demo clock

HR dates are computed from `hrSettings.calendar.asOfDate` when set (HR Settings → Holidays & calendar), otherwise from the real local date. Pin it to `2026-10-06` to replay the seeded scenario exactly as designed (the Jahangir Alam settlement reproduces the worked example to the paisa).

### Self-test

`src/hr/selfTest.js` replays fixed fixtures (resignation, termination, retirement, death in service and two appraisals) through the formulas. It runs automatically in development (`npm run dev`, see the browser console) and from **HR Settings → Statutory → Verify formulas**.

Files: `src/hr/config.js`, `src/hr/helpers.js` (+ `settlementCalc.js`, `appraisalCalc.js`), `src/hr/seed.js`, `src/hr/selfTest.js`, `src/pages/hr/*`, `src/components/hr*Modals.jsx`, `src/components/SettlementStatement.jsx`, `src/components/reportBits.jsx`.

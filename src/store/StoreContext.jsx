import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { CREDIT_STATUS, DEFAULT_CUSTOMER_TYPES, STATUS, USERS } from '../data/config';
import { seedAudit, seedCustomers } from '../data/seed';
import { addMonths, migrateCustomer, nextCustomerCode, nowIso, today, uid } from '../utils/helpers';
import { DEFAULT_SUPPLIER_TYPES, KYS_USERS, SUPPLIER_STATUS, TERMS_STATUS } from '../kys/config';
import { migrateSupplier, nextSupplierCode } from '../kys/helpers';
import { seedSupplierAudit, seedSuppliers } from '../kys/seed';
import { APPRAISAL_OPEN, APPRAISAL_STATUS, CYCLE_STATUS, EMPLOYEE_STATUS, HR_SYSTEM, HR_USERS, LEAVE_STATUS, SETTLEMENT_STATUS } from '../hr/config';
import {
  appraisalDiff, canApproveStage, closeLeaveYear, grossSalary, migrateAppraisal, migrateEmployee, migrateHrSettings, migrateSettlement,
  nextEmployeeCode, nextLeaveCode, nextSettlementCode, probationEndDate, serviceLength,
} from '../hr/helpers';
import { seedHr, seedHrAudit } from '../hr/seed';

const STORAGE_KEY = 'kyc_kys_store_v3';

export const ALL_USERS = [...USERS, ...KYS_USERS, ...HR_USERS];

// The audit trail is shared by all portals; oldest entries are dropped beyond this many.
const AUDIT_CAP = 4000;
const byAtDesc = (a, b) => new Date(b.at) - new Date(a.at);

const buildInitial = () => {
  const customers = seedCustomers();
  const suppliers = seedSuppliers();
  const hr = seedHr();
  return {
    currentUserId: 'u1',
    customers,
    customerTypes: DEFAULT_CUSTOMER_TYPES,
    suppliers,
    supplierTypes: DEFAULT_SUPPLIER_TYPES,
    ...hr,
    audit: [...seedAudit(customers), ...seedSupplierAudit(suppliers), ...seedHrAudit(hr)].sort(byAtDesc),
  };
};

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.customers)) {
        const fresh = buildInitial();
        // HR collections are versioned together: a missing or older schema replaces all of them (and their audit) with fresh seed.
        const hrStale = !parsed.hrSettings || (parsed.hrSettings.schemaVersion || 0) < fresh.hrSettings.schemaVersion;
        const hrPart = hrStale
          ? { employees: fresh.employees, kpiTemplates: fresh.kpiTemplates, appraisalCycles: fresh.appraisalCycles, appraisals: fresh.appraisals, leaveTypes: fresh.leaveTypes, leaveRequests: fresh.leaveRequests, attendance: fresh.attendance, settlements: fresh.settlements, hrSettings: fresh.hrSettings }
          : {
            employees: Array.isArray(parsed.employees) ? parsed.employees.map(migrateEmployee) : fresh.employees,
            kpiTemplates: Array.isArray(parsed.kpiTemplates) ? parsed.kpiTemplates : fresh.kpiTemplates,
            appraisalCycles: Array.isArray(parsed.appraisalCycles) ? parsed.appraisalCycles : fresh.appraisalCycles,
            appraisals: Array.isArray(parsed.appraisals) ? parsed.appraisals.map(migrateAppraisal) : fresh.appraisals,
            leaveTypes: Array.isArray(parsed.leaveTypes) ? parsed.leaveTypes : fresh.leaveTypes,
            leaveRequests: Array.isArray(parsed.leaveRequests) ? parsed.leaveRequests : fresh.leaveRequests,
            attendance: Array.isArray(parsed.attendance) ? parsed.attendance : fresh.attendance,
            settlements: Array.isArray(parsed.settlements) ? parsed.settlements.map(migrateSettlement) : fresh.settlements,
            hrSettings: migrateHrSettings(parsed.hrSettings),
          };
        const audit = hrStale ? [...(parsed.audit || []).filter((a) => a.portal !== 'hr'), ...seedHrAudit(hrPart)].sort(byAtDesc) : parsed.audit;
        return {
          ...fresh,
          ...parsed,
          customers: parsed.customers.map(migrateCustomer),
          suppliers: Array.isArray(parsed.suppliers) ? parsed.suppliers.map(migrateSupplier) : fresh.suppliers,
          supplierTypes: Array.isArray(parsed.supplierTypes) ? parsed.supplierTypes : fresh.supplierTypes,
          ...hrPart,
          audit,
        };
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return buildInitial();
};

// Audit entries are shared between portals; `portal` tells the pages which list to show.
// `extra` carries the optional refId / refCode of an HR sub-record (appraisal, settlement, leave request).
const audit = (state, entity, action, by, detail = '', portal = 'kyc', extra = {}) => [
  {
    id: uid('aud'),
    portal,
    customerId: entity.id,
    customerCode: entity.code || '(draft)',
    businessName: portal === 'kyc' ? entity.businessName : entity.name,
    action,
    by,
    at: nowIso(),
    detail,
    ...extra,
  },
  ...state.audit,
].slice(0, AUDIT_CAP);

// HR entries anchor to the employee; settings / cycle / leave-year changes anchor to the HR_SYSTEM pseudo-entity.
const hrAudit = (state, emp, action, by, detail = '', ref = null) =>
  audit(state, { id: emp.id, code: emp.code, name: emp.name }, action, by, detail, 'hr', ref ? { refId: ref.id, refCode: ref.code } : {});
const empOf = (state, id) => state.employees.find((e) => e.id === id);
const empOrStub = (state, id) => empOf(state, id) || { id, code: '', name: '(unknown employee)' };
const pushHistory = (rec, status, by, note = '') => ({ ...rec, history: [...(rec.history || []), { status, at: nowIso(), by, note }] });
const pushStatusHistory = (emp, status, by, reason = '') => ({ ...emp, statusHistory: [...(emp.statusHistory || []), { status, at: nowIso(), by, reason }] });
const userByName = (name) => ALL_USERS.find((u) => u.name === name);

// Everything on a settlement that feeds computeSettlement (staleness of a frozen statement).
const SETTLEMENT_INPUT_FIELDS = ['type', 'misconductClause', 'deathAtWork', 'afterLayoff', 'workCompleted', 'probationer', 'noticeDate', 'lastWorkingDay', 'noticeRequiredDays', 'noticeWaivedDays', 'payInLieu', 'payInLieuDays', 'nominee'];
const settlementInputsSig = (s) => JSON.stringify([s.inputs || {}, SETTLEMENT_INPUT_FIELDS.map((k) => s[k] ?? null), (s.clearance || []).map((r) => [r.dept, r.status, r.recoverable, r.remarks])]);

const replaceIn = (list, item) => list.map((x) => (x.id === item.id ? item : x));
const upsertIn = (list, item) => (list.some((x) => x.id === item.id) ? replaceIn(list, item) : [item, ...list]);

const SALARY_COMPONENTS = ['basic', 'houseRent', 'medical', 'conveyance', 'dearness', 'adhoc', 'otherAllowances'];

function reducer(state, a) {
  switch (a.type) {
    case 'SET_USER':
      return { ...state, currentUserId: a.userId };

    // ------------------------------------------------------------------ KYC
    case 'UPSERT_CUSTOMER': {
      const exists = state.customers.some((c) => c.id === a.customer.id);
      const customer = { ...a.customer, updatedAt: nowIso() };
      const customers = exists ? replaceIn(state.customers, customer) : [customer, ...state.customers];
      return {
        ...state,
        customers,
        audit: audit(state, customer, exists ? a.action || 'Updated' : 'Created', a.by, a.detail || (exists ? 'Record updated' : 'Application created')),
      };
    }

    case 'DELETE_CUSTOMER': {
      const customer = state.customers.find((c) => c.id === a.id);
      if (!customer) return state;
      return { ...state, customers: state.customers.filter((c) => c.id !== a.id), audit: audit(state, customer, 'Deleted', a.by, 'Draft discarded') };
    }

    case 'TRANSITION': {
      const current = state.customers.find((c) => c.id === a.id);
      if (!current) return state;
      const typeCfg = state.customerTypes.find((t) => t.code === current.customerType);
      let next = { ...current, status: a.status, statusReason: a.reason || '', updatedAt: nowIso() };
      if (a.status === STATUS.SUBMITTED && !next.code) next.code = nextCustomerCode(state.customers, current.customerType);
      if (a.status === STATUS.VERIFICATION && a.reviewer) next.assignedReviewer = a.reviewer;
      if (a.status === STATUS.ACTIVE) {
        // First activation starts the review clock. Reinstatement keeps the existing schedule so an overdue review is not silently cleared.
        if (a.label === 'Approved' || !next.reviewDue) {
          next.lastReviewed = today();
          next.reviewDue = addMonths(today(), typeCfg?.reviewMonths || 12);
        }
        next.activatedAt = next.activatedAt || nowIso();
        if (current.credit?.status === CREDIT_STATUS.SUSPENDED) next.credit = { ...current.credit, status: CREDIT_STATUS.APPROVED };
      }
      if (a.status === STATUS.SUSPENDED && current.credit?.status === CREDIT_STATUS.APPROVED) next.credit = { ...current.credit, status: CREDIT_STATUS.SUSPENDED };
      if (a.status === STATUS.REJECTED && [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW, CREDIT_STATUS.APPROVED].includes(current.credit?.status)) {
        next.credit = { ...current.credit, status: CREDIT_STATUS.DECLINED, approvedLimit: '', proposedLimit: '', decisionBy: a.by, decisionAt: nowIso(), decisionNote: 'KYC application rejected' };
      }
      if (a.patch) next = { ...next, ...a.patch };
      return { ...state, customers: replaceIn(state.customers, next), audit: audit(state, next, a.label || a.status, a.by, a.reason || a.detail || '') };
    }

    case 'CREDIT_DECISION': {
      const current = state.customers.find((c) => c.id === a.id);
      if (!current) return state;
      const credit = { ...current.credit, ...a.credit };
      const next = { ...current, credit, updatedAt: nowIso() };
      const label = { [CREDIT_STATUS.APPROVED]: 'Credit Approved', [CREDIT_STATUS.DECLINED]: 'Credit Declined', [CREDIT_STATUS.UNDER_REVIEW]: 'Credit Under Review' }[credit.status] || 'Credit Requested';
      return { ...state, customers: replaceIn(state.customers, next), audit: audit(state, next, label, a.by, a.detail || '') };
    }

    case 'COMPLETE_REVIEW': {
      const current = state.customers.find((c) => c.id === a.id);
      if (!current) return state;
      const typeCfg = state.customerTypes.find((t) => t.code === current.customerType);
      const next = { ...current, lastReviewed: today(), reviewDue: addMonths(today(), typeCfg?.reviewMonths || 12), updatedAt: nowIso() };
      return { ...state, customers: replaceIn(state.customers, next), audit: audit(state, next, 'Periodic Review Completed', a.by, a.detail || '') };
    }

    case 'LOG': {
      const current = state.customers.find((c) => c.id === a.id);
      if (!current) return state;
      return { ...state, audit: audit(state, current, a.action, a.by, a.detail) };
    }

    case 'SET_TYPES':
      return { ...state, customerTypes: a.customerTypes };

    // ------------------------------------------------------------------ KYS
    case 'UPSERT_SUPPLIER': {
      const exists = state.suppliers.some((s) => s.id === a.supplier.id);
      const supplier = { ...a.supplier, updatedAt: nowIso() };
      const suppliers = exists ? replaceIn(state.suppliers, supplier) : [supplier, ...state.suppliers];
      return {
        ...state,
        suppliers,
        audit: audit(state, supplier, exists ? a.action || 'Updated' : 'Created', a.by, a.detail || (exists ? 'Record updated' : 'Supplier application created'), 'kys'),
      };
    }

    case 'DELETE_SUPPLIER': {
      const supplier = state.suppliers.find((s) => s.id === a.id);
      if (!supplier) return state;
      return { ...state, suppliers: state.suppliers.filter((s) => s.id !== a.id), audit: audit(state, supplier, 'Deleted', a.by, 'Draft discarded', 'kys') };
    }

    case 'SUPPLIER_TRANSITION': {
      const current = state.suppliers.find((s) => s.id === a.id);
      if (!current) return state;
      const typeCfg = state.supplierTypes.find((t) => t.code === current.supplierType);
      let next = { ...current, status: a.status, statusReason: a.reason || '', updatedAt: nowIso() };
      if (a.status === SUPPLIER_STATUS.SUBMITTED && !next.code) next.code = nextSupplierCode(state.suppliers);
      if (a.status === SUPPLIER_STATUS.EVALUATION && a.evaluator) next.assignedEvaluator = a.evaluator;
      if (a.status === SUPPLIER_STATUS.ACTIVE) {
        if (a.label === 'Approved' || !next.reviewDue) {
          next.lastReviewed = today();
          next.reviewDue = addMonths(today(), typeCfg?.reviewMonths || 12);
        }
        next.activatedAt = next.activatedAt || nowIso();
        if (current.terms?.status === TERMS_STATUS.SUSPENDED) next.terms = { ...current.terms, status: TERMS_STATUS.APPROVED };
      }
      if (a.status === SUPPLIER_STATUS.SUSPENDED && current.terms?.status === TERMS_STATUS.APPROVED) {
        next.terms = { ...current.terms, status: TERMS_STATUS.SUSPENDED, decisionBy: a.by, decisionAt: nowIso(), decisionNote: `${a.status}: ${a.reason || ''}` };
      }
      // Blacklisting withdraws terms in any live state, including ones already suspended or still pending.
      if (a.status === SUPPLIER_STATUS.BLACKLISTED && [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW, TERMS_STATUS.APPROVED, TERMS_STATUS.SUSPENDED].includes(current.terms?.status)) {
        next.terms = { ...current.terms, status: TERMS_STATUS.DECLINED, approvedCap: '', decisionBy: a.by, decisionAt: nowIso(), decisionNote: `${a.status}: ${a.reason || ''}` };
      }
      if (a.status === SUPPLIER_STATUS.REJECTED && [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW, TERMS_STATUS.APPROVED].includes(current.terms?.status)) {
        next.terms = { ...current.terms, status: TERMS_STATUS.DECLINED, approvedCap: '', decisionBy: a.by, decisionAt: nowIso(), decisionNote: 'Supplier application rejected' };
      }
      if (a.patch) next = { ...next, ...a.patch };
      return { ...state, suppliers: replaceIn(state.suppliers, next), audit: audit(state, next, a.label || a.status, a.by, a.reason || a.detail || '', 'kys') };
    }

    case 'TERMS_DECISION': {
      const current = state.suppliers.find((s) => s.id === a.id);
      if (!current) return state;
      const terms = { ...current.terms, ...a.terms };
      const next = { ...current, terms, updatedAt: nowIso() };
      const label = { [TERMS_STATUS.APPROVED]: 'Terms Approved', [TERMS_STATUS.DECLINED]: 'Terms Declined', [TERMS_STATUS.UNDER_REVIEW]: 'Terms Under Review' }[terms.status] || 'Terms Requested';
      return { ...state, suppliers: replaceIn(state.suppliers, next), audit: audit(state, next, label, a.by, a.detail || '', 'kys') };
    }

    case 'SUPPLIER_COMPLETE_REVIEW': {
      const current = state.suppliers.find((s) => s.id === a.id);
      if (!current) return state;
      const typeCfg = state.supplierTypes.find((t) => t.code === current.supplierType);
      const next = { ...current, lastReviewed: today(), reviewDue: addMonths(today(), typeCfg?.reviewMonths || 12), updatedAt: nowIso() };
      return { ...state, suppliers: replaceIn(state.suppliers, next), audit: audit(state, next, 'Periodic Review Completed', a.by, a.detail || '', 'kys') };
    }

    case 'SUPPLIER_LOG': {
      const current = state.suppliers.find((s) => s.id === a.id);
      if (!current) return state;
      return { ...state, audit: audit(state, current, a.action, a.by, a.detail, 'kys') };
    }

    case 'SET_SUPPLIER_TYPES':
      return { ...state, supplierTypes: a.supplierTypes };

    // ------------------------------------------------------------------ HR
    case 'UPSERT_EMPLOYEE': {
      const prev = empOf(state, a.employee.id);
      let employee = { ...a.employee, updatedAt: nowIso() };
      // A salary change on a live record is versioned so the statement and reports can show the history.
      if (prev && prev.status !== EMPLOYEE_STATUS.DRAFT && SALARY_COMPONENTS.some((k) => String(prev.salary?.[k] ?? '') !== String(employee.salary?.[k] ?? ''))) {
        const entry = { id: uid('sal'), effectiveFrom: employee.salary.effectiveFrom || '' };
        SALARY_COMPONENTS.forEach((k) => { entry[k] = employee.salary[k] ?? ''; });
        employee = { ...employee, salary: { ...employee.salary, history: [...(employee.salary.history || []), { ...entry, gross: grossSalary(employee.salary), reason: a.detail || '', by: a.by, at: nowIso() }] } };
      }
      return {
        ...state,
        employees: prev ? replaceIn(state.employees, employee) : [employee, ...state.employees],
        audit: hrAudit(state, employee, prev ? a.action || 'Updated' : 'Created', a.by, a.detail || (prev ? 'Record updated' : 'Employee record created')),
      };
    }

    case 'DELETE_EMPLOYEE': {
      const employee = empOf(state, a.id);
      if (!employee || employee.status !== EMPLOYEE_STATUS.DRAFT) return state;
      return { ...state, employees: state.employees.filter((e) => e.id !== a.id), audit: hrAudit(state, employee, 'Deleted', a.by, 'Draft discarded') };
    }

    case 'EMPLOYEE_TRANSITION': {
      const cur = empOf(state, a.id);
      if (!cur) return state;
      const S = EMPLOYEE_STATUS;
      let next = pushStatusHistory({ ...cur, status: a.status, statusReason: a.reason || '', updatedAt: nowIso() }, a.status, a.by, a.reason || '');
      if (cur.status === S.DRAFT && a.status !== S.DRAFT) {
        // Leaving Draft assigns the employee code and the probation clock (or the confirmation date when no probation applies).
        if (!next.code) next.code = nextEmployeeCode(state.employees);
        const emp = { ...cur.employment, probation: { ...cur.employment.probation } };
        if (a.status === S.PROBATION) emp.probation.endDate = addMonths(emp.joinDate, Number(emp.probation.months) || 0);
        if (a.status === S.CONFIRMED) emp.confirmationDate = emp.confirmationDate || emp.joinDate;
        next.employment = emp;
      }
      if (a.status === S.SUSPENDED) next.suspendedFrom = cur.status;
      if (a.status === S.SEPARATED) next.separatedAt = a.patch?.separatedAt || a.asOf || today();
      if (a.patch) next = { ...next, ...a.patch };
      if (a.status === S.CONFIRMED && cur.status === S.PROBATION) {
        // Confirmation from probation: the page may pass the decision date in the patch; otherwise the probation end date is used.
        const confirmationDate = next.employment.confirmationDate || a.patch?.confirmationDate || probationEndDate(cur) || a.asOf || today();
        next.employment = { ...next.employment, confirmationDate, probation: { ...next.employment.probation, decision: 'Confirm', decidedAt: nowIso(), decidedBy: a.by } };
      }
      let log = hrAudit(state, next, a.label || a.status, a.by, a.reason || a.detail || '');
      let appraisals = state.appraisals;
      if (a.appraisal) {
        // Entering probation creates the probation review (object built by the page from the probation template).
        appraisals = [a.appraisal, ...state.appraisals];
        log = hrAudit({ audit: log }, next, 'Probation Review Created', a.by, `${a.appraisal.code}: probation review due ${a.appraisal.due?.publish || probationEndDate(next) || ''}`, a.appraisal);
      }
      return { ...state, employees: replaceIn(state.employees, next), appraisals, audit: log };
    }

    case 'HR_LOG': {
      const emp = a.employeeId === HR_SYSTEM.id ? HR_SYSTEM : empOf(state, a.employeeId);
      if (!emp) return state;
      return { ...state, audit: hrAudit(state, emp, a.action, a.by, a.detail || '', a.ref || null) };
    }

    case 'SET_KPI_TEMPLATES':
      return { ...state, kpiTemplates: a.kpiTemplates, audit: hrAudit(state, HR_SYSTEM, 'KPI Templates Changed', a.by, `${a.kpiTemplates.length} templates`) };

    case 'SET_LEAVE_TYPES':
      return { ...state, leaveTypes: a.leaveTypes, audit: hrAudit(state, HR_SYSTEM, 'Leave Types Changed', a.by, `${a.leaveTypes.length} leave types`) };

    case 'SET_HR_SETTINGS':
      return {
        ...state,
        hrSettings: { ...a.hrSettings, schemaVersion: state.hrSettings.schemaVersion },
        audit: hrAudit(state, HR_SYSTEM, 'Settings Changed', a.by, a.detail || 'HR settings updated'),
      };

    case 'UPSERT_CYCLE': {
      const cycle = { ...a.cycle, updatedAt: nowIso() };
      return { ...state, appraisalCycles: upsertIn(state.appraisalCycles, cycle), audit: hrAudit(state, HR_SYSTEM, 'Cycle Saved', a.by, `${cycle.code}: ${cycle.name} (${cycle.status})`) };
    }

    case 'OPEN_CYCLE': {
      const cur = state.appraisalCycles.find((c) => c.id === a.id);
      if (!cur) return state;
      const cycle = { ...cur, status: CYCLE_STATUS.OPEN, openedAt: nowIso(), updatedAt: nowIso() };
      const created = a.appraisals || [];
      let log = state.audit;
      created.forEach((apr) => { log = hrAudit({ audit: log }, empOrStub(state, apr.employeeId), 'Appraisal Created', a.by, `${apr.code}: ${cycle.name}`, apr); });
      log = hrAudit({ audit: log }, HR_SYSTEM, 'Cycle Opened', a.by, `${cycle.code}: ${created.length} appraisals created`);
      return { ...state, appraisalCycles: replaceIn(state.appraisalCycles, cycle), appraisals: [...created, ...state.appraisals], audit: log };
    }

    case 'CLOSE_CYCLE': {
      const cur = state.appraisalCycles.find((c) => c.id === a.id);
      if (!cur) return state;
      const A = APPRAISAL_STATUS;
      const cycle = { ...cur, status: CYCLE_STATUS.CLOSED, closedAt: nowIso(), updatedAt: nowIso() };
      const at = nowIso();
      let employees = state.employees;
      let log = state.audit;
      const appraisals = state.appraisals.map((apr) => {
        if (apr.cycleId !== cycle.id || ![A.PUBLISHED, A.ACKNOWLEDGED].includes(apr.status)) return apr;
        const closed = pushHistory({ ...apr, status: A.CLOSED, updatedAt: at }, A.CLOSED, a.by, `Cycle ${cycle.code} closed`);
        // The published result becomes the employee's last appraisal; grade D also removes rehire eligibility. Disciplinary records are never touched here.
        employees = employees.map((e) => (e.id !== apr.employeeId ? e : {
          ...e,
          lastAppraisal: { code: apr.code, cycle: cycle.code, grade: apr.scores?.gradeFinal || '', final: apr.scores?.final ?? '', at },
          rehireEligible: apr.scores?.gradeFinal === 'D' ? false : e.rehireEligible,
          updatedAt: at,
        }));
        log = hrAudit({ audit: log }, empOrStub(state, apr.employeeId), 'Appraisal Closed', a.by, `${apr.code}: grade ${apr.scores?.gradeFinal || '—'}, final ${apr.scores?.final ?? '—'}`, apr);
        return closed;
      });
      log = hrAudit({ audit: log }, HR_SYSTEM, 'Cycle Closed', a.by, `${cycle.code}: ${cycle.name}`);
      return { ...state, appraisalCycles: replaceIn(state.appraisalCycles, cycle), appraisals, employees, audit: log };
    }

    case 'UPSERT_APPRAISAL': {
      const prev = state.appraisals.find((x) => x.id === a.appraisal.id);
      const next = { ...a.appraisal, updatedAt: nowIso() };
      const detail = a.detail || appraisalDiff(prev, next).join('; ') || 'Lines saved';
      return { ...state, appraisals: upsertIn(state.appraisals, next), audit: hrAudit(state, empOrStub(state, next.employeeId), 'Appraisal Updated', a.by, detail, next) };
    }

    case 'APPRAISAL_TRANSITION': {
      const cur = state.appraisals.find((x) => x.id === a.id);
      if (!cur) return state;
      const A = APPRAISAL_STATUS;
      // Separation of duties: the appraisee never sets, calibrates, publishes or resolves their own appraisal.
      const actor = userByName(a.by);
      const reviewStep = (cur.status === A.KPI_SETTING && a.status === A.AGREED)
        || ([A.MANAGER, A.RETURNED].includes(cur.status) && a.status === A.HR)
        || (cur.status === A.HR && [A.PUBLISHED, A.RETURNED].includes(a.status))
        || (cur.status === A.DISPUTED && a.status === A.PUBLISHED);
      if (reviewStep && actor?.employeeId && actor.employeeId === cur.employeeId) return state;
      const at = nowIso();
      const note = a.reason || a.detail || '';
      let next = pushHistory({ ...cur, ...a.patch, status: a.status, statusReason: a.reason || '', updatedAt: at }, a.status, a.by, note);
      // Stage stamps: who completed the stage and when.
      if (a.status === A.MANAGER) next.self = { ...next.self, submittedAt: at };
      if (a.status === A.HR) next.manager = { ...next.manager, submittedAt: at, by: a.by };
      if (a.status === A.PUBLISHED && cur.status === A.DISPUTED) next.dispute = { ...next.dispute, resolvedAt: at, resolvedBy: a.by };
      else if (a.status === A.PUBLISHED) next.hr = { ...next.hr, reviewedAt: at, by: a.by };
      if ([A.ACKNOWLEDGED, A.DISPUTED].includes(a.status)) next.acknowledgement = { ...next.acknowledgement, at, by: a.by };
      const detail = `${cur.code}: ${note}${a.onBehalf ? ' (on behalf — deadline passed)' : ''}`;
      return { ...state, appraisals: replaceIn(state.appraisals, next), audit: hrAudit(state, empOrStub(state, next.employeeId), a.label || a.status, a.by, detail, next) };
    }

    case 'UPSERT_LEAVE_REQUEST': {
      const prev = state.leaveRequests.find((r) => r.id === a.request.id);
      if (prev && prev.status !== LEAVE_STATUS.PENDING) return state;
      const at = nowIso();
      const req = prev
        ? { ...a.request, updatedAt: at }
        : { ...a.request, code: a.request.code || nextLeaveCode(state.leaveRequests), status: LEAVE_STATUS.PENDING, requestedBy: a.request.requestedBy || a.by, requestedAt: at, updatedAt: at };
      const detail = `${req.code}: ${req.typeCode} ${req.from} → ${req.to} (${req.days}d)`;
      return { ...state, leaveRequests: prev ? replaceIn(state.leaveRequests, req) : [req, ...state.leaveRequests], audit: hrAudit(state, empOrStub(state, req.employeeId), prev ? 'Leave Request Updated' : 'Leave Requested', a.by, detail, req) };
    }

    case 'LEAVE_DECISION': {
      const cur = state.leaveRequests.find((r) => r.id === a.id);
      if (!cur) return state;
      const next = { ...cur, status: a.status, decision: { by: a.by, at: nowIso(), comment: a.comment || '' }, updatedAt: nowIso() };
      const label = { [LEAVE_STATUS.APPROVED]: 'Leave Approved', [LEAVE_STATUS.REJECTED]: 'Leave Rejected', [LEAVE_STATUS.CANCELLED]: 'Leave Cancelled' }[a.status] || 'Leave Decision';
      return { ...state, leaveRequests: replaceIn(state.leaveRequests, next), audit: hrAudit(state, empOrStub(state, next.employeeId), label, a.by, `${next.code}: ${a.comment || ''}`, next) };
    }

    case 'UPSERT_ATTENDANCE': {
      let attendance = state.attendance;
      let log = state.audit;
      (a.records || []).forEach((r) => {
        const existing = attendance.find((x) => x.employeeId === r.employeeId && x.month === r.month);
        // A locked month (already used by an appraisal snapshot) can only be changed with a recorded reason.
        if (existing?.locked && !a.reason) return;
        const rec = { ...r, id: existing?.id || r.id || uid('att'), enteredBy: a.by, updatedAt: nowIso() };
        attendance = existing ? attendance.map((x) => (x.id === existing.id ? rec : x)) : [rec, ...attendance];
        const detail = `${rec.month}: WD${rec.workingDays} P${rec.present} A${rec.absent} L${rec.late} Lv${rec.leave}${a.reason ? ' — ' + a.reason : ''}`;
        log = hrAudit({ audit: log }, empOrStub(state, rec.employeeId), 'Attendance Recorded', a.by, detail);
      });
      return { ...state, attendance, audit: log };
    }

    case 'CLOSE_LEAVE_YEAR': {
      const year = Number(state.hrSettings.leave.year);
      const { employees, details } = closeLeaveYear(state.employees, state.leaveTypes, state.leaveRequests, state.hrSettings, a.asOf, state.attendance);
      let log = state.audit;
      employees.forEach((e) => { if (details[e.id]) log = hrAudit({ audit: log }, e, 'Leave Carried Forward', a.by, details[e.id]); });
      log = hrAudit({ audit: log }, HR_SYSTEM, 'Leave Year Closed', a.by, `${year} closed; balances rolled into ${year + 1}`);
      return { ...state, employees, hrSettings: { ...state.hrSettings, leave: { ...state.hrSettings.leave, year: year + 1 } }, audit: log };
    }

    case 'INITIATE_SEPARATION': {
      const emp = empOf(state, a.settlement.employeeId);
      if (!emp) return state;
      const at = nowIso();
      // prevRehireEligible: the employee's flag before initiation, restored on withdrawal.
      const sep = pushHistory({ ...a.settlement, prevRehireEligible: emp.rehireEligible !== false, code: a.settlement.code || nextSettlementCode(state.settlements), status: SETTLEMENT_STATUS.INITIATED, createdAt: a.settlement.createdAt || at, updatedAt: at, inputsChangedAt: at }, SETTLEMENT_STATUS.INITIATED, a.by, a.settlement.reason || '');
      const next = pushStatusHistory({ ...emp, status: EMPLOYEE_STATUS.NOTICE, statusReason: `${sep.type}: LWD ${sep.lastWorkingDay}`, separationId: sep.id, rehireEligible: sep.rehireEligible !== false, updatedAt: at }, EMPLOYEE_STATUS.NOTICE, a.by, sep.type);
      let log = hrAudit(state, next, 'Separation Initiated', a.by, `${sep.code}: ${sep.type}, LWD ${sep.lastWorkingDay}`, sep);
      // Open appraisals are cancelled unless the employee serves most of the period (pro-rata rule, A.2 #25).
      const proRataMonths = Number(state.hrSettings.appraisal?.proRataMonths) || 9;
      const lwd = sep.lastWorkingDay || a.asOf;
      const appraisals = state.appraisals.map((apr) => {
        if (apr.employeeId !== emp.id || !APPRAISAL_OPEN.includes(apr.status)) return apr;
        const from = apr.periodFrom > (emp.employment?.joinDate || '') ? apr.periodFrom : emp.employment.joinDate;
        const to = lwd < apr.periodTo ? lwd : apr.periodTo;
        // Completed months served in the period (LWD counted as a day worked), not calendar months touched.
        const len = serviceLength(from, to, true);
        if (apr.type !== 'Probation' && len.years * 12 + len.months >= proRataMonths) return { ...apr, proRata: true, updatedAt: at };
        const cancelled = pushHistory({ ...apr, status: APPRAISAL_STATUS.CANCELLED, statusReason: 'Separation initiated', updatedAt: at }, APPRAISAL_STATUS.CANCELLED, a.by, 'Separation initiated');
        log = hrAudit({ audit: log }, next, 'Appraisal Cancelled', a.by, `${apr.code}: separation initiated`, apr);
        return cancelled;
      });
      return { ...state, settlements: [sep, ...state.settlements], employees: replaceIn(state.employees, next), appraisals, audit: log };
    }

    case 'UPSERT_SETTLEMENT': {
      const prev = state.settlements.find((s) => s.id === a.settlement.id);
      const at = nowIso();
      // inputsChangedAt moves only when something computeSettlement reads changes (inputs, separation terms,
      // clearance rows), so status changes and document/certificate saves never make a frozen statement stale.
      // A statement frozen in this same save already reflects the saved inputs.
      const freshStatement = a.settlement.statement && a.settlement.statement.computedAt !== prev?.statement?.computedAt;
      const changed = !prev || settlementInputsSig(prev) !== settlementInputsSig(a.settlement);
      const inputsChangedAt = changed && !freshStatement ? at : (prev?.inputsChangedAt || a.settlement.inputsChangedAt || '');
      const sep = { ...a.settlement, updatedAt: at, inputsChangedAt };
      return { ...state, settlements: upsertIn(state.settlements, sep), audit: hrAudit(state, empOrStub(state, sep.employeeId), a.action || 'Settlement Updated', a.by, a.detail || '', sep) };
    }

    case 'SETTLEMENT_TRANSITION': {
      const cur = state.settlements.find((s) => s.id === a.id);
      if (!cur) return state;
      const S = SETTLEMENT_STATUS;
      // Separation of duties (A.2 #10): an approval or payment by the preparer or a prior approver is refused outright.
      const stage = a.approval ? a.approval.stage : a.status === S.PAID ? 'Pay' : '';
      if (stage && !canApproveStage(cur, stage, userByName(a.by)).ok) return state;
      const at = nowIso();
      const note = a.reason || a.detail || '';
      let next = pushHistory({ ...cur, ...a.patch, status: a.status, statusReason: a.reason || '', updatedAt: at }, a.status, a.by, note);
      if (a.approval) next.approvals = [...(cur.approvals || []), { ...a.approval, by: a.by, at }];
      if (a.status === S.ON_HOLD) next.hold = { reason: a.reason || '', at, by: a.by };
      const emp = empOf(state, cur.employeeId);
      let employees = state.employees;
      let log = hrAudit(state, empOrStub(state, cur.employeeId), a.label || a.status, a.by, `${cur.code}: ${note}`, next);
      if (emp) {
        const lwd = next.lastWorkingDay;
        const exitNow = (a.status === S.HR_APPROVAL && emp.status === EMPLOYEE_STATUS.NOTICE && lwd && lwd <= (a.asOf || today())) || (a.status === S.PAID && emp.status !== EMPLOYEE_STATUS.SEPARATED);
        if (exitNow) {
          const left = pushStatusHistory({ ...emp, status: EMPLOYEE_STATUS.SEPARATED, statusReason: `${next.type}: LWD ${lwd}`, separatedAt: lwd || a.asOf || today(), updatedAt: at }, EMPLOYEE_STATUS.SEPARATED, a.by, next.type);
          employees = replaceIn(employees, left);
          log = hrAudit({ audit: log }, left, 'Exit Completed', a.by, `${next.code}: last working day ${lwd}`, next);
        }
        if (a.status === S.WITHDRAWN) {
          // Undo initiation: a suspension imposed since stays; rehire flag and exit date revert.
          const to = emp.status === EMPLOYEE_STATUS.SUSPENDED ? EMPLOYEE_STATUS.SUSPENDED : next.previousStatus || EMPLOYEE_STATUS.CONFIRMED;
          const back = pushStatusHistory({ ...emp, status: to, statusReason: to === emp.status ? emp.statusReason : '', separationId: '', separatedAt: '', ...('prevRehireEligible' in next ? { rehireEligible: next.prevRehireEligible } : {}), updatedAt: at }, to, a.by, 'Separation withdrawn');
          employees = replaceIn(employees, back);
          log = hrAudit({ audit: log }, back, 'Separation Withdrawn', a.by, `${next.code}: ${note}`, next);
        }
      }
      return { ...state, settlements: replaceIn(state.settlements, next), employees, audit: log };
    }

    case 'RESET':
      return buildInitial();

    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  }, [state]);

  const notify = useCallback((message, kind = 'success') => {
    const id = uid('toast');
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const currentUser = useMemo(() => ALL_USERS.find((u) => u.id === state.currentUserId) || ALL_USERS[0], [state.currentUserId]);

  const value = useMemo(() => ({ state, dispatch, currentUser, notify, toasts }), [state, currentUser, notify, toasts]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
};

export const useTypeConfig = (code) => {
  const { state } = useStore();
  return state.customerTypes.find((t) => t.code === code);
};

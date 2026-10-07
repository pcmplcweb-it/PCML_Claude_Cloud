// Appraisal-cycle modals used by the HR cycles page: create / edit a cycle
// and open a Planned cycle by generating one appraisal per eligible employee.
// Also the page-level appraisal gating shared by the appraisal list and form.
import { useMemo, useState } from 'react';
import { APPRAISAL_STATUS, CYCLE_STATUS, CYCLE_TYPES, canHr } from '../hr/config';
import { addDays, appraisalMode, appraisalOverdue, appraisalVisibility, departmentOf, designationName, emptyCycle, employeeName, generateAppraisals, hrToday, isHrRole, nextAppraisalCode, nextCycleCode } from '../hr/helpers';
import { useStore } from '../store/StoreContext';
import { Alert, Field, Modal } from './ui';

// ---------------------------------------------------------------- gating
// Wraps appraisalMode / appraisalVisibility (src/hr/appraisalCalc.js) with the rules the pages enforce:
// the appraisee never acts as a reviewer (goals, manager, HR, dispute) or on behalf on their own record,
// HR staff get the KPI-setting on-behalf mode once that deadline has passed, nobody sees manager/HR
// fields on their own appraisal before Published, and self fields stay visible after submission
// (Disputed / Cancelled are outside APPRAISAL_FLOW).
const AS = APPRAISAL_STATUS;
const PRE_PUBLISH = [AS.KPI_SETTING, AS.AGREED, AS.SELF, AS.MANAGER, AS.HR, AS.RETURNED];
const SELF_VISIBLE = [AS.MANAGER, AS.HR, AS.RETURNED, AS.PUBLISHED, AS.ACKNOWLEDGED, AS.DISPUTED, AS.CLOSED];
const REVIEWER_MODES = ['kpi', 'manager', 'hr', 'resolve'];

export const pageAppraisalMode = (apr, user, employees) => {
  const base = appraisalMode(apr, user, employees);
  if (base.isSelf) return REVIEWER_MODES.includes(base.mode) || base.onBehalf ? { ...base, mode: 'read', onBehalf: false } : base;
  if (base.mode === 'read' && isHrRole(user?.role) && apr.status === AS.KPI_SETTING && appraisalOverdue(apr, user?.asOf || hrToday()) > 0) return { ...base, mode: 'kpi', onBehalf: true };
  return base;
};

export const pageAppraisalVisibility = (apr, user) => {
  const v = appraisalVisibility(apr, user);
  const hidden = user?.employeeId === apr.employeeId && PRE_PUBLISH.includes(apr.status);
  return { managerFields: !hidden, hrFields: v.hrFields && !hidden, selfFields: v.selfFields || SELF_VISIBLE.includes(apr.status) || !!apr.self?.submittedAt };
};

export const pageAppraisalQueue = (appraisals = [], employees = [], user, asOf) =>
  appraisals
    .filter((x) => pageAppraisalMode(x, { ...user, asOf }, employees).mode !== 'read')
    .map((x) => ({ appraisal: x, employee: employees.find((e) => e.id === x.employeeId), days: appraisalOverdue(x, asOf) }))
    .sort((x, y) => y.days - x.days);

// 'Appraisal Updated' audit details carry field-level diffs: hide them from viewers who may not see those fields.
const HR_DIFF = / hr .* → |^grade override |^HR recommendation /;
export const redactAppraisalAudit = (row, vis) => {
  if (row.action !== 'Appraisal Updated' || vis.hrFields) return row;
  if (!vis.managerFields) return { ...row, detail: 'Lines saved' };
  return { ...row, detail: String(row.detail || '').split('; ').filter((p) => !HR_DIFF.test(p)).join('; ') || 'Lines saved' };
};

const DUE_STAGES = [['kpi', 'KPI setting'], ['self', 'Self-assessment'], ['manager', 'Manager review'], ['hr', 'HR review'], ['publish', 'Publish'], ['ack', 'Acknowledge']];

// ---------------------------------------------------------------- cycle editor
export function CycleModal({ cycle, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const settings = state.hrSettings;
  const year = settings.leave?.year || Number(hrToday(settings).slice(0, 4));
  const [f, setF] = useState(() => (cycle ? structuredClone(cycle) : { ...emptyCycle(currentUser.name), code: nextCycleCode(year, 'Annual'), periodFrom: `${year}-01-01`, periodTo: `${year}-12-31` }));
  const [codeTouched, setCodeTouched] = useState(!!cycle);
  const set = (patch) => setF({ ...f, ...patch });
  const setDue = (k, v) => set({ due: { ...f.due, [k]: v } });

  // The code follows the period year and type until the user edits it.
  const retitle = (patch) => {
    const next = { ...f, ...patch };
    if (!codeTouched) next.code = nextCycleCode((next.periodTo || next.periodFrom || `${year}`).slice(0, 4), next.type);
    setF(next);
  };
  const suggestDue = () => {
    if (!f.periodFrom || !f.periodTo) { notify('Set the period first.', 'error'); return; }
    set({ due: { kpi: addDays(f.periodFrom, 14), self: addDays(f.periodTo, -20), manager: addDays(f.periodTo, -15), hr: addDays(f.periodTo, -7), publish: addDays(f.periodTo, -3), ack: addDays(f.periodTo, Number(settings.appraisal?.ackDays) || 7) } });
  };

  const save = () => {
    if (!canHr(currentUser.role, 'manageCycles')) { notify('Your role cannot manage cycles.', 'error'); return; }
    if (!f.name.trim()) { notify('Enter the cycle name.', 'error'); return; }
    if (!f.code.trim()) { notify('Enter the cycle code.', 'error'); return; }
    if (state.appraisalCycles.some((c) => c.id !== f.id && c.code.trim().toUpperCase() === f.code.trim().toUpperCase())) { notify('Cycle code must be unique.', 'error'); return; }
    if (!f.periodFrom || !f.periodTo || f.periodFrom > f.periodTo) { notify('The period end must be on or after the period start.', 'error'); return; }
    const dues = DUE_STAGES.map(([k]) => f.due[k]).filter(Boolean);
    if (dues.some((d, i) => i > 0 && d < dues[i - 1])) { notify('Due dates must follow the stage order (KPI setting → acknowledge).', 'error'); return; }
    dispatch({ type: 'UPSERT_CYCLE', cycle: { ...f, code: f.code.trim().toUpperCase(), name: f.name.trim() }, by: currentUser.name });
    notify(`Cycle ${f.code} saved.`);
    onClose();
  };

  return (
    <Modal title={cycle ? `Edit cycle · ${cycle.code}` : 'New appraisal cycle'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>{cycle ? 'Save changes' : 'Create cycle'}</button></>}>
      {cycle && cycle.status !== CYCLE_STATUS.PLANNED && <Alert kind="warn">Only Planned cycles can be edited. This cycle is {cycle.status}.</Alert>}
      <div className="form-grid cols-3">
        <Field label="Cycle name" required><input autoFocus value={f.name} placeholder={`${f.type} ${(f.periodTo || '').slice(0, 4)}`} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Type"><select value={f.type} onChange={(e) => retitle({ type: e.target.value })}>{CYCLE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Code" required hint="Derived from the period year and type until edited"><input className="mono" value={f.code} onChange={(e) => { setCodeTouched(true); set({ code: e.target.value.toUpperCase() }); }} /></Field>
        <Field label="Period from" required><input type="date" value={f.periodFrom} onChange={(e) => retitle({ periodFrom: e.target.value })} /></Field>
        <Field label="Period to" required><input type="date" value={f.periodTo} onChange={(e) => retitle({ periodTo: e.target.value })} /></Field>
        <Field label="Increment effective from" hint="Payout date applied to published increments"><input type="date" value={f.payout.incrementEffective} onChange={(e) => set({ payout: { ...f.payout, incrementEffective: e.target.value } })} /></Field>
        <label className="check span-3"><input type="checkbox" checked={!!f.payout.bonusPayable} onChange={(e) => set({ payout: { ...f.payout, bonusPayable: e.target.checked } })} /> Performance bonus payable for this cycle</label>
      </div>
      <div className="row-between mt-16 mb-8"><span className="strong small">Stage due dates</span><button className="btn btn-sm" onClick={suggestDue}>Suggest from period</button></div>
      <div className="form-grid cols-3">
        {DUE_STAGES.map(([k, label]) => <Field key={k} label={label}><input type="date" value={f.due[k] || ''} onChange={(e) => setDue(k, e.target.value)} /></Field>)}
      </div>
      <p className="small muted mt-8">Due dates are copied to every appraisal created when the cycle opens; overdue stages surface in queues, reminders and the on-behalf actions for HR.</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- open cycle
export function OpenCycleModal({ cycle, onClose }) {
  const { state, dispatch, currentUser, notify } = useStore();
  const asOf = hrToday(state.hrSettings);
  const by = currentUser.name;
  const gen = useMemo(() => generateAppraisals(cycle, state.employees, state.kpiTemplates, state.hrSettings, state.appraisals, by, asOf), [cycle, state.employees, state.kpiTemplates, state.hrSettings, state.appraisals, by, asOf]);
  const [picked, setPicked] = useState(() => new Set(gen.appraisals.map((x) => x.employeeId)));
  const toggle = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = picked.size === gen.appraisals.length;
  const emp = (id) => state.employees.find((e) => e.id === id);

  const confirm = () => {
    if (!canHr(currentUser.role, 'manageCycles')) { notify('Your role cannot open cycles.', 'error'); return; }
    if (cycle.status !== CYCLE_STATUS.PLANNED) { notify('Only a Planned cycle can be opened.', 'error'); return; }
    const chosen = gen.appraisals.filter((x) => picked.has(x.employeeId));
    if (chosen.length === 0) { notify('Select at least one employee.', 'error'); return; }
    // Codes are re-numbered so deselected rows leave no gaps in the APR sequence.
    const start = parseInt(nextAppraisalCode(state.appraisals).split('-')[1], 10);
    const appraisals = chosen.map((x, i) => ({ ...x, code: `APR-${start + i}` }));
    dispatch({ type: 'OPEN_CYCLE', id: cycle.id, by, appraisals });
    notify(`Cycle ${cycle.code} opened; ${appraisals.length} appraisal(s) created in KPI Setting.`);
    onClose();
  };

  return (
    <Modal title={`Open cycle · ${cycle.code}`} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={confirm}>Open cycle &amp; create {picked.size} appraisal(s)</button></>}>
      <p className="small muted">{cycle.name} · {cycle.type} · {cycle.periodFrom} → {cycle.periodTo}. Employees are eligible when active, joined at least {state.hrSettings.appraisal?.minServiceDays} days before the period end and matched to a KPI template.</p>
      <div className="row-between mb-8">
        <span className="strong small">Eligible ({gen.appraisals.length})</span>
        <button className="btn btn-sm" onClick={() => setPicked(all ? new Set() : new Set(gen.appraisals.map((x) => x.employeeId)))}>{all ? 'Clear all' : 'Select all'}</button>
      </div>
      {gen.appraisals.length === 0 ? <Alert kind="warn">No eligible employees for this cycle.</Alert> : (
        <div className="table-wrap"><table>
          <thead><tr><th></th><th>Employee</th><th>Department</th><th>Template</th><th>Manager</th><th>Code</th></tr></thead>
          <tbody>{gen.appraisals.map((x) => {
            const e = emp(x.employeeId);
            return (
              <tr key={x.employeeId} className="clickable" onClick={() => toggle(x.employeeId)}>
                <td onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={picked.has(x.employeeId)} onChange={() => toggle(x.employeeId)} /></td>
                <td><div className="strong">{e?.name}</div><div className="small muted">{e?.code} · {designationName(e?.employment?.designation)}</div></td>
                <td>{departmentOf(e)}</td>
                <td className="mono small">{x.templateCode}</td>
                <td>{employeeName(x.managerId, state.employees) || <span className="muted">—</span>}</td>
                <td className="mono small muted">{x.code}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {gen.skipped.length > 0 && (
        <>
          <div className="strong small mt-16 mb-8">Skipped ({gen.skipped.length})</div>
          <div className="table-wrap"><table>
            <thead><tr><th>Employee</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>{gen.skipped.map((s) => <tr key={s.employee.id}><td>{s.employee.name || '(draft)'}</td><td className="small">{s.employee.status}</td><td className="small muted">{s.reason}</td></tr>)}</tbody>
          </table></div>
        </>
      )}
    </Modal>
  );
}

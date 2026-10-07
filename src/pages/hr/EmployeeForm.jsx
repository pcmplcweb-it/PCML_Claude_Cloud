import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../../components/DocumentManager';
import { Alert, Field, Progress } from '../../components/ui';
import { ACTIVE_EMPLOYEE_STATUSES, BD_BANKS, DEPARTMENTS, DESIGNATIONS, EMPLOYEE_DOC_TYPES, EMPLOYEE_STATUS, EMPLOYMENT_TYPES, ESTABLISHMENT_TYPES, EXPIRING_EMPLOYEE_DOCS, GRADES, LOAN_TYPES, PAY_MODES, RELATIONS, REQUIRED_EMPLOYEE_DOCS, TAX_CATEGORIES, WAGE_BASIS, WORKER_CATEGORIES, WORK_LOCATIONS, canHr, designationOf } from '../../hr/config';
import { buildAppraisal, emptyEmployee, emptyLoan, employeeCompleteness, findEmployeeDuplicates, fmtMoney2, grossSalary, hrToday, isHrRole, nextAppraisalCode, num, templateFor, validateEmployee } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const SECTIONS = ['Personal & identity', 'Employment', 'Salary & bank', 'PF, loans & tax', 'Documents'];
const S = EMPLOYEE_STATUS;
const SALARY_COMPONENTS = ['basic', 'houseRent', 'medical', 'conveyance', 'dearness', 'adhoc', 'otherAllowances'];
const ACCOUNT_TYPES = ['Savings', 'Current', 'Mobile Wallet (bKash / Nagad / Rocket)'];
const GENDERS = ['Male', 'Female', 'Other'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
const BLOOD_GROUPS = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export default function EmployeeForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const existing = id ? state.employees.find((x) => x.id === id) : null;
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);

  const [e, setE] = useState(() => (existing ? structuredClone(existing) : emptyEmployee(by)));
  const [section, setSection] = useState(0);
  const [errors, setErrors] = useState([]);
  const [changeNote, setChangeNote] = useState('');

  const dupes = useMemo(() => findEmployeeDuplicates(e, state.employees), [e, state.employees]);
  const pct = employeeCompleteness(e);
  const gross = grossSalary(e.salary);
  // Reporting-manager choices: active employees other than this one, grouped by department.
  const managers = useMemo(() => state.employees.filter((x) => x.id !== e.id && ACTIVE_EMPLOYEE_STATUSES.includes(x.status)), [state.employees, e.id]);

  const isDraft = !existing || existing.status === S.DRAFT;
  const editable = !existing || existing.status === S.DRAFT || canHr(role, 'edit');
  const salaryLocked = !!existing && existing.status !== S.DRAFT && !canHr(role, 'editSalary');
  const salaryChanged = !!existing && SALARY_COMPONENTS.some((k) => String(existing.salary?.[k] ?? '') !== String(e.salary?.[k] ?? ''));

  useEffect(() => { if (id && !existing) nav('/hr/employees'); }, [id, existing, nav]);
  useEffect(() => {
    setE(existing ? structuredClone(existing) : emptyEmployee(currentUser.name));
    setSection(0); setErrors([]); setChangeNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (id && !existing) return null;
  if (!editable) {
    return <Alert kind="warn" title="This record cannot be edited">Only HR can change an activated employee record. <Link to={`/hr/employees/${e.id}`}>Back to the employee</Link>.</Alert>;
  }
  if (existing?.status === S.SEPARATED) {
    return <Alert kind="warn" title="This record is closed">Separated employees are read-only. <Link to={`/hr/employees/${e.id}`}>Back to the employee</Link>.</Alert>;
  }

  const set = (patch) => setE((prev) => ({ ...prev, ...patch }));
  const setSub = (key, patch) => setE((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const setEmp = (patch) => setSub('employment', patch);
  const setProb = (patch) => setE((prev) => ({ ...prev, employment: { ...prev.employment, probation: { ...prev.employment.probation, ...patch } } }));
  const updLoan = (idx, patch) => set({ loans: e.loans.map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
  const rmLoan = (idx) => set({ loans: e.loans.filter((_, i) => i !== idx) });
  const emp = e.employment; const p = emp.probation; const sal = e.salary; const b = e.bank; const pf = e.pf; const tax = e.tax;

  // Designation drives the defaults for grade, category, department and probation length.
  const pickDesignation = (code) => {
    const d = designationOf(code);
    if (!d) { setEmp({ designation: code }); return; }
    setE((prev) => ({
      ...prev,
      employment: {
        ...prev.employment, designation: code, department: d.department, grade: d.grade, workerCategory: d.workerCategory,
        // Probation terms are fixed at activation (endDate is computed then), so only a Draft takes the designation default.
        probation: isDraft ? { ...prev.employment.probation, required: d.probationMonths > 0, months: String(d.probationMonths) } : prev.employment.probation,
      },
    }));
  };
  const designations = DESIGNATIONS.filter((d) => !emp.department || d.department === emp.department);

  const saveDraft = () => {
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: e, by, detail: existing ? 'Record details updated' : 'Employee record created as draft' });
    notify('Draft saved.');
    nav(`/hr/employees/${e.id}`);
  };
  const saveChanges = () => {
    const errs = validateEmployee(e, settings);
    setErrors(errs);
    if (errs.length) { notify('Please fix the highlighted issues before saving.', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (salaryChanged && !changeNote.trim()) { notify('A change note is required when salary components change.', 'error'); setSection(2); return; }
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: e, by, detail: changeNote.trim() || 'Record updated' });
    notify('Changes saved.');
    nav(`/hr/employees/${e.id}`);
  };
  const activate = () => {
    const errs = validateEmployee(e, settings);
    setErrors(errs);
    if (errs.length) { notify('Please fix the highlighted issues before activating.', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (dupes.length && !window.confirm(`Possible duplicate detected (${dupes.map((d) => `${d.employee.code || 'draft'} ${d.employee.name}`).join(', ')}). Activate anyway?`)) return;
    const probation = !!p.required && num(p.months) > 0;
    const tpl = probation ? templateFor(e, state.kpiTemplates, 'Probation') : null;
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: e, by, detail: existing ? 'Record completed for activation' : undefined });
    dispatch({
      type: 'EMPLOYEE_TRANSITION', id: e.id, status: probation ? S.PROBATION : S.CONFIRMED, by, label: 'Activated', asOf,
      detail: probation ? `Activated on ${p.months}-month probation from ${emp.joinDate}` : `Activated as confirmed from ${emp.joinDate}`,
      appraisal: probation && tpl ? buildAppraisal(e, null, 'Probation', tpl, settings, by, nextAppraisalCode(state.appraisals), asOf) : undefined,
    });
    notify(probation ? `${e.name} activated on probation${tpl ? '; probation review created' : ''}.` : `${e.name} activated as confirmed.`);
    nav(`/hr/employees/${e.id}`);
  };

  const sectionFlag = (i) => {
    const ok = {
      0: !!e.name && !!e.dob && !!e.nid && !!e.mobile && !!e.emergencyContact.name && !!e.emergencyContact.mobile,
      1: !!emp.department && !!emp.designation && !!emp.grade && !!emp.joinDate && (!!emp.reportingManagerId || emp.designation === 'MD') && (!p.required || num(p.months) > 0),
      2: num(sal.basic) > 0 && (sal.payMode === 'Cash' || (!!b.bankName && !!b.accountNo)),
      3: !pf.member || (!!e.nominee.name && !!e.nominee.relation),
      4: REQUIRED_EMPLOYEE_DOCS.every((t) => e.documents.some((d) => d.current && d.type === t)),
    }[i];
    return ok ? 'ok' : 'warn';
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{existing ? `Edit employee · ${e.code || e.name || 'Draft'}` : 'New employee'}</h1>
          <p className="sub">Fields marked * are checked on activation. Required documents: {REQUIRED_EMPLOYEE_DOCS.join(', ')}.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to={existing ? `/hr/employees/${e.id}` : '/hr/employees'}>Cancel</Link>
          {isDraft ? <button className="btn" onClick={saveDraft}>Save draft</button> : <button className="btn btn-primary" onClick={saveChanges}>Save changes</button>}
          {isDraft && canHr(role, 'activate') && <button className="btn btn-primary" onClick={activate}>Save &amp; activate</button>}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}><div style={{ flex: 1 }}><Progress value={pct} /></div><span className="small muted nowrap">{pct}% complete</span></div>

      {errors.length > 0 && <Alert kind="danger" title={`${errors.length} issue(s) must be resolved before ${isDraft ? 'activation' : 'saving'}`}><ul>{errors.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
      {dupes.length > 0 && (
        <Alert kind="warn" title="Possible duplicate employees">
          <ul>{dupes.map((d) => <li key={d.employee.id}><Link to={`/hr/employees/${d.employee.id}`} target="_blank">{d.employee.code || 'Draft'} · {d.employee.name}</Link> ({d.employee.status}) — {d.reasons.join(', ')}</li>)}</ul>
        </Alert>
      )}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {SECTIONS.map((t, i) => <button key={t} className={`tab ${section === i ? 'active' : ''}`} onClick={() => setSection(i)}><span className={`tab-flag ${sectionFlag(i)}`} />{t}</button>)}
        </div>
        <div className="card-body">
          {section === 0 && (
            <div className="stack" style={{ gap: 22 }}>
              <div className="form-grid cols-3">
                <Field label="Employee code" hint="Assigned automatically on activation."><input value={e.code || ''} disabled placeholder="Auto" /></Field>
                <Field label="Full name" required className="span-2"><input autoFocus value={e.name} onChange={(ev) => set({ name: ev.target.value })} /></Field>
                <Field label="Father's name"><input value={e.fatherName} onChange={(ev) => set({ fatherName: ev.target.value })} /></Field>
                <Field label="Mother's name"><input value={e.motherName} onChange={(ev) => set({ motherName: ev.target.value })} /></Field>
                <Field label="Date of birth" required hint="Must be 18 or older at joining (s.34)."><input type="date" value={e.dob} onChange={(ev) => set({ dob: ev.target.value })} /></Field>
                <Field label="Gender"><select value={e.gender} onChange={(ev) => set({ gender: ev.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Marital status"><select value={e.maritalStatus} onChange={(ev) => set({ maritalStatus: ev.target.value })}>{MARITAL.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Blood group"><select value={e.bloodGroup} onChange={(ev) => set({ bloodGroup: ev.target.value })}>{BLOOD_GROUPS.map((x) => <option key={x} value={x}>{x || '—'}</option>)}</select></Field>
                <Field label="Nationality"><input value={e.nationality} onChange={(ev) => set({ nationality: ev.target.value })} /></Field>
                <Field label="NID number" required hint="10, 13 or 17 digits."><input value={e.nid} onChange={(ev) => set({ nid: ev.target.value })} /></Field>
                <Field label="TIN"><input value={e.tin} onChange={(ev) => set({ tin: ev.target.value })} /></Field>
                <Field label="Passport no."><input value={e.passportNo} onChange={(ev) => set({ passportNo: ev.target.value })} /></Field>
                <Field label="Passport expiry"><input type="date" value={e.passportExpiry} onChange={(ev) => set({ passportExpiry: ev.target.value })} /></Field>
                <Field label="Mobile" required><input value={e.mobile} onChange={(ev) => set({ mobile: ev.target.value })} placeholder="01XXXXXXXXX" /></Field>
                <Field label="Alternate mobile"><input value={e.altMobile} onChange={(ev) => set({ altMobile: ev.target.value })} /></Field>
                <Field label="Email"><input type="email" value={e.email} onChange={(ev) => set({ email: ev.target.value })} /></Field>
                <Field label="Present address" className="span-2"><textarea value={e.presentAddress} onChange={(ev) => set({ presentAddress: ev.target.value })} /></Field>
                <Field label="Permanent address" className="span-3"><textarea value={e.permanentAddress} onChange={(ev) => set({ permanentAddress: ev.target.value })} /></Field>
              </div>
              <div>
                <h3 className="mb-8">Emergency contact <span className="req">*</span></h3>
                <div className="form-grid cols-3">
                  <Field label="Name" required><input value={e.emergencyContact.name} onChange={(ev) => setSub('emergencyContact', { name: ev.target.value })} /></Field>
                  <Field label="Relation"><select value={e.emergencyContact.relation} onChange={(ev) => setSub('emergencyContact', { relation: ev.target.value })}><option value="">—</option>{RELATIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Mobile" required><input value={e.emergencyContact.mobile} onChange={(ev) => setSub('emergencyContact', { mobile: ev.target.value })} /></Field>
                  <Field label="Address" className="span-3"><input value={e.emergencyContact.address} onChange={(ev) => setSub('emergencyContact', { address: ev.target.value })} /></Field>
                </div>
              </div>
              <div>
                <h3 className="mb-8">Nominee {pf.member && <span className="req">*</span>}</h3>
                <p className="small muted mb-8">Receives PF, compensation and any death benefit (s.19). Required for PF members.</p>
                <div className="form-grid cols-3">
                  <Field label="Name" required={pf.member}><input value={e.nominee.name} onChange={(ev) => setSub('nominee', { name: ev.target.value })} /></Field>
                  <Field label="Relation" required={pf.member}><select value={e.nominee.relation} onChange={(ev) => setSub('nominee', { relation: ev.target.value })}><option value="">—</option>{RELATIONS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Share %"><input type="number" min="0" max="100" value={e.nominee.sharePct} onChange={(ev) => setSub('nominee', { sharePct: ev.target.value })} /></Field>
                  <Field label="Nominee NID"><input value={e.nominee.nid} onChange={(ev) => setSub('nominee', { nid: ev.target.value })} /></Field>
                  <Field label="Nominee mobile"><input value={e.nominee.mobile} onChange={(ev) => setSub('nominee', { mobile: ev.target.value })} /></Field>
                </div>
              </div>
            </div>
          )}

          {section === 1 && (
            <div className="stack" style={{ gap: 22 }}>
              <div className="form-grid cols-3">
                <Field label="Department" required><select value={emp.department} onChange={(ev) => setEmp({ department: ev.target.value, designation: '' })}><option value="">—</option>{DEPARTMENTS.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></Field>
                <Field label="Designation" required hint={isDraft ? 'Sets grade, worker category and probation length.' : 'Sets grade and worker category; probation terms are fixed at activation.'}><select value={emp.designation} onChange={(ev) => pickDesignation(ev.target.value)}><option value="">—</option>{designations.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></Field>
                <Field label="Grade" required><select value={emp.grade} onChange={(ev) => setEmp({ grade: ev.target.value })}><option value="">—</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></Field>
                <Field label="Employment type"><select value={emp.employmentType} onChange={(ev) => setEmp({ employmentType: ev.target.value })}>{EMPLOYMENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Worker category" hint="Non-workers follow the statutory rules as company policy (s.2(65))."><select value={emp.workerCategory} onChange={(ev) => setEmp({ workerCategory: ev.target.value })}>{WORKER_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Wage basis"><select value={emp.wageBasis} onChange={(ev) => setEmp({ wageBasis: ev.target.value })}>{WAGE_BASIS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Establishment type" hint="Drives earned-leave accrual and cap (s.117)."><select value={emp.establishmentType} onChange={(ev) => setEmp({ establishmentType: ev.target.value })}>{ESTABLISHMENT_TYPES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></Field>
                <Field label="Joining date" required><input type="date" value={emp.joinDate} onChange={(ev) => setEmp({ joinDate: ev.target.value })} /></Field>
                {emp.employmentType === 'Contractual'
                  ? <Field label="Contract end date" required><input type="date" value={emp.contractEndDate} onChange={(ev) => setEmp({ contractEndDate: ev.target.value })} /></Field>
                  : <Field label="Confirmation date" hint="Set by the probation decision."><input type="date" value={emp.confirmationDate} disabled={isDraft} onChange={(ev) => setEmp({ confirmationDate: ev.target.value })} /></Field>}
                <Field label="Reporting manager" required={emp.designation !== 'MD'} className="span-2">
                  <select value={emp.reportingManagerId} onChange={(ev) => setEmp({ reportingManagerId: ev.target.value })}>
                    <option value="">— none (reports to Board) —</option>
                    {DEPARTMENTS.filter((d) => managers.some((m) => m.employment.department === d.code)).map((d) => (
                      <optgroup key={d.code} label={d.name}>{managers.filter((m) => m.employment.department === d.code).map((m) => <option key={m.id} value={m.id}>{m.name} · {designationOf(m.employment.designation)?.name || m.employment.designation}</option>)}</optgroup>
                    ))}
                  </select>
                </Field>
                <Field label="Work location"><select value={emp.workLocation} onChange={(ev) => setEmp({ workLocation: ev.target.value })}>{[...WORK_LOCATIONS, ...(WORK_LOCATIONS.includes(emp.workLocation) ? [] : [emp.workLocation])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}</select></Field>
              </div>
              <div>
                <h3 className="mb-8">Probation</h3>
                <div className="form-grid cols-3">
                  <label className="check"><input type="checkbox" checked={!!p.required} disabled={!isDraft} onChange={(ev) => setProb({ required: ev.target.checked })} /> Probation applies</label>
                  <Field label="Months" required={p.required} hint={`Policy: ${settings.probation?.monthsClerical} clerical / ${settings.probation?.monthsOther} other; one extension of ${settings.probation?.extensionMonths} months (s.4(8)).`}><input type="number" min="0" max="12" value={p.months} disabled={!p.required || !isDraft} onChange={(ev) => setProb({ months: ev.target.value })} /></Field>
                  <Field label="Probation ends" hint="Computed on activation."><input type="date" value={p.extended ? p.extendedTo : p.endDate} disabled /></Field>
                </div>
              </div>
            </div>
          )}

          {section === 2 && (
            <div className="stack" style={{ gap: 22 }}>
              <div>
                <h3 className="mb-8">Monthly salary (BDT)</h3>
                {salaryLocked && <Alert kind="info">Salary revision requires HR Head — use <b>Revise salary</b> on the record. Components are shown read-only.</Alert>}
                <div className="form-grid cols-3 mt-8">
                  {[['basic', 'Basic', true], ['houseRent', 'House rent'], ['medical', 'Medical'], ['conveyance', 'Conveyance'], ['dearness', 'Dearness allowance'], ['adhoc', 'Ad-hoc allowance'], ['otherAllowances', 'Other allowances']].map(([k, label, req]) => (
                    <Field key={k} label={label} required={!!req}><input type="number" min="0" value={sal[k]} disabled={salaryLocked} onChange={(ev) => setSub('salary', { [k]: ev.target.value })} /></Field>
                  ))}
                  <Field label="Gross (computed)"><input disabled value={fmtMoney2(gross)} /></Field>
                  <Field label="Effective from"><input type="date" value={sal.effectiveFrom} disabled={salaryLocked} onChange={(ev) => setSub('salary', { effectiveFrom: ev.target.value })} /></Field>
                  <Field label="Pay mode"><select value={sal.payMode} onChange={(ev) => setSub('salary', { payMode: ev.target.value })}>{PAY_MODES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  {salaryChanged && !salaryLocked && <Field label="Change note (recorded with the salary history)" required className="span-3"><input value={changeNote} onChange={(ev) => setChangeNote(ev.target.value)} placeholder="e.g. Correction of house rent per appointment letter" /></Field>}
                </div>
              </div>
              <div>
                <div className="row-between mb-8">
                  <div><h3>Bank account {sal.payMode !== 'Cash' && <span className="req">*</span>}</h3><p className="small muted">Salary and final settlement are paid here. Changing details clears verification.</p></div>
                  {b.verified ? <span className="badge badge-green">✓ Verified by {b.verifiedBy}</span> : <span className="badge badge-gray">Unverified</span>}
                </div>
                <div className="form-grid cols-3">
                  <Field label="Account type"><select value={b.accountType} onChange={(ev) => setSub('bank', { accountType: ev.target.value, verified: false })}>{[...ACCOUNT_TYPES, ...(ACCOUNT_TYPES.includes(b.accountType) ? [] : [b.accountType])].filter(Boolean).map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label={b.accountType.startsWith('Mobile') ? 'Wallet provider' : 'Bank name'} required={sal.payMode !== 'Cash'}><input list="hr-bd-banks" value={b.bankName} onChange={(ev) => setSub('bank', { bankName: ev.target.value, verified: false })} /><datalist id="hr-bd-banks">{BD_BANKS.map((x) => <option key={x} value={x} />)}</datalist></Field>
                  <Field label="Branch"><input value={b.branch} onChange={(ev) => setSub('bank', { branch: ev.target.value })} /></Field>
                  <Field label="Account name"><input value={b.accountName} onChange={(ev) => setSub('bank', { accountName: ev.target.value, verified: false })} /></Field>
                  <Field label={b.accountType.startsWith('Mobile') ? 'Wallet number' : 'Account number'} required={sal.payMode !== 'Cash'}><input value={b.accountNo} onChange={(ev) => setSub('bank', { accountNo: ev.target.value, verified: false })} /></Field>
                  <Field label="Routing no."><input value={b.routingNo} onChange={(ev) => setSub('bank', { routingNo: ev.target.value })} /></Field>
                </div>
              </div>
            </div>
          )}

          {section === 3 && (
            <div className="stack" style={{ gap: 22 }}>
              <div>
                <h3 className="mb-8">Provident fund</h3>
                <div className="form-grid cols-3">
                  <label className="check span-3"><input type="checkbox" checked={!!pf.member} onChange={(ev) => setSub('pf', { member: ev.target.checked })} /> PF member (eligible after {settings.pf?.eligibilityMonths} months of service; vests after {settings.pf?.vestingYears} years)</label>
                  <Field label="PF joining date"><input type="date" value={pf.joinDate} disabled={!pf.member} onChange={(ev) => setSub('pf', { joinDate: ev.target.value })} /></Field>
                  <Field label="Employee rate %"><input type="number" min="0" value={pf.employeeRatePct} disabled={!pf.member} onChange={(ev) => setSub('pf', { employeeRatePct: ev.target.value })} /></Field>
                  <Field label="Employer rate %"><input type="number" min="0" value={pf.employerRatePct} disabled={!pf.member} onChange={(ev) => setSub('pf', { employerRatePct: ev.target.value })} /></Field>
                  <Field label="Own balance (BDT)"><input type="number" min="0" value={pf.ownBalance} disabled={!pf.member} onChange={(ev) => setSub('pf', { ownBalance: ev.target.value })} /></Field>
                  <Field label="Employer balance (BDT)"><input type="number" min="0" value={pf.employerBalance} disabled={!pf.member} onChange={(ev) => setSub('pf', { employerBalance: ev.target.value })} /></Field>
                  <Field label="Interest accrued (BDT)"><input type="number" min="0" value={pf.interestAccrued} disabled={!pf.member} onChange={(ev) => setSub('pf', { interestAccrued: ev.target.value })} /></Field>
                  <Field label="PF advance outstanding (BDT)"><input type="number" min="0" value={pf.advanceOutstanding} disabled={!pf.member} onChange={(ev) => setSub('pf', { advanceOutstanding: ev.target.value })} /></Field>
                </div>
              </div>
              <div>
                <div className="row-between mb-8">
                  <div><h3>Loans &amp; advances</h3><p className="small muted">Outstanding balances are recovered from the final settlement (s.125(2)).</p></div>
                  <button className="btn btn-sm" onClick={() => set({ loans: [...e.loans, emptyLoan()] })}>+ Add loan</button>
                </div>
                {e.loans.length === 0 ? <p className="muted">None recorded.</p> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Type</th><th>Principal</th><th>Outstanding</th><th>Monthly instalment</th><th>Note</th><th></th></tr></thead>
                    <tbody>{e.loans.map((l, i) => (
                      <tr key={l.id}>
                        <td><select value={l.type} onChange={(ev) => updLoan(i, { type: ev.target.value })}>{LOAN_TYPES.map((x) => <option key={x}>{x}</option>)}</select></td>
                        <td><input type="number" min="0" value={l.principal} onChange={(ev) => updLoan(i, { principal: ev.target.value })} /></td>
                        <td><input type="number" min="0" value={l.outstanding} onChange={(ev) => updLoan(i, { outstanding: ev.target.value })} /></td>
                        <td><input type="number" min="0" value={l.monthlyInstalment} onChange={(ev) => updLoan(i, { monthlyInstalment: ev.target.value })} /></td>
                        <td><input value={l.note} onChange={(ev) => updLoan(i, { note: ev.target.value })} /></td>
                        <td><button className="btn btn-sm btn-ghost" onClick={() => rmLoan(i)}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
              <div>
                <h3 className="mb-8">Income tax</h3>
                <div className="form-grid cols-3">
                  <Field label="Tax category" hint="Sets the tax-free threshold used in the settlement estimate."><select value={tax.category} onChange={(ev) => setSub('tax', { category: ev.target.value })}>{TAX_CATEGORIES.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></Field>
                  <Field label="YTD taxable income (BDT)"><input type="number" min="0" value={tax.ytdIncome} onChange={(ev) => setSub('tax', { ytdIncome: ev.target.value })} /></Field>
                  <Field label="YTD tax deducted (BDT)"><input type="number" min="0" value={tax.ytdTaxPaid} onChange={(ev) => setSub('tax', { ytdTaxPaid: ev.target.value })} /></Field>
                  <label className="check span-3"><input type="checkbox" checked={!!tax.bonusPaidThisYear} onChange={(ev) => setSub('tax', { bonusPaidThisYear: ev.target.checked })} /> Festival bonus already paid this year</label>
                </div>
              </div>
            </div>
          )}

          {section === 4 && (
            <DocumentManager
              documents={e.documents}
              requiredDocs={REQUIRED_EMPLOYEE_DOCS}
              docTypes={Object.values(EMPLOYEE_DOC_TYPES)}
              expiringTypes={EXPIRING_EMPLOYEE_DOCS}
              uploadedBy={by}
              verifiedBy={by}
              canUpload
              canVerify={isHrRole(role)}
              onChange={(docs) => set({ documents: docs })}
            />
          )}
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <button className="btn" disabled={section === 0} onClick={() => setSection((x) => x - 1)}>← Previous</button>
          <div className="row">
            {isDraft && <button className="btn" onClick={saveDraft}>Save draft</button>}
            {section < SECTIONS.length - 1
              ? <button className="btn btn-primary" onClick={() => setSection((x) => x + 1)}>Next →</button>
              : isDraft
                ? (canHr(role, 'activate') ? <button className="btn btn-primary" onClick={activate}>Save &amp; activate</button> : <button className="btn btn-primary" onClick={saveDraft}>Save draft</button>)
                : <button className="btn btn-primary" onClick={saveChanges}>Save changes</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

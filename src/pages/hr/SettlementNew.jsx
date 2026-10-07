import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Field } from '../../components/ui';
import { EMPLOYEE_STATUS, EMPLOYER_INITIATED, MISCONDUCT_CLAUSES, RELATIONS, SEPARATION_SECTIONS, SEPARATION_TYPES, canHr } from '../../hr/config';
import { addDays, computeSettlement, continuousServiceCheck, daysBetween, designationName, dismissalEnquiryOf, emptySettlement, fmtMoney2, fmtNum2, exitElBalance, hrToday, noticeRequiredDays, effectiveNoticeServed, retirementDate, separationWarnings, settlementDeadline, settlementInputsFrom, validateSeparation, visibleEmployees } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';
import { fmtDate } from '../../utils/helpers';

const STEPS = ['Employee & type', 'Notice & dates', 'Dues inputs', 'Review'];
const SEPARABLE = [EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.SUSPENDED];
const RESIGNATION_TYPES = ['Resignation', 'Deemed Resignation (s.27(3A))'];
const NOTICE_RULE = {
  Resignation: 'Worker gives 60 days (permanent) or 30 / 14 days (temporary, monthly / other); shortfall is recoverable from dues (s.27).',
  Termination: 'Employer gives 120 days (permanent, monthly-rated) or 60 days; 30 / 14 days for temporary workers; nil when the work is completed (s.26). Pay in lieu allowed (s.26(3)).',
  Retrenchment: '30 days notice or pay in lieu, nil after a lay-off; compensation 30 days per year of service (s.20).',
  Discharge: 'No notice; compensation 30 days per year after one year of service (s.22).',
  Dismissal: 'No notice; requires a Dismissal Enquiry record with show-cause and enquiry dates (s.23–24); compensation 15 days per year unless the misconduct clause forfeits it (s.23(3)).',
  Retirement: 'Retirement at 60; benefit 30 days per year of service (s.28).',
  Death: 'Dues and death benefit (30 days per year, 45 if in the course of employment) are payable to the nominee (s.19, s.32).',
  'End of Contract': 'Contract expires on its end date; no notice or compensation (s.26(2)).',
  'Deemed Resignation (s.27(3A))': 'Absence beyond 10 days with two notices served; treated as resignation with the full notice shortfall recoverable.',
};
const n = (v) => (v === '' || v == null ? 0 : Number(v));
const DEEMED = 'Deemed Resignation (s.27(3A))';
// Rehire eligibility defaults to false for a Dismissal or an Unsatisfactory (D) last grade, and never resets an existing false (A.2 #25).
const defaultRehire = (type, emp) => type !== 'Dismissal' && emp?.rehireEligible !== false && emp?.lastAppraisal?.grade !== 'D';
// s.27(3A): deemed resignation is available only 7 days after the second notice (A.2 #22); '' while it is not yet due.
const deemedFrom = (emp, asOf) => { const second = emp?.absenceNotice?.secondNoticeOn; return second && asOf < addDays(second, 7) ? addDays(second, 7) : ''; };

export default function SettlementNew() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);

  // Active employees in scope without an open separation.
  const candidates = useMemo(() => visibleEmployees(state.employees, currentUser).filter((e) => SEPARABLE.includes(e.status) && !e.separationId).sort((a, b) => a.name.localeCompare(b.name)), [state.employees, currentUser]);
  const elType = state.leaveTypes.find((t) => t.code === 'EL');
  // Pro-rated to the LWD when leave.prorateOnExit is on.
  const elBalanceOf = (emp, lwd) => exitElBalance(emp, elType, settings.leave.year, state.leaveRequests, settings, asOf, state.attendance, lwd);
  const elDaysOf = (emp, lwd) => settlementInputsFrom(emp, { elBalance: elBalanceOf(emp, lwd) }).elBalanceDays;

  // Notice days from the Act for the current type and flags; LWD follows the notice unless retiring.
  const withNotice = (s, emp) => {
    const required = noticeRequiredDays(emp, s.type, settings, { probationer: s.probationer, workCompleted: s.workCompleted, afterLayoff: s.afterLayoff });
    const noticeDate = s.noticeDate || asOf;
    const lwd = s.type === 'Retirement' && emp?.dob ? retirementDate(emp, settings) : addDays(noticeDate, required);
    return { ...s, noticeDate, noticeRequiredDays: required, lastWorkingDay: lwd, rehireEligible: defaultRehire(s.type, emp), payInLieu: EMPLOYER_INITIATED.includes(s.type) ? s.payInLieu : false, payInLieuDays: EMPLOYER_INITIATED.includes(s.type) ? s.payInLieuDays : '' };
  };
  const fresh = (emp, type, probation) => {
    const base = emptySettlement(emp, by, settings, asOf);
    const s = withNotice({ ...base, type: type || base.type, probationer: probation || base.probationer }, emp);
    return { ...s, inputs: emp ? settlementInputsFrom(emp, { elBalance: elBalanceOf(emp, s.lastWorkingDay) }) : base.inputs };
  };

  const [sep, setSep] = useState(() => fresh(candidates.find((e) => e.id === params.get('employee')) || null, SEPARATION_TYPES.includes(params.get('type')) ? params.get('type') : '', params.get('probation') === '1'));
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const emp = state.employees.find((e) => e.id === sep.employeeId) || null;
  const live = useMemo(() => (emp && sep.lastWorkingDay ? computeSettlement(emp, sep, settings, { asOf, continuousService: continuousServiceCheck(emp, state.attendance, asOf, settings) }) : null), [emp, sep, settings, asOf, state.attendance]);
  const warnings = useMemo(() => (emp ? separationWarnings(sep, emp, settings) : []), [sep, emp, settings]);
  // Live validateSeparation errors (G.11 Review step), plus the s.27(3A) 7-day wait.
  const errors = useMemo(() => {
    const errs = validateSeparation(sep, emp, settings, asOf, state.settlements);
    const from = sep.type === DEEMED ? deemedFrom(emp, asOf) : '';
    if (from) errs.push(`Deemed resignation is available from ${fmtDate(from)}, 7 days after the second s.27(3A) notice.`);
    return errs;
  }, [sep, emp, settings, asOf, state.settlements]);
  const bonusEligible = useMemo(() => {
    const bands = settings.appraisal?.bands || [];
    const floor = bands.findIndex((b) => b.code === 'B');
    return state.appraisals.some((a) => a.employeeId === sep.employeeId && a.status === 'Closed' && bands.findIndex((b) => b.code === a.scores?.gradeFinal) >= 0 && bands.findIndex((b) => b.code === a.scores?.gradeFinal) <= floor);
  }, [state.appraisals, sep.employeeId, settings]);

  if (!canHr(role, 'separationInitiate')) return <Alert kind="warn" title="Role not permitted">Only HR Officer, HR Head or Admin can initiate a separation. <Link to="/hr/settlements">Back to settlements</Link></Alert>;

  const set = (patch) => setSep((prev) => ({ ...prev, ...patch }));
  const setIn = (patch) => setSep((prev) => ({ ...prev, inputs: { ...prev.inputs, ...patch } }));
  // A new LWD re-prefills the EL days unless they were edited by hand.
  const withLwd = (prev, next) => (emp && next.lastWorkingDay !== prev.lastWorkingDay && prev.inputs.elBalanceDays === elDaysOf(emp, prev.lastWorkingDay) ? { ...next, inputs: { ...next.inputs, elBalanceDays: elDaysOf(emp, next.lastWorkingDay) } } : next);
  const setNotice = (patch) => setSep((prev) => withLwd(prev, withNotice({ ...prev, ...patch }, emp)));
  const pickEmployee = (id) => {
    const e = candidates.find((x) => x.id === id) || null;
    setSep((prev) => ({ ...fresh(e, prev.type, prev.probationer && e?.status === EMPLOYEE_STATUS.PROBATION), reason: prev.reason }));
  };

  const required = n(sep.noticeRequiredDays);
  const served = effectiveNoticeServed(sep);
  const lieuMax = Math.max(0, required - served);
  const shortfall = RESIGNATION_TYPES.includes(sep.type) ? Math.max(0, required - served - n(sep.noticeWaivedDays)) : 0;
  const deadline = settlementDeadline(sep.lastWorkingDay, settings);
  const employer = EMPLOYER_INITIATED.includes(sep.type);
  const enquiry = dismissalEnquiryOf(emp);
  const elBalance = elBalanceOf(emp, sep.lastWorkingDay);

  const initiate = () => {
    setSubmitted(true);
    if (errors.length) { setStep(3); notify('Resolve the issues listed before initiating.', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    dispatch({ type: 'INITIATE_SEPARATION', settlement: { ...sep, rehireEligible: sep.rehireEligible !== false && defaultRehire(sep.type, emp), createdBy: by }, by, asOf });
    notify(`Separation initiated for ${emp.name}; ${emp.name} is now On Notice.`);
    nav(`/hr/settlements/${sep.id}`);
  };

  const stepFlag = (i) => {
    const ok = {
      0: !!emp && !!sep.type && (['Retirement', 'End of Contract'].includes(sep.type) || sep.reason.trim().length >= 10),
      1: !!sep.lastWorkingDay && !!sep.noticeDate && sep.lastWorkingDay >= sep.noticeDate,
      2: !emp || n(sep.inputs.assetRecovery) <= 0 || sep.inputs.assetShowCauseIssued,
      3: errors.length === 0,
    }[i];
    return ok ? 'ok' : 'warn';
  };
  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const num = (label, key, hint, extra = {}) => <Field label={label} hint={hint}><input type="number" min="0" value={sep.inputs[key]} onChange={(e) => setIn({ [key]: e.target.value })} {...extra} /></Field>;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Initiate separation</h1>
          <p className="sub">Four steps: who and why, notice and dates, dues inputs, review. The employee moves to <b>On Notice</b> and a settlement file opens for clearance and approvals.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to="/hr/settlements">Cancel</Link>
          {step === STEPS.length - 1 && <button className="btn btn-primary" disabled={!emp} onClick={initiate}>Initiate separation</button>}
        </div>
      </div>

      {submitted && errors.length > 0 && <Alert kind="danger" title={`${errors.length} issue(s) must be resolved before initiating`}><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      {warnings.length > 0 && <Alert kind="warn"><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {STEPS.map((t, i) => <button key={t} className={`tab ${step === i ? 'active' : ''}`} onClick={() => setStep(i)}><span className={`tab-flag ${stepFlag(i)}`} />{i + 1} {t}</button>)}
        </div>
        <div className="card-body">
          {step === 0 && (
            <div className="form-grid cols-3">
              <Field label="Employee" required className="span-2" hint={candidates.length ? 'Active employees without an open separation.' : 'No eligible employees in your scope.'}>
                <select autoFocus value={sep.employeeId} onChange={(e) => pickEmployee(e.target.value)}>
                  <option value="">— select —</option>
                  {candidates.map((e) => <option key={e.id} value={e.id}>{e.code} · {e.name} — {designationName(e.employment?.designation)} ({e.status})</option>)}
                </select>
              </Field>
              <Field label="Separation type" required>
                <select value={sep.type} onChange={(e) => setNotice({ type: e.target.value, misconductClause: '', deathAtWork: false, afterLayoff: false, workCompleted: false })}>
                  <option value="">— select —</option>
                  {SEPARATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              {emp && (
                <div className="span-3">
                  {kv([
                    ['Employee', <Link key="employee" to={`/hr/employees/${emp.id}`}>{emp.name} · {emp.code}</Link>],
                    ['Designation / department', `${designationName(emp.employment?.designation)} · ${emp.employment?.department || '—'} · ${emp.employment?.grade || '—'}`],
                    ['Employment', `${emp.employment?.employmentType} · ${emp.employment?.workerCategory} · ${emp.employment?.wageBasis}-rated · joined ${fmtDate(emp.employment?.joinDate)}`],
                    ['Status', emp.status],
                  ])}
                </div>
              )}
              {sep.type && (
                <div className="span-3">
                  <Alert kind="info" title={`${sep.type} — ${SEPARATION_SECTIONS[sep.type]} · ${emp?.employment?.workerCategory || 'Worker'}, ${emp?.employment?.employmentType || 'Permanent'}`}>
                    {NOTICE_RULE[sep.type]} {emp ? <b>Notice required here: {required} days.</b> : null}
                  </Alert>
                </div>
              )}
              <Field label="Reason" required={!['Retirement', 'End of Contract'].includes(sep.type)} className="span-3" hint="At least 10 characters; recorded in the audit trail and the employee's status history.">
                <textarea value={sep.reason} onChange={(e) => set({ reason: e.target.value })} placeholder="e.g. Resignation letter dated 05 Sep 2026 accepted; better opportunity" />
              </Field>
              {['Resignation', 'Termination'].includes(sep.type) && (
                <label className="check"><input type="checkbox" checked={sep.probationer} onChange={(e) => setNotice({ probationer: e.target.checked })} /> Probationer (no notice, no compensation){emp?.status === EMPLOYEE_STATUS.PROBATION ? ' — employee is on probation' : ''}</label>
              )}
              {sep.type === 'Termination' && <label className="check"><input type="checkbox" checked={sep.workCompleted} onChange={(e) => setNotice({ workCompleted: e.target.checked })} /> Work completed (no notice, s.26(1))</label>}
              {sep.type === 'Retrenchment' && <label className="check"><input type="checkbox" checked={sep.afterLayoff} onChange={(e) => setNotice({ afterLayoff: e.target.checked })} /> Retrenchment after lay-off (no notice; extra days, s.20)</label>}
              {sep.type === 'Death' && <label className="check"><input type="checkbox" checked={sep.deathAtWork} onChange={(e) => set({ deathAtWork: e.target.checked })} /> Death in the course of employment (45 days per year, s.19)</label>}
              {sep.type === 'Dismissal' && (
                <>
                  <Field label="Misconduct clause (s.23(4))" required><select value={sep.misconductClause} onChange={(e) => set({ misconductClause: e.target.value })}>{MISCONDUCT_CLAUSES.map((c) => <option key={c} value={c}>{c || '— select —'}</option>)}</select></Field>
                  <div className="span-2">{enquiry ? <Alert kind="success">Dismissal Enquiry on record: show-cause {fmtDate(enquiry.showCauseDate)}, enquiry {fmtDate(enquiry.enquiryDate)}.</Alert> : <Alert kind="danger">No Dismissal Enquiry record with show-cause and enquiry dates, not exonerated or withdrawn (s.24). Record it on the employee's Discipline tab first.</Alert>}</div>
                </>
              )}
              {sep.type === 'Death' && (
                <>
                  <Field label="Nominee name" required><input value={sep.nominee.name} onChange={(e) => set({ nominee: { ...sep.nominee, name: e.target.value } })} /></Field>
                  <Field label="Relation"><select value={sep.nominee.relation} onChange={(e) => set({ nominee: { ...sep.nominee, relation: e.target.value } })}><option value="">—</option>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></Field>
                  <Field label="Nominee NID / mobile"><div className="row"><input value={sep.nominee.nid} placeholder="NID" onChange={(e) => set({ nominee: { ...sep.nominee, nid: e.target.value } })} /><input value={sep.nominee.mobile} placeholder="Mobile" onChange={(e) => set({ nominee: { ...sep.nominee, mobile: e.target.value } })} /></div></Field>
                </>
              )}
              {sep.type === DEEMED && emp && !emp.absenceNotice?.secondNoticeOn && <div className="span-3"><Alert kind="danger">The second s.27(3A) notice has not been recorded for this employee.</Alert></div>}
              {sep.type === DEEMED && deemedFrom(emp, asOf) && <div className="span-3"><Alert kind="danger">Deemed resignation is available from {fmtDate(deemedFrom(emp, asOf))}, 7 days after the second s.27(3A) notice of {fmtDate(emp.absenceNotice.secondNoticeOn)}.</Alert></div>}
              {sep.type === 'End of Contract' && emp && <div className="span-3"><Alert kind={emp.employment?.contractEndDate ? 'info' : 'danger'}>{emp.employment?.contractEndDate ? `Contract end date on record: ${fmtDate(emp.employment.contractEndDate)}.` : 'No contract end date on the employee record.'}</Alert></div>}
            </div>
          )}

          {step === 1 && (
            <div className="form-grid cols-3">
              <Field label={sep.type === 'Death' ? 'Date of death' : 'Notice date'} required><input type="date" value={sep.noticeDate} onChange={(e) => setNotice({ noticeDate: e.target.value })} /></Field>
              <Field label="Last working day" required hint={sep.type === 'Retirement' && emp?.dob ? `Prefilled from the ${settings.statutory.retirementAge}th birthday: ${fmtDate(retirementDate(emp, settings))}` : `Default: notice date + ${required} days`}><input type="date" value={sep.lastWorkingDay} onChange={(e) => setSep((prev) => withLwd(prev, { ...prev, lastWorkingDay: e.target.value }))} /></Field>
              <Field label="Notice waived (days)" hint="Days the employer waives from the shortfall"><input type="number" min="0" value={sep.noticeWaivedDays} onChange={(e) => set({ noticeWaivedDays: e.target.value })} /></Field>
              <div className="span-3">
                {kv([
                  ['Notice required', `${required} days (${SEPARATION_SECTIONS[sep.type] || '—'})`],
                  ['Notice served', `${served} days (${fmtDate(sep.noticeDate)} → ${fmtDate(sep.lastWorkingDay)})`],
                  ['Shortfall', RESIGNATION_TYPES.includes(sep.type) ? `${shortfall} days${shortfall ? ' — recovered from dues (s.27(3))' : ''}` : 'Not applicable (employer-initiated or no notice)'],
                  ['Service at LWD', live ? `${live.meta.serviceText} · ${live.meta.completedYears} completed year(s)` : '—'],
                  ['Settlement deadline', deadline.date ? `${fmtDate(deadline.date)} — ${settings.settlement.deadlineWorkingDays} working days, ${deadline.skipped} non-working days skipped (s.123)` : '—'],
                  ['Law version', live ? live.lawVersion : '—'],
                ])}
              </div>
              {employer && (
                <>
                  <label className="check"><input type="checkbox" checked={sep.payInLieu} onChange={(e) => set({ payInLieu: e.target.checked, payInLieuDays: '' })} /> Pay in lieu of notice (s.26(3) / s.20(2))</label>
                  {sep.payInLieu && <Field label="Days paid in lieu" hint={`Notice not served: ${lieuMax} days (blank = all of them)`}><input type="number" min="0" max={lieuMax} placeholder={String(lieuMax)} value={sep.payInLieuDays} onChange={(e) => set({ payInLieuDays: e.target.value })} /></Field>}
                </>
              )}
              {sep.lastWorkingDay && sep.lastWorkingDay <= asOf && <div className="span-3"><Alert kind="info">The last working day is on or before today ({fmtDate(asOf)}); the employee will be marked Separated when the dues are submitted for HR approval.</Alert></div>}
            </div>
          )}

          {step === 2 && !emp && <Alert kind="warn">Select an employee in step 1 first.</Alert>}
          {step === 2 && emp && (
            <div className="stack" style={{ gap: 22 }}>
              <div>
                <h3 className="mb-8">Earnings</h3>
                <div className="form-grid cols-3">
                  {num('Earned leave balance (days)', 'elBalanceDays', elBalance == null ? 'Encashed at the gross daily rate (s.11, s.119)' : `Balance on record: ${fmtNum2(elBalance)} days for ${settings.leave.year}${settings.leave.prorateOnExit ? ' (accrual pro-rated to the LWD)' : ''}`)}
                  {num('Salary arrears (BDT)', 'arrears')}
                  {num('Overtime dues (BDT)', 'overtime', 's.108')}
                  {num('Expense reimbursement (BDT)', 'reimbursement')}
                  {num('Other payable (BDT)', 'otherPayable')}
                  {num('Performance bonus (BDT)', 'performanceBonus', bonusEligible ? 'Closed appraisal with grade B or better on record' : 'Requires a closed appraisal with grade ≥ B', { disabled: !bonusEligible })}
                  <label className="check"><input type="checkbox" checked={sep.inputs.finalMonthSalaryPaid} onChange={(e) => setIn({ finalMonthSalaryPaid: e.target.checked })} /> Final month salary already paid through payroll</label>
                  <label className="check"><input type="checkbox" checked={sep.inputs.bonusPaidThisYear} onChange={(e) => setIn({ bonusPaidThisYear: e.target.checked })} /> Festival bonus already paid this year</label>
                  {sep.type === 'Death' && num('Group insurance (BDT)', 'groupInsurance', 's.99 — payable to the nominee')}
                </div>
              </div>
              <div>
                <h3 className="mb-8">Provident fund {emp.pf?.member ? '' : '(not a member)'}</h3>
                <div className="form-grid cols-3">
                  {num('PF own balance (BDT)', 'pfOwn', 'r.263', { disabled: !emp.pf?.member })}
                  {num('PF employer balance (BDT)', 'pfEmployer', 'r.263(1) — vests after the vesting years', { disabled: !emp.pf?.member })}
                  {num('PF interest accrued (BDT)', 'pfInterest', 'r.261', { disabled: !emp.pf?.member })}
                  {num('PF advance outstanding (BDT)', 'pfAdvance', 'r.266 — set off against PF', { disabled: !emp.pf?.member })}
                </div>
              </div>
              <div>
                <h3 className="mb-8">Deductions</h3>
                <div className="form-grid cols-3">
                  {num('Loan / salary advance recovery (BDT)', 'loanRecovery', `Outstanding on record: ${fmtMoney2((emp.loans || []).reduce((s, l) => s + n(l.outstanding), 0))} (s.125(2))`)}
                  {num('Recovery for company property (BDT)', 'assetRecovery', 's.125(2)(c), s.127 — needs a show-cause notice')}
                  <label className="check"><input type="checkbox" checked={sep.inputs.assetShowCauseIssued} onChange={(e) => setIn({ assetShowCauseIssued: e.target.checked })} /> Show-cause notice issued for the loss / damage</label>
                  {num('Unauthorised absence (days)', 'absenceDays', 'r.115')}
                  {num('Other deduction (BDT)', 'otherDeduction')}
                </div>
              </div>
              <div>
                <h3 className="mb-8">Tax &amp; overrides</h3>
                <div className="form-grid cols-3">
                  {num('Income this fiscal year to date (BDT)', 'ytdIncome', 'From the employee tax record; drives the TDS estimate')}
                  {num('Tax already deducted this year (BDT)', 'ytdTaxPaid')}
                  {num('Tax override (BDT)', 'taxOverride', 'Leave blank to use the estimate')}
                  <Field label="Law version override" hint={`Auto picks by last working day vs cutover ${fmtDate(settings.statutory.lawCutoverDate)}`}><select value={sep.inputs.lawVersionOverride} onChange={(e) => setIn({ lawVersionOverride: e.target.value })}><option value="">Auto</option><option value="bla2026">bla2026 (2026 amendment)</option><option value="pre_2025">pre_2025</option></select></Field>
                  <Field label="Part-year rounding override"><select value={sep.inputs.roundingOverride} onChange={(e) => setIn({ roundingOverride: e.target.value })}><option value="">Settings default ({settings.statutory.partialYearRounding})</option><option value="six_months">Six months rounds up</option><option value="strict">Strict (completed years only)</option></select></Field>
                </div>
              </div>
            </div>
          )}

          {step === 3 && !emp && <Alert kind="warn">Select an employee in step 1 first.</Alert>}
          {step === 3 && emp && errors.length > 0 && <div className="mb-8"><Alert kind="danger" title="Resolve before initiating"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert></div>}
          {step === 3 && emp && live && (
            <div className="grid grid-2">
              <div className="stack">
                {kv([
                  ['Employee', `${emp.name} · ${emp.code}`],
                  ['Separation', `${sep.type} (${SEPARATION_SECTIONS[sep.type] || '—'})${sep.misconductClause ? ` · s.${sep.misconductClause}` : ''}`],
                  ['Reason', sep.reason],
                  ['Notice → LWD', `${fmtDate(sep.noticeDate)} → ${fmtDate(sep.lastWorkingDay)} (required ${required}, served ${served}${shortfall ? `, shortfall ${shortfall}` : ''})`],
                  ['Service', `${live.meta.serviceText} · ${live.meta.completedYears} completed year(s), ${live.meta.rounding} rounding · ${live.lawVersion}`],
                  ['Deadline', deadline.date ? `${fmtDate(deadline.date)} (${deadline.skipped} non-working days skipped)` : '—'],
                  ['Payee', live.meta.payee === 'Nominee' ? `Nominee: ${sep.nominee?.name || '—'} (${sep.nominee?.relation || '—'})` : 'Employee'],
                  ['Rehire eligible', sep.rehireEligible ? 'Yes' : 'No (dismissal, unsatisfactory last grade or already ineligible)'],
                ])}
                {live.flags.length > 0 && <div className="stack" style={{ gap: 8 }}>{live.flags.map((f) => <div key={f.text} className={`alert alert-${f.tone === 'danger' ? 'danger' : f.tone === 'warn' ? 'warn' : 'info'}`}>{f.text}</div>)}</div>}
              </div>
              <div>
                <table>
                  <thead><tr><th>Line</th><th>Formula</th><th className="right">BDT</th></tr></thead>
                  <tbody>
                    {live.lines.earnings.filter((l) => l.amount !== 0).map((l) => <tr key={l.key}><td>{l.label}</td><td className="small muted">{l.formula} · {l.cite}</td><td className="right mono">{fmtNum2(l.amount)}</td></tr>)}
                    <tr><td className="strong">Earnings</td><td /><td className="right mono strong">{fmtNum2(live.totals.earnings)}</td></tr>
                    {live.lines.deductions.filter((l) => l.amount !== 0).map((l) => <tr key={l.key}><td>Less: {l.label}</td><td className="small muted">{l.formula} · {l.cite}</td><td className="right mono">{fmtNum2(l.amount)}</td></tr>)}
                    <tr><td className="strong">Deductions</td><td /><td className="right mono strong">{fmtNum2(live.totals.deductions)}</td></tr>
                    <tr><td className="strong">Net payable</td><td /><td className="right mono strong">{fmtMoney2(live.totals.netPayable)}</td></tr>
                    {live.meta.pfMember && <tr><td className="strong">PF net</td><td className="small muted">{live.lines.pf.map((l) => `${l.label} ${fmtNum2(l.amount)}`).join(' · ')}</td><td className="right mono strong">{fmtNum2(live.totals.pfNet)}</td></tr>}
                    <tr><td className="strong">Total to {live.meta.payee.toLowerCase()}</td><td /><td className="right mono strong">{fmtMoney2(live.totals.totalToEmployee)}</td></tr>
                  </tbody>
                </table>
                <p className="small muted mt-8">Live preview; the statement is frozen later with <b>Finalise dues</b> on the settlement file. Days to LWD: {daysBetween(asOf, sep.lastWorkingDay)}.</p>
              </div>
            </div>
          )}
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <button className="btn" disabled={step === 0} onClick={() => setStep((x) => x - 1)}>← Previous</button>
          <div className="row">
            {step < STEPS.length - 1 ? <button className="btn btn-primary" disabled={step === 0 && !emp} onClick={() => setStep((x) => x + 1)}>Next →</button> : <button className="btn btn-primary" disabled={!emp} onClick={initiate}>Initiate separation</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

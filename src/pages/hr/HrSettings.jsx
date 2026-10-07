import { useEffect, useState } from 'react';
import { Alert, Card, EmptyState, Field } from '../../components/ui';
import { DEFAULT_HR_SETTINGS, DEFAULT_LEAVE_TYPES, ESTABLISHMENT_TYPES, GRADES, HR_ACTION_LABELS, HR_PERMISSIONS, HR_ROLES, LEAVE_STATUS, MISCONDUCT_CLAUSES, SEPARATION_TYPES, TAX_CATEGORIES } from '../../hr/config';
import { fmtDate, hrToday, localToday, num } from '../../hr/helpers';
import { runHrSelfTest } from '../../hr/selfTest';
import { useStore } from '../../store/StoreContext';

const TABS = ['Statutory & settlement', 'Leave types', 'Grades & gates', 'Tax', 'Holidays & calendar', 'Roles & permissions'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TONES = ['green', 'blue', 'indigo', 'purple', 'amber', 'red', 'gray'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Empty input stays '' so validation can flag it; otherwise settings hold numbers.
const N = (v) => (v === '' ? '' : Number(v));
const GATE_CAP_KEYS = [
  ['writtenWarningCap', 'Written warning cap'], ['finalWarningCap', 'Final warning / suspension cap'], ['integrityCap', 'Integrity cap'],
  ['attendanceCap', 'Attendance cap'], ['unapprovedCap', 'Unapproved absence cap'], ['gateKpiCap', 'Gate KPI cap'],
];
const fmtVal = (v) => (v != null && typeof v === 'object' ? JSON.stringify(v) : String(v));

// Notice periods (days) by separation type and employment type, with the section each default comes from.
const NOTICE_ROWS = [
  ['employerPermanentMonthly', 'Employer → permanent, monthly-rated', 's.26(1)(a): 120 days'],
  ['employerPermanentOther', 'Employer → permanent, other', 's.26(1)(b): 60 days'],
  ['employerTemporaryMonthly', 'Employer → temporary, monthly-rated', 's.26(2): 30 days'],
  ['employerTemporaryOther', 'Employer → temporary, other', 's.26(2): 14 days'],
  ['workerPermanent', 'Worker resigning, permanent', 's.27(1): 60 days'],
  ['workerTemporaryMonthly', 'Worker resigning, temporary monthly-rated', 's.27(2): 30 days'],
  ['workerTemporaryOther', 'Worker resigning, temporary other', 's.27(2): 14 days'],
  ['probation', 'Probationer (either side)', 's.4(6): none'],
  ['contractExpiry', 'End of contract', 's.26(2): none'],
  ['retrenchment', 'Retrenchment', 's.20(1)(a): 30 days'],
  ['retrenchmentAfterLayoffExtraDays', 'Retrenchment after lay-off: extra days paid', 's.20(2)(c): 15 days'],
  ['discharge', 'Discharge', 's.22: none'],
  ['dismissal', 'Dismissal', 's.23: none'],
  ['retirement', 'Retirement', 's.28: none'],
  ['death', 'Death', 's.19: none'],
];
// Compensation days per completed year of service by separation type.
const COMP_ROWS = [
  ['terminationDaysPerYear', 'Termination', 's.26(4): 30 days per year'],
  ['retrenchmentDaysPerYear', 'Retrenchment', 's.20(2)(c): 30 days per year'],
  ['dischargeDaysPerYear', 'Discharge', 's.22(2): 30 days per year'],
  ['dismissalDaysPerYear', 'Dismissal', 's.23(3): 15 days per year'],
  ['retirementDaysPerYear', 'Retirement', 's.28(3): 30 days per year'],
  ['deathDaysPerYear', 'Death', 's.19: 30 days per year'],
  ['deathAtWorkDaysPerYear', 'Death at work', 's.19 (2026 amendment): 45 days per year'],
  ['minServiceYears', 'Minimum service (years)', 's.20/22/23: one year of continuous service'],
  ['deathMinServiceYears', 'Death: minimum service (bla2026)', 's.19 as amended: 1 year'],
  ['deathMinServiceYearsPre2025', 'Death: minimum service (pre-2025)', 's.19: 2 years'],
];

// Validation of the whole draft; returns sentences for the error Alert.
const validate = (s, lt) => {
  const e = [];
  const bands = s.appraisal.bands || [];
  if (!bands.length) e.push('At least one grade band is required.');
  if (bands.some((b) => !String(b.code || '').trim()) || new Set(bands.map((b) => String(b.code).trim())).size !== bands.length) e.push('Grade band codes must be unique and non-empty.');
  bands.forEach((b, i) => { if (i > 0 && num(b.min) >= num(bands[i - 1].min)) e.push(`Band ${b.code}: minimum score must be below band ${bands[i - 1].code}.`); });
  if (bands.length && num(bands[bands.length - 1].min) !== 0) e.push('The last grade band must start at 0.');
  const guided = bands.reduce((t, b) => t + num(b.guidedPct), 0);
  if (bands.length && guided !== 100) e.push(`Guided distribution must total 100% (currently ${guided}%).`);
  // Gate caps must name an existing band exactly (appraisalCalc.bandIndex uses ===), or the cap silently stops applying.
  const bandCodes = new Set(bands.map((b) => b.code));
  GATE_CAP_KEYS.forEach(([k, label]) => { const v = s.appraisal.gates?.[k]; if (!bandCodes.has(v)) e.push(`${label} refers to band "${v || '(none)'}", which does not exist.`); });
  const w = num(s.appraisal.attendance.attendanceWeight);
  if (w < 0 || w > 1) e.push('Attendance weight must be between 0 and 1.');
  if (!(s.appraisal.attendance.attendanceSteps || []).length || !(s.appraisal.attendance.punctualitySteps || []).length) e.push('Attendance and punctuality step tables need at least one row.');
  [['resignationTiers', 'Resignation tiers (bla2026)'], ['resignationTiersPre2025', 'Resignation tiers (pre-2025)']].forEach(([k, label]) => {
    const tiers = s.compensation[k] || [];
    if (!tiers.length) { e.push(`${label}: at least one tier is required.`); return; }
    if (tiers[tiers.length - 1].upToYears != null) e.push(`${label}: the last tier must have no upper bound.`);
    tiers.forEach((t, i) => {
      if (i < tiers.length - 1 && t.upToYears == null) e.push(`${label}: only the last tier may be unbounded.`);
      if (i > 0 && i < tiers.length - 1 && num(t.upToYears) <= num(tiers[i - 1].upToYears)) e.push(`${label}: tiers must be in ascending order of years.`);
      if (num(t.days) < 0) e.push(`${label}: days cannot be negative.`);
    });
  });
  const slabs = s.tax.slabs || [];
  if (!slabs.length || slabs[slabs.length - 1].width != null) e.push('Tax slabs: the last slab must be open-ended (no width).');
  slabs.forEach((sl, i) => {
    if (i < slabs.length - 1 && num(sl.width) <= 0) e.push(`Tax slab ${i + 1}: width must be greater than zero.`);
    if (num(sl.rate) < 0 || num(sl.rate) > 100) e.push(`Tax slab ${i + 1}: rate must be between 0 and 100.`);
  });
  TAX_CATEGORIES.forEach((c) => { if (num(s.tax.thresholds[c.code]) <= 0) e.push(`Tax-free threshold for ${c.name} must be greater than zero.`); });
  if (num(s.tax.exemptionDivisor) <= 0) e.push('Exemption divisor must be greater than zero.');
  if (num(s.statutory.daysPerMonth) <= 0) e.push('Days per month must be greater than zero.');
  if (num(s.statutory.retirementAge) <= 0) e.push('Retirement age must be greater than zero.');
  if (num(s.settlement.deadlineWorkingDays) <= 0) e.push('Settlement deadline must be at least one working day.');
  if (num(s.leave.elAccrualDivisor) <= 0) e.push('EL accrual divisor must be greater than zero.');
  if (num(s.leave.elCapDays) <= 0) e.push('EL accumulation cap must be greater than zero.');
  if (!(s.company.name || '').trim()) e.push('Company name is required.');
  if (WEEKDAYS.every((d) => (s.calendar.weeklyOffs || []).includes(d))) e.push('At least one weekday must be a working day.');
  if ((s.calendar.holidays || []).some((h) => !h.date)) e.push('Every holiday needs a date.');
  if (s.calendar.asOfDate && !/^\d{4}-\d{2}-\d{2}$/.test(s.calendar.asOfDate)) e.push('The demo clock must be a valid date.');
  if (lt.some((t) => !String(t.code || '').trim() || !String(t.name || '').trim())) e.push('Every leave type needs a code and a name.');
  if (new Set(lt.map((t) => String(t.code).trim())).size !== lt.length) e.push('Leave type codes must be unique.');
  lt.forEach((t) => {
    if (!t.unlimited && num(t.annualDays) < 0) e.push(`${t.code}: annual days cannot be negative.`);
    if (t.carryForward && num(t.carryCap) <= 0) e.push(`${t.code}: a carry-forward cap is required when carry-forward is on.`);
  });
  return e;
};

export default function HrSettings() {
  const { state, dispatch, currentUser, notify } = useStore();
  const by = currentUser.name;
  const [s, setS] = useState(() => structuredClone(state.hrSettings));
  const [lt, setLt] = useState(() => structuredClone(state.leaveTypes));
  const [tab, setTab] = useState(0);
  const [errors, setErrors] = useState([]);
  const [selfTest, setSelfTest] = useState(null);

  // Keep the editors in step with the store (e.g. after "Reset demo data").
  useEffect(() => { setS(structuredClone(state.hrSettings)); }, [state.hrSettings]);
  useEffect(() => { setLt(structuredClone(state.leaveTypes)); }, [state.leaveTypes]);

  const upd = (sec, patch) => setS((p) => ({ ...p, [sec]: { ...p[sec], ...patch } }));
  const updN = (sec, sub, patch) => setS((p) => ({ ...p, [sec]: { ...p[sec], [sub]: { ...p[sec][sub], ...patch } } }));
  const toggleIn = (sec, key, v) => { const list = s[sec][key] || []; upd(sec, { [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }); };
  const numF = (sec, key, label, hint, extra = {}) => (
    <Field label={label} hint={hint}><input type="number" {...extra} value={s[sec][key] ?? ''} onChange={(e) => upd(sec, { [key]: N(e.target.value) })} /></Field>
  );
  const numN = (sec, sub, key, label, hint, extra = {}) => (
    <Field label={label} hint={hint}><input type="number" {...extra} value={s[sec][sub][key] ?? ''} onChange={(e) => updN(sec, sub, { [key]: N(e.target.value) })} /></Field>
  );
  const chk = (sec, key, label, hint) => (
    <Field hint={hint}><label className="check"><input type="checkbox" checked={!!s[sec][key]} onChange={(e) => upd(sec, { [key]: e.target.checked })} /> {label}</label></Field>
  );
  const sel = (sec, key, label, options, hint) => (
    <Field label={label} hint={hint}><select value={s[sec][key]} onChange={(e) => upd(sec, { [key]: e.target.value })}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
  );
  const chips = (sec, key, values, label, hint) => (
    <Field label={label} hint={hint} className="span-3">
      <div className="chip-list">
        {values.map((v) => {
          const on = (s[sec][key] || []).includes(v);
          return <label key={v} className={`chip ${on ? 'on' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" style={{ display: 'none' }} checked={on} onChange={() => toggleIn(sec, key, v)} />{on ? '✓ ' : ''}{v}</label>;
        })}
      </div>
    </Field>
  );
  const gradeOptions = (s.appraisal.bands || []).map((b) => [b.code, `${b.code} · ${b.name}`]);
  const gradeSel = (key, label, hint) => (
    <Field label={label} hint={hint}><select value={s.appraisal.gates[key] ?? ''} onChange={(e) => updN('appraisal', 'gates', { [key]: e.target.value })}>
      {!gradeOptions.some(([v]) => v === s.appraisal.gates[key]) && <option value={s.appraisal.gates[key] ?? ''} disabled>— select a band ({s.appraisal.gates[key] || 'none'} no longer exists) —</option>}
      {gradeOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select></Field>
  );

  // Row editors for the small tables (tiers, slabs, bands, steps, holidays, leave types).
  const setRow = (sec, key, i, patch) => upd(sec, { [key]: s[sec][key].map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addRow = (sec, key, row) => upd(sec, { [key]: [...(s[sec][key] || []), row] });
  const removeRow = (sec, key, i) => upd(sec, { [key]: s[sec][key].filter((_, k) => k !== i) });
  const setRowN = (sec, sub, key, i, patch) => updN(sec, sub, { [key]: s[sec][sub][key].map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addRowN = (sec, sub, key, row) => updN(sec, sub, { [key]: [...(s[sec][sub][key] || []), row] });
  const removeRowN = (sec, sub, key, i) => updN(sec, sub, { [key]: s[sec][sub][key].filter((_, k) => k !== i) });
  const updLt = (i, patch) => setLt(lt.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const leaveTypeInUse = (code) => state.leaveRequests.some((r) => r.typeCode === code && r.status !== LEAVE_STATUS.CANCELLED);
  const removeLeaveType = (i) => {
    if (leaveTypeInUse(lt[i].code)) { notify(`${lt[i].code} has leave requests and cannot be removed.`, 'error'); return; }
    setLt(lt.filter((_, k) => k !== i));
  };
  const addLeaveType = () => setLt([...lt, { code: '', name: 'New leave type', annualDays: '0', paid: true, accrues: false, carryForward: false, carryCap: '0', encashable: false, minServiceMonths: '0', maxConsecutive: '0', countCalendarDays: false, genderOnly: '', unlimited: false, statutoryRef: 'Policy' }]);

  const tierTable = (key, title, hint) => (
    <Card title={title} actions={<button className="btn btn-sm" onClick={() => addRow('compensation', key, { upToYears: null, inclusive: false, days: 0 })}>+ Tier</button>}>
      <div className="small muted" style={{ marginBottom: 8 }}>{hint}</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Up to years</th><th>Inclusive</th><th>Days per completed year</th><th></th></tr></thead>
        <tbody>{(s.compensation[key] || []).map((t, i) => (
          <tr key={i}>
            <td><input type="number" min="0" step="0.5" placeholder="no limit" value={t.upToYears ?? ''} style={{ width: 110 }} onChange={(e) => setRow('compensation', key, i, { upToYears: e.target.value === '' ? null : Number(e.target.value) })} /></td>
            <td><label className="check"><input type="checkbox" checked={!!t.inclusive} onChange={(e) => setRow('compensation', key, i, { inclusive: e.target.checked })} /> ≤ (else &lt;)</label></td>
            <td><input type="number" min="0" value={t.days ?? ''} style={{ width: 90 }} onChange={(e) => setRow('compensation', key, i, { days: N(e.target.value) })} /></td>
            <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRow('compensation', key, i)}>Remove</button></td>
          </tr>))}
        </tbody>
      </table></div>
    </Card>
  );

  // leave.year is a counter only CLOSE_LEAVE_YEAR moves, and the demo clock is runtime state: keep both.
  // Custom leave types that still have requests are kept too, so restoring cannot orphan those requests.
  const restoreDefaults = () => {
    const d = structuredClone(DEFAULT_HR_SETTINGS);
    d.leave.year = state.hrSettings.leave.year;
    d.calendar.asOfDate = state.hrSettings.calendar.asOfDate;
    setS(d);
    setLt([...structuredClone(DEFAULT_LEAVE_TYPES), ...structuredClone(state.leaveTypes.filter((t) => leaveTypeInUse(t.code) && !DEFAULT_LEAVE_TYPES.some((x) => x.code === t.code)))]);
    setErrors([]);
    notify('Defaults restored in the editor; Save changes to apply.', 'info');
  };

  const save = () => {
    const errs = validate(s, lt);
    const dropped = state.leaveTypes.filter((t) => !lt.some((x) => x.code === t.code) && leaveTypeInUse(t.code));
    if (dropped.length) errs.push(`${dropped.map((t) => t.code).join(', ')} ${dropped.length === 1 ? 'has' : 'have'} leave requests and cannot be removed.`);
    setErrors(errs);
    if (errs.length) { notify(errs[0], 'error'); return; }
    // Normalise before comparing so an untouched section is not reported as changed.
    // leave.year is never edited here (only CLOSE_LEAVE_YEAR advances it), so always keep the stored value.
    const next = { ...s, leave: { ...s.leave, year: state.hrSettings.leave.year }, calendar: { ...s.calendar, holidays: [...s.calendar.holidays].sort((a, b) => a.date.localeCompare(b.date)) } };
    const changed = Object.keys(next).filter((k) => k !== 'schemaVersion' && JSON.stringify(next[k]) !== JSON.stringify(state.hrSettings[k]));
    const ltChanged = JSON.stringify(lt) !== JSON.stringify(state.leaveTypes);
    if (!changed.length && !ltChanged) { notify('No changes to save.', 'info'); return; }
    if (changed.length) dispatch({ type: 'SET_HR_SETTINGS', hrSettings: next, by, detail: changed.join(', ') });
    if (ltChanged) dispatch({ type: 'SET_LEAVE_TYPES', leaveTypes: lt, by });
    notify('HR settings saved.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>HR Settings</h1><p className="sub">Statutory defaults follow the Bangladesh Labour Act 2006 as amended; every figure here feeds the statements, appraisals and leave balances.</p></div>
        <div className="page-actions">
          <button className="btn" onClick={restoreDefaults}>Restore defaults</button>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>
      </div>

      {errors.length > 0 && <Alert kind="danger" title="Please correct the following before saving"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {TABS.map((t, i) => <button key={t} className={`tab ${tab === i ? 'active' : ''}`} onClick={() => setTab(i)}>{t}</button>)}
        </div>
        <div className="card-body stack">
          {tab === 0 && (
            <>
              <Card title="Law version & service" actions={<button className="btn btn-sm" onClick={() => setSelfTest(runHrSelfTest())}>Verify formulas</button>}>
                <div className="form-grid cols-3">
                  {sel('statutory', 'lawVersion', 'Law version', [['auto', 'Auto by last working day'], ['bla2026', 'Labour Act as amended (2025/26)'], ['pre_2025', 'Pre-amendment (2006/2018)']], 'Auto picks the pre-2025 s.27(4) tiers when the LWD is before the cutover date.')}
                  <Field label="Amendment cutover date" hint="Commencement of the Labour (Amendment) Act; separations before it use the old resignation tiers."><input type="date" value={s.statutory.lawCutoverDate} onChange={(e) => upd('statutory', { lawCutoverDate: e.target.value })} /></Field>
                  {numF('statutory', 'daysPerMonth', 'Days per month', 'Rule 114: a day\'s wage is the monthly wage ÷ 30.', { min: 1 })}
                  {sel('statutory', 'partialYearRounding', 'Partial-year rounding', [['six_months', 'More than six months counts as a year'], ['strict', 'Completed years only']], 's.2(10): service beyond six months counts as one full year.')}
                  {sel('statutory', 'compWageBase', 'Compensation wage base', [['basic_da', 'Basic + dearness + ad-hoc'], ['gross', 'Gross salary']], 's.2(45): wages means basic plus dearness allowance and ad-hoc or interim pay.')}
                  {numF('statutory', 'continuousServiceDays', 'Continuous service (days in 12 months)', 's.14(2): 240 days attended in the preceding 12 months.', { min: 1 })}
                  {numF('statutory', 'retirementAge', 'Retirement age', 's.28(1): a worker retires on completing 60 years of age.', { min: 1 })}
                  {chk('statutory', 'applyToNonWorkers', 'Apply Act benefits to non-workers', 'Policy choice: managerial and supervisory staff are outside s.2(65), benefits extended by policy.')}
                  {chk('statutory', 'countLastDayInclusive', 'Count the last working day as served', 'Adds one day to the service length used for completed years.')}
                </div>
              </Card>

              {selfTest && (
                <Card title={`Formula self-test · ${selfTest.pass ? 'all checks pass' : 'FAILURES'} (${selfTest.results.filter((r) => r.ok).length}/${selfTest.results.length})`} actions={<button className="btn btn-sm btn-ghost" onClick={() => setSelfTest(null)}>Hide</button>}>
                  <div className="table-wrap"><table>
                    <thead><tr><th></th><th>Check</th><th>Expected</th><th>Actual</th></tr></thead>
                    <tbody>{selfTest.results.map((r) => (
                      <tr key={r.name}>
                        <td>{r.ok ? <span className="badge badge-green">✓</span> : <span className="badge badge-red">✗</span>}</td>
                        <td>{r.name}</td><td className="mono small">{fmtVal(r.expected)}</td><td className="mono small">{fmtVal(r.actual)}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                </Card>
              )}

              <Card title="Notice periods (days)">
                <div className="table-wrap"><table>
                  <thead><tr><th>Case</th><th>Days</th><th>Reference</th></tr></thead>
                  <tbody>{NOTICE_ROWS.map(([key, label, cite]) => (
                    <tr key={key}>
                      <td className="strong">{label}</td>
                      <td><input type="number" min="0" value={s.notice[key] ?? ''} style={{ width: 90 }} onChange={(e) => upd('notice', { [key]: N(e.target.value) })} /></td>
                      <td className="muted small">{cite}</td>
                    </tr>))}
                  </tbody>
                </table></div>
              </Card>

              <Card title="Compensation per completed year of service">
                <div className="table-wrap"><table>
                  <thead><tr><th>Separation type</th><th>Days / years</th><th>Reference</th></tr></thead>
                  <tbody>{COMP_ROWS.map(([key, label, cite]) => (
                    <tr key={key}>
                      <td className="strong">{label}</td>
                      <td><input type="number" min="0" value={s.compensation[key] ?? ''} style={{ width: 90 }} onChange={(e) => upd('compensation', { [key]: N(e.target.value) })} /></td>
                      <td className="muted small">{cite}</td>
                    </tr>))}
                  </tbody>
                </table></div>
                <div className="form-grid cols-3 mt-8">
                  {chk('compensation', 'permanentOnly', 'Compensation for permanent employees only', 's.26(4), s.27(4): benefits accrue to permanent workers.')}
                  {chk('compensation', 'resignationGratuityCompareAllTiers', 'Compare gratuity with every resignation tier', 's.2(10): the worker receives the higher of gratuity and statutory benefit.')}
                  {chips('compensation', 'forfeitOnMisconductClauses', MISCONDUCT_CLAUSES.filter(Boolean), 'Dismissal clauses that forfeit compensation', 's.23(3): no compensation when dismissed for theft, fraud or dishonesty.')}
                </div>
              </Card>

              <div className="grid grid-2">
                {tierTable('resignationTiers', 'Resignation benefit tiers · Labour Act as amended', 's.27(4): 7 days up to 3 years, 15 days up to 10 years, 30 days thereafter.')}
                {tierTable('resignationTiersPre2025', 'Resignation benefit tiers · pre-2025', 's.27(4) (2006/2018): nil below 5 years, 14 days up to 10 years, 30 days thereafter.')}
              </div>

              <Card title="Gratuity scheme">
                <div className="form-grid cols-3">
                  {chk('gratuity', 'schemeEnabled', 'Gratuity scheme in place', 's.2(10): optional scheme; statement takes the higher of gratuity and compensation.')}
                  {numF('gratuity', 'daysPerYear', 'Days per year', 's.2(10): 30 days wages per completed year.', { min: 0 })}
                  {numF('gratuity', 'daysPerYearAfter10', 'Days per year beyond 10 years', 's.2(10): 45 days wages for service beyond ten years.', { min: 0 })}
                  {sel('gratuity', 'wageBase', 'Gratuity wage base', [['basic', 'Basic salary'], ['gross', 'Gross salary']], 's.2(10): computed on the last drawn wages.')}
                  {chk('gratuity', 'compareWithCompensation', 'Pay the higher of gratuity and compensation', 's.2(10), s.26(4).')}
                  {chk('gratuity', 'fundApproved', 'Approved gratuity fund', 'ITA 2023 Sixth Schedule: gratuity from an approved fund is exempt up to the cap.')}
                </div>
              </Card>

              <Card title="Provident fund">
                <div className="form-grid cols-3">
                  {chk('pf', 'enabled', 'Provident fund operated', 's.264: PF for workers of private establishments.')}
                  {numF('pf', 'eligibilityMonths', 'Eligibility (months of service)', 's.264(9): membership after one year of service.', { min: 0 })}
                  {numF('pf', 'employeeRatePct', 'Employee contribution %', 's.264(9): 7–8% of basic.', { min: 0, step: 0.5 })}
                  {numF('pf', 'employerRatePct', 'Employer contribution %', 's.264(9): employer matches the employee contribution.', { min: 0, step: 0.5 })}
                  {sel('pf', 'rateBase', 'Contribution base', [['basic', 'Basic salary'], ['gross', 'Gross salary']], 's.264(9): on basic wages.')}
                  {numF('pf', 'vestingYears', 'Vesting of employer share (years)', 's.264(10): vests after the qualifying service.', { min: 0 })}
                  {chk('pf', 'vestOnDeath', 'Employer share vests on death', 's.264(10) proviso.')}
                  {chk('pf', 'forfeitOnDismissal', 'Forfeit employer share on dismissal', 'Trust-deed option (not statutory).')}
                  {chk('pf', 'advanceSetoff', 'Set off outstanding PF advance', 's.264: advances recovered from the member balance.')}
                  {chk('pf', 'recognised', 'Recognised fund (tax)', 'ITA 2023: employer contribution to a recognised fund is exempt.')}
                </div>
              </Card>

              <Card title="Festival bonus, notice shortfall and recoveries">
                <div className="form-grid cols-3">
                  {numF('bonus', 'countPerYear', 'Festival bonuses per year', 'Rule 111(5): two festival bonuses after one year of service.', { min: 0 })}
                  {numF('bonus', 'maxEachBasicMultiple', 'Maximum each (× basic)', 'Rule 111(5): not exceeding one basic wage each.', { min: 0, step: 0.5 })}
                  {sel('bonus', 'prorataOnExit', 'Pro-rata bonus on exit', [['none', 'None'], ['months_since_last', 'Months since last festival'], ['accrual', 'Accrual (2 × basic ÷ 12 per month)']], 'Policy; rule 111(5) does not require pro-rata.')}
                  {sel('noticeShortfall', 'base', 'Notice shortfall wage base', [['basic_da', 'Basic + dearness + ad-hoc'], ['gross', 'Gross salary']], 's.27(3): pay in lieu of the unserved notice.')}
                  {chk('noticeShortfall', 'setoffAllowed', 'Recover notice shortfall from dues', 's.27(3), s.14(3).')}
                  {chk('deductions', 'assetRecoveryRequiresShowCause', 'Asset recovery requires a show-cause', 's.125(2)(c), s.127: deduction for loss only after an opportunity to explain.')}
                </div>
              </Card>

              <Card title="Settlement deadline and approvals">
                <div className="form-grid cols-3">
                  {numF('settlement', 'deadlineWorkingDays', 'Payment deadline (working days after LWD)', 's.123: dues payable within 30 working days.', { min: 1 })}
                  {numF('settlement', 'managementApprovalAbove', 'Management approval above (BDT net)', 'Policy: settlements above this net amount need the MD\'s approval.', { min: 0 })}
                  {chk('settlement', 'issueServiceCertificate', 'Issue a service certificate on exit', 's.31: every worker is entitled to a certificate of service.')}
                  {chips('settlement', 'managementApprovalTypes', SEPARATION_TYPES, 'Separation types needing Management approval', 'Policy.')}
                  {chips('settlement', 'managementApprovalGrades', GRADES, 'Grades needing Management approval', 'Policy.')}
                </div>
              </Card>
            </>
          )}

          {tab === 1 && (
            <>
              <Card title="Earned-leave accrual" actions={<span className="small muted">Leave year {s.leave.year} (advanced by Close leave year)</span>}>
                <div className="form-grid cols-3">
                  {sel('leave', 'elAccrual', 'EL accrual mode', [['annual', 'Annual entitlement'], ['perDaysWorked', 'One day per N days worked']], 's.117: one day for every 18 days of work (22 for tea, 11 for newspaper).')}
                  {numF('leave', 'elAccrualDivisor', 'EL accrual divisor (days worked per EL day)', 's.117(1): 18 days for shops, commercial and industrial establishments.', { min: 1 })}
                  {numF('leave', 'elCapDays', 'EL accumulation cap (days)', 's.117(5): 40 days for factories, 60 for shops and commercial establishments; refused leave accrues beyond the cap.', { min: 1 })}
                  {chk('leave', 'encashOnExit', 'Encash earned leave on exit', 's.11, s.119: wages for leave not availed at separation.')}
                  {sel('leave', 'encashRateBase', 'Encashment rate base', [['gross', 'Gross salary'], ['basic_da', 'Basic + dearness + ad-hoc']], 's.119: full wages including dearness allowance.')}
                  {chk('leave', 'prorateOnExit', 'Pro-rate the current year\'s EL on exit', 'Policy.')}
                  {numF('leave', 'latesPerLeaveDay', 'Lates counted as one leave day', 'Policy: late arrivals converted to leave.', { min: 0 })}
                </div>
              </Card>
              <Card title="Leave types" actions={<button className="btn btn-sm" onClick={addLeaveType}>+ Add leave type</button>}>
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Name</th><th>Days / yr</th><th>Paid</th><th>Accrues</th><th>Carry</th><th>Cap</th><th>Encash</th><th>Min svc (m)</th><th>Max run</th><th>Calendar</th><th>Gender</th><th>Unlimited</th><th>Reference</th><th></th></tr></thead>
                  <tbody>{lt.map((t, i) => (
                    <tr key={i}>
                      <td><input value={t.code} style={{ width: 60 }} disabled={leaveTypeInUse(t.code)} onChange={(e) => updLt(i, { code: e.target.value.toUpperCase() })} /></td>
                      <td><input value={t.name} style={{ width: 150 }} onChange={(e) => updLt(i, { name: e.target.value })} /></td>
                      <td><input type="number" min="0" value={t.annualDays} style={{ width: 64 }} disabled={t.unlimited} onChange={(e) => updLt(i, { annualDays: e.target.value })} /></td>
                      <td className="center"><input type="checkbox" checked={!!t.paid} onChange={(e) => updLt(i, { paid: e.target.checked })} /></td>
                      <td className="center"><input type="checkbox" checked={!!t.accrues} onChange={(e) => updLt(i, { accrues: e.target.checked })} /></td>
                      <td className="center"><input type="checkbox" checked={!!t.carryForward} onChange={(e) => updLt(i, { carryForward: e.target.checked })} /></td>
                      <td><input type="number" min="0" value={t.carryCap} style={{ width: 64 }} disabled={!t.carryForward} onChange={(e) => updLt(i, { carryCap: e.target.value })} /></td>
                      <td className="center"><input type="checkbox" checked={!!t.encashable} onChange={(e) => updLt(i, { encashable: e.target.checked })} /></td>
                      <td><input type="number" min="0" value={t.minServiceMonths} style={{ width: 64 }} onChange={(e) => updLt(i, { minServiceMonths: e.target.value })} /></td>
                      <td><input type="number" min="0" value={t.maxConsecutive} style={{ width: 64 }} onChange={(e) => updLt(i, { maxConsecutive: e.target.value })} /></td>
                      <td className="center"><input type="checkbox" checked={!!t.countCalendarDays} onChange={(e) => updLt(i, { countCalendarDays: e.target.checked })} /></td>
                      <td><select value={t.genderOnly} onChange={(e) => updLt(i, { genderOnly: e.target.value })}><option value="">Any</option><option value="Female">Female</option><option value="Male">Male</option></select></td>
                      <td className="center"><input type="checkbox" checked={!!t.unlimited} onChange={(e) => updLt(i, { unlimited: e.target.checked })} /></td>
                      <td><input value={t.statutoryRef} style={{ width: 80 }} onChange={(e) => updLt(i, { statutoryRef: e.target.value })} /></td>
                      <td className="right"><button className="btn btn-sm btn-ghost" disabled={leaveTypeInUse(t.code)} title={leaveTypeInUse(t.code) ? 'In use by leave requests' : ''} onClick={() => removeLeaveType(i)}>Remove</button></td>
                    </tr>))}
                  </tbody>
                </table></div>
                <div className="small muted mt-8">Statutory minima: EL s.117 (1 per 18 days), CL s.115 (10 days), SL s.116 (14 days), ML s.46 (16 weeks, calendar days). Numeric fields are stored as entered.</div>
              </Card>
            </>
          )}

          {tab === 2 && (
            <>
              <Card title="Grade bands" actions={<button className="btn btn-sm" onClick={() => addRow('appraisal', 'bands', { code: '', name: '', min: 0, incrementPct: 0, bonusMultiplier: 0, promotionEligible: false, pip: false, guidedPct: 0, tone: 'gray' })}>+ Band</button>}>
                <div className="small muted" style={{ marginBottom: 8 }}>Ordered from the top grade down; the minimum score must fall with each row and the last band starts at 0. Guided % steers calibration and must total 100.</div>
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Name</th><th>Min score</th><th>Increment %</th><th>Bonus ×</th><th>Promotion</th><th>PIP</th><th>Guided %</th><th>Tone</th><th></th></tr></thead>
                  <tbody>{(s.appraisal.bands || []).map((b, i) => (
                    <tr key={i}>
                      <td><input value={b.code} style={{ width: 56 }} onChange={(e) => setRow('appraisal', 'bands', i, { code: e.target.value })} /></td>
                      <td><input value={b.name} style={{ width: 170 }} onChange={(e) => setRow('appraisal', 'bands', i, { name: e.target.value })} /></td>
                      <td><input type="number" min="0" max="100" value={b.min ?? ''} style={{ width: 70 }} onChange={(e) => setRow('appraisal', 'bands', i, { min: N(e.target.value) })} /></td>
                      <td><input type="number" min="0" step="0.5" value={b.incrementPct ?? ''} style={{ width: 70 }} onChange={(e) => setRow('appraisal', 'bands', i, { incrementPct: N(e.target.value) })} /></td>
                      <td><input type="number" min="0" step="0.25" value={b.bonusMultiplier ?? ''} style={{ width: 70 }} onChange={(e) => setRow('appraisal', 'bands', i, { bonusMultiplier: N(e.target.value) })} /></td>
                      <td className="center"><input type="checkbox" checked={!!b.promotionEligible} onChange={(e) => setRow('appraisal', 'bands', i, { promotionEligible: e.target.checked })} /></td>
                      <td className="center"><input type="checkbox" checked={!!b.pip} onChange={(e) => setRow('appraisal', 'bands', i, { pip: e.target.checked })} /></td>
                      <td><input type="number" min="0" max="100" value={b.guidedPct ?? ''} style={{ width: 70 }} onChange={(e) => setRow('appraisal', 'bands', i, { guidedPct: N(e.target.value) })} /></td>
                      <td><select value={b.tone} onChange={(e) => setRow('appraisal', 'bands', i, { tone: e.target.value })}>{TONES.map((t) => <option key={t} value={t}>{t}</option>)}</select> <span className={`badge badge-${b.tone}`}>{b.code || '?'}</span></td>
                      <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRow('appraisal', 'bands', i)}>Remove</button></td>
                    </tr>))}
                  </tbody>
                </table></div>
              </Card>

              <Card title="Grade gates (caps)">
                <div className="form-grid cols-3">
                  {gradeSel('writtenWarningCap', 'Written warning caps grade at', 'Active disciplinary record inside the period.')}
                  {gradeSel('finalWarningCap', 'Final warning / suspension caps at', 'Active disciplinary record inside the period.')}
                  {numN('appraisal', 'gates', 'integrityMaxRating', 'Integrity rating at or below', 'Triggers the integrity cap.', { min: 1, max: 5 })}
                  {gradeSel('integrityCap', 'Integrity cap', 'Low integrity rating.')}
                  {numN('appraisal', 'gates', 'attendanceBelowPct', 'Attendance below %', 'Triggers the attendance cap.', { min: 0, max: 100 })}
                  {gradeSel('attendanceCap', 'Attendance cap', 'Attendance below the threshold.')}
                  {numN('appraisal', 'gates', 'unapprovedAbsenceDays', 'Unapproved absence above (days)', 'Triggers the absence cap; attendance KPI scores 0 in KPI mode.', { min: 0 })}
                  {gradeSel('unapprovedCap', 'Unapproved absence cap', '')}
                  {numN('appraisal', 'gates', 'gateKpiFailBelow', 'Gate KPI fails below score', 'A gate KPI scoring below this caps the grade.', { min: 0, max: 100 })}
                  {gradeSel('gateKpiCap', 'Gate KPI cap', '')}
                </div>
              </Card>

              <Card title="Probation thresholds">
                <div className="form-grid cols-3">
                  {numF('probation', 'monthsClerical', 'Probation months · clerical', 's.4(8): six months for clerical work.', { min: 0 })}
                  {numF('probation', 'monthsOther', 'Probation months · other', 's.4(8): three months for other workers.', { min: 0 })}
                  {numF('probation', 'extensionMonths', 'Extension (months, once)', 's.4(8): may be extended once by three months.', { min: 0 })}
                  {numF('probation', 'confirmScoreMin', 'Confirm when review score ≥', 'Policy.', { min: 0, max: 100 })}
                  {numF('probation', 'extendScoreMin', 'Extend when review score ≥', 'Policy; below this the suggestion is Not confirm.', { min: 0, max: 100 })}
                  {numF('probation', 'attendanceMin', 'Confirm when attendance ≥ %', 'Policy.', { min: 0, max: 100 })}
                  {numF('probation', 'extendAttendanceMin', 'Extend when attendance ≥ %', 'Policy.', { min: 0, max: 100 })}
                  {numF('probation', 'maxUnapproved', 'Maximum unapproved absence (days)', 'Policy.', { min: 0 })}
                  {numF('probation', 'maxAvgLates', 'Maximum average lates per month', 'Policy.', { min: 0 })}
                </div>
              </Card>

              <Card title="Attendance KPI">
                <div className="form-grid cols-3">
                  {numN('appraisal', 'attendance', 'gracePeriodMin', 'Grace period (minutes)', 'Arrivals within the grace period are not late.', { min: 0 })}
                  {numN('appraisal', 'attendance', 'attendanceWeight', 'Attendance weight (0–1)', 'Score = weight × attendance step + (1 − weight) × punctuality step − penalty × unapproved days.', { min: 0, max: 1, step: 0.1 })}
                  {numN('appraisal', 'attendance', 'unapprovedPenalty', 'Penalty per unapproved day', 'Deducted from the attendance KPI score.', { min: 0 })}
                </div>
                <div className="grid grid-2 mt-8">
                  <Card title="Attendance steps" actions={<button className="btn btn-sm" onClick={() => addRowN('appraisal', 'attendance', 'attendanceSteps', { min: 0, score: 0 })}>+ Step</button>}>
                    <div className="table-wrap"><table>
                      <thead><tr><th>Attendance ≥ %</th><th>Score</th><th></th></tr></thead>
                      <tbody>{(s.appraisal.attendance.attendanceSteps || []).map((st, i) => (
                        <tr key={i}>
                          <td><input type="number" min="0" max="100" value={st.min ?? ''} style={{ width: 80 }} onChange={(e) => setRowN('appraisal', 'attendance', 'attendanceSteps', i, { min: N(e.target.value) })} /></td>
                          <td><input type="number" min="0" max="100" value={st.score ?? ''} style={{ width: 80 }} onChange={(e) => setRowN('appraisal', 'attendance', 'attendanceSteps', i, { score: N(e.target.value) })} /></td>
                          <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRowN('appraisal', 'attendance', 'attendanceSteps', i)}>Remove</button></td>
                        </tr>))}
                      </tbody>
                    </table></div>
                  </Card>
                  <Card title="Punctuality steps" actions={<button className="btn btn-sm" onClick={() => addRowN('appraisal', 'attendance', 'punctualitySteps', { maxLates: null, score: 0 })}>+ Step</button>}>
                    <div className="table-wrap"><table>
                      <thead><tr><th>Avg lates ≤ (blank = any)</th><th>Score</th><th></th></tr></thead>
                      <tbody>{(s.appraisal.attendance.punctualitySteps || []).map((st, i) => (
                        <tr key={i}>
                          <td><input type="number" min="0" placeholder="any" value={st.maxLates ?? ''} style={{ width: 80 }} onChange={(e) => setRowN('appraisal', 'attendance', 'punctualitySteps', i, { maxLates: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                          <td><input type="number" min="0" max="100" value={st.score ?? ''} style={{ width: 80 }} onChange={(e) => setRowN('appraisal', 'attendance', 'punctualitySteps', i, { score: N(e.target.value) })} /></td>
                          <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRowN('appraisal', 'attendance', 'punctualitySteps', i)}>Remove</button></td>
                        </tr>))}
                      </tbody>
                    </table></div>
                  </Card>
                </div>
              </Card>

              <Card title="Appraisal limits">
                <div className="form-grid cols-3">
                  {numF('appraisal', 'maxCustomKpis', 'Custom KPIs per appraisal', 'Added by the manager during KPI setting.', { min: 0 })}
                  {numF('appraisal', 'minServiceDays', 'Minimum service before the period end (days)', 'Employees joining later are skipped when a cycle opens.', { min: 0 })}
                  {numF('appraisal', 'proRataMonths', 'Pro-rata months on separation', 'Open appraisals stay open when this much of the period was served at the LWD.', { min: 0 })}
                  {numF('appraisal', 'ratingCommentMinChars', 'Comment length for ratings 1 and 5', 'Characters required to justify an extreme rating.', { min: 0 })}
                  {numF('appraisal', 'hrAdjustMax', 'HR rating adjustment (± points)', 'HR may move a competency rating by at most this much, with a comment.', { min: 0 })}
                  {numF('appraisal', 'pipDays', 'PIP length (days)', 'Default PIP end date from the HR review.', { min: 0 })}
                  {numF('appraisal', 'pipDaysWorker', 'PIP length for workers (days)', '', { min: 0 })}
                  {numF('appraisal', 'ackDays', 'Acknowledgement window (days)', 'Days after publishing to acknowledge or dispute.', { min: 0 })}
                  {chips('appraisal', 'managerialGrades', GRADES, 'Managerial grades (manager competency set)', 'Grades evaluated on leadership and planning competencies.')}
                </div>
              </Card>
            </>
          )}

          {tab === 3 && (
            <>
              <Alert kind="info">The settlement statement shows an <b>estimate</b> of tax deductible at source under the Income Tax Act 2023 (s.86); the final liability is assessed on the employee's return.</Alert>
              <Card title="Tax-free thresholds by category">
                <div className="form-grid cols-3">
                  {TAX_CATEGORIES.map((c) => (
                    <Field key={c.code} label={c.name} hint="ITA 2023 s.33 / Finance Act thresholds (BDT per year).">
                      <input type="number" min="0" value={s.tax.thresholds[c.code] ?? ''} onChange={(e) => updN('tax', 'thresholds', { [c.code]: N(e.target.value) })} />
                    </Field>
                  ))}
                </div>
              </Card>
              <Card title="Exemptions and minimum tax">
                <div className="form-grid cols-3">
                  {numF('tax', 'exemptionDivisor', 'Income exempt: 1 ÷ N of total', 'ITA 2023 Sixth Schedule Part 1: one-third of salary income exempt.', { min: 1 })}
                  {numF('tax', 'exemptionCap', 'Exemption cap (BDT)', 'Sixth Schedule: exemption limited to BDT 4.5–5 lakh.', { min: 0 })}
                  {numF('tax', 'gratuityExemptCap', 'Gratuity exempt up to (BDT)', 'Sixth Schedule: gratuity from an approved fund exempt up to BDT 2.5 crore.', { min: 0 })}
                  {numF('tax', 'minimumTax', 'Minimum tax (BDT)', 'ITA 2023 s.163: minimum tax where taxable income exceeds the threshold.', { min: 0 })}
                  <Field label="Fiscal year starts in" hint="Bangladesh income year runs July to June.">
                    <select value={s.tax.fiscalYearStartMonth} onChange={(e) => upd('tax', { fiscalYearStartMonth: Number(e.target.value) })}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                  </Field>
                </div>
              </Card>
              <Card title="Tax slabs (above the threshold)" actions={<button className="btn btn-sm" onClick={() => addRow('tax', 'slabs', { width: null, rate: 0 })}>+ Slab</button>}>
                <div className="small muted" style={{ marginBottom: 8 }}>Each slab's width is the band of taxable income it covers; the last slab is open-ended (leave its width blank).</div>
                <div className="table-wrap"><table>
                  <thead><tr><th>#</th><th>Width (BDT)</th><th>Rate %</th><th></th></tr></thead>
                  <tbody>{(s.tax.slabs || []).map((sl, i) => (
                    <tr key={i}>
                      <td className="muted">{i + 1}</td>
                      <td><input type="number" min="0" placeholder="remainder" value={sl.width ?? ''} style={{ width: 140 }} onChange={(e) => setRow('tax', 'slabs', i, { width: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                      <td><input type="number" min="0" max="100" value={sl.rate ?? ''} style={{ width: 80 }} onChange={(e) => setRow('tax', 'slabs', i, { rate: N(e.target.value) })} /></td>
                      <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRow('tax', 'slabs', i)}>Remove</button></td>
                    </tr>))}
                  </tbody>
                </table></div>
              </Card>
            </>
          )}

          {tab === 4 && (
            <>
              <Card title="Company">
                <div className="form-grid cols-3">
                  <Field label="Company name" required><input value={s.company.name} onChange={(e) => upd('company', { name: e.target.value })} /></Field>
                  <Field label="Address" className="span-2"><input value={s.company.address} onChange={(e) => upd('company', { address: e.target.value })} /></Field>
                  <Field label="Establishment type" hint="Default for new employees; drives the EL divisor and cap (s.117).">
                    <select value={s.company.establishmentType} onChange={(e) => upd('company', { establishmentType: e.target.value })}>{ESTABLISHMENT_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name} (1 EL per {t.elDivisor} days, cap {t.elCap})</option>)}</select>
                  </Field>
                </div>
              </Card>

              <Card title="Demo clock">
                <div className="form-grid cols-3">
                  <Field label="As-of date" hint="Blank = real clock. Set 2026-10-06 to replay the seeded sample exactly as designed; every HR page, reminder and statement uses this date.">
                    <div className="input-group">
                      <input type="date" value={s.calendar.asOfDate} onChange={(e) => upd('calendar', { asOfDate: e.target.value })} />
                      <button className="btn btn-sm" onClick={() => upd('calendar', { asOfDate: '' })} disabled={!s.calendar.asOfDate}>Use real date</button>
                    </div>
                  </Field>
                  <Field label="Effective HR date">
                    <div className="row" style={{ gap: 8, alignItems: 'center', minHeight: 36 }}>
                      <span className="strong">{fmtDate(hrToday(s))}</span>
                      <span className={`badge ${s.calendar.asOfDate ? 'badge-amber' : 'badge-green'}`}>{s.calendar.asOfDate ? 'demo clock' : 'real clock'}</span>
                      {s.calendar.asOfDate && <span className="small muted">real date {fmtDate(localToday())}</span>}
                    </div>
                  </Field>
                </div>
                {JSON.stringify(s.calendar.asOfDate) !== JSON.stringify(state.hrSettings.calendar.asOfDate) && <Alert kind="warn">The clock change applies after Save changes.</Alert>}
              </Card>

              <Card title="Weekly offs">
                <Field hint="Non-working weekdays skipped by the settlement deadline, leave day counts and working days per month (s.103).">
                  <div className="chip-list">
                    {WEEKDAYS.map((d) => {
                      const on = (s.calendar.weeklyOffs || []).includes(d);
                      return <label key={d} className={`chip ${on ? 'on' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" style={{ display: 'none' }} checked={on} onChange={() => toggleIn('calendar', 'weeklyOffs', d)} />{on ? '✓ ' : ''}{d}</label>;
                    })}
                  </div>
                </Field>
              </Card>

              <Card title={`Holidays (${(s.calendar.holidays || []).length})`} actions={<button className="btn btn-sm" onClick={() => addRow('calendar', 'holidays', { date: '', name: '' })}>+ Holiday</button>}>
                <div className="small muted" style={{ marginBottom: 8 }}>s.118: at least 11 festival holidays a year. Holidays are skipped when counting working days; the list is sorted on save.</div>
                {(s.calendar.holidays || []).length === 0 ? <EmptyState>No holidays configured.</EmptyState> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Date</th><th>Name</th><th></th></tr></thead>
                    <tbody>{s.calendar.holidays.map((h, i) => (
                      <tr key={i}>
                        <td><input type="date" value={h.date} onChange={(e) => setRow('calendar', 'holidays', i, { date: e.target.value })} /></td>
                        <td><input value={h.name} onChange={(e) => setRow('calendar', 'holidays', i, { name: e.target.value })} /></td>
                        <td className="right"><button className="btn btn-sm btn-ghost" onClick={() => removeRow('calendar', 'holidays', i)}>Remove</button></td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
              </Card>
            </>
          )}

          {tab === 5 && (
            <>
              <Alert kind="info">Permissions are defined in code for this demo. The Administrator role is shared with the KYC and KYS portals; Line Manager rights apply to direct reports only and Employee rights to the own file.</Alert>
              <div className="table-wrap"><table>
                <thead><tr><th>Action</th>{Object.values(HR_ROLES).map((r) => <th key={r}>{r}</th>)}</tr></thead>
                <tbody>{Object.entries(HR_PERMISSIONS).map(([action, roles]) => (
                  <tr key={action}>
                    <td className="strong">{HR_ACTION_LABELS[action] || action}</td>
                    {Object.values(HR_ROLES).map((r) => <td key={r} className="center">{roles.includes(r) ? <span className="badge badge-green">✓</span> : <span className="muted">—</span>}</td>)}
                  </tr>))}
                </tbody>
              </table></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

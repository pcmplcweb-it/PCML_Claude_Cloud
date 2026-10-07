import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DocumentManager from '../../components/DocumentManager';
import { ApprovalModal, ClearanceSignOffModal, PaymentModal } from '../../components/hrSettlementModals';
import { exportCsv } from '../../components/reportBits';
import SettlementStatement, { ServiceCertificate } from '../../components/SettlementStatement';
import { Alert, Card, EmptyState, Field, Progress, ReasonModal, StatusBadge, WorkflowSteps } from '../../components/ui';
import { CLEARANCE_DEPARTMENTS, CLEARANCE_STATUS, EMPLOYEE_STATUS, EMPLOYER_INITIATED, MISCONDUCT_CLAUSES, SEPARATION_DOC_TYPES, SEPARATION_SECTIONS, SEPARATION_TYPES, SETTLEMENT_FLOW, SETTLEMENT_OPEN, SETTLEMENT_STATUS, canHr } from '../../hr/config';
import { canApproveStage, canSignClearance, computeSettlement, continuousServiceCheck, daysUntilAsOf, designationName, fmtMoney2, fmtNum2, freezeStatement, hrScope, hrToday, isHrRole, noticeRequiredDays, effectiveNoticeServed, requiresManagementApproval, settlementDeadlineOf, settlementReady, validateSeparation } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';
import { addDays, fmtDate, fmtDateTime, nowIso } from '../../utils/helpers';

const S = SETTLEMENT_STATUS;
const TABS = [
  { key: 'separation', label: 'Separation' },
  { key: 'clearance', label: 'Clearance' },
  { key: 'inputs', label: 'Inputs' },
  { key: 'statement', label: 'Statement' },
  { key: 'approvals', label: 'Approvals & payment' },
  { key: 'history', label: 'History' },
];
const EDITABLE = [S.INITIATED, S.CLEARANCE, S.RETURNED];
const RESIGNATION_TYPES = ['Resignation', 'Deemed Resignation (s.27(3A))'];
const STAGE_OF = { [S.HR_APPROVAL]: { key: 'HR', modal: 'hr', action: 'settlementHrApprove' }, [S.FINANCE_APPROVAL]: { key: 'Finance', modal: 'finance', action: 'settlementFinanceApprove' }, [S.MGMT_APPROVAL]: { key: 'Management', modal: 'management', action: 'settlementManagementApprove' } };
// Fields of the separation the HR officer may still change before approval.
const SEP_FIELDS = ['type', 'reason', 'misconductClause', 'deathAtWork', 'afterLayoff', 'workCompleted', 'probationer', 'noticeDate', 'lastWorkingDay', 'noticeRequiredDays', 'noticeWaivedDays', 'payInLieu', 'payInLieuDays', 'nominee'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const n = (v) => (v === '' || v == null ? 0 : Number(v));
const FLAG_KIND = { info: 'info', warn: 'warn', danger: 'danger' };
// Status a held settlement returns to: the last on-track status in its history.
const releaseStatus = (sep) => [...(sep.history || [])].reverse().find((h) => EDITABLE.includes(h.status))?.status || S.INITIATED;
const DEEMED = 'Deemed Resignation (s.27(3A))';
const ACTIVE = [EMPLOYEE_STATUS.PROBATION, EMPLOYEE_STATUS.CONFIRMED, EMPLOYEE_STATUS.SUSPENDED];
const STALE_REASON = 'Inputs changed after the dues were finalised; finalise again.';
// Stale only when a real input (separation details, dues inputs, clearance) changed after the freeze; workflow
// transitions, documents and toggles also bump updatedAt, so they must not count. No stamp = not stale.
const statementStale = (sep) => !!(sep.statement && sep.inputsChangedAt && sep.statement.computedAt < sep.inputsChangedAt);
// validateSeparation (A.2 #9) against the employee as they were before the separation (now On Notice / Separated),
// plus the s.27(3A) wait of 7 days after the second notice (A.2 #22).
const separationErrors = (s, emp, settings, asOf, settlements) => {
  const errs = validateSeparation(s, { ...emp, status: ACTIVE.includes(s.previousStatus) ? s.previousStatus : EMPLOYEE_STATUS.CONFIRMED }, settings, asOf, settlements);
  const second = emp.absenceNotice?.secondNoticeOn;
  if (s.type === DEEMED && second && asOf < addDays(second, 7)) errs.push(`Deemed resignation is available from ${fmtDate(addDays(second, 7))}, 7 days after the second s.27(3A) notice.`);
  return errs;
};

export default function SettlementDetail() {
  const { id } = useParams();
  const { state, dispatch, currentUser, notify } = useStore();
  const sep = state.settlements.find((x) => x.id === id);
  const emp = state.employees.find((e) => e.id === sep?.employeeId);
  const [tab, setTab] = useState('separation');
  const [modal, setModal] = useState(null); // { kind: 'sign' | 'approve' | 'pay' | 'hold' | 'release' | 'withdraw', row?, stage? }
  const [sepForm, setSepForm] = useState(() => (sep ? pick(sep, SEP_FIELDS) : {}));
  const [inputsForm, setInputsForm] = useState(() => ({ ...(sep?.inputs || {}) }));
  const [showPreview, setShowPreview] = useState(false);
  const [printMode, setPrintMode] = useState(null); // 'certificate' while the service certificate prints
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);

  useEffect(() => { setTab('separation'); setModal(null); }, [id]);
  useEffect(() => {
    if (!sep) return;
    setSepForm(pick(sep, SEP_FIELDS)); setInputsForm({ ...sep.inputs }); setShowPreview(false);
  }, [id, sep?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);
  const bands = settings.appraisal?.bands;
  // Grade at or above B on a closed appraisal enables the performance-bonus line (A.2 #25).
  const gradeAtLeastB = (grade) => { const list = bands || []; const i = list.findIndex((b) => b.code === grade); return i >= 0 && i <= list.findIndex((b) => b.code === 'B'); };
  const ctx = useMemo(() => {
    if (!emp) return { asOf };
    const list = bands || [];
    const floor = list.findIndex((b) => b.code === 'B');
    const proRata = state.appraisals.some((a) => a.employeeId === emp.id && a.proRata && a.status === 'Closed' && list.findIndex((b) => b.code === a.scores?.gradeFinal) >= 0 && list.findIndex((b) => b.code === a.scores?.gradeFinal) <= floor);
    return { asOf, continuousService: continuousServiceCheck(emp, state.attendance, asOf, settings), proRataAppraisal: proRata };
  }, [emp, asOf, state.attendance, state.appraisals, bands, settings]);
  const live = useMemo(() => (sep && emp ? computeSettlement(emp, sep, settings, ctx) : null), [sep, emp, settings, ctx]);
  const preview = useMemo(() => (sep && emp ? computeSettlement(emp, { ...sep, inputs: inputsForm }, settings, ctx) : null), [sep, emp, inputsForm, settings, ctx]);
  // settlementReady plus the type rules that can change after the wizard (statementStale mirrors its inputsChangedAt test).
  const ready = useMemo(() => {
    if (!sep || !emp) return { ok: false, reasons: [], warnings: [] };
    const base = settlementReady(sep, emp, settings);
    const reasons = base.reasons.filter((r) => r !== STALE_REASON);
    if (statementStale(sep)) reasons.push(STALE_REASON);
    separationErrors(sep, emp, settings, asOf, state.settlements).forEach((r) => { if (!reasons.includes(r)) reasons.push(r); });
    return { ...base, ok: reasons.length === 0, reasons };
  }, [sep, emp, settings, asOf, state.settlements]);
  const history = useMemo(() => state.audit.filter((a) => a.portal === 'hr' && a.refId === id), [state.audit, id]);
  const bonusEligible = state.appraisals.some((a) => a.employeeId === sep?.employeeId && a.status === 'Closed' && gradeAtLeastB(a.scores?.gradeFinal));

  if (!sep) return <Alert kind="warn">Settlement not found. <Link to="/hr/settlements">Back to settlements</Link></Alert>;
  if (!emp) return <Alert kind="danger">The employee record for {sep.code} no longer exists. <Link to="/hr/settlements">Back to settlements</Link></Alert>;
  if (!(scope.kind === 'all' || scope.ids.has(emp.id))) return <Alert kind="warn">You do not have access to this employee's file. <Link to="/hr/settlements">Back to settlements</Link></Alert>;

  const section = SEPARATION_SECTIONS[sep.type] || '';
  const deadline = settlementDeadlineOf(sep, settings);
  const deadlineDays = daysUntilAsOf(deadline, asOf);
  const open = SETTLEMENT_OPEN.includes(sep.status);
  const editable = canHr(role, 'settlementEdit') && EDITABLE.includes(sep.status);
  const stage = STAGE_OF[sep.status];
  const gate = stage ? canApproveStage(sep, stage.key, currentUser) : null;
  // The HR staff member who prepared the statement sees Approve (HR) disabled with the separation-of-duties hint (L.29).
  const preparedByMe = sep.statement?.computedBy === by;
  const showStage = !!stage && (canHr(role, stage.action) || (stage.key === 'HR' && isHrRole(role) && preparedByMe));
  const gateHint = gate && !gate.ok && preparedByMe ? 'Separation of duties: the statement was prepared by you.' : gate?.reason;
  const payGate = sep.status === S.APPROVED ? canApproveStage(sep, 'Pay', currentUser) : null;
  const signed = sep.clearance.filter((r) => r.status !== CLEARANCE_STATUS.PENDING).length;
  const stale = EDITABLE.includes(sep.status) && statementStale(sep);
  const inputsDirty = editable && JSON.stringify(inputsForm) !== JSON.stringify({ ...(sep.inputs || {}) });
  const sepDirty = editable && JSON.stringify(sepForm) !== JSON.stringify(pick(sep, SEP_FIELDS));
  const lastReturn = [...sep.approvals].reverse().find((a) => a.decision === 'Returned');
  const statement = sep.statement || live;

  const transition = (status, label, extra = {}) => {
    dispatch({ type: 'SETTLEMENT_TRANSITION', id: sep.id, status, by, label, reason: extra.reason, detail: extra.detail, patch: extra.patch, asOf });
    setModal(null);
    notify(extra.toast || `${label} recorded.`);
  };
  const patchSettlement = (patch, detail, action = 'Settlement Updated') => dispatch({ type: 'UPSERT_SETTLEMENT', settlement: { ...sep, ...patch }, by, detail, action });

  const startClearance = () => transition(S.CLEARANCE, 'Clearance Started', { detail: 'Clearance started', toast: 'Clearance started; departments can now sign off.' });
  const finalise = () => {
    if (inputsDirty || sepDirty) { notify(`Save the ${sepDirty ? 'separation details' : 'dues inputs'} before finalising; unsaved changes are not included.`, 'error'); setTab(sepDirty ? 'separation' : 'inputs'); return; }
    const frozen = freezeStatement(sep, emp, settings, ctx, by);
    const net = frozen.statement.totals.netPayable;
    dispatch({ type: 'UPSERT_SETTLEMENT', settlement: frozen, by, action: 'Dues Computed', detail: `${sep.code}: net ${fmtMoney2(net)}` });
    notify(`Dues finalised: net payable ${fmtMoney2(net)}.`);
    setTab('statement');
  };
  const submit = () => {
    if (!ready.ok) { notify(ready.reasons[0], 'error'); return; }
    if (ready.warnings.length && !window.confirm(`${ready.warnings.join(' ')} Submit anyway?`)) return;
    transition(S.HR_APPROVAL, sep.status === S.RETURNED ? 'Resubmitted' : 'Submitted for HR Approval', { detail: `net ${fmtMoney2(sep.statement.totals.netPayable)}`, toast: 'Submitted for HR approval.' });
  };
  const confirmExit = () => {
    if (!window.confirm(`Confirm that ${emp.name} left on ${fmtDate(sep.lastWorkingDay)}? The employee record becomes Separated.`)) return;
    dispatch({ type: 'EMPLOYEE_TRANSITION', id: emp.id, status: EMPLOYEE_STATUS.SEPARATED, by, label: 'Exit Completed', detail: `${sep.code}: last working day ${sep.lastWorkingDay}`, patch: { separatedAt: sep.lastWorkingDay }, asOf });
    notify(`${emp.name} marked Separated.`);
  };
  const setRehire = (checked) => {
    patchSettlement({ rehireEligible: checked }, `Rehire eligible: ${checked ? 'yes' : 'no'}`);
    dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...emp, rehireEligible: checked }, by, action: 'Rehire Eligibility Changed', detail: `${sep.code}: rehire eligible ${checked ? 'yes' : 'no'}` });
  };
  const issueCertificate = () => {
    if (!window.confirm(`Issue the service certificate for ${emp.name} (s.31)?`)) return;
    patchSettlement({ serviceCertificate: { issued: true, issuedAt: nowIso(), by } }, `${sep.code}: service certificate issued`, 'Service Certificate Issued');
    notify('Service certificate issued.');
  };
  const withReason = (reason) => {
    if (modal.kind === 'hold') transition(S.ON_HOLD, 'Placed on Hold', { reason });
    else if (modal.kind === 'release') transition(releaseStatus(sep), 'Released from Hold', { reason });
    else transition(S.WITHDRAWN, 'Withdrawn', { reason, toast: `Separation withdrawn; ${emp.name} returns to ${sep.previousStatus}.` });
  };
  const printStatement = () => { setTab('statement'); window.setTimeout(() => window.print(), 150); };
  const printCertificate = () => { setTab('approvals'); setPrintMode('certificate'); window.setTimeout(() => { window.print(); setPrintMode(null); }, 150); };

  const saveSeparation = () => {
    const errs = separationErrors({ ...sep, ...sepForm }, emp, settings, asOf, state.settlements);
    if (errs.length) { notify(errs[0], 'error'); return; }
    // A change to Dismissal turns rehire eligibility off (A.2 #25); HR can still tick it back on the Approvals tab.
    const toDismissal = sepForm.type === 'Dismissal' && sep.type !== 'Dismissal';
    patchSettlement({ ...sepForm, ...(toDismissal ? { rehireEligible: false } : {}), inputsChangedAt: nowIso() }, 'Separation details updated');
    if (toDismissal && emp.rehireEligible !== false) dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...emp, rehireEligible: false }, by, action: 'Rehire Eligibility Changed', detail: `${sep.code}: dismissal; rehire eligible no` });
    notify('Separation details saved.');
  };
  const setSepField = (patch) => setSepForm((prev) => {
    const next = { ...prev, ...patch };
    if ('type' in patch || 'probationer' in patch || 'workCompleted' in patch || 'afterLayoff' in patch) next.noticeRequiredDays = noticeRequiredDays(emp, next.type, settings, next);
    return next;
  });
  const saveInputs = () => {
    if (n(inputsForm.assetRecovery) > 0 && !inputsForm.assetShowCauseIssued) notify('Asset recovery will be withheld until a show-cause notice is issued.', 'info');
    patchSettlement({ inputs: inputsForm, inputsChangedAt: nowIso() }, 'Dues inputs updated');
    notify('Inputs saved; finalise the dues again before submitting.');
  };
  const setIn = (patch) => setInputsForm((prev) => ({ ...prev, ...patch }));
  const exportStatement = () => {
    const rows = [['Section', 'Key', 'Label', 'Formula', 'Citation', 'Amount']];
    ['earnings', 'deductions', 'pf'].forEach((sec) => (statement.lines[sec] || []).forEach((l) => rows.push([sec, l.key, l.label, l.formula, l.cite, l.amount])));
    Object.entries(statement.totals).forEach(([k, v]) => rows.push(['totals', k, k, '', '', v]));
    exportCsv(rows, `${sep.code}_statement.csv`);
  };

  // Action bar — one array, gated by permission, status and separation of duties (disabled + hint where the spec says).
  const actions = [];
  if (sep.status === S.INITIATED && canHr(role, 'settlementEdit')) actions.push(<button key="sc" className="btn btn-primary" onClick={startClearance}>Start clearance</button>);
  if (editable) actions.push(<button key="fd" className="btn" onClick={finalise} title={stale ? 'Inputs changed since the last computation' : 'Freeze the statement at today\'s inputs'}>{sep.statement ? 'Re-finalise dues' : 'Finalise dues'}</button>);
  if (editable && sep.status !== S.INITIATED) actions.push(<button key="sb" className="btn btn-primary" disabled={!ready.ok} title={ready.ok ? '' : ready.reasons.join(' ')} onClick={submit}>{sep.status === S.RETURNED ? 'Resubmit for HR approval' : 'Submit for HR approval'}</button>);
  if (showStage) {
    actions.push(<button key="ap" className="btn btn-success" disabled={!gate.ok} title={gateHint} onClick={() => setModal({ kind: 'approve', stage: stage.modal })}>✓ Approve ({stage.key})</button>);
    actions.push(<button key="rt" className="btn btn-warn" disabled={!gate.ok} title={gateHint} onClick={() => setModal({ kind: 'approve', stage: stage.modal })}>Return to HR</button>);
  }
  if (sep.status === S.APPROVED && canHr(role, 'settlementPay')) actions.push(<button key="py" className="btn btn-success" disabled={!payGate.ok} title={payGate.reason} onClick={() => setModal({ kind: 'pay' })}>Record payment</button>);
  if (sep.serviceCertificate.issued) actions.push(<button key="pc" className="btn btn-ghost" onClick={printCertificate}>🖨 Print certificate</button>);
  if (sep.status === S.PAID && canHr(role, 'issueCertificate') && !sep.serviceCertificate.issued && settings.settlement?.issueServiceCertificate !== false) actions.push(<button key="ic" className="btn btn-primary" onClick={issueCertificate}>Issue service certificate</button>);
  if (emp.status === EMPLOYEE_STATUS.NOTICE && sep.lastWorkingDay && sep.lastWorkingDay <= asOf && canHr(role, 'markExit') && open) actions.push(<button key="ce" className="btn" onClick={confirmExit}>Confirm exit</button>);
  if (EDITABLE.includes(sep.status) && canHr(role, 'settlementHold')) actions.push(<button key="hd" className="btn btn-warn" onClick={() => setModal({ kind: 'hold' })}>Place on hold</button>);
  if (sep.status === S.ON_HOLD && canHr(role, 'settlementHold')) actions.push(<button key="rl" className="btn btn-success" onClick={() => setModal({ kind: 'release' })}>Release</button>);
  if ([...EDITABLE, S.ON_HOLD].includes(sep.status) && canHr(role, 'separationInitiate')) actions.push(<button key="wd" className="btn btn-danger" onClick={() => setModal({ kind: 'withdraw' })}>Withdraw</button>);
  actions.push(<button key="pr" className="btn btn-ghost" onClick={printStatement}>🖨 Print statement</button>);

  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const numField = (label, key, hint, extra = {}) => <Field label={label} hint={hint}><input type="number" min="0" disabled={!editable} value={inputsForm[key]} onChange={(e) => setIn({ [key]: e.target.value })} {...extra} /></Field>;
  const employer = EMPLOYER_INITIATED.includes(sepForm.type);
  const servedForm = effectiveNoticeServed(sepForm);
  const lieuMaxForm = Math.max(0, n(sepForm.noticeRequiredDays) - servedForm);
  const signHint = (row) => {
    if (!EDITABLE.includes(sep.status)) return 'Clearance is closed at this stage';
    if (canSignClearance(row, sep, emp, currentUser)) return '';
    if (row.dept === 'LINE') return 'Only the reporting manager (or HR Head / Admin) can sign';
    return `Signed by ${(CLEARANCE_DEPARTMENTS.find((d) => d.dept === row.dept)?.signOffRoles || []).join(' / ')}`;
  };

  return (
    <div className={`stack ${tab === 'statement' || printMode ? 'statement-print' : ''}`}>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{sep.code} · <Link to={`/hr/employees/${emp.id}`}>{emp.name}</Link></h1>
            <StatusBadge status={sep.status} />
          </div>
          <p className="sub">
            {sep.type}{section ? ` (${section})` : ''} · {emp.code} · {designationName(emp.employment?.designation)} · LWD {fmtDate(sep.lastWorkingDay)} · deadline {fmtDate(deadline)}{' '}
            {open && deadlineDays < 0 && <span className="badge badge-red">{-deadlineDays} d overdue</span>}
            {open && deadlineDays >= 0 && deadlineDays <= 7 && <span className="badge badge-amber">{deadlineDays} d left</span>}
            {sep.status === S.PAID && <span className="badge badge-green">paid {fmtDate(sep.payment.paidAt)}</span>}
          </p>
        </div>
        <div className="page-actions">{actions}</div>
      </div>

      <div className="no-print"><WorkflowSteps status={sep.status} steps={SETTLEMENT_FLOW} /></div>

      {sep.status === S.ON_HOLD && <Alert kind="warn" title={`On hold since ${fmtDate(sep.hold.at)} by ${sep.hold.by}`}>{sep.hold.reason}</Alert>}
      {sep.status === S.RETURNED && lastReturn && <Alert kind="warn" title={`Returned to HR by ${lastReturn.by} (${lastReturn.stage} stage, ${fmtDate(lastReturn.at)})`}>{lastReturn.comment || sep.statusReason}</Alert>}
      {sep.status === S.WITHDRAWN && <Alert kind="danger" title="Separation withdrawn">{sep.statusReason}</Alert>}
      {editable && sep.status !== S.INITIATED && !ready.ok && <Alert kind="info" title="Before submitting for HR approval"><ul>{ready.reasons.map((r) => <li key={r}>{r}</li>)}</ul></Alert>}
      {showStage && !gate.ok && <Alert kind="warn" title={`${stage.key} approval not available to you`}>{gateHint}</Alert>}
      {payGate && canHr(role, 'settlementPay') && !payGate.ok && <Alert kind="warn" title="Payment not available to you">{payGate.reason}</Alert>}
      {emp.status === EMPLOYEE_STATUS.NOTICE && sep.lastWorkingDay <= asOf && open && <Alert kind="info">Last working day {fmtDate(sep.lastWorkingDay)} has passed; the employee is still On Notice until the exit is confirmed or the dues are submitted for approval.</Alert>}

      <div className="card no-print">
        <div className="tabs" style={{ padding: '0 12px' }}>{TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}{t.key === 'clearance' ? ` ${signed}/5` : ''}</button>)}</div>
      </div>

      {tab === 'separation' && (
        <div className="grid grid-2">
          <Card title="Separation">
            {kv([
              ['Type', `${sep.type}${section ? ` (${section})` : ''}${sep.misconductClause ? ` · misconduct s.${sep.misconductClause}` : ''}`],
              ['Reason', sep.reason],
              ['Notice date', fmtDate(sep.noticeDate)], ['Last working day', fmtDate(sep.lastWorkingDay)],
              ['Notice', `required ${sep.noticeRequiredDays} · served ${effectiveNoticeServed(sep)} · waived ${n(sep.noticeWaivedDays)} days${live?.meta.shortfallDays ? ` · shortfall ${live.meta.shortfallDays}` : ''}`],
              ['Pay in lieu', sep.payInLieu ? `${live ? live.meta.payInLieuDays : sep.payInLieuDays} days` : 'No'],
              ['Flags', [sep.probationer && 'probationer', sep.workCompleted && 'work completed', sep.afterLayoff && 'after lay-off', sep.deathAtWork && 'death in the course of employment'].filter(Boolean).join(', ') || 'None'],
              ['Service at LWD', live ? `${live.meta.serviceText} · ${live.meta.completedYears} completed year(s) · ${live.lawVersion}` : ''],
              ['Deadline (s.123)', `${fmtDate(deadline)} · ${settings.settlement.deadlineWorkingDays} working days, ${live?.skippedDays ?? 0} non-working days skipped`],
              ['Previous status', sep.previousStatus],
              ['Nominee', sep.nominee?.name ? `${sep.nominee.name} (${sep.nominee.relation || '—'})${sep.nominee.nid ? ` · NID ${sep.nominee.nid}` : ''}` : ''],
              ['Initiated', `${fmtDateTime(sep.createdAt)} by ${sep.createdBy}`],
            ])}
            {live?.flags.length > 0 && <div className="stack mt-16" style={{ gap: 8 }}>{live.flags.map((f) => <div key={f.text} className={`alert alert-${FLAG_KIND[f.tone] || 'info'}`}>{f.text}</div>)}</div>}
          </Card>
          <div className="stack">
            <Card title="Employee">
              {kv([
                ['Employee', <Link to={`/hr/employees/${emp.id}`}>{emp.name} · {emp.code}</Link>],
                ['Status', <StatusBadge status={emp.status} />],
                ['Designation', `${designationName(emp.employment?.designation)} · ${emp.employment?.department || '—'} · ${emp.employment?.grade || '—'}`],
                ['Employment', `${emp.employment?.employmentType} · ${emp.employment?.workerCategory} · joined ${fmtDate(emp.employment?.joinDate)}`],
                ['Reporting manager', emp.employment?.reportingManagerId ? <Link to={`/hr/employees/${emp.employment.reportingManagerId}`}>{state.employees.find((e) => e.id === emp.employment.reportingManagerId)?.name || '—'}</Link> : 'None'],
                ['Bank', <>{emp.bank?.bankName || '—'} {emp.bank?.verified ? <span className="badge badge-green">verified</span> : <span className="badge badge-amber">unverified</span>}</>],
                ['PF', emp.pf?.member ? `Member since ${fmtDate(emp.pf.joinDate)}` : 'Not a member'],
              ])}
            </Card>
            {editable && (
              <Card title="Edit separation details" actions={<button className="btn btn-sm btn-primary" onClick={saveSeparation}>Save</button>}>
                <div className="form-grid">
                  <Field label="Type"><select value={sepForm.type} onChange={(e) => setSepField({ type: e.target.value, misconductClause: '' })}>{SEPARATION_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                  <Field label="Notice required (days)" hint="Recomputed from the Act when the type or flags change"><input type="number" min="0" value={sepForm.noticeRequiredDays} onChange={(e) => setSepField({ noticeRequiredDays: e.target.value })} /></Field>
                  <Field label="Notice date"><input type="date" value={sepForm.noticeDate} onChange={(e) => setSepField({ noticeDate: e.target.value })} /></Field>
                  <Field label="Last working day" required hint={`Served ${servedForm} days`}><input type="date" value={sepForm.lastWorkingDay} onChange={(e) => setSepField({ lastWorkingDay: e.target.value })} /></Field>
                  <Field label="Notice waived (days)"><input type="number" min="0" value={sepForm.noticeWaivedDays} onChange={(e) => setSepField({ noticeWaivedDays: e.target.value })} /></Field>
                  {sepForm.type === 'Dismissal' && <Field label="Misconduct clause"><select value={sepForm.misconductClause} onChange={(e) => setSepField({ misconductClause: e.target.value })}>{MISCONDUCT_CLAUSES.map((c) => <option key={c} value={c}>{c || '—'}</option>)}</select></Field>}
                  <Field label="Reason" className="span-2"><textarea value={sepForm.reason} onChange={(e) => setSepField({ reason: e.target.value })} /></Field>
                  {RESIGNATION_TYPES.includes(sepForm.type) || sepForm.type === 'Termination' ? <label className="check"><input type="checkbox" checked={!!sepForm.probationer} onChange={(e) => setSepField({ probationer: e.target.checked })} /> Probationer</label> : null}
                  {sepForm.type === 'Termination' && <label className="check"><input type="checkbox" checked={!!sepForm.workCompleted} onChange={(e) => setSepField({ workCompleted: e.target.checked })} /> Work completed</label>}
                  {sepForm.type === 'Retrenchment' && <label className="check"><input type="checkbox" checked={!!sepForm.afterLayoff} onChange={(e) => setSepField({ afterLayoff: e.target.checked })} /> After lay-off</label>}
                  {sepForm.type === 'Death' && <label className="check"><input type="checkbox" checked={!!sepForm.deathAtWork} onChange={(e) => setSepField({ deathAtWork: e.target.checked })} /> Death in the course of employment</label>}
                  {employer && <label className="check"><input type="checkbox" checked={!!sepForm.payInLieu} onChange={(e) => setSepField({ payInLieu: e.target.checked, payInLieuDays: '' })} /> Pay in lieu of notice</label>}
                  {employer && sepForm.payInLieu && <Field label="Days paid in lieu" hint={`Notice not served: ${lieuMaxForm} days (blank = all of them)`}><input type="number" min="0" max={lieuMaxForm} placeholder={String(lieuMaxForm)} value={sepForm.payInLieuDays} onChange={(e) => setSepField({ payInLieuDays: e.target.value })} /></Field>}
                  {sepForm.type === 'Death' && <Field label="Nominee name" required><input value={sepForm.nominee?.name || ''} onChange={(e) => setSepField({ nominee: { ...sepForm.nominee, name: e.target.value } })} /></Field>}
                  {sepForm.type === 'Death' && <Field label="Nominee relation"><input value={sepForm.nominee?.relation || ''} onChange={(e) => setSepField({ nominee: { ...sepForm.nominee, relation: e.target.value } })} /></Field>}
                </div>
                <p className="small muted mt-8">Saving changes the inputs timestamp; finalise the dues again before submitting.</p>
              </Card>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <Card title="Separation documents">
              <DocumentManager
                documents={sep.documents}
                docTypes={Object.values(SEPARATION_DOC_TYPES)}
                expiringTypes={[]}
                uploadedBy={by}
                verifiedBy={by}
                canUpload={isHrRole(role) && open}
                canVerify={isHrRole(role)}
                onChange={(docs, detail) => patchSettlement({ documents: docs }, detail, 'Document Changed')}
              />
            </Card>
          </div>
        </div>
      )}

      {tab === 'clearance' && (
        <Card title="Departmental clearance" actions={<div className="row" style={{ gap: 8 }}><div style={{ width: 140 }}><Progress value={(signed / sep.clearance.length) * 100} /></div><span className="small">{signed}/{sep.clearance.length} signed</span></div>}>
          <div className="table-wrap"><table>
            <thead><tr><th>Department</th><th>Items</th><th>Status</th><th>Signed</th><th>Remarks</th><th className="right">Recoverable</th><th></th></tr></thead>
            <tbody>{sep.clearance.map((row) => {
              const hint = signHint(row);
              const can = hint === '';
              return (
                <tr key={row.dept}>
                  <td className="strong">{row.label}</td>
                  <td className="small"><ul style={{ margin: 0, paddingLeft: 16 }}>{row.items.map((it) => <li key={it}>{it}</li>)}</ul></td>
                  <td><StatusBadge status={row.status} /></td>
                  <td className="small">{row.signedBy ? <>{row.signedBy}<div className="muted">{fmtDateTime(row.signedAt)}</div></> : '—'}</td>
                  <td className="small muted">{row.remarks || '—'}</td>
                  <td className="right mono">{row.recoverable ? fmtNum2(row.recoverable) : '—'}</td>
                  <td className="nowrap">
                    {canHr(role, 'clearanceSignOff') && (
                      <button className="btn btn-sm" disabled={!can} title={can ? '' : hint} onClick={() => setModal({ kind: 'sign', row })}>{row.status === CLEARANCE_STATUS.PENDING ? 'Sign off' : 'Amend'}</button>
                    )}
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
          <p className="small muted mt-8">IT and Admin sign through the HR Officer in this demo; Finance signs for advances and ledgers; the line-manager row is signed by the employee's reporting manager (or HR Head / Admin on their behalf). Dues found are flagged on the statement — enter the deduction under Inputs.</p>
        </Card>
      )}

      {tab === 'inputs' && preview && (
        <div className="grid grid-2">
          <Card title="Dues inputs" actions={editable ? <><button className="btn btn-sm" onClick={() => setShowPreview(true)}>Recompute</button><button className="btn btn-sm btn-primary" onClick={saveInputs}>Save inputs</button></> : <button className="btn btn-sm" onClick={() => setShowPreview(true)}>Recompute</button>}>
            {!editable && <p className="small muted mb-8">Inputs are read-only at this stage ({sep.status}).</p>}
            <div className="stack" style={{ gap: 18 }}>
              <div className="form-grid">
                {numField('Earned leave balance (days)', 'elBalanceDays', 'Encashed at the gross daily rate (s.11, s.119)')}
                {numField('Salary arrears (BDT)', 'arrears')}
                {numField('Overtime dues (BDT)', 'overtime', 's.108')}
                {numField('Expense reimbursement (BDT)', 'reimbursement')}
                {numField('Other payable (BDT)', 'otherPayable')}
                {numField('Performance bonus (BDT)', 'performanceBonus', bonusEligible ? 'Closed appraisal with grade ≥ B on record' : 'Requires a closed appraisal with grade ≥ B', { disabled: !editable || !bonusEligible })}
                <label className="check"><input type="checkbox" disabled={!editable} checked={!!inputsForm.finalMonthSalaryPaid} onChange={(e) => setIn({ finalMonthSalaryPaid: e.target.checked })} /> Final month salary already paid</label>
                <label className="check"><input type="checkbox" disabled={!editable} checked={!!inputsForm.bonusPaidThisYear} onChange={(e) => setIn({ bonusPaidThisYear: e.target.checked })} /> Festival bonus already paid this year</label>
                {sep.type === 'Death' && numField('Group insurance (BDT)', 'groupInsurance', 's.99')}
              </div>
              <div className="form-grid">
                {numField('PF own balance (BDT)', 'pfOwn', 'r.263', { disabled: !editable || !emp.pf?.member })}
                {numField('PF employer balance (BDT)', 'pfEmployer', 'r.263(1)', { disabled: !editable || !emp.pf?.member })}
                {numField('PF interest accrued (BDT)', 'pfInterest', 'r.261', { disabled: !editable || !emp.pf?.member })}
                {numField('PF advance outstanding (BDT)', 'pfAdvance', 'r.266', { disabled: !editable || !emp.pf?.member })}
              </div>
              <div className="form-grid">
                {numField('Loan / advance recovery (BDT)', 'loanRecovery', 's.125(2)')}
                {numField('Recovery for company property (BDT)', 'assetRecovery', 's.125(2)(c), s.127')}
                <label className="check span-2"><input type="checkbox" disabled={!editable} checked={!!inputsForm.assetShowCauseIssued} onChange={(e) => setIn({ assetShowCauseIssued: e.target.checked })} /> Show-cause notice issued for the loss / damage</label>
                {numField('Unauthorised absence (days)', 'absenceDays', 'r.115')}
                {numField('Other deduction (BDT)', 'otherDeduction')}
              </div>
              <div className="form-grid">
                {numField('Income this fiscal year to date (BDT)', 'ytdIncome')}
                {numField('Tax already deducted (BDT)', 'ytdTaxPaid')}
                {numField('Tax override (BDT)', 'taxOverride', 'Blank = estimate')}
                <Field label="Law version override"><select disabled={!editable} value={inputsForm.lawVersionOverride} onChange={(e) => setIn({ lawVersionOverride: e.target.value })}><option value="">Auto</option><option value="bla2026">bla2026</option><option value="pre_2025">pre_2025</option></select></Field>
                <Field label="Rounding override"><select disabled={!editable} value={inputsForm.roundingOverride} onChange={(e) => setIn({ roundingOverride: e.target.value })}><option value="">Default ({settings.statutory.partialYearRounding})</option><option value="six_months">six_months</option><option value="strict">strict</option></select></Field>
              </div>
            </div>
          </Card>
          <div className="stack">
            <Card title="Service & notice">
              {kv([
                ['Service', `${preview.meta.serviceText} (${preview.meta.exactYears} yrs) → ${preview.meta.completedYears} completed, ${preview.meta.rounding}`],
                ['Law version', preview.lawVersion],
                ['Notice', `required ${preview.meta.noticeRequired} · served ${preview.meta.noticeServed} · waived ${preview.meta.noticeWaived} · shortfall ${preview.meta.shortfallDays}`],
                ['Daily rates', `comp ${fmtNum2(preview.meta.W)} · gross ${fmtNum2(preview.meta.grossDaily)} · leave ${fmtNum2(preview.meta.leaveDaily)}`],
                ['Final month', `${preview.meta.served}/${preview.meta.dim} days`],
                ['PF vesting', preview.meta.pfMember ? `${preview.meta.vested * 100}%` : 'not a member'],
                ['Continuous service', ctx.continuousService ? `${ctx.continuousService.daysWorked} days in ${ctx.continuousService.months} attendance month(s)` : '—'],
              ])}
            </Card>
            <Card title={showPreview ? 'Preview of the unsaved inputs' : sep.statement ? 'Frozen statement totals' : 'Live totals'}>
              {(() => { const t = (showPreview ? preview : statement).totals; return kv([['Earnings', fmtMoney2(t.earnings)], ['Deductions', fmtMoney2(t.deductions)], ['Net payable', <span className="strong">{fmtMoney2(t.netPayable)}</span>], ['PF net', fmtMoney2(t.pfNet)], ['Total to employee', <span className="strong">{fmtMoney2(t.totalToEmployee)}</span>]]); })()}
              {showPreview && <p className="small muted mt-8">Save inputs and finalise to carry these figures into the statement.</p>}
              {(showPreview ? preview : statement).flags.filter((f) => f.tone !== 'info').map((f) => <div key={f.text} className={`alert alert-${FLAG_KIND[f.tone] || 'info'} mt-8`}>{f.text}</div>)}
            </Card>
          </div>
        </div>
      )}

      {tab === 'statement' && (
        <div className="card statement-wrap">
          <div className="card-head no-print">
            <h3>{sep.statement ? `Frozen ${fmtDateTime(sep.statement.computedAt)} by ${sep.statement.computedBy}` : 'Live preview — not yet finalised'}{stale ? <span className="badge badge-amber" style={{ marginLeft: 8 }}>inputs changed since</span> : null}</h3>
            <div className="row">
              <button className="btn btn-sm" onClick={exportStatement}>Export CSV</button>
              <button className="btn btn-sm" onClick={printStatement}>Print</button>
            </div>
          </div>
          <div className="card-body">
            {stale && <Alert kind="warn">Inputs or clearance changed after the dues were finalised. Finalise again to refresh the frozen statement.</Alert>}
            <SettlementStatement statement={statement} employee={emp} settlement={sep} settings={settings} />
          </div>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="grid grid-2">
          <Card title="Approvals">
            {sep.approvals.length === 0 ? <EmptyState>No approvals recorded yet.</EmptyState> : (
              <ul className="timeline">
                {sep.approvals.map((a, i) => {
                  const round = sep.approvals.slice(0, i).filter((x) => x.decision === 'Returned').length + 1;
                  return <li key={`${a.stage}-${a.at}`}><span className="when">{fmtDateTime(a.at)}</span><span><b>{a.stage} · {a.decision}</b> by {a.by} <span className="muted small">(round {round})</span>{a.comment && <span className="muted"> — {a.comment}</span>}</span></li>;
                })}
              </ul>
            )}
            {stage && <p className="small muted mt-8">Awaiting {stage.key} approval{sep.status === S.FINANCE_APPROVAL ? requiresManagementApproval(sep, emp, sep.statement?.totals || {}, settings) ? '; management approval follows (type, grade or amount threshold)' : '; approved for payment next' : ''}.</p>}
          </Card>
          <div className="stack">
            <Card title="Payment">
              {kv([
                ['Status', <StatusBadge status={sep.status} />],
                ['Paid on', sep.payment.paidAt ? `${fmtDate(sep.payment.paidAt)} by ${sep.payment.paidBy}` : ''],
                ['Mode / reference', sep.payment.reference ? `${sep.payment.mode} · ${sep.payment.reference}` : ''],
                ['Amount', sep.payment.amount ? fmtMoney2(sep.payment.amount) : ''],
                ['Payee', sep.payment.paidAt ? `${sep.payment.payee}${sep.payment.payeeName ? ` · ${sep.payment.payeeName} (${sep.payment.payeeRelation || '—'})` : ''}` : ''],
                ['Account', sep.payment.bankAccountNo],
                ['PF payment', sep.payment.pfPaidAt ? `${fmtDate(sep.payment.pfPaidAt)} · ${sep.payment.pfReference || ''}` : ''],
              ])}
            </Card>
            <Card title="Certificate & exit">
              {kv([['Service certificate', sep.serviceCertificate.issued ? <span className="badge badge-green">Issued {fmtDate(sep.serviceCertificate.issuedAt)} by {sep.serviceCertificate.by}</span> : <span className="badge badge-gray">Not issued</span>]])}
              <div className="stack mt-8" style={{ gap: 8 }}>
                <label className="check"><input type="checkbox" disabled={!isHrRole(role)} checked={!!sep.exitInterviewDone} onChange={(e) => patchSettlement({ exitInterviewDone: e.target.checked }, `Exit interview ${e.target.checked ? 'done' : 'pending'}`)} /> Exit interview done</label>
                <label className="check"><input type="checkbox" disabled={!isHrRole(role)} checked={!!sep.rehireEligible} onChange={(e) => setRehire(e.target.checked)} /> Eligible for rehire</label>
              </div>
            </Card>
          </div>
          {sep.serviceCertificate.issued && (
            <div className="card statement-wrap" style={{ gridColumn: '1 / -1' }}>
              <div className="card-head no-print">
                <h3>Certificate of service (s.31)</h3>
                <button className="btn btn-sm" onClick={printCertificate}>Print certificate</button>
              </div>
              <div className="card-body"><ServiceCertificate employee={emp} settlement={sep} settings={settings} /></div>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="grid grid-2">
          <Card title="Status history">
            {sep.history.length === 0 ? <EmptyState>No status changes.</EmptyState> : (
              <table><thead><tr><th>Status</th><th>When</th><th>By</th><th>Note</th></tr></thead>
                <tbody>{[...sep.history].reverse().map((h) => <tr key={`${h.status}-${h.at}`}><td><StatusBadge status={h.status} /></td><td className="nowrap small">{fmtDateTime(h.at)}</td><td className="small">{h.by}</td><td className="small muted">{h.note}</td></tr>)}</tbody></table>
            )}
          </Card>
          <Card title="Audit trail">
            {history.length === 0 ? <EmptyState>No history recorded.</EmptyState> : (
              <ul className="timeline">{history.map((h) => <li key={h.id}><span className="when">{fmtDateTime(h.at)}</span><span><b>{h.action}</b> by {h.by}{h.detail && <span className="muted"> — {h.detail}</span>}</span></li>)}</ul>
            )}
          </Card>
        </div>
      )}

      {modal?.kind === 'sign' && <ClearanceSignOffModal settlement={sep} row={modal.row} onClose={() => setModal(null)} />}
      {modal?.kind === 'approve' && <ApprovalModal settlement={sep} stage={modal.stage} onClose={() => setModal(null)} />}
      {modal?.kind === 'pay' && <PaymentModal settlement={sep} employee={emp} onClose={() => setModal(null)} />}
      {modal?.kind === 'hold' && <ReasonModal title={`Place on hold · ${sep.code}`} confirmLabel="Place on hold" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal?.kind === 'release' && <ReasonModal title={`Release from hold · ${sep.code}`} label={`Reason (returns to ${releaseStatus(sep)})`} confirmLabel="Release" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal?.kind === 'withdraw' && <ReasonModal title={`Withdraw separation · ${sep.code}`} label={`Reason (${emp.name} returns to ${sep.previousStatus})`} danger confirmLabel="Withdraw" onConfirm={withReason} onClose={() => setModal(null)} />}
    </div>
  );
}

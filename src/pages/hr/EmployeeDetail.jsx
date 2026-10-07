import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../../components/DocumentManager';
import { Alert, Card, EmptyState, GradeBadge, ReasonModal, StatusBadge, WorkflowSteps } from '../../components/ui';
import { RowMenu } from '../../components/quickActions';
import { pageAppraisalVisibility, redactAppraisalAudit } from '../../components/hrAppraisalModals';
import { DisciplinaryModal, ProbationDecisionModal, SalaryRevisionModal } from '../../components/hrEmployeeModals';
import { AttendanceEntryModal, LeaveRequestModal } from '../../components/hrLeaveModals';
import { ACTIVE_EMPLOYEE_STATUSES, DEPARTMENTS, EMPLOYEE_DOC_TYPES, EMPLOYEE_FLOW, EMPLOYEE_STATUS, ESTABLISHMENT_TYPES, EXPIRING_EMPLOYEE_DOCS, REQUIRED_EMPLOYEE_DOCS, SEPARATION_SECTIONS, TAX_CATEGORIES, canHr } from '../../hr/config';
import { addMonths, ageAt, allLeaveBalances, attendanceKpi, buildAppraisal, canSeeSensitive, daysUntilAsOf, designationName, employeeInsights, findEmployeeDuplicates, fmtDate, fmtDateTime, fmtMoney2, fmtPct, grossSalary, hrReminders, hrScope, hrToday, isHrRole, managerOf, maskValue, monthLabel, nextAppraisalCode, nowIso, num, physicalAttendancePct, probationEndDate, recentAttendance, retirementDate, settlementDeadlineOf, templateFor, validateEmployee } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const S = EMPLOYEE_STATUS;
const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'employment', label: 'Employment & Salary' },
  { key: 'documents', label: 'Documents' },
  { key: 'leave', label: 'Leave & Attendance' },
  { key: 'appraisals', label: 'Appraisals' },
  { key: 'discipline', label: 'Discipline' },
  { key: 'separation', label: 'Separation' },
  { key: 'history', label: 'History' },
];
// Audit details that may carry salary figures (older 'Salary Revised' entries); redacted for viewers without viewSensitive.
const REDACT_AUDIT = new Set(['Salary Revised']);
const FLAG_KIND = { info: 'info', warn: 'warn', danger: 'danger', success: 'success' };
const SALARY_ROWS = [['basic', 'Basic'], ['houseRent', 'House rent'], ['medical', 'Medical'], ['conveyance', 'Conveyance'], ['dearness', 'Dearness allowance'], ['adhoc', 'Ad-hoc allowance'], ['otherAllowances', 'Other allowances']];
const deptName = (code) => DEPARTMENTS.find((d) => d.code === code)?.name || code || '';

export default function EmployeeDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const e = state.employees.find((x) => x.id === id);
  const [tab, setTab] = useState('profile');
  const [modal, setModal] = useState(null); // string kind, or { kind: 'disciplinary', record }
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);

  useEffect(() => { setTab('profile'); setModal(null); }, [id]);

  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);
  const inScope = !!e && (scope.kind === 'all' || scope.ids.has(e.id));
  // 'Appraisal Updated' diffs are redacted to what the viewer may see on that appraisal (ratings / HR calibration).
  const history = useMemo(() => state.audit.filter((a) => a.portal === 'hr' && a.customerId === id).map((h) => {
    if (h.action !== 'Appraisal Updated') return h;
    const apr = state.appraisals.find((x) => x.id === h.refId);
    const hr = isHrRole(currentUser.role) && currentUser.employeeId !== id;
    return redactAppraisalAudit(h, apr ? pageAppraisalVisibility(apr, currentUser) : { managerFields: hr, hrFields: hr });
  }), [state.audit, state.appraisals, id, currentUser]);
  const ins = useMemo(() => (e ? employeeInsights(e, { asOf, settings, employees: state.employees }) : null), [e, asOf, settings, state.employees]);
  const errors = useMemo(() => (e && e.status === S.DRAFT ? validateEmployee(e, settings) : []), [e, settings]);
  // Only the active link: a withdrawn separation clears separationId and must not be shown as the current one.
  const settlement = useMemo(() => (e && e.separationId ? state.settlements.find((s) => s.id === e.separationId) || null : null), [state.settlements, e]);
  const appraisals = useMemo(() => state.appraisals.filter((a) => a.employeeId === id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [state.appraisals, id]);
  const balances = useMemo(() => (e ? allLeaveBalances(e, state.leaveTypes, settings.leave.year, state.leaveRequests, settings, asOf, state.attendance) : []), [e, state.leaveTypes, settings, state.leaveRequests, asOf, state.attendance]);
  const requests = useMemo(() => state.leaveRequests.filter((r) => r.employeeId === id).sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)), [state.leaveRequests, id]);
  const months = useMemo(() => state.attendance.filter((a) => a.employeeId === id).sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 12), [state.attendance, id]);
  const attKpi = useMemo(() => { const sum = recentAttendance(id, state.attendance, asOf, 6); return { sum, ...attendanceKpi(sum, settings) }; }, [id, state.attendance, asOf, settings]);
  const absenceDue = useMemo(() => hrReminders(state, currentUser, asOf).some((r) => r.kind === 'absenceNotice' && r.employeeId === id), [state, currentUser, asOf, id]);

  if (!e) return <Alert kind="warn">Employee not found. <Link to="/hr/employees">Back to list</Link></Alert>;
  if (!inScope) return <Alert kind="warn" title="Access restricted">You do not have access to this employee's file. <Link to="/hr/employees">Back to list</Link></Alert>;

  const isSelf = currentUser.employeeId === e.id;
  const sensitive = canSeeSensitive(currentUser, e);
  const show = (v) => (sensitive ? v || '—' : maskValue(v));
  const active = ACTIVE_EMPLOYEE_STATUSES.includes(e.status);
  const emp = e.employment; const p = emp.probation; const sal = e.salary; const b = e.bank; const pf = e.pf;
  const manager = managerOf(e, state.employees);
  const pEnd = probationEndDate(e);
  const lwd = settlement?.lastWorkingDay || '';
  const exitDue = e.status === S.NOTICE && !!lwd && lwd <= asOf;
  const noticeStep = e.absenceNotice.firstNoticeOn ? (e.absenceNotice.secondNoticeOn ? 0 : 2) : 1;

  const transition = (status, label, extra = {}) => {
    dispatch({ type: 'EMPLOYEE_TRANSITION', id: e.id, status, label, by, asOf, reason: extra.reason, patch: extra.patch, detail: extra.detail, appraisal: extra.appraisal });
    setModal(null);
    notify(extra.toast || `${label} recorded.`);
  };
  const patchEmployee = (patch, detail, action = 'Updated') => dispatch({ type: 'UPSERT_EMPLOYEE', employee: { ...e, ...patch }, by, detail, action });

  const activate = () => {
    if (errors.length) { notify('Record is incomplete; open Edit to resolve the issues.', 'error'); return; }
    const probation = !!p.required && num(p.months) > 0;
    const tpl = probation ? templateFor(e, state.kpiTemplates, 'Probation') : null;
    const dupes = findEmployeeDuplicates(e, state.employees);
    const dupText = dupes.length ? `Possible duplicate detected (${dupes.map((d) => `${d.employee.code || 'draft'} ${d.employee.name} — ${d.reasons.join(', ')}`).join('; ')}). ` : '';
    if (!window.confirm(`${dupText}Activate ${e.name}${probation ? ` on ${p.months}-month probation` : ' as confirmed'} from ${fmtDate(emp.joinDate)}${dupes.length ? ' anyway' : ''}?`)) return;
    transition(probation ? S.PROBATION : S.CONFIRMED, 'Activated', {
      detail: probation ? `Activated on ${p.months}-month probation from ${emp.joinDate}` : `Activated as confirmed from ${emp.joinDate}`,
      appraisal: probation && tpl ? buildAppraisal(e, null, 'Probation', tpl, settings, by, nextAppraisalCode(state.appraisals), asOf) : undefined,
      toast: probation ? `${e.name} activated on probation${tpl ? '; probation review created' : ''}.` : `${e.name} activated as confirmed.`,
    });
  };
  const confirmExit = () => {
    if (!window.confirm(`Confirm that ${e.name} exited on ${fmtDate(lwd)}? The record becomes Separated.`)) return;
    transition(S.SEPARATED, 'Exit Completed', { patch: { separatedAt: lwd }, detail: `Last working day ${lwd} passed; exit confirmed`, toast: 'Exit confirmed; employee is now Separated.' });
  };
  const deleteDraft = () => {
    if (!window.confirm('Discard this draft employee record permanently?')) return;
    dispatch({ type: 'DELETE_EMPLOYEE', id: e.id, by });
    nav('/hr/employees');
  };
  const absenceNotice = (reason) => {
    const patch = noticeStep === 1 ? { firstNoticeOn: asOf } : { secondNoticeOn: asOf };
    patchEmployee({ absenceNotice: { ...e.absenceNotice, ...patch } }, `${noticeStep === 1 ? 'First' : 'Second'} s.27(3A) notice issued ${asOf}: ${reason}`, 'Absence Notice Issued');
    setModal(null); notify(`${noticeStep === 1 ? 'First' : 'Second'} absence notice recorded.`);
  };
  const markBankVerified = () => patchEmployee({ bank: { ...b, verified: true, verifiedBy: by, verifiedAt: nowIso() } }, `${b.bankName} ${maskValue(b.accountNo)} verified`, 'Bank Verified');

  // Primary actions sit in the page head; the rest go into an Actions menu so the bar stays readable.
  const actions = [];
  if (canHr(role, 'edit') && e.status !== S.SEPARATED) actions.push(<Link key="edit" className="btn" to={`/hr/employees/${e.id}/edit`}>✏️ Edit</Link>);
  if (e.status === S.DRAFT && canHr(role, 'activate')) actions.push(<button key="act" className="btn btn-primary" onClick={activate}>Activate</button>);
  if (e.status === S.PROBATION && canHr(role, 'confirm')) actions.push(<button key="prob" className="btn btn-primary" onClick={() => setModal('probation')}>Decide probation</button>);
  if (active && canHr(role, 'editSalary')) actions.push(<button key="sal" className="btn" onClick={() => setModal('salary')}>Revise salary</button>);
  if (active && !e.separationId && canHr(role, 'separationInitiate')) actions.push(<button key="sep" className="btn btn-warn" onClick={() => nav(`/hr/settlements/new?employee=${e.id}`)}>Initiate separation</button>);
  if (e.separationId && settlement) actions.push(<Link key="stl" className="btn" to={`/hr/settlements/${settlement.id}`}>Open settlement · {settlement.code}</Link>);
  if (e.status === S.NOTICE && canHr(role, 'markExit')) actions.push(<button key="exit" className="btn btn-danger" disabled={!exitDue} title={exitDue ? '' : `last working day ${fmtDate(lwd)} not yet reached`} onClick={confirmExit}>Confirm exit</button>);
  const canDiscipline = e.status !== S.DRAFT && canHr(role, 'disciplinary');
  const menu = [
    active && canHr(role, 'leaveRequest') && (isSelf || canHr(role, 'leaveAdminister')) && { label: 'Request leave', onClick: () => setModal('leave') },
    active && canHr(role, 'attendanceEntry') && { label: 'Enter attendance', onClick: () => setModal('attendance') },
    canDiscipline && { label: 'Record disciplinary action', onClick: () => setModal({ kind: 'disciplinary' }) },
    active && e.status !== S.SUSPENDED && canHr(role, 'suspend') && { label: 'Suspend', danger: true, onClick: () => setModal('suspend') },
    e.status === S.SUSPENDED && canHr(role, 'suspend') && { label: 'Reinstate', onClick: () => setModal('reinstate') },
    active && canHr(role, 'disciplinary') && (absenceDue || noticeStep === 2) && { label: `Record s.27(3A) notice${noticeStep === 2 ? ' (second)' : ''}`, onClick: () => setModal('absence') },
    e.status === S.DRAFT && canHr(role, 'edit') && { label: 'Discard draft', danger: true, onClick: deleteDraft },
  ];

  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const lastApr = e.lastAppraisal?.code ? e.lastAppraisal : null;
  const pfEligibleOn = emp.joinDate ? addMonths(emp.joinDate, num(settings.pf?.eligibilityMonths) || 12) : '';

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{e.name || '(unnamed record)'}</h1>
            <StatusBadge status={e.status} />
            {lastApr && <GradeBadge grade={lastApr.grade} bands={settings.appraisal?.bands} />}
          </div>
          <p className="sub"><span className="mono">{e.code || 'Draft'}</span> · {designationName(emp.designation) || 'no designation'} · {deptName(emp.department)}{emp.grade ? ` · ${emp.grade}` : ''}{emp.joinDate ? ` · joined ${fmtDate(emp.joinDate)} (${ins.serviceText})` : ''}</p>
        </div>
        <div className="page-actions">{actions}<RowMenu items={menu} /></div>
      </div>

      <WorkflowSteps status={e.status} steps={EMPLOYEE_FLOW} />

      {e.statusReason && [S.SUSPENDED, S.NOTICE, S.SEPARATED].includes(e.status) && <Alert kind={e.status === S.SUSPENDED ? 'danger' : 'warn'} title={`${e.status}: reason`}>{e.statusReason}</Alert>}
      {exitDue && canHr(role, 'markExit') && <Alert kind="warn" title="Exit date passed">Last working day {fmtDate(lwd)} has passed; confirm the exit to mark the employee Separated.</Alert>}
      {e.status === S.DRAFT && errors.length > 0 && <Alert kind="info" title={`${errors.length} item(s) outstanding before activation`}><ul>{errors.slice(0, 6).map((x) => <li key={x}>{x}</li>)}{errors.length > 6 && <li>…and {errors.length - 6} more</li>}</ul></Alert>}
      {ins.flags.length > 0 && <div className="stack" style={{ gap: 8 }}>{ins.flags.map((fl) => <div key={fl.text} className={`alert alert-${FLAG_KIND[fl.tone] || 'info'}`}>{fl.text}</div>)}</div>}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>{TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
        <div className="card-body">
          {tab === 'profile' && (
            <div className="grid grid-2">
              <Card title="Identity">
                {kv([
                  ['Employee code', e.code], ['Full name', e.name], ["Father's name", e.fatherName], ["Mother's name", e.motherName],
                  ['Date of birth', e.dob ? `${fmtDate(e.dob)} (${ageAt(e.dob, asOf)} years)` : ''],
                  ['Gender / marital status', `${e.gender}${e.maritalStatus ? ` · ${e.maritalStatus}` : ''}`], ['Blood group', e.bloodGroup], ['Nationality', e.nationality],
                  ['NID', <span key="nid" className="mono">{show(e.nid)}</span>], ['TIN', <span key="tin" className="mono">{show(e.tin)}</span>],
                  ['Passport', e.passportNo ? <>{<span className="mono">{show(e.passportNo)}</span>}{e.passportExpiry ? ` · expires ${fmtDate(e.passportExpiry)}` : ''}</> : ''],
                ])}
                {!sensitive && <p className="small muted mt-8">Identity numbers are masked for your role.</p>}
              </Card>
              <Card title="Contact">
                {kv([
                  ['Mobile', e.mobile], ['Alternate mobile', e.altMobile], ['Email', e.email],
                  ['Present address', e.presentAddress], ['Permanent address', e.permanentAddress], ['Work location', emp.workLocation],
                ])}
              </Card>
              <Card title="Emergency contact">
                {kv([['Name', e.emergencyContact.name], ['Relation', e.emergencyContact.relation], ['Mobile', e.emergencyContact.mobile], ['Address', e.emergencyContact.address]])}
              </Card>
              <Card title="Nominee">
                {e.nominee.name ? kv([['Name', e.nominee.name], ['Relation', e.nominee.relation], ['NID', <span key="nid" className="mono">{show(e.nominee.nid)}</span>], ['Mobile', e.nominee.mobile], ['Share', e.nominee.sharePct ? `${e.nominee.sharePct}%` : '']]) : <p className="muted">No nominee recorded{pf.member ? ' (required for PF members)' : ''}.</p>}
              </Card>
              <Card title="Record">
                {kv([['Created', `${fmtDateTime(e.createdAt)} by ${e.createdBy}`], ['Last updated', fmtDateTime(e.updatedAt)], ['Rehire eligible', e.rehireEligible ? 'Yes' : 'No'], ['Documents', `${e.documents.filter((d) => d.current).length} current${ins.docsMissing.length ? ` · missing ${ins.docsMissing.join(', ')}` : ''}`]])}
              </Card>
            </div>
          )}

          {tab === 'employment' && (
            <div className="grid grid-2">
              <Card title="Employment">
                {kv([
                  ['Department', deptName(emp.department)], ['Designation', designationName(emp.designation)], ['Grade', emp.grade],
                  ['Employment type', `${emp.employmentType} · ${emp.workerCategory} · ${emp.wageBasis}`],
                  ['Establishment', ESTABLISHMENT_TYPES.find((x) => x.code === emp.establishmentType)?.name || emp.establishmentType],
                  ['Joining date', emp.joinDate ? `${fmtDate(emp.joinDate)} · service ${ins.serviceText}` : ''],
                  ['Confirmation date', emp.confirmationDate ? fmtDate(emp.confirmationDate) : ''],
                  ['Contract end', emp.employmentType === 'Contractual' ? fmtDate(emp.contractEndDate) : ''],
                  ['Reporting manager', manager ? <Link key="reporting-manager" to={`/hr/employees/${manager.id}`}>{manager.name} · {designationName(manager.employment.designation)}</Link> : emp.designation === 'MD' ? 'Board' : ''],
                  ['Work location', emp.workLocation],
                  ['Retirement date', e.dob ? `${fmtDate(retirementDate(e, settings))} (age ${settings.statutory?.retirementAge}, s.28)` : ''],
                ])}
              </Card>
              <Card title="Probation">
                {!p.required ? <p className="muted">No probation applies to this designation.</p> : kv([
                  ['Length', `${p.months} month(s)`],
                  ['Ends', pEnd ? <>{fmtDate(pEnd)} {e.status === S.PROBATION && ins.probationDaysLeft != null && <span className={`badge ${ins.probationDaysLeft < 0 ? 'badge-red' : ins.probationDaysLeft <= 30 ? 'badge-amber' : 'badge-blue'}`}>{ins.probationDaysLeft < 0 ? `${-ins.probationDaysLeft} days overdue` : `${ins.probationDaysLeft} days left`}</span>}</> : 'set on activation'],
                  ['Extended', p.extended ? `Yes, to ${fmtDate(p.extendedTo)} (original end ${fmtDate(p.endDate)})` : 'No'],
                  ['Decision', p.decision ? `${p.decision}${p.decidedBy ? ` by ${p.decidedBy}` : ''}${p.decidedAt ? ` · ${fmtDateTime(p.decidedAt)}` : ''}` : e.status === S.PROBATION ? 'Pending' : ''],
                  ['Probation review', (() => { const a = appraisals.find((x) => x.type === 'Probation'); return a ? <Link to={`/hr/appraisals/${a.id}`}>{a.code} · {a.status}</Link> : ''; })()],
                ])}
                {e.status === S.PROBATION && canHr(role, 'confirm') && <button className="btn btn-sm btn-primary mt-16" onClick={() => setModal('probation')}>Decide probation</button>}
              </Card>
              {sensitive ? (
                <Card title="Salary" actions={active && canHr(role, 'editSalary') && <button className="btn btn-sm" onClick={() => setModal('salary')}>Revise salary</button>}>
                  <table>
                    <thead><tr><th>Component</th><th className="right">Monthly (BDT)</th></tr></thead>
                    <tbody>
                      {SALARY_ROWS.map(([k, label]) => <tr key={k} className={num(sal[k]) ? '' : 'muted'}><td>{label}</td><td className="right mono">{fmtMoney2(num(sal[k]))}</td></tr>)}
                      <tr><td className="strong">Gross</td><td className="right mono strong">{fmtMoney2(grossSalary(sal))}</td></tr>
                    </tbody>
                  </table>
                  <p className="small muted mt-8">Effective from {fmtDate(sal.effectiveFrom)} · paid by {sal.payMode}.</p>
                  {sal.history.length > 0 && (
                    <>
                      <h4 className="mt-16 mb-8" style={{ fontSize: 13.5 }}>Salary history</h4>
                      <table>
                        <thead><tr><th>Effective</th><th className="right">Basic</th><th className="right">Gross</th><th>Reason</th><th>By</th></tr></thead>
                        <tbody>{[...sal.history].reverse().map((h) => <tr key={h.id}><td className="nowrap">{fmtDate(h.effectiveFrom)}</td><td className="right mono">{fmtMoney2(num(h.basic))}</td><td className="right mono">{fmtMoney2(h.gross)}</td><td className="small">{h.reason}</td><td className="small muted">{h.by}{h.at ? ` · ${fmtDate(h.at)}` : ''}</td></tr>)}</tbody>
                      </table>
                    </>
                  )}
                </Card>
              ) : <Card title="Salary"><p className="muted">Salary details are visible to HR, Finance and Management only.</p></Card>}
              <Card title="Bank account" actions={isHrRole(role) && !b.verified && b.accountNo && <button className="btn btn-sm" onClick={markBankVerified}>Mark verified</button>}>
                {kv([
                  ['Bank', b.bankName ? `${b.bankName}${b.branch ? `, ${b.branch}` : ''}` : ''], ['Account type', b.accountType], ['Account name', b.accountName],
                  ['Account number', <span key="account-number" className="mono">{show(b.accountNo)}</span>], ['Routing no.', b.routingNo],
                  ['Status', b.verified ? <><span className="badge badge-green">Verified</span> <span className="small muted">by {b.verifiedBy}{b.verifiedAt ? ` · ${fmtDate(b.verifiedAt)}` : ''}</span></> : <span key="status" className="badge badge-gray">Unverified</span>],
                ])}
              </Card>
              <Card title="Provident fund">
                {pf.member ? kv([
                  ['Member since', fmtDate(pf.joinDate)], ['Contribution', `${pf.employeeRatePct}% employee · ${pf.employerRatePct}% employer of basic`],
                  ...(sensitive ? [['Own balance', fmtMoney2(num(pf.ownBalance))], ['Employer balance', fmtMoney2(num(pf.employerBalance))], ['Interest accrued', fmtMoney2(num(pf.interestAccrued))], ['Advance outstanding', fmtMoney2(num(pf.advanceOutstanding))]] : []),
                  ['Vesting', emp.joinDate ? `${settings.pf?.vestingYears} years of service (${addMonths(emp.joinDate, 12 * (num(settings.pf?.vestingYears) || 2)) <= asOf ? 'vested' : `vests ${fmtDate(addMonths(emp.joinDate, 12 * (num(settings.pf?.vestingYears) || 2)))}`})` : ''],
                ]) : <p className="muted">Not a PF member.{pfEligibleOn && pfEligibleOn <= asOf && active ? <> <span className="badge badge-amber">Eligible since {fmtDate(pfEligibleOn)}</span></> : pfEligibleOn ? ` Eligible from ${fmtDate(pfEligibleOn)}.` : ''}</p>}
              </Card>
              <Card title={`Loans & advances (${e.loans.length})`}>
                {!sensitive ? <p className="muted">Visible to HR and Finance only.</p> : e.loans.length === 0 ? <p className="muted">None recorded.</p> : (
                  <table><thead><tr><th>Type</th><th className="right">Principal</th><th className="right">Outstanding</th><th className="right">Instalment</th><th>Note</th></tr></thead>
                    <tbody>{e.loans.map((l) => <tr key={l.id}><td>{l.type}</td><td className="right mono">{fmtMoney2(num(l.principal))}</td><td className="right mono">{fmtMoney2(num(l.outstanding))}</td><td className="right mono">{fmtMoney2(num(l.monthlyInstalment))}</td><td className="small muted">{l.note}</td></tr>)}</tbody></table>
                )}
              </Card>
              {sensitive && (
                <Card title="Income tax">
                  {kv([['Category', TAX_CATEGORIES.find((t) => t.code === e.tax.category)?.name || e.tax.category], ['YTD taxable income', fmtMoney2(num(e.tax.ytdIncome))], ['YTD tax deducted', fmtMoney2(num(e.tax.ytdTaxPaid))], ['Festival bonus paid this year', e.tax.bonusPaidThisYear ? 'Yes' : 'No']])}
                </Card>
              )}
            </div>
          )}

          {tab === 'documents' && (
            canHr(role, 'viewDocuments') ? (
              <DocumentManager
                documents={e.documents}
                requiredDocs={REQUIRED_EMPLOYEE_DOCS}
                docTypes={Object.values(EMPLOYEE_DOC_TYPES)}
                expiringTypes={EXPIRING_EMPLOYEE_DOCS}
                uploadedBy={by}
                verifiedBy={by}
                canUpload={(isHrRole(role) || isSelf) && e.status !== S.SEPARATED}
                canVerify={isHrRole(role)}
                onChange={(docs, detail) => patchEmployee({ documents: docs }, detail, 'Document Changed')}
              />
            ) : <Alert kind="warn">Your role cannot view documents.</Alert>
          )}

          {tab === 'leave' && (
            <div className="stack">
              <div className="grid grid-2">
                <Card title={`Leave balances · ${settings.leave.year}`} actions={active && canHr(role, 'leaveRequest') && (isSelf || canHr(role, 'leaveAdminister')) && <button className="btn btn-sm" onClick={() => setModal('leave')}>+ Request leave</button>}>
                  <table>
                    <thead><tr><th>Type</th><th className="right">Opening</th><th className="right">Entitlement</th><th className="right">Taken</th><th className="right">Pending</th><th className="right">Balance</th></tr></thead>
                    <tbody>{balances.map((r) => (
                      <tr key={r.type.code}>
                        <td><span className="strong">{r.type.code}</span> <span className="small muted">{r.type.name}</span></td>
                        <td className="right mono">{r.unlimited ? '—' : r.opening}</td>
                        <td className="right mono">{r.unlimited ? 'unlimited' : r.entitlement}</td>
                        <td className="right mono">{r.taken}</td>
                        <td className="right mono">{r.pending || '—'}</td>
                        <td className="right mono strong">{r.unlimited ? '—' : <>{r.balance}{r.cap != null ? <span className="small muted"> / cap {r.cap}</span> : null}</>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </Card>
                <Card title="Attendance KPI · last 6 months" actions={active && canHr(role, 'attendanceEntry') && <button className="btn btn-sm" onClick={() => setModal('attendance')}>Enter attendance</button>}>
                  {attKpi.sum.months === 0 ? <p className="muted">No attendance recorded in the last 6 months.</p> : kv([
                    ['Months recorded', attKpi.sum.months], ['Attendance', <>{fmtPct(attKpi.sum.pct)} <span className="small muted">({attKpi.sum.present} present + {attKpi.sum.leave} leave of {attKpi.sum.workingDays} working days)</span></>],
                    ['Average lates / month', attKpi.sum.avgLates], ['Unapproved absence', `${attKpi.sum.unapproved} day(s)${attKpi.sum.unapprovedRun ? ` · longest run ${attKpi.sum.unapprovedRun}` : ''}`],
                    ['Attendance KPI score', <><span className={`badge ${attKpi.score >= 80 ? 'badge-green' : attKpi.score >= 60 ? 'badge-amber' : 'badge-red'}`}>{attKpi.score}</span> <span className="small muted">attendance {attKpi.attScore} · punctuality {attKpi.punct}</span></>],
                  ])}
                </Card>
              </div>
              <Card title={`Leave requests (${requests.length})`}>
                {requests.length === 0 ? <p className="muted">No leave requests.</p> : (
                  <table>
                    <thead><tr><th>Code</th><th>Type</th><th>Period</th><th className="right">Days</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
                    <tbody>{requests.map((r) => <tr key={r.id}><td className="mono">{r.code}</td><td>{r.typeCode}</td><td className="nowrap">{fmtDate(r.from)} → {fmtDate(r.to)}</td><td className="right mono">{r.days}</td><td className="small">{r.reason}</td><td><StatusBadge status={r.status} /></td><td className="small muted">{r.decision?.by ? `${r.decision.by} · ${fmtDate(r.decision.at)}${r.decision.comment ? ` — ${r.decision.comment}` : ''}` : `applied ${fmtDate(r.requestedAt)}`}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
              <Card title="Attendance by month">
                {months.length === 0 ? <p className="muted">No attendance recorded.</p> : (
                  <table>
                    <thead><tr><th>Month</th><th className="right">Working</th><th className="right">Present</th><th className="right">Leave</th><th className="right">LWP</th><th className="right">Absent</th><th className="right">Unapproved</th><th className="right">Late</th><th className="right">Present %</th><th></th></tr></thead>
                    <tbody>{months.map((a) => <tr key={a.id}><td className="nowrap">{monthLabel(a.month)}</td><td className="right mono">{a.workingDays}</td><td className="right mono">{a.present}</td><td className="right mono">{a.leave}</td><td className="right mono">{a.lwp}</td><td className="right mono">{a.absent}</td><td className={`right mono ${num(a.unapproved) ? 'strong' : ''}`}>{a.unapproved}{num(a.unapprovedRun) >= 10 ? <span className="badge badge-red" style={{ marginLeft: 6 }}>run {a.unapprovedRun}</span> : null}</td><td className="right mono">{a.late}</td><td className="right mono">{fmtPct(physicalAttendancePct(a), 1)}</td><td className="small muted">{a.locked ? 'locked' : ''}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
            </div>
          )}

          {tab === 'appraisals' && (
            <div className="stack">
              {lastApr && (
                <div className="grid grid-4">
                  <div className="card stat"><span className="stat-label">Last appraisal</span><span className="stat-value" style={{ fontSize: 20 }}>{lastApr.code}</span><span className="stat-hint">{lastApr.cycle}</span></div>
                  <div className="card stat"><span className="stat-label">Final score</span><span className="stat-value">{lastApr.final ?? '—'}</span><span className="stat-hint">{lastApr.at ? `closed ${fmtDate(lastApr.at)}` : ''}</span></div>
                  <div className="card stat"><span className="stat-label">Grade</span><span className="stat-value" style={{ fontSize: 20 }}><GradeBadge grade={lastApr.grade} bands={settings.appraisal?.bands} /></span><span className="stat-hint">rehire eligible: {e.rehireEligible ? 'yes' : 'no'}</span></div>
                  <div className="card stat"><span className="stat-label">Open reviews</span><span className="stat-value">{appraisals.filter((a) => !['Closed', 'Cancelled'].includes(a.status)).length}</span><span className="stat-hint">of {appraisals.length} total</span></div>
                </div>
              )}
              {appraisals.length === 0 ? <EmptyState>No appraisals for this employee.</EmptyState> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Code</th><th>Type</th><th>Cycle / period</th><th>Status</th><th className="right">KPI</th><th className="right">Comp.</th><th className="right">Final</th><th>Grade</th><th>Recommendation</th><th></th></tr></thead>
                  <tbody>{appraisals.map((a) => {
                    const cyc = state.appraisalCycles.find((c) => c.id === a.cycleId);
                    const hidden = isSelf && !['Published', 'Acknowledged', 'Closed'].includes(a.status);
                    return (
                      <tr key={a.id} className="clickable" onClick={() => nav(`/hr/appraisals/${a.id}`)}>
                        <td className="mono">{a.code}</td><td>{a.type}</td>
                        <td><div>{cyc?.name || (a.type === 'Probation' ? 'Probation review' : '—')}</div><div className="small muted">{fmtDate(a.periodFrom)} → {fmtDate(a.periodTo)}</div></td>
                        <td><StatusBadge status={a.status} /></td>
                        <td className="right mono">{hidden ? '·' : a.scores?.kpi ?? '—'}</td><td className="right mono">{hidden ? '·' : a.scores?.competency ?? '—'}</td><td className="right mono strong">{hidden ? '·' : a.scores?.final ?? '—'}</td>
                        <td>{hidden ? <span className="small muted">pending</span> : <GradeBadge grade={a.scores?.gradeFinal} bands={settings.appraisal?.bands} />}</td>
                        <td className="small">{hidden ? '' : a.hr?.recommendation || a.manager?.recommendation || '—'}</td>
                        <td><Link to={`/hr/appraisals/${a.id}`} onClick={(ev) => ev.stopPropagation()}>Open</Link></td>
                      </tr>
                    );
                  })}</tbody>
                </table></div>
              )}
            </div>
          )}

          {tab === 'discipline' && (
            <div className="stack">
              <div className="row-between">
                <p className="small muted" style={{ margin: 0 }}>Dated records drive appraisal gate caps and are never cleared by a cycle close. A dismissal (s.23) requires a Dismissal Enquiry with show-cause and enquiry dates (s.24).</p>
                {canDiscipline && <button className="btn btn-sm btn-danger" onClick={() => setModal({ kind: 'disciplinary' })}>+ Record disciplinary action</button>}
              </div>
              {e.disciplinary.length === 0 ? <EmptyState>No disciplinary records.</EmptyState> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Show-cause</th><th>Reply due</th><th>Enquiry</th><th>Clause</th><th>Outcome</th><th>Note</th><th>Recorded by</th><th></th></tr></thead>
                  <tbody>{[...e.disciplinary].sort((a, c) => (a.date < c.date ? 1 : -1)).map((d) => (
                    <tr key={d.id} className={d.outcome === 'Withdrawn' ? 'muted' : ''}>
                      <td className="nowrap">{fmtDate(d.date)}</td>
                      <td><span className={`badge ${['Final Warning', 'Dismissal Enquiry', 'Suspension'].includes(d.type) ? 'badge-red' : d.type === 'Written Warning' ? 'badge-amber' : 'badge-gray'}`}>{d.type}</span></td>
                      <td className="mono small">{d.reference || '—'}</td><td className="nowrap">{d.showCauseDate ? fmtDate(d.showCauseDate) : '—'}</td><td className="nowrap">{d.replyDueDate ? fmtDate(d.replyDueDate) : '—'}</td><td className="nowrap">{d.enquiryDate ? fmtDate(d.enquiryDate) : '—'}</td>
                      <td className="small">{d.misconductClause || '—'}</td><td>{d.outcome || <span className="muted">open</span>}</td>
                      <td className="small">{d.note}{d.documentId && (() => { const doc = e.documents.find((x) => x.id === d.documentId); return doc ? <div className="small muted">📎 {doc.type} · {doc.fileName}</div> : null; })()}</td>
                      <td className="small muted">{d.by}{d.at ? ` · ${fmtDate(d.at)}` : ''}</td>
                      <td>{canDiscipline && <button className="btn btn-sm" onClick={() => setModal({ kind: 'disciplinary', record: d })}>Edit</button>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
          )}

          {tab === 'separation' && (
            settlement ? (
              <div className="grid grid-2">
                <Card title={`Separation · ${settlement.code}`} actions={<Link className="btn btn-sm" to={`/hr/settlements/${settlement.id}`}>Open settlement</Link>}>
                  {kv([
                    ['Type', `${settlement.type} (${SEPARATION_SECTIONS[settlement.type] || ''})`], ['Reason', settlement.reason],
                    ['Notice date', fmtDate(settlement.noticeDate)], ['Last working day', fmtDate(settlement.lastWorkingDay)],
                    ['Notice required', `${settlement.noticeRequiredDays} day(s)${num(settlement.noticeWaivedDays) ? ` · ${settlement.noticeWaivedDays} waived` : ''}`],
                    ['Settlement status', <StatusBadge key="settlement-status" status={settlement.status} />],
                    ['Deadline', (() => { const d = settlementDeadlineOf(settlement, settings); const days = daysUntilAsOf(d, asOf); return <>{fmtDate(d)} {!['Paid', 'Withdrawn'].includes(settlement.status) && days != null && days < 0 && <span className="badge badge-red">{-days} days overdue</span>}</>; })()],
                    ['Clearance', `${settlement.clearance.filter((c) => c.status !== 'Pending').length} of ${settlement.clearance.length} signed`],
                    ...(sensitive && settlement.statement ? [['Net payable', fmtMoney2(settlement.statement.totals?.netPayable)], ['Total to employee (incl. PF)', fmtMoney2(settlement.statement.totals?.totalToEmployee)]] : []),
                    ['Separated on', e.separatedAt ? fmtDate(e.separatedAt) : ''],
                    ['Service certificate', settlement.serviceCertificate?.issued ? `Issued ${fmtDate(settlement.serviceCertificate.issuedAt)} by ${settlement.serviceCertificate.by}` : 'Not issued'],
                  ])}
                </Card>
                <Card title="Exit">
                  {kv([['Previous status', settlement.previousStatus], ['Exit interview', settlement.exitInterviewDone ? 'Done' : 'Pending'], ['Rehire eligible', e.rehireEligible ? 'Yes' : 'No'], ['Payment', settlement.payment?.paidAt ? `${fmtDate(settlement.payment.paidAt)} · ${settlement.payment.mode} · ref ${settlement.payment.reference}` : 'Not yet paid']])}
                  {exitDue && canHr(role, 'markExit') && <button className="btn btn-danger mt-16" onClick={confirmExit}>Confirm exit</button>}
                </Card>
              </div>
            ) : (
              <EmptyState>
                <div>No separation initiated.</div>
                {active && canHr(role, 'separationInitiate') && <button className="btn btn-warn mt-16" onClick={() => nav(`/hr/settlements/new?employee=${e.id}`)}>Initiate separation</button>}
              </EmptyState>
            )
          )}

          {tab === 'history' && (
            <div className="grid grid-2">
              <Card title="Status history">
                {e.statusHistory.length === 0 ? <p className="muted">No status changes recorded.</p> : (
                  <ul className="timeline">{[...e.statusHistory].reverse().map((h, i) => <li key={`${h.at}-${i}`}><span className="when">{fmtDateTime(h.at)}</span><span><StatusBadge status={h.status} /> by {h.by}{h.reason && <span className="muted"> — {h.reason}</span>}</span></li>)}</ul>
                )}
              </Card>
              <Card title={`Audit trail (${history.length})`}>
                {history.length === 0 ? <p className="muted">No history recorded.</p> : (
                  <ul className="timeline">{history.map((h) => <li key={h.id}><span className="when">{fmtDateTime(h.at)}</span><span><b>{h.action}</b> by {h.by}{h.refCode && <span className="mono small"> [{h.refCode}]</span>}{h.detail && (sensitive || !REDACT_AUDIT.has(h.action)) && <span className="muted"> — {h.detail}</span>}</span></li>)}</ul>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      {modal === 'probation' && <ProbationDecisionModal employee={e} onClose={() => setModal(null)} />}
      {modal === 'salary' && <SalaryRevisionModal employee={e} onClose={() => setModal(null)} />}
      {modal?.kind === 'disciplinary' && <DisciplinaryModal employee={e} record={modal.record} onClose={() => setModal(null)} />}
      {modal === 'leave' && <LeaveRequestModal employee={e} onClose={() => setModal(null)} />}
      {modal === 'attendance' && <AttendanceEntryModal employee={e} onClose={() => setModal(null)} />}
      {modal === 'suspend' && <ReasonModal title={`Suspend ${e.name}`} danger confirmLabel="Suspend" onClose={() => setModal(null)} onConfirm={(reason) => transition(S.SUSPENDED, 'Suspended', { reason, toast: `${e.name} placed under suspension.` })} />}
      {modal === 'reinstate' && <ReasonModal title={`Reinstate ${e.name}`} confirmLabel="Reinstate" onClose={() => setModal(null)} onConfirm={(reason) => transition(e.suspendedFrom || S.CONFIRMED, 'Reinstated', { reason, toast: `${e.name} reinstated as ${e.suspendedFrom || S.CONFIRMED}.` })} />}
      {modal === 'absence' && <ReasonModal title={`Record ${noticeStep === 1 ? 'first' : 'second'} s.27(3A) absence notice`} label="Notice details (dispatch reference, address; recorded in the audit trail)" confirmLabel="Record notice" onClose={() => setModal(null)} onConfirm={absenceNotice} />}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../../components/DocumentManager';
import { Alert, Card, EmptyState, Field, Modal, Progress, RiskBadge, StatusBadge, TermsBadge, WorkflowSteps } from '../../components/ui';
import { ROLES } from '../../data/config';
import { EXPIRING_SUPPLIER_DOCS, KYS_ROLES, KYS_USERS, SUPPLIER_DOC_TYPES, SUPPLIER_FLOW, SUPPLIER_PAYMENT_TERMS, SUPPLIER_RISK_CRITERIA, SUPPLIER_STATUS, TERMS_STATUS, canKys } from '../../kys/config';
import { findSupplierDuplicates, supplierCompleteness, supplierInsights, supplierRiskFromScore, supplierRiskScore, validateSupplier } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { REFERENCE_OUTCOMES, daysUntil, fmtDate, fmtDateTime, fmtMoney, maskValue, nowIso, referenceSummary } from '../../utils/helpers';

const S = SUPPLIER_STATUS;
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'capability', label: 'Capability & financials' },
  { key: 'evaluate', label: 'Evaluation & risk' },
  { key: 'documents', label: 'Documents' },
  { key: 'terms', label: 'Commercial terms' },
  { key: 'history', label: 'History' },
];
const n = (v) => (v === '' || v == null ? 0 : Number(v));
const FLAG_KIND = { info: 'info', warn: 'warn', danger: 'danger', success: 'success' };

export default function SupplierDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const s = state.suppliers.find((x) => x.id === id);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const [evaluator, setEvaluator] = useState(KYS_USERS.find((u) => u.role === KYS_ROLES.EVALUATOR)?.name || '');
  const [termsForm, setTermsForm] = useState(() => ({ ...(s?.terms || {}) }));
  const role = currentUser.role;

  useEffect(() => {
    setTab('overview'); setModal(null); setReason(''); setTermsForm({ ...(s?.terms || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const typeCfg = state.supplierTypes.find((t) => t.code === s?.supplierType);
  const dupes = useMemo(() => (s ? findSupplierDuplicates(s, state.suppliers) : []), [s, state.suppliers]);
  const errors = useMemo(() => (s ? validateSupplier(s, typeCfg) : []), [s, typeCfg]);
  const history = useMemo(() => state.audit.filter((a) => a.portal === 'kys' && a.customerId === id), [state.audit, id]);

  if (!s) return <Alert kind="warn">Supplier not found. <Link to="/kys/suppliers">Back to list</Link></Alert>;

  const sensitive = canKys(role, 'viewSensitive');
  const show = (v) => (sensitive ? v || '—' : maskValue(v));
  const pct = supplierCompleteness(s, typeCfg);
  const by = currentUser.name;
  const ins = supplierInsights(s);
  const canEvalNow = canKys(role, 'evaluate') && s.status === S.EVALUATION;

  const transition = (status, label, extra = {}) => {
    dispatch({ type: 'SUPPLIER_TRANSITION', id: s.id, status, label, by, reason: extra.reason, evaluator: extra.evaluator, patch: extra.patch, detail: extra.detail });
    setModal(null); setReason('');
    notify(extra.toast || `${label} recorded.`);
  };
  const patchSupplier = (patch, detail, action = 'Updated') => dispatch({ type: 'UPSERT_SUPPLIER', supplier: { ...s, ...patch }, by, detail, action });

  const submit = () => {
    if (errors.length) { notify('Application is incomplete; open Edit to resolve the issues.', 'error'); return; }
    transition(S.SUBMITTED, 'Submitted', { detail: 'Submitted for evaluation', toast: 'Submitted for evaluation.' });
  };
  const startEvaluation = () => transition(S.EVALUATION, 'Evaluation Started', { evaluator, detail: `Assigned to ${evaluator}` });
  const sendForApproval = () => {
    if (!s.risk.category) { notify('Complete the risk assessment before sending for approval.', 'error'); setTab('evaluate'); return; }
    const unverified = s.documents.filter((d) => d.current && !d.verified);
    if (unverified.length && !window.confirm(`${unverified.length} document(s) are not marked verified. Continue?`)) return;
    transition(S.APPROVAL, 'Evaluated', { detail: `Evaluation completed; risk ${s.risk.category}` });
  };
  const approve = () => transition(S.ACTIVE, 'Approved', { detail: 'Supplier approved', toast: 'Supplier approved and activated.' });
  const withReason = (kind) => {
    if (!reason.trim()) { notify('A reason is required.', 'error'); return; }
    const map = { return: [S.RETURNED, 'Returned for Correction'], reject: [S.REJECTED, 'Rejected'], suspend: [S.SUSPENDED, 'Suspended'], blacklist: [S.BLACKLISTED, 'Blacklisted'], reinstate: [S.ACTIVE, 'Reinstated'] };
    if (kind === 'reopen') return transition(S.DRAFT, 'Reopened', { reason, patch: { risk: { category: '', score: 0, criteria: [], reason: '', evaluatorComment: '' }, statusReason: '' } });
    const [status, label] = map[kind];
    transition(status, label, { reason });
  };
  const completeReview = () => {
    dispatch({ type: 'SUPPLIER_COMPLETE_REVIEW', id: s.id, by, detail: reason || 'Periodic review completed; details confirmed' });
    setModal(null); setReason(''); notify('Periodic review recorded.');
  };
  const deleteDraft = () => {
    if (!window.confirm('Discard this draft application permanently?')) return;
    dispatch({ type: 'DELETE_SUPPLIER', id: s.id, by });
    nav('/kys/suppliers');
  };

  const setRisk = (patch) => patchSupplier({ risk: { ...s.risk, ...patch } }, 'Risk assessment updated');
  const toggleCriterion = (key) => {
    const criteria = s.risk.criteria.includes(key) ? s.risk.criteria.filter((k) => k !== key) : [...s.risk.criteria, key];
    const score = supplierRiskScore(criteria);
    setRisk({ criteria, score, category: supplierRiskFromScore(score) });
  };

  const requestTerms = () => {
    if (!termsForm.annualCap) { notify('Enter the proposed annual cap.', 'error'); return; }
    const fresh = { ...termsForm, status: TERMS_STATUS.REQUESTED, approvedPaymentTerms: '', approvedCap: '', rating: '', decisionBy: '', decisionAt: '', decisionNote: '' };
    setTermsForm(fresh);
    dispatch({ type: 'TERMS_DECISION', id: s.id, by, terms: fresh, detail: `Requested ${fresh.requestedPaymentTerms}, cap ${fmtMoney(fresh.annualCap)}` });
    notify('Commercial terms requested.');
  };
  const decideTerms = (status) => {
    const approved = status === TERMS_STATUS.APPROVED;
    if (approved && !termsForm.approvedCap) { notify('Enter the approved annual cap.', 'error'); return; }
    const decision = { ...termsForm, status, decisionBy: by, decisionAt: nowIso(), approvedCap: approved ? termsForm.approvedCap : '', approvedPaymentTerms: approved ? termsForm.approvedPaymentTerms || termsForm.requestedPaymentTerms : '', rating: approved ? termsForm.rating : '' };
    setTermsForm(decision);
    dispatch({ type: 'TERMS_DECISION', id: s.id, by, terms: decision, detail: approved ? `Approved ${decision.approvedPaymentTerms}, cap ${fmtMoney(decision.approvedCap)}. ${decision.decisionNote || ''}` : decision.decisionNote || 'Declined' });
    setModal(null); notify(`Terms ${status.toLowerCase()}.`);
  };

  const actions = [];
  if ([S.DRAFT, S.RETURNED].includes(s.status)) {
    if (canKys(role, 'edit')) actions.push(<Link key="edit" className="btn" to={`/kys/suppliers/${s.id}/edit`}>✏️ Edit</Link>);
    if (canKys(role, 'submit')) actions.push(<button key="submit" className="btn btn-primary" onClick={submit}>Submit for evaluation</button>);
    if (s.status === S.DRAFT && canKys(role, 'edit')) actions.push(<button key="del" className="btn btn-ghost" onClick={deleteDraft}>Discard draft</button>);
  }
  if (s.status === S.SUBMITTED && canKys(role, 'evaluate')) actions.push(<button key="se" className="btn btn-primary" onClick={() => setModal('assign')}>Start evaluation</button>);
  if (s.status === S.EVALUATION && canKys(role, 'evaluate')) actions.push(<button key="fa" className="btn btn-primary" onClick={sendForApproval}>Send for approval</button>);
  if (s.status === S.APPROVAL && canKys(role, 'approve')) actions.push(<button key="ap" className="btn btn-success" onClick={approve}>✓ Approve supplier</button>);
  if ([S.SUBMITTED, S.EVALUATION, S.APPROVAL].includes(s.status) && canKys(role, 'returnForCorrection')) actions.push(<button key="rt" className="btn btn-warn" onClick={() => setModal('return')}>Return for correction</button>);
  if ([S.SUBMITTED, S.EVALUATION, S.APPROVAL].includes(s.status) && canKys(role, 'reject')) actions.push(<button key="rj" className="btn btn-danger" onClick={() => setModal('reject')}>Reject</button>);
  if (s.status === S.ACTIVE && canKys(role, 'suspend')) actions.push(<button key="sp" className="btn btn-danger" onClick={() => setModal('suspend')}>Suspend</button>);
  if ([S.ACTIVE, S.SUSPENDED].includes(s.status) && canKys(role, 'blacklist')) actions.push(<button key="bl" className="btn btn-danger" onClick={() => setModal('blacklist')}>Blacklist</button>);
  if (s.status === S.ACTIVE && canKys(role, 'review')) actions.push(<button key="rv" className="btn" onClick={() => setModal('review')}>Record periodic review</button>);
  if (s.status === S.SUSPENDED && canKys(role, 'reinstate')) actions.push(<button key="ri" className="btn btn-success" onClick={() => setModal('reinstate')}>Reinstate</button>);
  if (s.status === S.REJECTED && canKys(role, 'approve')) actions.push(<button key="ro" className="btn" onClick={() => setModal('reopen')}>Reopen as draft</button>);

  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const r = s.registration; const c = s.compliance; const cap = s.capability; const f = s.financials; const a = s.siteAudit;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{s.name || '(untitled application)'}</h1>
            <StatusBadge status={s.status} /><RiskBadge category={s.risk.category} /><TermsBadge status={s.terms.status} />
          </div>
          <p className="sub"><span className="mono">{s.code || 'Draft'}</span> · {typeCfg?.name} · {s.contactName}{s.contactDesignation ? ` (${s.contactDesignation})` : ''} · {s.city ? `${s.city}, ` : ''}{s.country}</p>
        </div>
        <div className="page-actions">{actions}</div>
      </div>

      <WorkflowSteps status={s.status} steps={SUPPLIER_FLOW} />

      {s.statusReason && [S.RETURNED, S.REJECTED, S.SUSPENDED, S.BLACKLISTED].includes(s.status) && <Alert kind={s.status === S.RETURNED ? 'warn' : 'danger'} title={`${s.status}: reason`}>{s.statusReason}</Alert>}
      {dupes.length > 0 && <Alert kind="warn" title="Duplicate review required"><ul>{dupes.map((d) => <li key={d.supplier.id}><Link to={`/kys/suppliers/${d.supplier.id}`}>{d.supplier.code || 'Draft'} · {d.supplier.name}</Link> ({d.supplier.status}) — {d.reasons.join(', ')}</li>)}</ul></Alert>}
      {[S.DRAFT, S.RETURNED].includes(s.status) && errors.length > 0 && <Alert kind="info" title={`${errors.length} item(s) outstanding before submission`}><ul>{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}{errors.length > 6 && <li>…and {errors.length - 6} more</li>}</ul></Alert>}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>{TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}</div>
        <div className="card-body">
          {tab === 'overview' && (
            <div className="grid grid-2">
              <Card title="Supplier profile">
                {kv([
                  ['Supplier code', s.code], ['Supplier type', typeCfg?.name], ['Legal name', s.name], ['Trade name', s.tradeName], ['Registered address', s.address], ['City / country', `${s.city ? `${s.city}, ` : ''}${s.country}`],
                  ['Website', s.website ? <a key="website" href={s.website} target="_blank" rel="noreferrer">{s.website}</a> : ''],
                  ['Primary contact', s.contactName ? `${s.contactName}${s.contactDesignation ? ` · ${s.contactDesignation}` : ''}` : ''],
                  ['Mobile', <>{s.mobile} {s.mobileVerified ? <span className="badge badge-green">OTP verified</span> : <span className="badge badge-amber">unverified</span>}</>],
                  ['Email', <>{s.email || '—'} {s.email && (s.emailVerified ? <span className="badge badge-green">verified</span> : <span className="badge badge-gray">unverified</span>)}</>],
                  ['Completeness', <div key="completeness" className="row"><div style={{ width: 140 }}><Progress value={pct} /></div><span className="small">{pct}%</span></div>],
                ])}
              </Card>
              <Card title="Registration & compliance">
                {kv([
                  ['Ownership type', r.ownershipType], ['Established', r.establishedYear ? `${r.establishedYear} (${r.yearsInBusiness || '—'} years)` : ''], ['Employees', r.employees],
                  ['Trade license', r.tradeLicenseNo ? `${r.tradeLicenseNo}${r.tradeLicenseExpiry ? ` (expires ${fmtDate(r.tradeLicenseExpiry)})` : ''}` : ''],
                  ['TIN', show(r.tin)], ['BIN', show(r.bin)], ['Registration', r.regNo ? `${r.regNo}${r.regDate ? ` · ${fmtDate(r.regDate)}` : ''}` : ''],
                  ['IRC', r.ircNo ? `${r.ircNo}${r.ircExpiry ? ` (expires ${fmtDate(r.ircExpiry)})` : ''}` : ''],
                  ['Certifications', c.certifications.length ? <div key="certifications" className="chip-list">{c.certifications.map((x) => <span key={x.id} className={`chip ${x.expiry && daysUntil(x.expiry) < 0 ? 'badge-red' : 'on'}`}>{x.name}{x.expiry ? ` · ${fmtDate(x.expiry)}` : ''}</span>)}</div> : ''],
                  ['Declarations', <div key="declarations" className="chip-list">{[['Code of conduct', c.codeOfConductSigned], ['No sanctions', c.noSanctionsDeclared], ['No PEP', c.noPepDeclared], ['No child labour', c.noChildLabourDeclared], ['Environmental', c.environmentalCompliant]].map(([l, ok]) => <span key={l} className={`badge ${ok ? 'badge-green' : 'badge-gray'}`}>{ok ? '✓' : '—'} {l}</span>)}</div>],
                  ['Conflict of interest', c.conflictOfInterest || 'None declared'],
                ])}
                {!sensitive && <p className="small muted mt-8">Tax and identity numbers are masked for your role.</p>}
              </Card>
              <Card title={`Bank accounts (${s.bankAccounts.length})`}>
                {s.bankAccounts.length === 0 ? <p className="muted">No accounts recorded.</p> : (
                  <table><thead><tr><th>Bank</th><th>Type</th><th>Account</th><th>Purpose</th><th>Status</th></tr></thead>
                    <tbody>{s.bankAccounts.map((b) => (
                      <tr key={b.id}>
                        <td><div className="strong">{b.bankName}{b.primary && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Primary</span>}</div><div className="small muted">{b.branch}{b.routingNo ? ` · ${b.routingNo}` : ''}</div></td>
                        <td className="small">{b.accountType}</td>
                        <td><div className="mono">{show(b.accountNo)}</div><div className="small muted">{b.accountName}</div></td>
                        <td className="small muted">{b.purpose}</td>
                        <td>{b.verified ? <><span className="badge badge-green">Verified</span>{b.verifiedBy && <div className="small muted">by {b.verifiedBy}{b.verifiedAt ? ` · ${fmtDate(b.verifiedAt)}` : ''}</div>}</> : <span className="badge badge-gray">Unverified</span>}</td>
                      </tr>))}</tbody></table>
                )}
              </Card>
              <Card title={`Owners & directors (${s.owners.length})`}>
                {s.owners.length === 0 ? <p className="muted">None recorded.</p> : (
                  <table><thead><tr><th>Name</th><th>Designation</th><th>ID</th><th>Nationality</th><th>Share</th></tr></thead>
                    <tbody>{s.owners.map((o) => <tr key={o.id}><td>{o.name}</td><td>{o.designation}</td><td className="mono">{show(o.idNumber)}</td><td>{o.nationality}</td><td>{o.share ? `${o.share}%` : '—'}</td></tr>)}</tbody></table>
                )}
              </Card>
              <Card title={`Authorised signatories (${s.signatories.length})`}>
                {s.signatories.length === 0 ? <p className="muted">None recorded.</p> : (
                  <table><thead><tr><th>Name</th><th>Designation</th><th>Contact</th><th>Authority</th></tr></thead>
                    <tbody>{s.signatories.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.designation}</td><td className="small">{x.mobile}{x.email ? <div className="muted">{x.email}</div> : null}</td><td className="chip-list">{x.canQuote && <span className="chip on">Quote / contract</span>}{x.canInvoice && <span className="chip on">Invoice</span>}</td></tr>)}</tbody></table>
                )}
              </Card>
              <Card title={`References (${s.references.length})`}>
                {s.references.length === 0 ? <p className="muted">None recorded{typeCfg?.minReferences > 0 ? ` (${typeCfg.minReferences} required)` : ''}.</p> : (
                  <>
                    <table><thead><tr><th>Reference</th><th>Type</th><th>Contact</th><th>Outcome</th></tr></thead>
                      <tbody>{s.references.map((x) => (
                        <tr key={x.id}>
                          <td><div className="strong">{x.name}</div><div className="small muted">{[x.designation, x.organisation].filter(Boolean).join(', ')}{x.relationship ? ` · ${x.relationship}` : ''}{x.yearsKnown ? ` · ${x.yearsKnown} yrs` : ''}</div>{x.remarks && <div className="small muted">Remarks: {x.remarks}</div>}</td>
                          <td className="small">{x.type}</td>
                          <td className="small">{x.mobile}{x.email ? <div className="muted">{x.email}</div> : null}</td>
                          <td><span className={`badge ${x.outcome === 'Positive' ? 'badge-green' : x.outcome === 'Negative' ? 'badge-red' : !x.outcome || x.outcome === 'Not contacted' ? 'badge-gray' : 'badge-amber'}`}>{x.outcome || 'Not contacted'}</span>{x.feedback && <div className="small muted">{x.feedback}</div>}</td>
                        </tr>))}</tbody></table>
                    {(() => { const rs = referenceSummary(s.references); return <p className="small muted mt-8">{rs.contacted} of {rs.total} contacted · {rs.positive} positive{rs.negative ? ` · ${rs.negative} negative` : ''}.</p>; })()}
                  </>
                )}
              </Card>
              <Card title="Site audit">
                {!a.done ? <p className="muted">No site audit recorded{typeCfg?.requireSiteAudit ? ' (required for this type)' : ''}.</p> : kv([
                  ['Date / auditor', `${fmtDate(a.date)}${a.auditor ? ` by ${a.auditor}` : ''}`],
                  ['Score / grade', <><span className={`badge ${n(a.score) >= 80 ? 'badge-green' : n(a.score) >= 60 ? 'badge-amber' : 'badge-red'}`}>{a.score || '—'}</span> {a.grade}</>],
                  ['Findings', a.findings], ['Corrective actions', a.correctiveActions ? `${a.correctiveActions}${a.dueDate ? ` (due ${fmtDate(a.dueDate)})` : ''}` : 'None'],
                  ['Status', a.correctiveActions ? (a.closed ? <span key="closed" className="badge badge-green">Actions closed</span> : <span key="open" className="badge badge-amber">Actions open</span>) : <span key="none" className="badge badge-green">No actions required</span>],
                ])}
              </Card>
              <Card title="Review schedule">
                {kv([
                  ['Last reviewed', s.lastReviewed ? fmtDate(s.lastReviewed) : 'Never'],
                  ['Next review due', s.reviewDue ? <>{fmtDate(s.reviewDue)} {daysUntil(s.reviewDue) <= 30 && <span className={`badge ${daysUntil(s.reviewDue) < 0 ? 'badge-red' : 'badge-amber'}`}>{daysUntil(s.reviewDue) < 0 ? 'overdue' : 'due soon'}</span>}</> : 'Set on approval'],
                  ['Review cycle', `${typeCfg?.reviewMonths} months`], ['Assigned evaluator', s.assignedEvaluator],
                  ['Created', `${fmtDateTime(s.createdAt)} by ${s.createdBy}`], ['Last updated', fmtDateTime(s.updatedAt)],
                ])}
              </Card>
            </div>
          )}

          {tab === 'capability' && (
            <div className="stack">
              <div className="grid grid-4">
                <div className={`card stat ${ins.utilisation == null ? '' : ins.utilisation > 80 ? 'tone-amber' : 'tone-green'}`}><span className="stat-label">Capacity committed to us</span><span className="stat-value">{ins.utilisation == null ? '—' : `${ins.utilisation}%`}</span><span className="stat-hint">{ins.capacity ? `${ins.committed.toLocaleString()} of ${ins.capacity.toLocaleString()} / month` : 'no capacity data'}</span></div>
                <div className={`card stat ${ins.growth == null ? '' : ins.growth < -10 ? 'tone-red' : ins.growth >= 10 ? 'tone-green' : 'tone-blue'}`}><span className="stat-label">Turnover trend</span><span className="stat-value">{ins.growth == null ? '—' : `${ins.growth > 0 ? '+' : ''}${ins.growth}%`}</span><span className="stat-hint">{ins.y1 ? `latest ${fmtMoney(ins.y1)}` : 'no turnover data'}</span></div>
                <div className={`card stat ${ins.leverage == null ? '' : ins.leverage > 100 ? 'tone-red' : ins.leverage > 50 ? 'tone-amber' : 'tone-green'}`}><span className="stat-label">Leverage</span><span className="stat-value">{ins.leverage == null ? '—' : `${ins.leverage}%`}</span><span className="stat-hint">loans over net worth</span></div>
                <div className={`card stat ${ins.auditScore == null ? '' : ins.auditScore >= 80 ? 'tone-green' : ins.auditScore >= 60 ? 'tone-amber' : 'tone-red'}`}><span className="stat-label">Site audit score</span><span className="stat-value">{ins.auditScore ?? '—'}</span><span className="stat-hint">{ins.certCount} certification{ins.certCount === 1 ? '' : 's'}{ins.certCount > ins.validCerts ? `, ${ins.certCount - ins.validCerts} expired` : ''}</span></div>
              </div>
              {ins.flags.length > 0 && <div className="stack" style={{ gap: 8 }}>{ins.flags.map((fl) => <div key={fl.text} className={`alert alert-${FLAG_KIND[fl.tone] || 'info'}`}>{fl.text}</div>)}</div>}
              <div className="grid grid-2">
                <Card title={`Products & services (${cap.products.length})`}>
                  {kv([['Categories', cap.categories.length ? <div key="categories" className="chip-list">{cap.categories.map((x) => <span key={x} className="chip on">{x}</span>)}</div> : '']])}
                  {cap.products.length === 0 ? <p className="muted mt-8">None recorded.</p> : (
                    <table className="mt-8"><thead><tr><th>Item</th><th className="right">Capacity / mo</th><th className="right">To us / mo</th><th className="right">Lead</th><th className="right">MOQ</th><th className="right">Unit price</th></tr></thead>
                      <tbody>{cap.products.map((p) => <tr key={p.id}><td>{p.item}<div className="small muted">{p.category}</div></td><td className="right mono">{n(p.monthlyCapacity).toLocaleString()} {p.unit}</td><td className="right mono">{n(p.committedToUs).toLocaleString()}</td><td className="right">{p.leadTimeDays ? `${p.leadTimeDays} d` : '—'}</td><td className="right">{p.minOrder || '—'}</td><td className="right mono">{p.unitPrice ? fmtMoney(p.unitPrice) : '—'}</td></tr>)}</tbody></table>
                  )}
                  {kv([['Major clients', cap.majorClients], ['Export markets', cap.exportMarkets], ['Quality process', cap.qualityProcess]])}
                </Card>
                <Card title={`Facilities (${cap.plants.length})`}>
                  {cap.plants.length === 0 ? <p className="muted">None recorded.</p> : (
                    <table><thead><tr><th>Facility</th><th>Location</th><th>Capacity</th><th>Tenure</th></tr></thead>
                      <tbody>{cap.plants.map((p) => <tr key={p.id}><td className="strong">{p.name}</td><td>{p.location}</td><td>{p.capacity}</td><td>{p.ownedOrRented}</td></tr>)}</tbody></table>
                  )}
                </Card>
                <Card title="Financials">
                  {kv([
                    ['Turnover (latest)', f.turnoverY1 ? fmtMoney(f.turnoverY1) : ''], ['Turnover (previous)', f.turnoverY2 ? fmtMoney(f.turnoverY2) : ''], ['Turnover (two years ago)', f.turnoverY3 ? fmtMoney(f.turnoverY3) : ''],
                    ['3-year trend', ins.threeYearTrend != null ? `${ins.threeYearTrend > 0 ? '+' : ''}${ins.threeYearTrend}%` : ''],
                    ['Net worth', f.netWorth ? fmtMoney(f.netWorth) : ''], ['Paid-up capital', f.paidUpCapital ? fmtMoney(f.paidUpCapital) : ''], ['Loans outstanding', f.loansOutstanding ? fmtMoney(f.loansOutstanding) : ''],
                    ['Audited by', f.auditedBy ? `${f.auditedBy}${f.lastAuditedYear ? ` (${f.lastAuditedYear})` : ''}` : ''], ['Insurance cover', f.insuranceCover],
                  ])}
                  {ins.y1 > 0 && (
                    <div className="bar-list mt-16">
                      {[['Latest', ins.y1], ['Previous', ins.y2], ['Two years ago', ins.y3]].filter(([, v]) => v > 0).map(([l, v]) => (
                        <div key={l} className="bar-row"><span>{l}</span><div className="bar"><span style={{ width: `${(v / Math.max(ins.y1, ins.y2, ins.y3)) * 100}%`, background: 'var(--primary)' }} /></div><span className="right mono small">{fmtMoney(v)}</span></div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card title="Certifications">
                  {c.certifications.length === 0 ? <p className="muted">None recorded.</p> : (
                    <table><thead><tr><th>Certification</th><th>Issuer</th><th>Number</th><th>Expiry</th></tr></thead>
                      <tbody>{c.certifications.map((x) => <tr key={x.id}><td className="strong">{x.name}</td><td>{x.issuer}</td><td className="mono small">{x.number}</td><td>{x.expiry ? <span className={`badge ${daysUntil(x.expiry) < 0 ? 'badge-red' : daysUntil(x.expiry) <= 60 ? 'badge-amber' : 'badge-green'}`}>{fmtDate(x.expiry)}</span> : '—'}</td></tr>)}</tbody></table>
                  )}
                </Card>
              </div>
            </div>
          )}

          {tab === 'evaluate' && (
            <div className="grid grid-2">
              <Card title="Evaluation checklist">
                {!canEvalNow && <p className="small muted mb-16">Editable by an evaluator while the application is in Evaluation. Current status: {s.status}.</p>}
                <div className="stack" style={{ gap: 10 }}>
                  <label className="check"><input type="checkbox" disabled checked={s.mobileVerified} readOnly /> Contact mobile verified by OTP</label>
                  <label className="check"><input type="checkbox" disabled checked={c.codeOfConductSigned && c.noSanctionsDeclared && c.noPepDeclared} readOnly /> Compliance declarations complete</label>
                  <label className="check"><input type="checkbox" disabled checked={!typeCfg?.requireSiteAudit || (a.done && n(a.score) >= 60)} readOnly /> Site audit {a.done ? `scored ${a.score || '—'}` : 'not done'}{typeCfg?.requireSiteAudit ? ' (required)' : ''}</label>
                  <div className="strong small" style={{ marginTop: 6 }}>Bank accounts ({s.bankAccounts.filter((b) => b.verified).length}/{s.bankAccounts.length} verified)</div>
                  {s.bankAccounts.map((b) => (
                    <label key={b.id} className="check" style={{ paddingLeft: 12 }}>
                      <input type="checkbox" disabled={!canEvalNow} checked={b.verified} onChange={(e) => patchSupplier({ bankAccounts: s.bankAccounts.map((x) => (x.id === b.id ? { ...x, verified: e.target.checked, verifiedBy: e.target.checked ? by : '', verifiedAt: e.target.checked ? nowIso() : '' } : x)) }, `${b.bankName} ${maskValue(b.accountNo)} ${e.target.checked ? 'verified' : 'unverified'}`, 'Bank Verified')} />
                      {b.bankName} · {b.accountType} · <span className="mono">{show(b.accountNo)}</span>{b.primary && <span className="badge badge-blue">Primary</span>}
                    </label>
                  ))}
                  <label className="check"><input type="checkbox" disabled checked={s.documents.filter((d) => d.current).length > 0 && s.documents.filter((d) => d.current).every((d) => d.verified)} readOnly /> All current documents verified ({s.documents.filter((d) => d.current && d.verified).length}/{s.documents.filter((d) => d.current).length}) — see Documents tab</label>
                  <label className="check"><input type="checkbox" disabled checked={dupes.length === 0} readOnly /> No unresolved duplicate matches</label>
                  <label className="check"><input type="checkbox" disabled checked={s.references.length > 0 && referenceSummary(s.references).pending === 0 && s.references.length >= (typeCfg?.minReferences ?? 0)} readOnly /> References contacted ({referenceSummary(s.references).contacted}/{s.references.length}{typeCfg?.minReferences ? `, min ${typeCfg.minReferences}` : ''})</label>
                </div>
                <h4 className="mt-16 mb-8" style={{ fontSize: 13.5 }}>Reference checks</h4>
                {s.references.length === 0 ? <p className="muted small">No references recorded.</p> : (
                  <div className="stack" style={{ gap: 10 }}>
                    {s.references.map((x) => (
                      <div key={x.id} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="row-between">
                          <div><span className="strong">{x.name}</span> <span className="muted small">· {x.type}{x.organisation ? ` · ${x.organisation}` : ''} · {x.mobile || x.email}</span></div>
                          <select style={{ width: 'auto' }} disabled={!canEvalNow} value={x.outcome || 'Not contacted'} onChange={(e) => patchSupplier({ references: s.references.map((y) => (y.id === x.id ? { ...y, outcome: e.target.value, contactedBy: e.target.value === 'Not contacted' ? '' : by, contactedAt: e.target.value === 'Not contacted' ? '' : nowIso() } : y)) }, `Reference ${x.name} (${x.type}): ${e.target.value}`, 'Reference Checked')}>
                            {REFERENCE_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <input className="mt-8" key={`fb-${x.id}-${s.updatedAt}`} placeholder="Feedback from the reference" disabled={!canEvalNow} defaultValue={x.feedback || ''} onBlur={(e) => e.target.value !== (x.feedback || '') && patchSupplier({ references: s.references.map((y) => (y.id === x.id ? { ...y, feedback: e.target.value } : y)) }, `Reference feedback recorded for ${x.name}`, 'Reference Checked')} />
                        {x.contactedBy && <div className="small muted mt-8">Contacted by {x.contactedBy} on {fmtDateTime(x.contactedAt)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Risk assessment">
                <p className="small muted mb-8">Tick the criteria that apply. Score ≥8 = High, 4–7 = Medium, otherwise Low.</p>
                <div className="stack" style={{ gap: 8 }}>
                  {SUPPLIER_RISK_CRITERIA.map((x) => <label key={x.key} className="check"><input type="checkbox" disabled={!canEvalNow} checked={s.risk.criteria.includes(x.key)} onChange={() => toggleCriterion(x.key)} /> {x.label} <span className="muted small">(+{x.weight})</span></label>)}
                </div>
                <div className="row mt-16"><span className="strong">Score: {s.risk.score}</span><RiskBadge category={s.risk.category} /></div>
                <div className="form-grid mt-16">
                  <Field label="Reason / basis" className="span-2"><textarea key={`reason-${s.updatedAt}`} disabled={!canEvalNow} defaultValue={s.risk.reason} onBlur={(e) => e.target.value !== s.risk.reason && setRisk({ reason: e.target.value })} /></Field>
                  <Field label="Evaluator comment" className="span-2"><textarea key={`comment-${s.updatedAt}`} disabled={!canEvalNow} defaultValue={s.risk.evaluatorComment} onBlur={(e) => e.target.value !== s.risk.evaluatorComment && setRisk({ evaluatorComment: e.target.value })} /></Field>
                </div>
                {ins.flags.filter((x) => x.tone !== 'info').length > 0 && <div className="mt-16"><div className="strong small mb-8">Insight flags to consider</div><ul style={{ margin: 0, paddingLeft: 18 }} className="small">{ins.flags.filter((x) => x.tone !== 'info').map((x) => <li key={x.text}>{x.text}</li>)}</ul></div>}
              </Card>
            </div>
          )}

          {tab === 'documents' && (
            canKys(role, 'viewDocuments') ? (
              <DocumentManager
                documents={s.documents}
                requiredDocs={typeCfg?.requiredDocs || []}
                docTypes={Object.values(SUPPLIER_DOC_TYPES)}
                expiringTypes={EXPIRING_SUPPLIER_DOCS}
                uploadedBy={by}
                verifiedBy={by}
                canUpload={canKys(role, 'edit') && ([S.DRAFT, S.RETURNED, S.ACTIVE].includes(s.status) || role === ROLES.ADMIN)}
                canVerify={canKys(role, 'evaluate') && [S.EVALUATION, S.ACTIVE].includes(s.status)}
                onChange={(docs, detail) => patchSupplier({ documents: docs }, detail, 'Document Changed')}
              />
            ) : <Alert kind="warn">Your role cannot view documents.</Alert>
          )}

          {tab === 'terms' && (
            <div className="grid grid-2">
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-head"><h3>Insight for the commercial-terms decision</h3><button className="btn btn-sm" onClick={() => setTab('capability')}>Capability &amp; financials</button></div>
                <div className="card-body">
                  <div className="grid grid-3">
                    <div><div className="stat-label">Supplier turnover</div><div className="strong">{ins.y1 ? fmtMoney(ins.y1) : '—'} <span className="muted small">{ins.growth != null ? `(${ins.growth > 0 ? '+' : ''}${ins.growth}%)` : ''}</span></div></div>
                    <div><div className="stat-label">Proposed cap vs turnover</div><div className="strong">{ins.capVsTurnover != null ? `${ins.capVsTurnover}%` : '—'}</div></div>
                    <div><div className="stat-label">Capacity committed</div><div className="strong">{ins.utilisation != null ? `${ins.utilisation}%` : '—'}</div></div>
                    <div><div className="stat-label">Site audit</div><div className="strong">{ins.auditScore ?? '—'} <span className="muted small">{a.grade}</span></div></div>
                    <div><div className="stat-label">References</div><div className="strong">{referenceSummary(s.references).positive}/{s.references.length} positive</div></div>
                    <div><div className="stat-label">Leverage</div><div className="strong">{ins.leverage == null ? '—' : `${ins.leverage}%`}</div></div>
                  </div>
                  {ins.flags.filter((x) => x.tone !== 'info').length > 0 && <ul style={{ margin: '14px 0 0', paddingLeft: 18 }}>{ins.flags.filter((x) => x.tone !== 'info').map((x) => <li key={x.text} style={{ color: x.tone === 'danger' ? 'var(--danger)' : x.tone === 'warn' ? 'var(--warn)' : 'var(--success)' }}>{x.text}</li>)}</ul>}
                </div>
              </div>
              <Card title="Terms request">
                <Alert kind="info">Supplier approval confirms the supplier is qualified. Commercial terms are a separate Finance decision on payment terms, annual spend cap and rating, made only once the supplier is <b>Active</b>.</Alert>
                <div className="form-grid mt-16">
                  <Field label="Requested payment terms"><select disabled={!canKys(role, 'termsRequest')} value={termsForm.requestedPaymentTerms} onChange={(e) => setTermsForm({ ...termsForm, requestedPaymentTerms: e.target.value })}>{SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
                  <Field label="Credit days offered by supplier"><input type="number" min="0" disabled={!canKys(role, 'termsRequest')} value={termsForm.creditDaysOffered} onChange={(e) => setTermsForm({ ...termsForm, creditDaysOffered: e.target.value })} /></Field>
                  <Field label="Proposed annual cap (BDT)" required><input type="number" min="0" disabled={!canKys(role, 'termsRequest')} value={termsForm.annualCap} onChange={(e) => setTermsForm({ ...termsForm, annualCap: e.target.value })} /></Field>
                  <Field label="Security deposit / bank guarantee (BDT)"><input type="number" min="0" disabled={!canKys(role, 'termsRequest')} value={termsForm.securityDeposit} onChange={(e) => setTermsForm({ ...termsForm, securityDeposit: e.target.value })} /></Field>
                  <Field label="Justification" className="span-2"><textarea disabled={!canKys(role, 'termsRequest')} value={termsForm.justification} onChange={(e) => setTermsForm({ ...termsForm, justification: e.target.value })} /></Field>
                </div>
                {canKys(role, 'termsRequest') && [TERMS_STATUS.NONE, TERMS_STATUS.DECLINED].includes(s.terms.status) && ![S.REJECTED, S.BLACKLISTED].includes(s.status) && <button className="btn btn-primary mt-16" onClick={requestTerms}>Submit terms request</button>}
              </Card>
              <Card title="Terms decision">
                <dl className="kv">
                  <dt>Status</dt><dd><TermsBadge status={s.terms.status} /></dd>
                  <dt>Requested</dt><dd>{s.terms.requestedPaymentTerms} · cap {fmtMoney(s.terms.annualCap)}</dd>
                  <dt>Approved terms</dt><dd className="strong">{s.terms.approvedPaymentTerms || '—'}</dd>
                  <dt>Approved annual cap</dt><dd className="strong">{fmtMoney(s.terms.approvedCap)}</dd>
                  <dt>Rating</dt><dd>{s.terms.rating ? <span className="badge badge-green">{s.terms.rating}</span> : '—'}</dd>
                  <dt>Decision</dt><dd>{s.terms.decisionBy ? `${s.terms.decisionBy} · ${fmtDateTime(s.terms.decisionAt)}` : '—'}</dd>
                  <dt>Note</dt><dd>{s.terms.decisionNote || '—'}</dd>
                </dl>
                {canKys(role, 'termsDecide') && [TERMS_STATUS.REQUESTED, TERMS_STATUS.UNDER_REVIEW].includes(s.terms.status) && (
                  s.status === S.ACTIVE
                    ? <button className="btn btn-primary mt-16" onClick={() => { setTermsForm({ ...s.terms, approvedPaymentTerms: s.terms.approvedPaymentTerms || s.terms.requestedPaymentTerms, approvedCap: s.terms.approvedCap || s.terms.annualCap, rating: s.terms.rating || 'Approved' }); setModal('terms'); }}>Make terms decision</button>
                    : <Alert kind="warn" title="Supplier not yet active">Terms can be decided only after the supplier is approved.</Alert>
                )}
              </Card>
            </div>
          )}

          {tab === 'history' && (history.length === 0 ? <EmptyState>No history recorded.</EmptyState> : (
            <ul className="timeline">{history.map((h) => <li key={h.id}><span className="when">{fmtDateTime(h.at)}</span><span><b>{h.action}</b> by {h.by}{h.detail && <span className="muted"> — {h.detail}</span>}</span></li>)}</ul>
          ))}
        </div>
      </div>

      {modal === 'assign' && (
        <Modal title="Start evaluation" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={startEvaluation}>Start</button></>}>
          <Field label="Assign evaluator"><select value={evaluator} onChange={(e) => setEvaluator(e.target.value)}>{[...KYS_USERS.filter((u) => u.role === KYS_ROLES.EVALUATOR), { id: 'adm', name: 'System Admin' }].map((u) => <option key={u.id}>{u.name}</option>)}</select></Field>
          {dupes.length > 0 && <Alert kind="warn">This application has {dupes.length} possible duplicate match(es). Resolve them during evaluation.</Alert>}
        </Modal>
      )}
      {['return', 'reject', 'suspend', 'blacklist', 'reinstate', 'reopen'].includes(modal) && (
        <Modal title={{ return: 'Return for correction', reject: 'Reject application', suspend: 'Suspend supplier', blacklist: 'Blacklist supplier', reinstate: 'Reinstate supplier', reopen: 'Reopen as draft' }[modal]} onClose={() => setModal(null)}
          footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className={`btn ${['reject', 'suspend', 'blacklist'].includes(modal) ? 'btn-danger' : 'btn-primary'}`} onClick={() => withReason(modal)}>Confirm</button></>}>
          {modal === 'blacklist' && <Alert kind="danger">Blacklisting withdraws any approved commercial terms and prevents reinstatement from this screen.</Alert>}
          <Field label="Reason (recorded in the audit trail)" required><textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
      {modal === 'review' && (
        <Modal title="Record periodic review" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={completeReview}>Mark reviewed</button></>}>
          <p>Confirm registration, certifications, capacity, financial standing, bank details and performance have been re-checked. The next review will be scheduled {typeCfg?.reviewMonths} months from today.</p>
          {errors.length > 0 && <Alert kind="warn" title="Outstanding issues found on this record"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
          <Field label="Review notes"><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
      {modal === 'terms' && (
        <Modal title="Commercial terms decision" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger" onClick={() => decideTerms(TERMS_STATUS.DECLINED)}>Decline</button><button className="btn btn-success" onClick={() => decideTerms(TERMS_STATUS.APPROVED)}>Approve</button></>}>
          <div className="form-grid">
            <Field label="Requested"><input disabled value={`${s.terms.requestedPaymentTerms} · cap ${fmtMoney(s.terms.annualCap)}`} /></Field>
            <Field label="Risk category"><input disabled value={s.risk.category || 'Not assessed'} /></Field>
            <Field label="Approved payment terms"><select value={termsForm.approvedPaymentTerms} onChange={(e) => setTermsForm({ ...termsForm, approvedPaymentTerms: e.target.value })}>{SUPPLIER_PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Approved annual cap (BDT)" required><input type="number" min="0" value={termsForm.approvedCap} onChange={(e) => setTermsForm({ ...termsForm, approvedCap: e.target.value })} /></Field>
            <Field label="Supplier rating"><select value={termsForm.rating} onChange={(e) => setTermsForm({ ...termsForm, rating: e.target.value })}>{['Preferred', 'Approved', 'Conditional', 'Trial'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Decision note" className="span-2"><textarea value={termsForm.decisionNote} onChange={(e) => setTermsForm({ ...termsForm, decisionNote: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

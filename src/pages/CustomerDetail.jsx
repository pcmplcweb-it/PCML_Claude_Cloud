import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../components/DocumentManager';
import { Alert, Card, CreditBadge, EmptyState, Field, Modal, Progress, RiskBadge, StatusBadge, WorkflowSteps } from '../components/ui';
import { CREDIT_STATUS, PAYMENT_TERMS, RISK_CRITERIA, ROLES, STATUS, USERS, can } from '../data/config';
import { useStore } from '../store/StoreContext';
import { REFERENCE_OUTCOMES, referenceSummary, termsToDays, businessInsights, completeness, computeRiskScore, daysUntil, findDuplicates, fmtDate, fmtDateTime, fmtMoney, maskValue, nowIso, riskFromScore, validateCustomer } from '../utils/helpers';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'business', label: 'Business profile' },
  { key: 'verify', label: 'Verification & risk' },
  { key: 'documents', label: 'Documents' },
  { key: 'credit', label: 'Credit' },
  { key: 'history', label: 'History' },
];

const n = (v) => (v === '' || v == null ? 0 : Number(v));
const FLAG_KIND = { info: 'info', warn: 'warn', danger: 'danger', success: 'success' };

export default function CustomerDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const c = state.customers.find((x) => x.id === id);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null); // { kind: 'return'|'reject'|'suspend'|'verify-assign'|'credit-decision'|'review' }
  const [reason, setReason] = useState('');
  const [reviewer, setReviewer] = useState(USERS.find((u) => u.role === ROLES.REVIEWER)?.name || '');
  // Declared before any early return so the hook order is stable even when the record disappears (e.g. a discarded draft).
  const [creditForm, setCreditForm] = useState(() => ({ ...(c?.credit || {}) }));
  const role = currentUser.role;

  // Reset per-record UI state when navigating directly from one customer to another.
  useEffect(() => {
    setTab('overview');
    setModal(null);
    setReason('');
    setCreditForm({ ...(c?.credit || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const typeCfg = state.customerTypes.find((t) => t.code === c?.customerType);
  const dupes = useMemo(() => (c ? findDuplicates(c, state.customers) : []), [c, state.customers]);
  const errors = useMemo(() => (c ? validateCustomer(c, typeCfg) : []), [c, typeCfg]);
  const history = useMemo(() => state.audit.filter((a) => (a.portal || 'kyc') === 'kyc' && a.customerId === id), [state.audit, id]);

  if (!c) return <Alert kind="warn">Customer not found. <Link to="/kyc/customers">Back to list</Link></Alert>;

  const sensitive = can(role, 'viewSensitive');
  const show = (v) => (sensitive ? v || '—' : maskValue(v));
  const pct = completeness(c, typeCfg);
  const by = currentUser.name;
  // Category always follows the score, so an assessment with no criteria ticked is a valid Low.
  const riskCat = c.risk.category || riskFromScore(c.risk.score || 0);

  const transition = (status, label, extra = {}) => {
    dispatch({ type: 'TRANSITION', id: c.id, status, label, by, reason: extra.reason, reviewer: extra.reviewer, patch: extra.patch, detail: extra.detail });
    setModal(null); setReason('');
    notify(extra.toast || `${label} recorded.`);
  };

  // One audit entry per change, labelled with the action (e.g. "Bank Verified") instead of a generic "Updated".
  const patchCustomer = (patch, detail, action = 'Updated') => {
    dispatch({ type: 'UPSERT_CUSTOMER', customer: { ...c, ...patch }, by, detail, action });
  };

  // ---- Workflow actions -------------------------------------------------
  const submit = () => {
    if (errors.length) { notify('Application is incomplete; open Edit to resolve the issues.', 'error'); return; }
    // Same duplicate gate as the form's submit.
    const hard = dupes.filter((d) => d.reasons.some((r) => r !== 'Same business name'));
    if (hard.length && !window.confirm(`Possible duplicate detected (${hard.map((d) => d.customer.code || d.customer.businessName).join(', ')}). Submit anyway for reviewer decision?`)) return;
    transition(STATUS.SUBMITTED, 'Submitted', { detail: hard.length ? `Submitted with ${hard.length} duplicate flag(s)` : 'Submitted for verification', toast: 'Submitted for verification.' });
  };
  const startVerification = () => transition(STATUS.VERIFICATION, 'Verification Started', { reviewer, detail: `Assigned to ${reviewer}` });
  const sendForApproval = () => {
    const unverified = c.documents.filter((d) => d.current && !d.verified);
    if (unverified.length && !window.confirm(`${unverified.length} document(s) are not marked verified. Continue?`)) return;
    // Persist the derived category with the transition (no separate audit entry) so a zero-criteria Low rating is valid.
    transition(STATUS.APPROVAL, 'Verified', { detail: `Verification completed; risk ${riskCat}`, patch: c.risk.category ? undefined : { risk: { ...c.risk, category: riskCat } } });
  };
  const approve = () => transition(STATUS.ACTIVE, 'Approved', { detail: 'Customer activated', toast: 'Customer approved and activated.' });
  const withReason = (kind) => {
    if (!reason.trim()) { notify('A reason is required.', 'error'); return; }
    if (kind === 'return') transition(STATUS.RETURNED, 'Returned for Correction', { reason });
    if (kind === 'reject') transition(STATUS.REJECTED, 'Rejected', { reason });
    if (kind === 'suspend') transition(STATUS.SUSPENDED, 'Suspended', { reason });
    if (kind === 'reinstate') transition(STATUS.ACTIVE, 'Reinstated', { reason });
    // Reopening starts a fresh assessment: clear the rejected run's risk rating and reason.
    if (kind === 'reopen') transition(STATUS.DRAFT, 'Reopened', { reason, patch: { risk: { category: '', score: 0, criteria: [], reason: '', reviewerComment: '' }, statusReason: '' } });
  };
  const completeReview = () => {
    dispatch({ type: 'COMPLETE_REVIEW', id: c.id, by, detail: reason || 'Periodic review completed; details confirmed' });
    setModal(null); setReason(''); notify('Periodic review recorded.');
  };
  const deleteDraft = () => {
    // A coded record (submitted then reopened) can't be discarded: nextCustomerCode would reissue its code.
    if (c.code) { notify(`${c.code} has been issued a customer code and cannot be discarded.`, 'error'); return; }
    if (!window.confirm('Discard this draft application permanently?')) return;
    dispatch({ type: 'DELETE_CUSTOMER', id: c.id, by });
    nav('/kyc/customers');
  };

  // ---- Verification checklist / risk -----------------------------------
  const canVerifyNow = can(role, 'verify') && c.status === STATUS.VERIFICATION;
  const setRisk = (patch) => patchCustomer({ risk: { ...c.risk, ...patch } }, 'Risk assessment updated');
  const toggleCriterion = (key) => {
    const criteria = c.risk.criteria.includes(key) ? c.risk.criteria.filter((k) => k !== key) : [...c.risk.criteria, key];
    const score = computeRiskScore(criteria);
    setRisk({ criteria, score, category: riskFromScore(score) });
  };

  // ---- Credit -----------------------------------------------------------
  const requestCredit = () => {
    if (!(Number(creditForm.requestedLimit) > 0)) { notify('Enter a requested limit greater than zero.', 'error'); return; }
    // A fresh request clears any previous decision so stale approval data cannot show on a new request.
    const fresh = { ...creditForm, status: CREDIT_STATUS.REQUESTED, proposedLimit: '', approvedLimit: '', decisionBy: '', decisionAt: '', decisionNote: '' };
    setCreditForm(fresh);
    dispatch({ type: 'CREDIT_DECISION', id: c.id, by, credit: fresh, detail: `Requested ${fmtMoney(creditForm.requestedLimit)} on ${creditForm.paymentTerms} (${creditForm.requestedCreditDays || 0} credit days)` });
    notify('Credit request submitted.');
  };
  const decideCredit = (status) => {
    if (status === CREDIT_STATUS.APPROVED && !(Number(creditForm.approvedLimit) > 0)) { notify('Enter an approved limit greater than zero.', 'error'); return; }
    const approved = status === CREDIT_STATUS.APPROVED;
    const decision = { ...creditForm, status, decisionBy: by, decisionAt: nowIso(), approvedLimit: approved ? creditForm.approvedLimit : '', proposedLimit: approved ? creditForm.proposedLimit : '', approvedCreditDays: approved ? (creditForm.approvedCreditDays === '' ? termsToDays(creditForm.paymentTerms) : creditForm.approvedCreditDays) : '' };
    setCreditForm(decision);
    dispatch({ type: 'CREDIT_DECISION', id: c.id, by, credit: decision, detail: approved ? `Approved ${fmtMoney(creditForm.approvedLimit)} on ${creditForm.paymentTerms} (${decision.approvedCreditDays} credit days). ${creditForm.decisionNote || ''}` : creditForm.decisionNote || 'Declined' });
    setModal(null); notify(`Credit ${status.toLowerCase()}.`);
  };

  const actions = [];
  if ([STATUS.DRAFT, STATUS.RETURNED].includes(c.status)) {
    if (can(role, 'edit')) actions.push(<Link key="edit" className="btn" to={`/kyc/customers/${c.id}/edit`}>✏️ Edit</Link>);
    if (can(role, 'submit')) actions.push(<button key="submit" className="btn btn-primary" onClick={submit}>Submit for verification</button>);
    if (c.status === STATUS.DRAFT && !c.code && can(role, 'edit')) actions.push(<button key="del" className="btn btn-ghost" onClick={deleteDraft}>Discard draft</button>);
  }
  if (c.status === STATUS.SUBMITTED && can(role, 'verify')) {
    actions.push(<button key="sv" className="btn btn-primary" onClick={() => setModal('assign')}>Start verification</button>);
  }
  if (c.status === STATUS.VERIFICATION && can(role, 'verify')) {
    actions.push(<button key="fa" className="btn btn-primary" onClick={sendForApproval}>Send for approval</button>);
  }
  if (c.status === STATUS.APPROVAL && can(role, 'approve')) {
    actions.push(<button key="ap" className="btn btn-success" onClick={approve}>✓ Approve &amp; activate</button>);
  }
  if ([STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status) && can(role, 'returnForCorrection')) {
    actions.push(<button key="rt" className="btn btn-warn" onClick={() => setModal('return')}>Return for correction</button>);
  }
  if ([STATUS.SUBMITTED, STATUS.VERIFICATION, STATUS.APPROVAL].includes(c.status) && can(role, 'reject')) {
    actions.push(<button key="rj" className="btn btn-danger" onClick={() => setModal('reject')}>Reject</button>);
  }
  if (c.status === STATUS.ACTIVE && can(role, 'suspend')) {
    actions.push(<button key="sp" className="btn btn-danger" onClick={() => setModal('suspend')}>Suspend</button>);
  }
  if (c.status === STATUS.ACTIVE && can(role, 'review')) {
    actions.push(<button key="rv" className="btn" onClick={() => setModal('review')}>Record periodic review</button>);
  }
  if (c.status === STATUS.SUSPENDED && can(role, 'reinstate')) {
    actions.push(<button key="ri" className="btn btn-success" onClick={() => setModal('reinstate')}>Reinstate</button>);
  }
  if (c.status === STATUS.REJECTED && can(role, 'approve')) {
    actions.push(<button key="ro" className="btn" onClick={() => setModal('reopen')}>Reopen as draft</button>);
  }

  const kv = (rows) => (
    <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{c.businessName || '(untitled application)'}</h1>
            <StatusBadge status={c.status} />
            <RiskBadge category={c.risk.category} />
            <CreditBadge status={c.credit.status} />
          </div>
          <p className="sub"><span className="mono">{c.code || 'Draft'}</span> · {typeCfg?.name} · {c.name} · {c.district}, {c.division}</p>
        </div>
        <div className="page-actions">{actions}</div>
      </div>

      <WorkflowSteps status={c.status} />

      {c.statusReason && [STATUS.RETURNED, STATUS.REJECTED, STATUS.SUSPENDED].includes(c.status) && (
        <Alert kind={c.status === STATUS.RETURNED ? 'warn' : 'danger'} title={`${c.status}: reason`}>{c.statusReason}</Alert>
      )}
      {dupes.length > 0 && (
        <Alert kind="warn" title="Duplicate review required">
          <ul>{dupes.map((d) => <li key={d.customer.id}><Link to={`/kyc/customers/${d.customer.id}`}>{d.customer.code || 'Draft'} · {d.customer.businessName}</Link> ({d.customer.status}) — {d.reasons.join(', ')}</li>)}</ul>
        </Alert>
      )}
      {[STATUS.DRAFT, STATUS.RETURNED].includes(c.status) && errors.length > 0 && (
        <Alert kind="info" title={`${errors.length} item(s) outstanding before submission`}>
          <ul>{errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}{errors.length > 6 && <li>…and {errors.length - 6} more</li>}</ul>
        </Alert>
      )}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {TABS.map((t) => <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>)}
        </div>
        <div className="card-body">
          {tab === 'overview' && (
            <div className="grid grid-2">
              <Card title="Customer profile">
                {kv([
                  ['Customer code', c.code], ['Customer type', typeCfg?.name], ['Business name', c.businessName], ['Owner / contact', c.name],
                  ['Business address', c.address], ['Billing address', c.billingAddress || 'Same as business'], ['District / division', `${c.district}, ${c.division}`],
                  ['Mobile', <>{c.mobile} {c.mobileVerified ? <span className="badge badge-green">OTP verified</span> : <span className="badge badge-amber">unverified</span>}</>],
                  ['Alternate mobile', c.altMobile],
                  ['Email', <>{c.email || '—'} {c.email && (c.emailVerified ? <span className="badge badge-green">verified</span> : <span className="badge badge-gray">unverified</span>)}</>],
                  ['Completeness', <div key="pct" className="row"><div style={{ width: 140 }}><Progress value={pct} /></div><span className="small">{pct}%</span></div>],
                ])}
              </Card>
              <Card title="Identity & business verification">
                {kv([
                  ['ID type', c.identity.idType], ['ID number', <span key="id" className="mono">{show(c.identity.idNumber)}</span>], ['Name on ID', c.identity.idName],
                  ['Date of birth', c.identity.dob ? fmtDate(c.identity.dob) : ''], ["Father's / spouse's name", c.identity.fatherName],
                  ['Trade license', c.business.tradeLicenseNo ? `${c.business.tradeLicenseNo}${c.business.tradeLicenseExpiry ? ` (expires ${fmtDate(c.business.tradeLicenseExpiry)})` : ''}` : ''],
                  ['TIN', show(c.business.tin)], ['BIN', show(c.business.bin)], ['Registration', c.business.regNo ? `${c.business.regNo} · ${fmtDate(c.business.regDate)}` : ''],
                  ['Years in business', c.business.yearsInBusiness],
                ])}
                {!sensitive && <p className="small muted mt-8">Identity and tax numbers are masked for your role.</p>}
              </Card>
              <Card title="Outlet location">
                {kv([
                  ['Coordinates', c.location.lat ? <a key="map" href={`https://www.google.com/maps?q=${c.location.lat},${c.location.lng}`} target="_blank" rel="noreferrer">{c.location.lat}, {c.location.lng}</a> : ''],
                  ['Outlet address', c.location.outletAddress], ['Field visit', c.location.visitDate ? `${fmtDate(c.location.visitDate)} by ${c.location.visitedBy || '—'}` : ''],
                  ['Findings', c.location.findings],
                  ['Location verified', c.location.verified ? <span key="lv" className="badge badge-green">Yes</span> : <span key="lv" className="badge badge-gray">Not yet</span>],
                ])}
              </Card>
              <Card title={`Bank / payment accounts (${c.bankAccounts.length})`}>
                {c.bankAccounts.length === 0 ? <p className="muted">No accounts recorded.</p> : (
                  <table>
                    <thead><tr><th>Bank / provider</th><th>Type</th><th>Account</th><th>Purpose</th><th>Status</th></tr></thead>
                    <tbody>{c.bankAccounts.map((b) => (
                      <tr key={b.id}>
                        <td><div className="strong">{b.bankName}{b.primary && <span className="badge badge-blue" style={{ marginLeft: 6 }}>Primary</span>}</div><div className="small muted">{b.branch}{b.routingNo ? ` · RTN ${b.routingNo}` : ''}</div></td>
                        <td className="small">{b.accountType}</td>
                        <td><div className="mono">{show(b.accountNo)}</div><div className="small muted">{b.accountName}</div></td>
                        <td className="small muted">{b.purpose}</td>
                        <td>{b.verified ? <><span className="badge badge-green">Verified</span>{b.verifiedBy && <div className="small muted">by {b.verifiedBy}{b.verifiedAt ? ` · ${fmtDate(b.verifiedAt)}` : ''}</div>}</> : <span className="badge badge-gray">Unverified</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </Card>
              <Card title={`Owners (${c.owners.length})`}>
                {c.owners.length === 0 ? <p className="muted">None recorded.</p> : (
                  <table><thead><tr><th>Name</th><th>ID number</th><th>Share</th><th>Mobile</th></tr></thead>
                    <tbody>{c.owners.map((o) => <tr key={o.id}><td>{o.name}</td><td className="mono">{show(o.idNumber)}</td><td>{o.share ? `${o.share}%` : '—'}</td><td>{o.mobile}</td></tr>)}</tbody></table>
                )}
              </Card>
              <Card title={`Authorised representatives (${c.representatives.length})`}>
                {c.representatives.length === 0 ? <p className="muted">None recorded.</p> : (
                  <table><thead><tr><th>Name</th><th>Designation</th><th>Mobile</th><th>Permissions</th></tr></thead>
                    <tbody>{c.representatives.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.designation}</td><td>{r.mobile}</td><td className="chip-list">{r.canOrder && <span className="chip on">Orders</span>}{r.canPay && <span className="chip on">Payments</span>}</td></tr>)}</tbody></table>
                )}
              </Card>
              <Card title={`References (${c.references.length})`}>
                {c.references.length === 0 ? <p className="muted">None recorded{typeCfg?.minReferences > 0 ? ` (${typeCfg.minReferences} required)` : ''}.</p> : (
                  <>
                    <table><thead><tr><th>Reference</th><th>Type</th><th>Contact</th><th>Outcome</th></tr></thead>
                      <tbody>{c.references.map((r) => (
                        <tr key={r.id}>
                          <td><div className="strong">{r.name}</div><div className="small muted">{[r.designation, r.organisation].filter(Boolean).join(', ')}{r.relationship ? ` · ${r.relationship}` : ''}{r.yearsKnown ? ` · ${r.yearsKnown} yrs` : ''}</div>{r.remarks && <div className="small muted">Remarks: {r.remarks}</div>}</td>
                          <td className="small">{r.type}</td>
                          <td className="small">{r.mobile}{r.email ? <div className="muted">{r.email}</div> : null}</td>
                          <td><span className={`badge ${r.outcome === 'Positive' ? 'badge-green' : r.outcome === 'Negative' ? 'badge-red' : r.outcome === 'Not contacted' || !r.outcome ? 'badge-gray' : 'badge-amber'}`}>{r.outcome || 'Not contacted'}</span>{r.feedback && <div className="small muted">{r.feedback}</div>}</td>
                        </tr>
                      ))}</tbody></table>
                    {(() => { const s = referenceSummary(c.references); return <p className="small muted mt-8">{s.contacted} of {s.total} contacted · {s.positive} positive{s.negative ? ` · ${s.negative} negative` : ''}{s.unreachable ? ` · ${s.unreachable} unreachable` : ''}.</p>; })()}
                  </>
                )}
              </Card>
              <Card title="Review schedule">
                {kv([
                  ['Last reviewed', c.lastReviewed ? fmtDate(c.lastReviewed) : 'Never'],
                  ['Next review due', c.reviewDue ? <>{fmtDate(c.reviewDue)} {daysUntil(c.reviewDue) <= 30 && <span className={`badge ${daysUntil(c.reviewDue) < 0 ? 'badge-red' : 'badge-amber'}`}>{daysUntil(c.reviewDue) < 0 ? 'overdue' : 'due soon'}</span>}</> : 'Set on activation'],
                  ['Review cycle', `${typeCfg?.reviewMonths} months`], ['Assigned reviewer', c.assignedReviewer],
                  ['Created', `${fmtDateTime(c.createdAt)} by ${c.createdBy}`], ['Last updated', fmtDateTime(c.updatedAt)],
                ])}
              </Card>
            </div>
          )}

          {tab === 'business' && (() => {
            const b = c.business;
            const inv = b.investment;
            const ins = businessInsights(c);
            const pct = (v, total) => (total ? Math.round((n(v) / total) * 100) : 0);
            return (
              <div className="stack">
                <div className="grid grid-4">
                  <div className="card stat"><span className="stat-label">Monthly sales volume</span><span className="stat-value">{ins.totalVolume ? ins.totalVolume.toLocaleString() : '—'}</span><span className="stat-hint">{ins.unit}, all brands and suppliers</span></div>
                  <div className={`card stat ${ins.topShare == null ? '' : ins.topShare >= 70 && ins.suppliers.length > 1 ? 'tone-amber' : ins.topShare < 50 ? 'tone-green' : 'tone-blue'}`}><span className="stat-label">Largest supplier share</span><span className="stat-value">{ins.topShare == null ? '—' : `${ins.topShare}%`}</span><span className="stat-hint">{ins.topSupplier ? `${ins.topSupplier.name} · ${ins.suppliers.length} supplier${ins.suppliers.length === 1 ? '' : 's'}` : 'no suppliers recorded'}</span></div>
                  <div className="card stat tone-blue"><span className="stat-label">Capital invested</span><span className="stat-value" style={{ fontSize: 20 }}>{ins.totalInvestment ? fmtMoney(ins.totalInvestment) : '—'}</span><span className="stat-hint">{inv.sourceOfFunds}</span></div>
                  <div className={`card stat ${ins.leverage == null ? '' : ins.leverage > 60 ? 'tone-red' : ins.leverage > 35 ? 'tone-amber' : 'tone-green'}`}><span className="stat-label">Leverage</span><span className="stat-value">{ins.leverage == null ? '—' : `${ins.leverage}%`}</span><span className="stat-hint">{ins.loansOutstanding ? `${fmtMoney(ins.loansOutstanding)} outstanding` : 'no borrowings'}</span></div>
                </div>

                {ins.flags.length > 0 && (
                  <div className="stack" style={{ gap: 8 }}>
                    {ins.flags.map((f) => <div key={f.text} className={`alert alert-${FLAG_KIND[f.tone] || 'info'}`}>{f.text}</div>)}
                  </div>
                )}

                <div className="grid grid-2">
                  <Card title="Business position">
                    {kv([
                      ['Ownership type', b.ownershipType], ['Established', b.establishedYear ? `${b.establishedYear} (${b.yearsInBusiness || '—'} years)` : b.yearsInBusiness ? `${b.yearsInBusiness} years` : ''],
                      ['Employees', b.employees], ['Premises area', b.outletArea ? `${Number(b.outletArea).toLocaleString()} sq ft` : ''],
                      ['Main products / services', b.mainProducts],
                      ['Storage capacity', b.storageCapacity ? `${Number(b.storageCapacity).toLocaleString()} ${ins.unit}` : ''],
                      ['Monthly sales (declared)', b.monthlyVolume ? `${Number(b.monthlyVolume).toLocaleString()} ${ins.unit}` : ''],
                      ['Annual turnover', b.annualTurnover ? fmtMoney(b.annualTurnover) : ''], ['Monthly turnover', ins.monthlyTurnover ? fmtMoney(Math.round(ins.monthlyTurnover)) : ''],
                      ['Delivery vehicles', b.vehicles], ['Resellers served', b.retailersServed], ['Market area', b.marketArea], ['Main customers', b.mainCustomers],
                    ])}
                  </Card>
                  <Card title={`Products & suppliers (${b.brands.length})`}>
                    {b.brands.length === 0 ? <p className="muted">No products or suppliers recorded.</p> : (
                      <>
                        <div className="bar-list mb-16">
                          {[...b.brands].sort((x, y) => n(y.monthlyVolume) - n(x.monthlyVolume)).map((x) => (
                            <div key={x.id} className="bar-row">
                              <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={x.supplier}>{x.brand || x.supplier || '(unnamed)'}</span>
                              <div className="bar"><span style={{ width: `${pct(x.monthlyVolume, ins.totalVolume)}%`, background: ins.topSupplier && (x.supplier || x.brand || 'Unnamed').trim() === ins.topSupplier.name ? 'var(--primary)' : 'var(--gray)' }} /></div>
                              <span className="right mono">{pct(x.monthlyVolume, ins.totalVolume)}%</span>
                            </div>
                          ))}
                        </div>
                        <table>
                          <thead><tr><th>Product / brand</th><th>Supplier</th><th className="right">{ins.unit}/mo</th><th className="right">Years</th><th className="right">Supplier credit</th><th>Terms</th></tr></thead>
                          <tbody>{b.brands.map((x) => (
                            <tr key={x.id}>
                              <td>{x.brand || '(unnamed)'}{x.note && <div className="small muted">{x.note}</div>}</td>
                              <td className="small">{x.supplier || '—'}</td>
                              <td className="right mono">{n(x.monthlyVolume).toLocaleString()}</td>
                              <td className="right">{x.yearsWith || '—'}</td>
                              <td className="right mono">{x.creditLimit ? fmtMoney(x.creditLimit) : '—'}</td>
                              <td>{x.terms}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                        {ins.supplierCredit > 0 && <p className="small muted mt-8">Existing suppliers extend a combined {fmtMoney(ins.supplierCredit)} in credit.</p>}
                      </>
                    )}
                  </Card>
                  <Card title="Investment & financing">
                    {kv([
                      ['Capital invested', inv.capitalInvested ? fmtMoney(inv.capitalInvested) : ''], ['Current stock', inv.stockValue ? `${fmtMoney(inv.stockValue)}${ins.stockMonths != null ? ` (${ins.stockMonths} months of sales)` : ''}` : ''],
                      ['Fixed assets', inv.fixedAssets ? fmtMoney(inv.fixedAssets) : ''], ['Working capital', inv.workingCapital ? fmtMoney(inv.workingCapital) : ''],
                      ['Net worth (est.)', inv.netWorth ? fmtMoney(inv.netWorth) : ''], ['Source of funds', inv.sourceOfFunds],
                      ['Premises', `${inv.premises}${inv.premisesValue ? ` · ${inv.premises === 'Owned' ? 'value' : 'rent'} ${fmtMoney(inv.premisesValue)}` : ''}`],
                    ])}
                    <h4 className="mt-16 mb-8" style={{ fontSize: 13.5 }}>Loans &amp; facilities ({inv.loans.length})</h4>
                    {inv.loans.length === 0 ? <p className="muted small">No borrowings recorded.</p> : (
                      <table>
                        <thead><tr><th>Lender</th><th>Type</th><th className="right">Sanctioned</th><th className="right">Outstanding</th><th className="right">Instalment</th><th>Security</th></tr></thead>
                        <tbody>{inv.loans.map((l) => (
                          <tr key={l.id}><td>{l.lender}<div className="small muted">{l.purpose}</div></td><td className="small">{l.type}</td><td className="right mono">{l.amount ? fmtMoney(l.amount) : '—'}</td><td className="right mono">{fmtMoney(l.outstanding || l.amount)}</td><td className="right mono">{l.monthlyInstalment ? fmtMoney(l.monthlyInstalment) : '—'}</td><td className="small muted">{l.security}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                    {ins.monthlyInstalments > 0 && <p className="small muted mt-8">Monthly debt service {fmtMoney(ins.monthlyInstalments)}{ins.monthlyTurnover ? ` = ${Math.round((ins.monthlyInstalments / ins.monthlyTurnover) * 100)}% of monthly turnover` : ''}.</p>}
                  </Card>
                  <Card title={`Other businesses of the owner (${b.otherBusinesses.length})`}>
                    {b.otherBusinesses.length === 0 ? <p className="muted">None recorded.</p> : (
                      <>
                        <table>
                          <thead><tr><th>Business</th><th>Role</th><th className="right">Investment</th><th className="right">Turnover</th></tr></thead>
                          <tbody>{b.otherBusinesses.map((o) => (
                            <tr key={o.id}><td><div className="strong">{o.name}</div><div className="small muted">{o.nature}{o.location ? ` · ${o.location}` : ''}{o.since ? ` · since ${o.since}` : ''}</div></td><td>{o.role}</td><td className="right mono">{o.investment ? fmtMoney(o.investment) : '—'}</td><td className="right mono">{o.annualTurnover ? fmtMoney(o.annualTurnover) : '—'}</td></tr>
                          ))}</tbody>
                        </table>
                        <div className="row mt-8 small">
                          <span className="chip">Other investments {fmtMoney(ins.otherInvestment)}</span>
                          <span className="chip">Other turnover {fmtMoney(ins.otherTurnover)}</span>
                          {ins.totalInvestment > 0 && <span className="chip">This business = {Math.round((ins.totalInvestment / (ins.totalInvestment + ins.otherInvestment)) * 100)}% of owner's total investment</span>}
                        </div>
                      </>
                    )}
                  </Card>
                </div>
              </div>
            );
          })()}

          {tab === 'verify' && (
            <div className="grid grid-2">
              <Card title="Verification checklist">
                {!canVerifyNow && <p className="small muted mb-16">Editable by a reviewer while the application is in Verification. Current status: {c.status}.</p>}
                <div className="stack" style={{ gap: 10 }}>
                  <label className="check"><input type="checkbox" disabled={!canVerifyNow} checked={c.location.verified} onChange={(e) => patchCustomer({ location: { ...c.location, verified: e.target.checked } }, `Outlet location ${e.target.checked ? 'verified' : 'unverified'}`, 'Location Verified')} /> Outlet location and photographs verified</label>
                  <div className="strong small" style={{ marginTop: 6 }}>Bank / payment accounts ({c.bankAccounts.filter((b) => b.verified).length}/{c.bankAccounts.length} verified)</div>
                  {c.bankAccounts.length === 0 && <span className="small muted">No bank accounts recorded.</span>}
                  {c.bankAccounts.map((b) => (
                    <label key={b.id} className="check" style={{ paddingLeft: 12 }}>
                      <input type="checkbox" disabled={!canVerifyNow} checked={b.verified} onChange={(e) => patchCustomer(
                        { bankAccounts: c.bankAccounts.map((x) => (x.id === b.id ? { ...x, verified: e.target.checked, verifiedBy: e.target.checked ? by : '', verifiedAt: e.target.checked ? nowIso() : '' } : x)) },
                        `${b.bankName} ${b.accountType} ${maskValue(b.accountNo)} ${e.target.checked ? 'verified' : 'unverified'}`,
                        'Bank Verified',
                      )} />
                      {b.bankName} · {b.accountType} · <span className="mono">{show(b.accountNo)}</span>{b.primary && <span className="badge badge-blue">Primary</span>}
                    </label>
                  ))}
                  <label className="check"><input type="checkbox" disabled checked={c.mobileVerified} readOnly /> Mobile verified by OTP</label>
                  <label className="check"><input type="checkbox" disabled checked={c.documents.filter((d) => d.current).length > 0 && c.documents.filter((d) => d.current).every((d) => d.verified)} readOnly /> All current documents verified ({c.documents.filter((d) => d.current && d.verified).length}/{c.documents.filter((d) => d.current).length}) — see Documents tab</label>
                  <label className="check"><input type="checkbox" disabled checked={dupes.length === 0} readOnly /> No unresolved duplicate matches</label>
                  <label className="check"><input type="checkbox" disabled checked={c.references.length >= (typeCfg?.minReferences ?? 0) && referenceSummary(c.references).pending === 0 && c.references.length > 0} readOnly /> References contacted ({referenceSummary(c.references).contacted}/{c.references.length}{typeCfg?.minReferences ? `, min ${typeCfg.minReferences}` : ''})</label>
                </div>
                <h4 className="mt-16 mb-8" style={{ fontSize: 13.5 }}>Reference checks</h4>
                {c.references.length === 0 ? <p className="muted small">No references recorded on the application.</p> : (
                  <div className="stack" style={{ gap: 10 }}>
                    {c.references.map((r) => (
                      <div key={r.id} style={{ padding: 10, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div className="row-between">
                          <div><span className="strong">{r.name}</span> <span className="muted small">· {r.type}{r.organisation ? ` · ${r.organisation}` : ''} · {r.mobile || r.email}</span></div>
                          <select style={{ width: 'auto' }} disabled={!canVerifyNow} value={r.outcome || 'Not contacted'} onChange={(e) => patchCustomer(
                            { references: c.references.map((x) => (x.id === r.id ? { ...x, outcome: e.target.value, contactedBy: e.target.value === 'Not contacted' ? '' : by, contactedAt: e.target.value === 'Not contacted' ? '' : nowIso() } : x)) },
                            `Reference ${r.name} (${r.type}): ${e.target.value}`,
                            'Reference Checked',
                          )}>
                            {REFERENCE_OUTCOMES.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <input className="mt-8" key={`fb-${r.id}-${c.updatedAt}`} placeholder="Feedback from the reference" disabled={!canVerifyNow} defaultValue={r.feedback || ''} onBlur={(e) => e.target.value !== (r.feedback || '') && patchCustomer({ references: c.references.map((x) => (x.id === r.id ? { ...x, feedback: e.target.value } : x)) }, `Reference feedback recorded for ${r.name}`, 'Reference Checked')} />
                        {r.contactedBy && <div className="small muted mt-8">Contacted by {r.contactedBy} on {fmtDateTime(r.contactedAt)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Risk assessment">
                <p className="small muted mb-8">Tick the criteria that apply. Score ≥7 = High, 3–6 = Medium, otherwise Low.</p>
                <div className="stack" style={{ gap: 8 }}>
                  {RISK_CRITERIA.map((r) => (
                    <label key={r.key} className="check">
                      <input type="checkbox" disabled={!canVerifyNow} checked={c.risk.criteria.includes(r.key)} onChange={() => toggleCriterion(r.key)} /> {r.label} <span className="muted small">(+{r.weight})</span>
                    </label>
                  ))}
                </div>
                <div className="row mt-16"><span className="strong">Score: {c.risk.score}</span><RiskBadge category={riskCat} /></div>
                <div className="form-grid mt-16">
                  {/* Free-text fields commit on blur so the audit trail gets one entry per edit, not one per keystroke. */}
                  <Field label="Reason / basis" className="span-2"><textarea key={`reason-${c.updatedAt}`} disabled={!canVerifyNow} defaultValue={c.risk.reason} onBlur={(e) => e.target.value !== c.risk.reason && setRisk({ reason: e.target.value })} /></Field>
                  <Field label="Reviewer comment" className="span-2"><textarea key={`comment-${c.updatedAt}`} disabled={!canVerifyNow} defaultValue={c.risk.reviewerComment} onBlur={(e) => e.target.value !== c.risk.reviewerComment && setRisk({ reviewerComment: e.target.value })} /></Field>
                </div>
              </Card>
            </div>
          )}

          {tab === 'documents' && (
            can(role, 'viewDocuments') ? (
              <DocumentManager
                documents={c.documents}
                requiredDocs={typeCfg?.requiredDocs || []}
                uploadedBy={by}
                verifiedBy={by}
                // Uploads: while drafting, after return, or for renewals on an active customer. Verification: during verification or for renewals.
                canUpload={can(role, 'edit') && ([STATUS.DRAFT, STATUS.RETURNED, STATUS.ACTIVE].includes(c.status) || role === ROLES.ADMIN)}
                canVerify={can(role, 'verify') && [STATUS.VERIFICATION, STATUS.ACTIVE].includes(c.status)}
                onChange={(docs, detail) => patchCustomer({ documents: docs }, detail, 'Document Changed')}
              />
            ) : <Alert kind="warn">Your role cannot view documents.</Alert>
          )}

          {tab === 'credit' && (() => { const ins = businessInsights(c); return (
            <div className="grid grid-2">
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-head"><h3>Business insight for credit decision</h3><button className="btn btn-sm" onClick={() => setTab('business')}>Full business profile</button></div>
                <div className="card-body">
                  <div className="grid grid-3">
                    <div><div className="stat-label">Monthly turnover</div><div className="strong">{ins.monthlyTurnover ? fmtMoney(Math.round(ins.monthlyTurnover)) : '—'}</div></div>
                    <div><div className="stat-label">Requested vs turnover</div><div className="strong">{ins.creditMonths != null ? `${ins.creditMonths} months` : '—'}</div></div>
                    <div><div className="stat-label">Largest supplier</div><div className="strong">{ins.topShare == null ? '—' : `${ins.topShare}%`} <span className="muted small">{ins.topSupplier ? `${ins.topSupplier.name} of ${ins.totalVolume.toLocaleString()} ${ins.unit}` : ''}</span></div></div>
                    <div><div className="stat-label">Existing supplier credit</div><div className="strong">{ins.supplierCredit ? fmtMoney(ins.supplierCredit) : '—'}</div></div>
                    {(() => { const s = referenceSummary(c.references); return (
                      <div><div className="stat-label">References</div><div className="strong">{s.positive}/{s.total} positive{s.negative ? <span className="badge badge-red" style={{ marginLeft: 6 }}>{s.negative} negative</span> : null}{s.pending ? <span className="muted small"> · {s.pending} not yet contacted</span> : null}</div></div>
                    ); })()}
                    <div><div className="stat-label">Leverage</div><div className="strong">{ins.leverage == null ? '—' : `${ins.leverage}%`} <span className="muted small">{ins.loansOutstanding ? `(${fmtMoney(ins.loansOutstanding)})` : ''}</span></div></div>
                  </div>
                  {ins.flags.filter((f) => f.tone !== 'info').length > 0 && (
                    <ul className="mt-16" style={{ margin: '14px 0 0', paddingLeft: 18 }}>
                      {ins.flags.filter((f) => f.tone !== 'info').map((f) => <li key={f.text} className={f.tone === 'danger' ? 'badge-red' : ''} style={{ color: f.tone === 'danger' ? 'var(--danger)' : f.tone === 'warn' ? 'var(--warn)' : 'var(--success)' }}>{f.text}</li>)}
                    </ul>
                  )}
                </div>
              </div>
              <Card title="Credit request">
                <Alert kind="info">KYC approval confirms the customer is verified. Credit approval is a separate decision on whether, and how much, the customer may buy on credit. A decision is only made once the customer is <b>Active</b>.</Alert>
                <div className="form-grid mt-16">
                  <Field label="Requested limit (BDT)" required><input type="number" min="0" disabled={!can(role, 'creditRequest')} value={creditForm.requestedLimit} onChange={(e) => setCreditForm({ ...creditForm, requestedLimit: e.target.value })} /></Field>
                  <Field label="Requested payment terms" hint="Selecting a term fills the credit days; adjust if a different period is agreed."><select disabled={!can(role, 'creditRequest')} value={creditForm.paymentTerms} onChange={(e) => setCreditForm({ ...creditForm, paymentTerms: e.target.value, requestedCreditDays: termsToDays(e.target.value) })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
                  <Field label="Credit days requested" required hint="Days from invoice to payment due."><input type="number" min="0" disabled={!can(role, 'creditRequest')} value={creditForm.requestedCreditDays ?? ''} onChange={(e) => setCreditForm({ ...creditForm, requestedCreditDays: e.target.value })} /></Field>
                  <Field label="Trade / bank references" className="span-2"><textarea disabled={!can(role, 'creditRequest')} value={creditForm.references} onChange={(e) => setCreditForm({ ...creditForm, references: e.target.value })} /></Field>
                  <Field label="Justification" className="span-2"><textarea disabled={!can(role, 'creditRequest')} value={creditForm.justification} onChange={(e) => setCreditForm({ ...creditForm, justification: e.target.value })} /></Field>
                </div>
                {can(role, 'creditRequest') && [CREDIT_STATUS.NONE, CREDIT_STATUS.DECLINED].includes(c.credit.status) && c.status !== STATUS.REJECTED && (
                  <button className="btn btn-primary mt-16" onClick={requestCredit}>Submit credit request</button>
                )}
              </Card>
              <Card title="Credit decision">
                <dl className="kv">
                  <dt>Status</dt><dd><CreditBadge status={c.credit.status} /></dd>
                  <dt>Requested</dt><dd>{fmtMoney(c.credit.requestedLimit)} · {c.credit.paymentTerms} · {c.credit.requestedCreditDays ?? termsToDays(c.credit.paymentTerms)} credit days</dd>
                  <dt>Approved credit days</dt><dd className="strong">{c.credit.approvedCreditDays === '' || c.credit.approvedCreditDays == null ? '—' : `${c.credit.approvedCreditDays} days`}</dd>
                  <dt>Proposed limit</dt><dd>{fmtMoney(c.credit.proposedLimit)}</dd>
                  <dt>Approved limit</dt><dd className="strong">{fmtMoney(c.credit.approvedLimit)}</dd>
                  <dt>Decision</dt><dd>{c.credit.decisionBy ? `${c.credit.decisionBy} · ${fmtDateTime(c.credit.decisionAt)}` : '—'}</dd>
                  <dt>Note</dt><dd>{c.credit.decisionNote || '—'}</dd>
                </dl>
                {can(role, 'creditDecide') && [CREDIT_STATUS.REQUESTED, CREDIT_STATUS.UNDER_REVIEW].includes(c.credit.status) && (
                  c.status === STATUS.ACTIVE
                    ? <button className="btn btn-primary mt-16" onClick={() => { setCreditForm({ ...c.credit, proposedLimit: c.credit.proposedLimit || c.credit.requestedLimit, approvedLimit: c.credit.approvedLimit || c.credit.requestedLimit }); setModal('credit'); }}>Make credit decision</button>
                    : <Alert kind="warn" title="KYC not yet active">Credit can be decided only after KYC approval activates the customer.</Alert>
                )}
              </Card>
            </div>
          ); })()}

          {tab === 'history' && (
            history.length === 0 ? <EmptyState>No history recorded.</EmptyState> : (
              <ul className="timeline">
                {history.map((a) => (
                  <li key={a.id}><span className="when">{fmtDateTime(a.at)}</span><span><b>{a.action}</b> by {a.by}{a.detail && <span className="muted"> — {a.detail}</span>}</span></li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>

      {/* ---- Modals ---- */}
      {modal === 'assign' && (
        <Modal title="Start verification" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={startVerification}>Start</button></>}>
          <Field label="Assign reviewer"><select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>{USERS.filter((u) => [ROLES.REVIEWER, ROLES.ADMIN].includes(u.role)).map((u) => <option key={u.id}>{u.name}</option>)}</select></Field>
          {dupes.length > 0 && <Alert kind="warn">This application has {dupes.length} possible duplicate match(es). Resolve them during verification.</Alert>}
        </Modal>
      )}
      {['return', 'reject', 'suspend', 'reinstate', 'reopen'].includes(modal) && (
        <Modal title={{ return: 'Return for correction', reject: 'Reject application', suspend: 'Suspend customer', reinstate: 'Reinstate customer', reopen: 'Reopen as draft' }[modal]} onClose={() => setModal(null)}
          footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className={`btn ${modal === 'reject' || modal === 'suspend' ? 'btn-danger' : 'btn-primary'}`} onClick={() => withReason(modal)}>Confirm</button></>}>
          <Field label="Reason (recorded in the audit trail and shown to the field officer)" required><textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
      {modal === 'review' && (
        <Modal title="Record periodic review" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={completeReview}>Mark reviewed</button></>}>
          <p>Confirm that identity, business, contact and document details have been re-checked. The next review will be scheduled {typeCfg?.reviewMonths} months from today.</p>
          {errors.length > 0 && <Alert kind="warn" title="Outstanding issues found on this record"><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
          <Field label="Review notes"><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
      {modal === 'credit' && (
        <Modal title="Credit decision" onClose={() => setModal(null)} footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-danger" onClick={() => decideCredit(CREDIT_STATUS.DECLINED)}>Decline</button><button className="btn btn-success" onClick={() => decideCredit(CREDIT_STATUS.APPROVED)}>Approve</button></>}>
          <div className="form-grid">
            <Field label="Requested"><input disabled value={fmtMoney(c.credit.requestedLimit)} /></Field>
            <Field label="Risk category"><input disabled value={c.risk.category || 'Not assessed'} /></Field>
            <Field label="Proposed limit (BDT)"><input type="number" value={creditForm.proposedLimit} onChange={(e) => setCreditForm({ ...creditForm, proposedLimit: e.target.value })} /></Field>
            <Field label="Approved limit (BDT)" required><input type="number" value={creditForm.approvedLimit} onChange={(e) => setCreditForm({ ...creditForm, approvedLimit: e.target.value })} /></Field>
            <Field label="Payment terms"><select value={creditForm.paymentTerms} onChange={(e) => setCreditForm({ ...creditForm, paymentTerms: e.target.value, approvedCreditDays: termsToDays(e.target.value) })}>{PAYMENT_TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Approved credit days" required hint={`Requested: ${creditForm.requestedCreditDays ?? termsToDays(creditForm.paymentTerms)} days`}><input type="number" min="0" value={creditForm.approvedCreditDays === '' || creditForm.approvedCreditDays == null ? termsToDays(creditForm.paymentTerms) : creditForm.approvedCreditDays} onChange={(e) => setCreditForm({ ...creditForm, approvedCreditDays: e.target.value })} /></Field>
            <Field label="Decision note" className="span-2"><textarea value={creditForm.decisionNote} onChange={(e) => setCreditForm({ ...creditForm, decisionNote: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

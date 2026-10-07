import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../../components/DocumentManager';
import { Alert, Field, Progress } from '../../components/ui';
import { ROLES } from '../../data/config';
import { AUDIT_GRADES, COUNTRIES, EXPIRING_SUPPLIER_DOCS, KYS_USERS, SUPPLIER_DOC_TYPES, SUPPLIER_STATUS, SUPPLY_CATEGORIES, canKys } from '../../kys/config';
import { emptyCertification, emptyOwner, emptyPlant, emptyProduct, emptySignatory, emptySupplier, findSupplierDuplicates, supplierCompleteness, supplierInsights, validateSupplier } from '../../kys/helpers';
import { useStore } from '../../store/StoreContext';
import { BANK_ACCOUNT_TYPES, OWNERSHIP_TYPES, REFERENCE_TYPES, VOLUME_UNITS, emptyBankAccount, emptyReference, fmtMoney } from '../../utils/helpers';

const SECTIONS = ['Profile & contact', 'Registration & compliance', 'Capability', 'Financials', 'Bank', 'Ownership & signatories', 'References', 'Site audit', 'Documents'];

export default function SupplierForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const existing = id ? state.suppliers.find((s) => s.id === id) : null;

  const [s, setS] = useState(() => (existing ? structuredClone(existing) : emptySupplier(currentUser.name)));
  const [section, setSection] = useState(0);
  const [errors, setErrors] = useState([]);
  const [otp, setOtp] = useState({ sent: '', entered: '' });

  const typeCfg = state.supplierTypes.find((t) => t.code === s.supplierType);
  const dupes = useMemo(() => findSupplierDuplicates(s, state.suppliers), [s, state.suppliers]);
  const pct = supplierCompleteness(s, typeCfg);
  const ins = supplierInsights(s);

  const editable = !existing || [SUPPLIER_STATUS.DRAFT, SUPPLIER_STATUS.RETURNED].includes(existing.status) || currentUser.role === ROLES.ADMIN;
  const canSubmit = canKys(currentUser.role, 'submit') && (!existing || [SUPPLIER_STATUS.DRAFT, SUPPLIER_STATUS.RETURNED].includes(existing.status));

  useEffect(() => { if (id && !existing) nav('/kys/suppliers'); }, [id, existing, nav]);
  useEffect(() => {
    setS(existing ? structuredClone(existing) : emptySupplier(currentUser.name));
    setSection(0); setErrors([]); setOtp({ sent: '', entered: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (id && !existing) return null;
  if (!editable) {
    return <Alert kind="warn" title="This record cannot be edited">Only applications in Draft or Returned for Correction can be changed. <Link to={`/kys/suppliers/${s.id}`}>Back to the supplier</Link>.</Alert>;
  }

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const setSub = (key, patch) => setS((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const updList = (key, idx, patch) => set({ [key]: s[key].map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
  const rmList = (key, idx) => set({ [key]: s[key].filter((_, i) => i !== idx) });
  const updNested = (parent, key, idx, patch) => setSub(parent, { [key]: s[parent][key].map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
  const rmNested = (parent, key, idx) => setSub(parent, { [key]: s[parent][key].filter((_, i) => i !== idx) });

  const saveDraft = () => {
    dispatch({ type: 'UPSERT_SUPPLIER', supplier: s, by: currentUser.name, detail: existing ? 'Application details updated' : 'Application created as draft' });
    notify('Draft saved.');
    nav(`/kys/suppliers/${s.id}`);
  };
  const submit = () => {
    const errs = validateSupplier(s, typeCfg);
    setErrors(errs);
    if (errs.length) { notify('Please fix the highlighted issues before submitting.', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const hard = dupes.filter((d) => d.reasons.some((r) => r !== 'Same legal name'));
    if (hard.length && !window.confirm(`Possible duplicate detected (${hard.map((d) => d.supplier.code || d.supplier.name).join(', ')}). Submit anyway for evaluator decision?`)) return;
    dispatch({ type: 'UPSERT_SUPPLIER', supplier: s, by: currentUser.name, detail: 'Application details saved' });
    dispatch({ type: 'SUPPLIER_TRANSITION', id: s.id, status: SUPPLIER_STATUS.SUBMITTED, by: currentUser.name, label: 'Submitted', detail: hard.length ? `Submitted with ${hard.length} duplicate flag(s)` : 'Submitted for evaluation' });
    notify('Application submitted for evaluation.');
    nav(`/kys/suppliers/${s.id}`);
  };

  const sendOtp = () => {
    if (!s.mobile.trim()) { notify('Enter the contact mobile number first.', 'error'); return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtp({ sent: code, entered: '' });
    notify(`Demo OTP sent to ${s.mobile}: ${code}`, 'info');
  };
  const confirmOtp = () => {
    if (otp.entered === otp.sent) { set({ mobileVerified: true }); setOtp({ sent: '', entered: '' }); notify('Mobile number verified.'); }
    else notify('OTP does not match.', 'error');
  };

  const r = s.registration; const c = s.compliance; const cap = s.capability; const f = s.financials; const a = s.siteAudit;
  const sectionFlag = (i) => {
    const ok = {
      0: !!s.name && !!s.address && !!s.contactName && !!s.mobile && !!s.email && s.mobileVerified,
      1: !!r.tradeLicenseNo && !!r.tin && c.codeOfConductSigned && c.noSanctionsDeclared && c.noPepDeclared,
      2: cap.categories.length > 0 && cap.products.length > 0 && cap.products.every((p) => !!p.item),
      3: !typeCfg?.requireFinancials || !!f.turnoverY1,
      4: (!typeCfg?.requireBank || s.bankAccounts.some((b) => !!b.accountNo)) && s.bankAccounts.every((b) => !!b.bankName && !!b.accountName && !!b.accountNo) && (s.bankAccounts.length === 0 || s.bankAccounts.some((b) => b.primary)),
      5: s.owners.length > 0 && s.owners.every((o) => !!o.name) && s.signatories.length > 0 && s.signatories.every((o) => !!o.name),
      6: s.references.length >= (typeCfg?.minReferences ?? 0) && s.references.every((x) => x.name && (x.mobile || x.email)),
      7: !typeCfg?.requireSiteAudit || a.done,
      8: (typeCfg?.requiredDocs || []).every((t) => s.documents.some((d) => d.current && d.type === t)),
    }[i];
    return ok ? 'ok' : 'warn';
  };
  const toggleCategory = (cat) => setSub('capability', { categories: cap.categories.includes(cat) ? cap.categories.filter((x) => x !== cat) : [...cap.categories, cat] });

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{existing ? `Edit supplier · ${s.code || s.name || 'Draft'}` : 'New supplier application'}</h1>
          <p className="sub">Fields marked * are mandatory for <b>{typeCfg?.name}</b>. Required documents: {typeCfg?.requiredDocs.join(', ')}.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to={existing ? `/kys/suppliers/${s.id}` : '/kys/suppliers'}>Cancel</Link>
          <button className="btn" onClick={saveDraft}>Save draft</button>
          {canSubmit && <button className="btn btn-primary" onClick={submit}>Save &amp; submit</button>}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}><div style={{ flex: 1 }}><Progress value={pct} /></div><span className="small muted nowrap">{pct}% complete</span></div>

      {errors.length > 0 && <Alert kind="danger" title={`${errors.length} issue(s) must be resolved before submission`}><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
      {dupes.length > 0 && (
        <Alert kind="warn" title="Possible duplicate suppliers">
          <ul>{dupes.map((d) => <li key={d.supplier.id}><Link to={`/kys/suppliers/${d.supplier.id}`} target="_blank">{d.supplier.code || 'Draft'} · {d.supplier.name}</Link> ({d.supplier.status}) — {d.reasons.join(', ')}</li>)}</ul>
        </Alert>
      )}
      {existing?.status === SUPPLIER_STATUS.RETURNED && existing.statusReason && <Alert kind="warn" title="Returned for correction">{existing.statusReason}</Alert>}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {SECTIONS.map((t, i) => <button key={t} className={`tab ${section === i ? 'active' : ''}`} onClick={() => setSection(i)}><span className={`tab-flag ${sectionFlag(i)}`} />{t}</button>)}
        </div>
        <div className="card-body">
          {section === 0 && (
            <div className="form-grid cols-3">
              <Field label="Supplier type" required hint={typeCfg?.description}><select value={s.supplierType} onChange={(e) => set({ supplierType: e.target.value })} disabled={!!s.code}>{state.supplierTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
              <Field label="Supplier code" hint="Assigned automatically on submission."><input value={s.code || ''} disabled placeholder="Auto" /></Field>
              <Field label="Country" required><select value={s.country} onChange={(e) => set({ country: e.target.value })}>{COUNTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
              <Field label="Legal name" required className="span-2"><input value={s.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Trade name (if different)"><input value={s.tradeName} onChange={(e) => set({ tradeName: e.target.value })} /></Field>
              <Field label="Registered address" required className="span-2"><textarea value={s.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              <Field label="City"><input value={s.city} onChange={(e) => set({ city: e.target.value })} /></Field>
              <Field label="Website"><input value={s.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" /></Field>
              <Field label="Primary contact person" required><input value={s.contactName} onChange={(e) => set({ contactName: e.target.value })} /></Field>
              <Field label="Contact designation"><input value={s.contactDesignation} onChange={(e) => set({ contactDesignation: e.target.value })} /></Field>
              <Field label="Contact mobile" required><input value={s.mobile} onChange={(e) => set({ mobile: e.target.value, mobileVerified: false })} placeholder="01XXXXXXXXX or +country code" /></Field>
              <Field label="Contact email" required><input type="email" value={s.email} onChange={(e) => set({ email: e.target.value, emailVerified: false })} /></Field>
              <div className="span-3 card" style={{ background: 'var(--surface-2)' }}><div className="card-body">
                <div className="row-between">
                  <div><div className="strong">Mobile verification: {s.mobile || '—'}</div><div className="small muted">One-time password by SMS (simulated).</div></div>
                  {s.mobileVerified ? <span className="badge badge-green">✓ Verified</span> : <span className="badge badge-amber">Not verified</span>}
                </div>
                {!s.mobileVerified && (
                  <div className="row mt-16">
                    <button className="btn" onClick={sendOtp}>{otp.sent ? 'Resend OTP' : 'Send OTP'}</button>
                    {otp.sent && <><input style={{ width: 140 }} placeholder="6-digit code" value={otp.entered} onChange={(e) => setOtp({ ...otp, entered: e.target.value })} /><button className="btn btn-primary" onClick={confirmOtp}>Confirm</button></>}
                  </div>
                )}
                <div className="row-between mt-16">
                  <div><div className="strong">Email verification: {s.email || '—'}</div><div className="small muted">Verification link (simulated).</div></div>
                  {s.emailVerified ? <span className="badge badge-green">✓ Verified</span> : s.email ? <button className="btn btn-sm" onClick={() => { set({ emailVerified: true }); notify('Email verified.'); }}>Simulate link click</button> : <span className="badge badge-gray">Enter email</span>}
                </div>
              </div></div>
            </div>
          )}

          {section === 1 && (
            <div className="stack" style={{ gap: 22 }}>
              <div>
                <h3 className="mb-8">Registration</h3>
                <div className="form-grid cols-3">
                  <Field label="Ownership type"><select value={r.ownershipType} onChange={(e) => setSub('registration', { ownershipType: e.target.value })}>{OWNERSHIP_TYPES.map((o) => <option key={o}>{o}</option>)}</select></Field>
                  <Field label="Established (year)"><input type="number" min="1900" max="2100" value={r.establishedYear} onChange={(e) => setSub('registration', { establishedYear: e.target.value })} /></Field>
                  <Field label="Years in business"><input type="number" min="0" value={r.yearsInBusiness} onChange={(e) => setSub('registration', { yearsInBusiness: e.target.value })} /></Field>
                  <Field label="Employees"><input type="number" min="0" value={r.employees} onChange={(e) => setSub('registration', { employees: e.target.value })} /></Field>
                  <Field label="Trade license number" required><input value={r.tradeLicenseNo} onChange={(e) => setSub('registration', { tradeLicenseNo: e.target.value })} /></Field>
                  <Field label="Trade license expiry"><input type="date" value={r.tradeLicenseExpiry} onChange={(e) => setSub('registration', { tradeLicenseExpiry: e.target.value })} /></Field>
                  <Field label="TIN" required><input value={r.tin} onChange={(e) => setSub('registration', { tin: e.target.value })} /></Field>
                  <Field label="BIN / VAT registration"><input value={r.bin} onChange={(e) => setSub('registration', { bin: e.target.value })} /></Field>
                  <Field label="Company registration no."><input value={r.regNo} onChange={(e) => setSub('registration', { regNo: e.target.value })} /></Field>
                  <Field label="Registration date"><input type="date" value={r.regDate} onChange={(e) => setSub('registration', { regDate: e.target.value })} /></Field>
                  <Field label="Import registration (IRC) no." hint="Required for traders of imported goods."><input value={r.ircNo} onChange={(e) => setSub('registration', { ircNo: e.target.value })} /></Field>
                  <Field label="IRC expiry"><input type="date" value={r.ircExpiry} onChange={(e) => setSub('registration', { ircExpiry: e.target.value })} /></Field>
                </div>
              </div>
              <div>
                <div className="row-between mb-8">
                  <div><h3>Certifications</h3><p className="small muted">Quality, environmental, safety or product certifications held.</p></div>
                  <button className="btn btn-sm" onClick={() => setSub('compliance', { certifications: [...c.certifications, emptyCertification()] })}>+ Add certification</button>
                </div>
                {c.certifications.length === 0 ? <p className="muted">None recorded.</p> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Certification</th><th>Issuing body</th><th>Certificate no.</th><th>Expiry</th><th></th></tr></thead>
                    <tbody>{c.certifications.map((x, i) => (
                      <tr key={x.id}>
                        <td><input value={x.name} onChange={(e) => updNested('compliance', 'certifications', i, { name: e.target.value })} placeholder="e.g. ISO 9001:2015" /></td>
                        <td><input value={x.issuer} onChange={(e) => updNested('compliance', 'certifications', i, { issuer: e.target.value })} /></td>
                        <td><input value={x.number} onChange={(e) => updNested('compliance', 'certifications', i, { number: e.target.value })} /></td>
                        <td><input type="date" value={x.expiry} onChange={(e) => updNested('compliance', 'certifications', i, { expiry: e.target.value })} /></td>
                        <td><button className="btn btn-sm btn-ghost" onClick={() => rmNested('compliance', 'certifications', i)}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
              <div>
                <h3 className="mb-8">Declarations <span className="req">*</span></h3>
                <div className="stack" style={{ gap: 8 }}>
                  <label className="check"><input type="checkbox" checked={c.codeOfConductSigned} onChange={(e) => setSub('compliance', { codeOfConductSigned: e.target.checked })} /> Supplier code of conduct acknowledged and signed</label>
                  <label className="check"><input type="checkbox" checked={c.noSanctionsDeclared} onChange={(e) => setSub('compliance', { noSanctionsDeclared: e.target.checked })} /> Declares that the company and its owners are not on any sanctions list</label>
                  <label className="check"><input type="checkbox" checked={c.noPepDeclared} onChange={(e) => setSub('compliance', { noPepDeclared: e.target.checked })} /> Declares no owner or director is a politically exposed person (PEP)</label>
                  <label className="check"><input type="checkbox" checked={c.noChildLabourDeclared} onChange={(e) => setSub('compliance', { noChildLabourDeclared: e.target.checked })} /> Declares no child or forced labour in its operations</label>
                  <label className="check"><input type="checkbox" checked={c.environmentalCompliant} onChange={(e) => setSub('compliance', { environmentalCompliant: e.target.checked })} /> Holds valid environmental clearance where applicable</label>
                </div>
                <div className="form-grid mt-16"><Field label="Conflict of interest / related-party disclosure" className="span-2" hint="Any relationship with our employees or directors."><input value={c.conflictOfInterest} onChange={(e) => setSub('compliance', { conflictOfInterest: e.target.value })} placeholder="None" /></Field></div>
              </div>
            </div>
          )}

          {section === 2 && (
            <div className="stack" style={{ gap: 22 }}>
              <div>
                <h3 className="mb-8">Supply categories <span className="req">*</span></h3>
                <div className="chip-list">{SUPPLY_CATEGORIES.map((cat) => <label key={cat} className={`chip ${cap.categories.includes(cat) ? 'on' : ''}`} style={{ cursor: 'pointer' }}><input type="checkbox" style={{ display: 'none' }} checked={cap.categories.includes(cat)} onChange={() => toggleCategory(cat)} />{cap.categories.includes(cat) ? '✓ ' : ''}{cat}</label>)}</div>
              </div>
              <div>
                <div className="row-between mb-8">
                  <div><h3>Products / services offered <span className="req">*</span></h3><p className="small muted">Capacity, the share we would take, lead time and indicative pricing.</p></div>
                  <button className="btn btn-sm" onClick={() => setSub('capability', { products: [...cap.products, emptyProduct()] })}>+ Add item</button>
                </div>
                {cap.products.length === 0 ? <p className="muted">None recorded.</p> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>Item / service</th><th>Category</th><th>Unit</th><th>Monthly capacity</th><th>Committed to us / month</th><th>Lead time (days)</th><th>Min. order</th><th>Unit price (BDT)</th><th></th></tr></thead>
                    <tbody>{cap.products.map((p, i) => (
                      <tr key={p.id}>
                        <td style={{ minWidth: 170 }}><input value={p.item} onChange={(e) => updNested('capability', 'products', i, { item: e.target.value })} /></td>
                        <td><select value={p.category} onChange={(e) => updNested('capability', 'products', i, { category: e.target.value })}>{SUPPLY_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></td>
                        <td><select value={p.unit} onChange={(e) => updNested('capability', 'products', i, { unit: e.target.value })}>{VOLUME_UNITS.map((x) => <option key={x}>{x}</option>)}</select></td>
                        <td><input type="number" min="0" value={p.monthlyCapacity} onChange={(e) => updNested('capability', 'products', i, { monthlyCapacity: e.target.value })} /></td>
                        <td><input type="number" min="0" value={p.committedToUs} onChange={(e) => updNested('capability', 'products', i, { committedToUs: e.target.value })} /></td>
                        <td><input type="number" min="0" value={p.leadTimeDays} onChange={(e) => updNested('capability', 'products', i, { leadTimeDays: e.target.value })} /></td>
                        <td><input type="number" min="0" value={p.minOrder} onChange={(e) => updNested('capability', 'products', i, { minOrder: e.target.value })} /></td>
                        <td><input type="number" min="0" value={p.unitPrice} onChange={(e) => updNested('capability', 'products', i, { unitPrice: e.target.value })} /></td>
                        <td><button className="btn btn-sm btn-ghost" onClick={() => rmNested('capability', 'products', i)}>✕</button></td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
                {ins.capacity > 0 && <div className="row mt-8 small"><span className="chip">Capacity {ins.capacity.toLocaleString()} / month</span><span className="chip on">Committed to us {ins.utilisation}%</span>{ins.avgLead != null && <span className="chip">Avg lead time {ins.avgLead} days</span>}</div>}
              </div>
              <div>
                <div className="row-between mb-8">
                  <div><h3>Plants, warehouses &amp; fleet</h3><p className="small muted">Facilities the supplier operates from.</p></div>
                  <button className="btn btn-sm" onClick={() => setSub('capability', { plants: [...cap.plants, emptyPlant()] })}>+ Add facility</button>
                </div>
                {cap.plants.map((p, i) => (
                  <div key={p.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10 }}>
                    <Field label="Facility name"><input value={p.name} onChange={(e) => updNested('capability', 'plants', i, { name: e.target.value })} /></Field>
                    <Field label="Location"><input value={p.location} onChange={(e) => updNested('capability', 'plants', i, { location: e.target.value })} /></Field>
                    <Field label="Capacity / size"><input value={p.capacity} onChange={(e) => updNested('capability', 'plants', i, { capacity: e.target.value })} /></Field>
                    <Field label="Tenure"><select value={p.ownedOrRented} onChange={(e) => updNested('capability', 'plants', i, { ownedOrRented: e.target.value })}>{['Owned', 'Leased', 'Rented'].map((x) => <option key={x}>{x}</option>)}</select></Field>
                    <div className="field span-2" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => rmNested('capability', 'plants', i)}>Remove</button></div>
                  </div>
                ))}
              </div>
              <div className="form-grid">
                <Field label="Major clients" className="span-2"><input value={cap.majorClients} onChange={(e) => setSub('capability', { majorClients: e.target.value })} placeholder="Notable customers served" /></Field>
                <Field label="Export markets"><input value={cap.exportMarkets} onChange={(e) => setSub('capability', { exportMarkets: e.target.value })} /></Field>
                <Field label="Quality control process"><input value={cap.qualityProcess} onChange={(e) => setSub('capability', { qualityProcess: e.target.value })} placeholder="Inspection, testing, traceability" /></Field>
              </div>
            </div>
          )}

          {section === 3 && (
            <div className="stack">
              <div className="form-grid cols-3">
                <Field label="Turnover, latest year (BDT)" required={typeCfg?.requireFinancials}><input type="number" min="0" value={f.turnoverY1} onChange={(e) => setSub('financials', { turnoverY1: e.target.value })} /></Field>
                <Field label="Turnover, previous year (BDT)"><input type="number" min="0" value={f.turnoverY2} onChange={(e) => setSub('financials', { turnoverY2: e.target.value })} /></Field>
                <Field label="Turnover, two years ago (BDT)"><input type="number" min="0" value={f.turnoverY3} onChange={(e) => setSub('financials', { turnoverY3: e.target.value })} /></Field>
                <Field label="Net worth (BDT)"><input type="number" min="0" value={f.netWorth} onChange={(e) => setSub('financials', { netWorth: e.target.value })} /></Field>
                <Field label="Paid-up capital (BDT)"><input type="number" min="0" value={f.paidUpCapital} onChange={(e) => setSub('financials', { paidUpCapital: e.target.value })} /></Field>
                <Field label="Loans outstanding (BDT)"><input type="number" min="0" value={f.loansOutstanding} onChange={(e) => setSub('financials', { loansOutstanding: e.target.value })} /></Field>
                <Field label="Audited by"><input value={f.auditedBy} onChange={(e) => setSub('financials', { auditedBy: e.target.value })} placeholder="Audit firm" /></Field>
                <Field label="Last audited year"><input type="number" min="1990" max="2100" value={f.lastAuditedYear} onChange={(e) => setSub('financials', { lastAuditedYear: e.target.value })} /></Field>
                <Field label="Insurance cover"><input value={f.insuranceCover} onChange={(e) => setSub('financials', { insuranceCover: e.target.value })} placeholder="Type and sum insured" /></Field>
              </div>
              <div className="row small">
                {ins.growth != null && <span className={`chip ${ins.growth < -10 ? 'badge-red' : ''}`}>Latest-year growth {ins.growth}%</span>}
                {ins.leverage != null && <span className={`chip ${ins.leverage > 100 ? 'badge-red' : ''}`}>Leverage {ins.leverage}% of net worth</span>}
                {f.turnoverY1 && <span className="chip">Turnover {fmtMoney(f.turnoverY1)}</span>}
              </div>
              <Alert kind="info">Upload audited financial statements and a recent bank statement under <b>Documents</b>. The evaluator reconciles these figures against them.</Alert>
            </div>
          )}

          {section === 4 && (
            <div className="stack">
              <div className="row-between">
                <div><h3>Bank accounts {typeCfg?.requireBank && <span className="req">*</span>}</h3><p className="small muted">Accounts we will pay into. Exactly one must be primary.</p></div>
                <button className="btn btn-sm" onClick={() => set({ bankAccounts: [...s.bankAccounts, emptyBankAccount(s.bankAccounts.length === 0)] })}>+ Add account</button>
              </div>
              {s.bankAccounts.length === 0 && <p className="muted">No accounts recorded.</p>}
              {s.bankAccounts.map((b, i) => {
                const isWallet = b.accountType.startsWith('Mobile Wallet');
                const upd = (patch) => set({ bankAccounts: s.bankAccounts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={b.id} style={{ padding: 14, border: `1px solid ${b.primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: b.primary ? 'var(--primary-soft)' : 'var(--surface)' }}>
                    <div className="row-between mb-8">
                      <div className="row" style={{ gap: 8 }}><span className="strong">Account {i + 1}</span>{b.primary ? <span className="badge badge-blue">Primary</span> : <button className="btn-link small" onClick={() => set({ bankAccounts: s.bankAccounts.map((x, k) => ({ ...x, primary: k === i })) })}>Make primary</button>}{b.verified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-gray">Unverified</span>}</div>
                      <button className="btn btn-sm btn-ghost" onClick={() => { const next = s.bankAccounts.filter((_, k) => k !== i); if (next.length && !next.some((x) => x.primary)) next[0] = { ...next[0], primary: true }; set({ bankAccounts: next }); }}>Remove</button>
                    </div>
                    <div className="form-grid cols-3">
                      <Field label="Account type" required><select value={b.accountType} onChange={(e) => upd({ accountType: e.target.value, verified: false })}>{BANK_ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                      <Field label={isWallet ? 'Wallet provider' : 'Bank name'} required><input value={b.bankName} onChange={(e) => upd({ bankName: e.target.value, verified: false })} /></Field>
                      <Field label="Branch"><input value={b.branch} disabled={isWallet} onChange={(e) => upd({ branch: e.target.value })} /></Field>
                      <Field label="Account name" required><input value={b.accountName} onChange={(e) => upd({ accountName: e.target.value, verified: false })} /></Field>
                      <Field label={isWallet ? 'Wallet number' : 'Account number'} required><input value={b.accountNo} onChange={(e) => upd({ accountNo: e.target.value, verified: false })} /></Field>
                      <Field label="Routing / SWIFT"><input value={b.routingNo} disabled={isWallet} onChange={(e) => upd({ routingNo: e.target.value })} /></Field>
                      <Field label="Purpose" className="span-3"><input value={b.purpose} onChange={(e) => upd({ purpose: e.target.value })} placeholder="e.g. Supplier payments, LC settlements" /></Field>
                    </div>
                  </div>
                );
              })}
              <Alert kind="info">The evaluator verifies each account against the bank statement or a bank confirmation letter. Changing details clears verification.</Alert>
            </div>
          )}

          {section === 5 && (
            <div className="stack">
              <div className="row-between"><div><h3>Owners &amp; directors <span className="req">*</span></h3><p className="small muted">Beneficial ownership with share percentages.</p></div><button className="btn btn-sm" onClick={() => set({ owners: [...s.owners, emptyOwner()] })}>+ Add owner / director</button></div>
              {s.owners.length === 0 && <p className="muted">None recorded.</p>}
              {s.owners.map((o, i) => (
                <div key={o.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Field label="Name" required><input value={o.name} onChange={(e) => updList('owners', i, { name: e.target.value })} /></Field>
                  <Field label="Designation"><input value={o.designation} onChange={(e) => updList('owners', i, { designation: e.target.value })} /></Field>
                  <Field label="NID / passport"><input value={o.idNumber} onChange={(e) => updList('owners', i, { idNumber: e.target.value })} /></Field>
                  <Field label="Nationality"><select value={o.nationality} onChange={(e) => updList('owners', i, { nationality: e.target.value })}>{COUNTRIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                  <Field label="Ownership share %"><input type="number" min="0" max="100" value={o.share} onChange={(e) => updList('owners', i, { share: e.target.value })} /></Field>
                  <div className="field" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => rmList('owners', i)}>Remove</button></div>
                </div>
              ))}
              <div className="row-between mt-16"><div><h3>Authorised signatories <span className="req">*</span></h3><p className="small muted">Persons who may quote, sign contracts and issue invoices.</p></div><button className="btn btn-sm" onClick={() => set({ signatories: [...s.signatories, emptySignatory()] })}>+ Add signatory</button></div>
              {s.signatories.length === 0 && <p className="muted">None recorded.</p>}
              {s.signatories.map((x, i) => (
                <div key={x.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Field label="Name" required><input value={x.name} onChange={(e) => updList('signatories', i, { name: e.target.value })} /></Field>
                  <Field label="Designation"><input value={x.designation} onChange={(e) => updList('signatories', i, { designation: e.target.value })} /></Field>
                  <Field label="Mobile"><input value={x.mobile} onChange={(e) => updList('signatories', i, { mobile: e.target.value })} /></Field>
                  <Field label="Email"><input type="email" value={x.email} onChange={(e) => updList('signatories', i, { email: e.target.value })} /></Field>
                  <label className="check"><input type="checkbox" checked={x.canQuote} onChange={(e) => updList('signatories', i, { canQuote: e.target.checked })} /> May quote and sign contracts</label>
                  <label className="check"><input type="checkbox" checked={x.canInvoice} onChange={(e) => updList('signatories', i, { canInvoice: e.target.checked })} /> May issue invoices</label>
                  <div className="field span-3" style={{ alignItems: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => rmList('signatories', i)}>Remove</button></div>
                </div>
              ))}
            </div>
          )}

          {section === 6 && (
            <div className="stack">
              <div className="row-between">
                <div><h3>References {typeCfg?.minReferences > 0 && <span className="req">*</span>}</h3><p className="small muted">Existing customers, bankers or partners who can vouch for the supplier. {typeCfg?.minReferences > 0 ? `At least ${typeCfg.minReferences} required for ${typeCfg.name}.` : 'Optional for this type.'} The evaluator contacts each one.</p></div>
                <button className="btn btn-sm" onClick={() => set({ references: [...s.references, emptyReference()] })}>+ Add reference</button>
              </div>
              {s.references.length === 0 && <p className="muted">No references recorded.</p>}
              {s.references.map((x, i) => (
                <div key={x.id} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div className="row-between mb-8"><div className="row" style={{ gap: 8 }}><span className="strong">Reference {i + 1}</span>{x.outcome && x.outcome !== 'Not contacted' && <span className={`badge ${x.outcome === 'Positive' ? 'badge-green' : x.outcome === 'Negative' ? 'badge-red' : 'badge-amber'}`}>{x.outcome}</span>}</div><button className="btn btn-sm btn-ghost" onClick={() => rmList('references', i)}>Remove</button></div>
                  <div className="form-grid cols-3">
                    <Field label="Reference type" required><select value={x.type} onChange={(e) => updList('references', i, { type: e.target.value })}>{REFERENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                    <Field label="Contact person" required><input value={x.name} onChange={(e) => updList('references', i, { name: e.target.value })} /></Field>
                    <Field label="Organisation"><input value={x.organisation} onChange={(e) => updList('references', i, { organisation: e.target.value })} /></Field>
                    <Field label="Designation"><input value={x.designation} onChange={(e) => updList('references', i, { designation: e.target.value })} /></Field>
                    <Field label="Mobile" hint="Mobile or email is required."><input value={x.mobile} onChange={(e) => updList('references', i, { mobile: e.target.value })} /></Field>
                    <Field label="Email"><input type="email" value={x.email} onChange={(e) => updList('references', i, { email: e.target.value })} /></Field>
                    <Field label="Relationship to supplier"><input value={x.relationship} onChange={(e) => updList('references', i, { relationship: e.target.value })} /></Field>
                    <Field label="Years known"><input type="number" min="0" value={x.yearsKnown} onChange={(e) => updList('references', i, { yearsKnown: e.target.value })} /></Field>
                    <Field label="Remarks"><input value={x.remarks} onChange={(e) => updList('references', i, { remarks: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 7 && (
            <div className="stack">
              <Alert kind="info">{typeCfg?.requireSiteAudit ? 'A site audit is mandatory for this supplier type.' : 'A site audit is optional for this supplier type but strengthens the evaluation.'} Record the visit findings here and upload photographs under Documents.</Alert>
              <label className="check"><input type="checkbox" checked={a.done} onChange={(e) => setSub('siteAudit', { done: e.target.checked })} /> Site audit conducted</label>
              {a.done && (
                <div className="form-grid cols-3">
                  <Field label="Audit date" required><input type="date" value={a.date} onChange={(e) => setSub('siteAudit', { date: e.target.value })} /></Field>
                  <Field label="Auditor"><select value={a.auditor} onChange={(e) => setSub('siteAudit', { auditor: e.target.value })}><option value="">—</option>{KYS_USERS.map((u) => <option key={u.id}>{u.name}</option>)}</select></Field>
                  <Field label="Score (0–100)"><input type="number" min="0" max="100" value={a.score} onChange={(e) => setSub('siteAudit', { score: e.target.value })} /></Field>
                  <Field label="Grade"><select value={a.grade} onChange={(e) => setSub('siteAudit', { grade: e.target.value })}><option value="">—</option>{AUDIT_GRADES.map((g) => <option key={g}>{g}</option>)}</select></Field>
                  <Field label="Findings" className="span-3"><textarea value={a.findings} onChange={(e) => setSub('siteAudit', { findings: e.target.value })} placeholder="Facilities, equipment, housekeeping, safety, quality control, capacity observed" /></Field>
                  <Field label="Corrective actions required" className="span-2"><textarea value={a.correctiveActions} onChange={(e) => setSub('siteAudit', { correctiveActions: e.target.value })} /></Field>
                  <Field label="Corrective action due date"><input type="date" value={a.dueDate} onChange={(e) => setSub('siteAudit', { dueDate: e.target.value })} /></Field>
                  <label className="check span-3"><input type="checkbox" checked={a.closed} onChange={(e) => setSub('siteAudit', { closed: e.target.checked })} /> Corrective actions closed</label>
                </div>
              )}
            </div>
          )}

          {section === 8 && (
            <DocumentManager
              documents={s.documents}
              requiredDocs={typeCfg?.requiredDocs || []}
              docTypes={Object.values(SUPPLIER_DOC_TYPES)}
              expiringTypes={EXPIRING_SUPPLIER_DOCS}
              uploadedBy={currentUser.name}
              onChange={(docs) => set({ documents: docs })}
            />
          )}
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <button className="btn" disabled={section === 0} onClick={() => setSection((x) => x - 1)}>← Previous</button>
          <div className="row">
            <button className="btn" onClick={saveDraft}>Save draft</button>
            {section < SECTIONS.length - 1 ? <button className="btn btn-primary" onClick={() => setSection((x) => x + 1)}>Next →</button> : canSubmit ? <button className="btn btn-primary" onClick={submit}>Save &amp; submit</button> : <button className="btn btn-primary" onClick={saveDraft}>Save changes</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

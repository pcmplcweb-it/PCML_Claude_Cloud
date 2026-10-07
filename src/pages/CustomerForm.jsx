import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DocumentManager from '../components/DocumentManager';
import { Alert, Field, Progress } from '../components/ui';
import { DIVISIONS, DOC_TYPES, ROLES, STATUS, USERS, can } from '../data/config';
import { useStore } from '../store/StoreContext';
import { BANK_ACCOUNT_TYPES, FUND_SOURCES, OWNERSHIP_TYPES, PREMISES_TYPES, REFERENCE_TYPES, VOLUME_UNITS, businessInsights, completeness, daysUntil, emptyBankAccount, emptyBrand, emptyCustomer, emptyLoan, emptyOtherBusiness, emptyReference, findDuplicates, fmtMoney, normalizePhone, uid, validateCustomer } from '../utils/helpers';

const SECTIONS = ['Profile', 'Identity', 'Business', 'Contact verification', 'Location', 'Bank', 'Owners & representatives', 'References', 'Documents'];

export default function CustomerForm() {
  const { id } = useParams();
  const nav = useNavigate();
  const { state, dispatch, currentUser, notify } = useStore();
  const existing = id ? state.customers.find((c) => c.id === id) : null;

  const [c, setC] = useState(() => (existing ? structuredClone(existing) : emptyCustomer(currentUser.name)));
  const [section, setSection] = useState(0);
  const [errors, setErrors] = useState([]);
  const [otp, setOtp] = useState({ sent: '', entered: '' });
  const [bizTab, setBizTab] = useState('reg');

  const typeCfg = state.customerTypes.find((t) => t.code === c.customerType);
  const dupes = useMemo(() => findDuplicates(c, state.customers), [c, state.customers]);
  const pct = completeness(c, typeCfg);

  const editable = !existing || [STATUS.DRAFT, STATUS.RETURNED].includes(existing.status) || currentUser.role === ROLES.ADMIN;
  // Submission is only possible from Draft / Returned and only for roles with the submit permission (Admin edits of later statuses are corrections, not resubmissions).
  const canSubmit = can(currentUser.role, 'submit') && (!existing || [STATUS.DRAFT, STATUS.RETURNED].includes(existing.status));

  useEffect(() => {
    if (id && !existing) nav('/kyc/customers');
  }, [id, existing, nav]);

  // Reload the draft when the route changes (e.g. from /customers/new to /customers/:id/edit) so no stale state carries over.
  useEffect(() => {
    setC(existing ? structuredClone(existing) : emptyCustomer(currentUser.name));
    setSection(0);
    setErrors([]);
    setOtp({ sent: '', entered: '' });
    setBizTab('reg');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (id && !existing) return null;

  if (!editable) {
    return (
      <Alert kind="warn" title="This record cannot be edited">
        Only applications in Draft or Returned for Correction can be changed. <Link to={`/kyc/customers/${c.id}`}>Back to the customer</Link>.
      </Alert>
    );
  }

  const set = (patch) => setC((prev) => ({ ...prev, ...patch }));
  const setSub = (key, patch) => setC((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const saveDraft = () => {
    dispatch({ type: 'UPSERT_CUSTOMER', customer: c, by: currentUser.name, detail: existing ? 'Application details updated' : 'Application created as draft' });
    notify('Draft saved.');
    nav(`/kyc/customers/${c.id}`);
  };

  const submit = () => {
    const errs = validateCustomer(c, typeCfg);
    setErrors(errs);
    if (errs.length) { notify('Please fix the highlighted issues before submitting.', 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const hard = dupes.filter((d) => d.reasons.some((r) => r !== 'Same business name'));
    if (hard.length && !window.confirm(`Possible duplicate detected (${hard.map((d) => d.customer.code || d.customer.businessName).join(', ')}). Submit anyway for reviewer decision?`)) return;
    dispatch({ type: 'UPSERT_CUSTOMER', customer: c, by: currentUser.name, detail: 'Application details saved' });
    dispatch({ type: 'TRANSITION', id: c.id, status: STATUS.SUBMITTED, by: currentUser.name, label: 'Submitted', detail: hard.length ? `Submitted with ${hard.length} duplicate flag(s)` : 'Submitted for verification' });
    notify('Application submitted for verification.');
    nav(`/kyc/customers/${c.id}`);
  };

  // ---- OTP simulation ----
  const sendOtp = () => {
    if (!/^01[0-9]{9}$/.test(normalizePhone(c.mobile))) { notify('Enter a valid mobile number first.', 'error'); return; }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setOtp({ sent: code, entered: '' });
    notify(`Demo OTP sent to ${c.mobile}: ${code}`, 'info');
  };
  const confirmOtp = () => {
    if (otp.entered === otp.sent) { set({ mobileVerified: true }); setOtp({ sent: '', entered: '' }); notify('Mobile number verified.'); }
    else notify('OTP does not match.', 'error');
  };

  const addOwner = () => set({ owners: [...c.owners, { id: uid('own'), name: c.owners.length ? '' : c.identity.idName || c.name, idNumber: c.owners.length ? '' : c.identity.idNumber, share: c.owners.length ? '' : 100, mobile: c.owners.length ? '' : c.mobile }] });
  const addRep = () => set({ representatives: [...c.representatives, { id: uid('rep'), name: '', designation: '', mobile: '', canOrder: true, canPay: false }] });
  const updList = (key, idx, patch) => set({ [key]: c[key].map((o, i) => (i === idx ? { ...o, ...patch } : o)) });
  const rmList = (key, idx) => set({ [key]: c[key].filter((_, i) => i !== idx) });

  const sectionFlag = (i) => {
    const ok = {
      0: !!c.name && !!c.businessName && !!c.address && !!c.district,
      1: !!c.identity.idNumber && !!c.identity.idName,
      2: !typeCfg?.requireBusinessReg || (!!c.business.tradeLicenseNo && !!c.business.tin),
      3: c.mobileVerified,
      4: !typeCfg?.requireLocation || (!!c.location.lat && !!c.location.lng),
      // Each flag mirrors the corresponding validateCustomer rule.
      5: (!typeCfg?.requireBank || c.bankAccounts.some((b) => !!b.accountNo))
        && c.bankAccounts.every((b) => !!b.bankName && !!b.accountName && !!b.accountNo)
        && (c.bankAccounts.length === 0 || c.bankAccounts.some((b) => b.primary)),
      6: c.owners.length > 0 && c.owners.every((o) => !!o.name) && c.representatives.every((r) => !!r.name),
      7: c.references.length >= (typeCfg?.minReferences ?? 0) && c.references.every((r) => r.name && (r.mobile || r.email)),
      8: (typeCfg?.requiredDocs || []).every((t) => c.documents.some((d) => d.current && d.type === t))
        && !c.documents.some((d) => d.current && d.expiry && daysUntil(d.expiry) < 0),
    }[i];
    return ok ? 'ok' : 'warn';
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{existing ? `Edit application · ${c.code || c.businessName || 'Draft'}` : 'New customer application'}</h1>
          <p className="sub">Fields marked * are mandatory for <b>{typeCfg?.name}</b>. Required documents: {typeCfg?.requiredDocs.join(', ')}.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" to={existing ? `/kyc/customers/${c.id}` : '/kyc/customers'}>Cancel</Link>
          <button className="btn" onClick={saveDraft}>Save draft</button>
          {canSubmit && <button className="btn btn-primary" onClick={submit}>Save &amp; submit</button>}
        </div>
      </div>

      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}><Progress value={pct} /></div>
        <span className="small muted nowrap">{pct}% complete</span>
      </div>

      {errors.length > 0 && (
        <Alert kind="danger" title={`${errors.length} issue(s) must be resolved before submission`}>
          <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
        </Alert>
      )}

      {dupes.length > 0 && (
        <Alert kind="warn" title="Possible duplicate records">
          <ul>
            {dupes.map((d) => (
              <li key={d.customer.id}>
                <Link to={`/kyc/customers/${d.customer.id}`} target="_blank">{d.customer.code || 'Draft'} · {d.customer.businessName}</Link> ({d.customer.status}) — {d.reasons.join(', ')}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {existing?.status === STATUS.RETURNED && existing.statusReason && (
        <Alert kind="warn" title="Returned for correction">{existing.statusReason}</Alert>
      )}

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          {SECTIONS.map((s, i) => (
            <button key={s} className={`tab ${section === i ? 'active' : ''}`} onClick={() => setSection(i)}>
              <span className={`tab-flag ${sectionFlag(i)}`} />{s}
            </button>
          ))}
        </div>
        <div className="card-body">
          {section === 0 && (
            <div className="form-grid">
              <Field label="Customer type" required hint={typeCfg?.description}>
                <select value={c.customerType} onChange={(e) => set({ customerType: e.target.value })} disabled={!!c.code}>
                  {state.customerTypes.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Customer code" hint="Assigned automatically on submission.">
                <input value={c.code || ''} disabled placeholder="Auto" />
              </Field>
              <Field label="Business name" required><input value={c.businessName} onChange={(e) => set({ businessName: e.target.value })} /></Field>
              <Field label="Owner / contact name" required><input value={c.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Division" required>
                <select value={c.division} onChange={(e) => set({ division: e.target.value })}>{DIVISIONS.map((d) => <option key={d}>{d}</option>)}</select>
              </Field>
              <Field label="District" required><input value={c.district} onChange={(e) => set({ district: e.target.value })} /></Field>
              <Field label="Business address" required className="span-2"><textarea value={c.address} onChange={(e) => set({ address: e.target.value })} /></Field>
              <Field label="Billing address" className="span-2" hint="Leave blank if same as business address.">
                <textarea value={c.billingAddress} onChange={(e) => set({ billingAddress: e.target.value })} />
              </Field>
              <Field label="Mobile number" required hint="Verified under Contact verification."><input value={c.mobile} onChange={(e) => set({ mobile: e.target.value, mobileVerified: false })} placeholder="01XXXXXXXXX" /></Field>
              <Field label="Alternate mobile"><input value={c.altMobile} onChange={(e) => set({ altMobile: e.target.value })} /></Field>
              <Field label="Email"><input type="email" value={c.email} onChange={(e) => set({ email: e.target.value, emailVerified: false })} /></Field>
            </div>
          )}

          {section === 1 && (
            <div className="form-grid">
              <Field label="Identity document type" required>
                <select value={c.identity.idType} onChange={(e) => setSub('identity', { idType: e.target.value })}>
                  <option>{DOC_TYPES.NID}</option><option>{DOC_TYPES.PASSPORT}</option>
                </select>
              </Field>
              <Field label="Identity number" required><input value={c.identity.idNumber} onChange={(e) => setSub('identity', { idNumber: e.target.value })} /></Field>
              <Field label="Name as on document" required><input value={c.identity.idName} onChange={(e) => setSub('identity', { idName: e.target.value })} /></Field>
              <Field label="Date of birth"><input type="date" value={c.identity.dob} onChange={(e) => setSub('identity', { dob: e.target.value })} /></Field>
              <Field label="Father's / spouse's name"><input value={c.identity.fatherName} onChange={(e) => setSub('identity', { fatherName: e.target.value })} /></Field>
              <div className="span-2"><Alert kind="info">Upload a scan of the identity document under the <b>Documents</b> section. The reviewer will match the number and name against the scan.</Alert></div>
            </div>
          )}

          {section === 2 && (() => {
            const b = c.business;
            const inv = b.investment;
            const setB = (patch) => setSub('business', patch);
            const setInv = (patch) => setB({ investment: { ...inv, ...patch } });
            const updBrand = (i, patch) => setB({ brands: b.brands.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            const updLoan = (i, patch) => setInv({ loans: inv.loans.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            const updOther = (i, patch) => setB({ otherBusinesses: b.otherBusinesses.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            const ins = businessInsights(c);
            const money = (v) => (v ? fmtMoney(v) : '—');
            const u = b.volumeUnit;
            const BIZ_TABS = [
              { key: 'reg', label: 'Registration', done: !typeCfg?.requireBusinessReg || (!!b.tradeLicenseNo && !!b.tin) },
              // Only Registration carries a submission rule; the profile tabs are recommended, so they never show a warning flag.
              { key: 'pos', label: 'Position & scale', done: true },
              { key: 'sup', label: 'Products & suppliers', done: true, count: b.brands.length || undefined },
              { key: 'inv', label: 'Investment & financing', done: true, count: inv.loans.length || undefined },
              { key: 'oth', label: 'Other businesses', done: b.otherBusinesses.every((o) => !!o.name), count: b.otherBusinesses.length || undefined },
            ];
            return (
              <div className="stack">
                <div className="tabs" style={{ marginTop: -6 }}>
                  {BIZ_TABS.map((t) => (
                    <button key={t.key} className={`tab ${bizTab === t.key ? 'active' : ''}`} onClick={() => setBizTab(t.key)}>
                      <span className={`tab-flag ${t.done ? 'ok' : 'warn'}`} />{t.label}{t.count ? <span className="chip" style={{ padding: '0 6px' }}>{t.count}</span> : null}
                    </button>
                  ))}
                </div>

                {bizTab === 'reg' && (
                  <div className="form-grid cols-3">
                    <Field label="Trade license number" required={typeCfg?.requireBusinessReg}><input value={b.tradeLicenseNo} onChange={(e) => setB({ tradeLicenseNo: e.target.value })} /></Field>
                    <Field label="Trade license expiry"><input type="date" value={b.tradeLicenseExpiry} onChange={(e) => setB({ tradeLicenseExpiry: e.target.value })} /></Field>
                    <Field label="TIN" required={typeCfg?.requireBusinessReg}><input value={b.tin} onChange={(e) => setB({ tin: e.target.value })} /></Field>
                    <Field label="BIN / VAT registration"><input value={b.bin} onChange={(e) => setB({ bin: e.target.value })} /></Field>
                    <Field label="Company registration no."><input value={b.regNo} onChange={(e) => setB({ regNo: e.target.value })} placeholder="Registrar number, if incorporated" /></Field>
                    <Field label="Registration date"><input type="date" value={b.regDate} onChange={(e) => setB({ regDate: e.target.value })} /></Field>
                    <div className="span-3"><Alert kind="info">Upload the trade license, TIN and BIN certificates under <b>Documents</b>. The reviewer matches these numbers against the scans.</Alert></div>
                  </div>
                )}

                {bizTab === 'pos' && (
                  <div className="stack">
                    <div className="form-grid cols-3">
                      <Field label="Ownership type"><select value={b.ownershipType} onChange={(e) => setB({ ownershipType: e.target.value })}>{OWNERSHIP_TYPES.map((o) => <option key={o}>{o}</option>)}</select></Field>
                      <Field label="Established (year)"><input type="number" min="1900" max="2100" value={b.establishedYear} onChange={(e) => setB({ establishedYear: e.target.value })} /></Field>
                      <Field label="Years in business"><input type="number" min="0" value={b.yearsInBusiness} onChange={(e) => setB({ yearsInBusiness: e.target.value })} /></Field>
                      <Field label="Main products / services" className="span-2"><input value={b.mainProducts} onChange={(e) => setB({ mainProducts: e.target.value })} placeholder="What the business sells or does" /></Field>
                      <Field label="Employees"><input type="number" min="0" value={b.employees} onChange={(e) => setB({ employees: e.target.value })} /></Field>
                    </div>
                    <div>
                      <h4 className="mb-8" style={{ fontSize: 13.5 }}>Scale</h4>
                      <div className="form-grid cols-3">
                        <Field label="Unit of measure" hint="Applies to sales volume and storage capacity."><select value={u} onChange={(e) => setB({ volumeUnit: e.target.value })}>{VOLUME_UNITS.map((x) => <option key={x}>{x}</option>)}</select></Field>
                        <Field label={`Sales volume (${u} / month)`} hint="All products and suppliers combined."><input type="number" min="0" value={b.monthlyVolume} onChange={(e) => setB({ monthlyVolume: e.target.value })} /></Field>
                        <Field label="Annual turnover (BDT)"><input type="number" min="0" value={b.annualTurnover} onChange={(e) => setB({ annualTurnover: e.target.value })} /></Field>
                        <Field label="Premises area (sq ft)"><input type="number" min="0" value={b.outletArea} onChange={(e) => setB({ outletArea: e.target.value })} /></Field>
                        <Field label={`Storage capacity (${u})`}><input type="number" min="0" value={b.storageCapacity} onChange={(e) => setB({ storageCapacity: e.target.value })} /></Field>
                        <Field label="Delivery vehicles"><input type="number" min="0" value={b.vehicles} onChange={(e) => setB({ vehicles: e.target.value })} /></Field>
                      </div>
                    </div>
                    <div>
                      <h4 className="mb-8" style={{ fontSize: 13.5 }}>Market</h4>
                      <div className="form-grid cols-3">
                        <Field label="Market coverage area" className="span-2"><input value={b.marketArea} onChange={(e) => setB({ marketArea: e.target.value })} placeholder="Areas / localities served" /></Field>
                        <Field label="Resellers / sub-dealers served" hint="If the business supplies other traders."><input type="number" min="0" value={b.retailersServed} onChange={(e) => setB({ retailersServed: e.target.value })} /></Field>
                        <Field label="Main customer segments" className="span-3"><input value={b.mainCustomers} onChange={(e) => setB({ mainCustomers: e.target.value })} placeholder="e.g. households, contractors, institutions, resellers" /></Field>
                      </div>
                    </div>
                  </div>
                )}

                {bizTab === 'sup' && (
                  <div className="stack">
                    <div className="row-between">
                      <p className="small muted">Product lines or brands the business trades in, the supplier each is sourced from, monthly volume and the credit each supplier extends.</p>
                      <button className="btn btn-sm" onClick={() => setB({ brands: [...b.brands, emptyBrand()] })}>+ Add product line</button>
                    </div>
                    {b.brands.length === 0 ? <p className="muted">No products or suppliers recorded.</p> : (
                      <div className="table-wrap"><table>
                        <thead><tr><th>Product / brand</th><th>Supplier</th><th>{u} / month</th><th>Years dealing</th><th>Credit limit from supplier</th><th>Terms</th><th>Note</th><th></th></tr></thead>
                        <tbody>{b.brands.map((x, i) => (
                          <tr key={x.id}>
                            <td style={{ minWidth: 160 }}><input value={x.brand} onChange={(e) => updBrand(i, { brand: e.target.value })} placeholder="Product or brand" /></td>
                            <td style={{ minWidth: 160 }}><input value={x.supplier} onChange={(e) => updBrand(i, { supplier: e.target.value })} placeholder="Supplier / manufacturer" /></td>
                            <td><input type="number" min="0" value={x.monthlyVolume} onChange={(e) => updBrand(i, { monthlyVolume: e.target.value })} /></td>
                            <td><input type="number" min="0" value={x.yearsWith} onChange={(e) => updBrand(i, { yearsWith: e.target.value })} /></td>
                            <td><input type="number" min="0" value={x.creditLimit} onChange={(e) => updBrand(i, { creditLimit: e.target.value })} /></td>
                            <td><select value={x.terms} onChange={(e) => updBrand(i, { terms: e.target.value })}>{['Cash', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map((tm) => <option key={tm}>{tm}</option>)}</select></td>
                            <td><input value={x.note} onChange={(e) => updBrand(i, { note: e.target.value })} /></td>
                            <td><button className="btn btn-sm btn-ghost" onClick={() => setB({ brands: b.brands.filter((_, k) => k !== i) })}>✕</button></td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    )}
                    {ins.totalVolume > 0 && (
                      <div className="row small">
                        <span className="chip">Total {ins.totalVolume.toLocaleString()} {u}/month</span>
                        {ins.topSupplier && <span className="chip on">Largest supplier: {ins.topSupplier.name} ({ins.topShare}%)</span>}
                        <span className="chip">{ins.suppliers.length} supplier{ins.suppliers.length === 1 ? '' : 's'}</span>
                        {ins.supplierCredit > 0 && <span className="chip">Supplier credit {fmtMoney(ins.supplierCredit)}</span>}
                      </div>
                    )}
                  </div>
                )}

                {bizTab === 'inv' && (
                  <div className="stack">
                    <div className="form-grid cols-3">
                      <Field label="Total capital invested (BDT)"><input type="number" min="0" value={inv.capitalInvested} onChange={(e) => setInv({ capitalInvested: e.target.value })} /></Field>
                      <Field label="Current stock value (BDT)"><input type="number" min="0" value={inv.stockValue} onChange={(e) => setInv({ stockValue: e.target.value })} /></Field>
                      <Field label="Fixed assets (BDT)" hint="Vehicles, equipment, fittings."><input type="number" min="0" value={inv.fixedAssets} onChange={(e) => setInv({ fixedAssets: e.target.value })} /></Field>
                      <Field label="Working capital (BDT)"><input type="number" min="0" value={inv.workingCapital} onChange={(e) => setInv({ workingCapital: e.target.value })} /></Field>
                      <Field label="Estimated net worth (BDT)"><input type="number" min="0" value={inv.netWorth} onChange={(e) => setInv({ netWorth: e.target.value })} /></Field>
                      <Field label="Source of funds"><select value={inv.sourceOfFunds} onChange={(e) => setInv({ sourceOfFunds: e.target.value })}>{FUND_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></Field>
                      <Field label="Premises"><select value={inv.premises} onChange={(e) => setInv({ premises: e.target.value })}>{PREMISES_TYPES.map((s) => <option key={s}>{s}</option>)}</select></Field>
                      <Field label={inv.premises === 'Owned' ? 'Premises value (BDT)' : 'Monthly rent (BDT)'}><input type="number" min="0" value={inv.premisesValue} onChange={(e) => setInv({ premisesValue: e.target.value })} /></Field>
                    </div>
                    <div className="row-between">
                      <div><h4 style={{ fontSize: 13.5 }}>Loans &amp; credit facilities</h4><p className="small muted">Bank and non-bank borrowings of the business.</p></div>
                      <button className="btn btn-sm" onClick={() => setInv({ loans: [...inv.loans, emptyLoan()] })}>+ Add loan</button>
                    </div>
                    {inv.loans.length === 0 ? <p className="muted small">No loans recorded.</p> : (
                      <div className="table-wrap"><table>
                        <thead><tr><th>Lender</th><th>Type</th><th>Sanctioned</th><th>Outstanding</th><th>Monthly instalment</th><th>Purpose</th><th>Security</th><th></th></tr></thead>
                        <tbody>{inv.loans.map((l, i) => (
                          <tr key={l.id}>
                            <td><input value={l.lender} onChange={(e) => updLoan(i, { lender: e.target.value })} /></td>
                            <td><select value={l.type} onChange={(e) => updLoan(i, { type: e.target.value })}>{['Term loan', 'Overdraft / CC', 'Project loan', 'Lease', 'Personal loan', 'Other'].map((tm) => <option key={tm}>{tm}</option>)}</select></td>
                            <td><input type="number" min="0" value={l.amount} onChange={(e) => updLoan(i, { amount: e.target.value })} /></td>
                            <td><input type="number" min="0" value={l.outstanding} onChange={(e) => updLoan(i, { outstanding: e.target.value })} /></td>
                            <td><input type="number" min="0" value={l.monthlyInstalment} onChange={(e) => updLoan(i, { monthlyInstalment: e.target.value })} /></td>
                            <td><input value={l.purpose} onChange={(e) => updLoan(i, { purpose: e.target.value })} /></td>
                            <td><input value={l.security} onChange={(e) => updLoan(i, { security: e.target.value })} /></td>
                            <td><button className="btn btn-sm btn-ghost" onClick={() => setInv({ loans: inv.loans.filter((_, k) => k !== i) })}>✕</button></td>
                          </tr>
                        ))}</tbody>
                      </table></div>
                    )}
                    <div className="row small">
                      <span className="chip">Invested {money(ins.totalInvestment)}</span>
                      <span className="chip">Loans outstanding {money(ins.loansOutstanding)}</span>
                      {ins.leverage != null && <span className={`chip ${ins.leverage > 60 ? 'badge-red' : ''}`}>Leverage {ins.leverage}%</span>}
                      {ins.stockMonths != null && <span className="chip">Stock = {ins.stockMonths} months of sales</span>}
                    </div>
                  </div>
                )}

                {bizTab === 'oth' && (
                  <div className="stack">
                    <div className="row-between">
                      <p className="small muted">Other trades, companies or investments held by the owner(s).</p>
                      <button className="btn btn-sm" onClick={() => setB({ otherBusinesses: [...b.otherBusinesses, emptyOtherBusiness()] })}>+ Add business</button>
                    </div>
                    {b.otherBusinesses.length === 0 && <p className="muted">None recorded.</p>}
                    {b.otherBusinesses.map((o, i) => (
                      <div key={o.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                        <Field label="Business name" required><input value={o.name} onChange={(e) => updOther(i, { name: e.target.value })} /></Field>
                        <Field label="Nature of business"><input value={o.nature} onChange={(e) => updOther(i, { nature: e.target.value })} /></Field>
                        <Field label="Location"><input value={o.location} onChange={(e) => updOther(i, { location: e.target.value })} /></Field>
                        <Field label="Owner's role"><select value={o.role} onChange={(e) => updOther(i, { role: e.target.value })}>{['Owner', 'Partner', 'Managing Partner', 'Director', 'Managing Director', 'Shareholder', 'Investor'].map((r) => <option key={r}>{r}</option>)}</select></Field>
                        <Field label="Investment (BDT)"><input type="number" min="0" value={o.investment} onChange={(e) => updOther(i, { investment: e.target.value })} /></Field>
                        <Field label="Annual turnover (BDT)"><input type="number" min="0" value={o.annualTurnover} onChange={(e) => updOther(i, { annualTurnover: e.target.value })} /></Field>
                        <Field label="Since (year)"><input type="number" min="1900" max="2100" value={o.since} onChange={(e) => updOther(i, { since: e.target.value })} /></Field>
                        <div className="field span-2" style={{ justifyContent: 'flex-end', alignItems: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => setB({ otherBusinesses: b.otherBusinesses.filter((_, k) => k !== i) })}>Remove</button></div>
                      </div>
                    ))}
                  </div>
                )}

                {ins.flags.length > 0 && (
                  <Alert kind="info" title="Insights from the figures entered">
                    <ul>{ins.flags.map((f) => <li key={f.text}>{f.text}</li>)}</ul>
                  </Alert>
                )}
              </div>
            );
          })()}

          {section === 3 && (
            <div className="stack">
              <div className="card" style={{ background: 'var(--surface-2)' }}><div className="card-body">
                <div className="row-between">
                  <div><div className="strong">Mobile: {c.mobile || '—'}</div><div className="small muted">One-time password sent by SMS (simulated in this demo).</div></div>
                  {c.mobileVerified ? <span className="badge badge-green">✓ Verified</span> : <span className="badge badge-amber">Not verified</span>}
                </div>
                {!c.mobileVerified && (
                  <div className="row mt-16">
                    <button className="btn" onClick={sendOtp}>{otp.sent ? 'Resend OTP' : 'Send OTP'}</button>
                    {otp.sent && (
                      <>
                        <input style={{ width: 140 }} placeholder="6-digit code" value={otp.entered} onChange={(e) => setOtp({ ...otp, entered: e.target.value })} />
                        <button className="btn btn-primary" onClick={confirmOtp}>Confirm</button>
                      </>
                    )}
                  </div>
                )}
              </div></div>
              <div className="card" style={{ background: 'var(--surface-2)' }}><div className="card-body">
                <div className="row-between">
                  <div><div className="strong">Email: {c.email || '—'}</div><div className="small muted">Verification link sent to the address (simulated).</div></div>
                  {c.emailVerified ? <span className="badge badge-green">✓ Verified</span> : <span className="badge badge-gray">{c.email ? 'Not verified' : 'Optional'}</span>}
                </div>
                {c.email && !c.emailVerified && (
                  <div className="row mt-16">
                    <button className="btn" onClick={() => notify(`Verification link sent to ${c.email}`, 'info')}>Send verification link</button>
                    <button className="btn btn-ghost" onClick={() => { set({ emailVerified: true }); notify('Email verified.'); }}>Simulate link click</button>
                  </div>
                )}
              </div></div>
            </div>
          )}

          {section === 4 && (
            <div className="form-grid">
              <Field label="Latitude" required={typeCfg?.requireLocation}><input value={c.location.lat} onChange={(e) => setSub('location', { lat: e.target.value })} placeholder="23.8103" /></Field>
              <Field label="Longitude" required={typeCfg?.requireLocation}><input value={c.location.lng} onChange={(e) => setSub('location', { lng: e.target.value })} placeholder="90.4125" /></Field>
              <div className="span-2 row">
                <button className="btn" onClick={() => {
                  if (!navigator.geolocation) { notify('Geolocation unavailable in this browser.', 'error'); return; }
                  navigator.geolocation.getCurrentPosition(
                    (p) => { setSub('location', { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }); notify('Device location captured.'); },
                    () => notify('Could not read device location.', 'error'),
                  );
                }}>📍 Use device location</button>
                {c.location.lat && c.location.lng && (
                  <a className="btn" href={`https://www.google.com/maps?q=${c.location.lat},${c.location.lng}`} target="_blank" rel="noreferrer">Open in Maps</a>
                )}
              </div>
              <Field label="Outlet address (as observed)" className="span-2"><input value={c.location.outletAddress} onChange={(e) => setSub('location', { outletAddress: e.target.value })} /></Field>
              <Field label="Field visit date"><input type="date" value={c.location.visitDate} onChange={(e) => setSub('location', { visitDate: e.target.value })} /></Field>
              <Field label="Visited by">
                <select value={c.location.visitedBy} onChange={(e) => setSub('location', { visitedBy: e.target.value })}>
                  <option value="">—</option>
                  {USERS.filter((u) => u.role === ROLES.FIELD_OFFICER).map((u) => <option key={u.id}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="Field visit findings" className="span-2" hint="Stock levels, premises, signage, neighbouring competitors, etc.">
                <textarea value={c.location.findings} onChange={(e) => setSub('location', { findings: e.target.value })} />
              </Field>
              <div className="span-2"><Alert kind="info">Upload outlet photographs under <b>Documents</b> as "Outlet Photograph".</Alert></div>
            </div>
          )}

          {section === 5 && (
            <div className="stack">
              <div className="row-between">
                <div>
                  <h3>Bank &amp; payment accounts {typeCfg?.requireBank && <span className="req">*</span>}</h3>
                  <p className="small muted">Record every account the customer may pay from or receive refunds into. Exactly one must be marked primary.</p>
                </div>
                <button className="btn btn-sm" onClick={() => set({ bankAccounts: [...c.bankAccounts, emptyBankAccount(c.bankAccounts.length === 0)] })}>+ Add account</button>
              </div>
              {c.bankAccounts.length === 0 && (
                <p className="muted">{typeCfg?.requireBank ? 'At least one bank account is required for this customer type.' : 'No accounts recorded (optional for this customer type).'}</p>
              )}
              {c.bankAccounts.map((b, i) => {
                const isWallet = b.accountType.startsWith('Mobile Wallet');
                const upd = (patch) => set({ bankAccounts: c.bankAccounts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
                const setPrimary = () => set({ bankAccounts: c.bankAccounts.map((x, k) => ({ ...x, primary: k === i })) });
                const remove = () => {
                  const next = c.bankAccounts.filter((_, k) => k !== i);
                  if (next.length && !next.some((x) => x.primary)) next[0] = { ...next[0], primary: true };
                  set({ bankAccounts: next });
                };
                return (
                  <div key={b.id} style={{ padding: 14, border: `1px solid ${b.primary ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, background: b.primary ? 'var(--primary-soft)' : 'var(--surface)' }}>
                    <div className="row-between mb-8">
                      <div className="row" style={{ gap: 8 }}>
                        <span className="strong">Account {i + 1}</span>
                        {b.primary ? <span className="badge badge-blue">Primary</span> : <button className="btn-link small" onClick={setPrimary}>Make primary</button>}
                        {b.verified ? <span className="badge badge-green">Verified</span> : <span className="badge badge-gray">Unverified</span>}
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={remove}>Remove</button>
                    </div>
                    <div className="form-grid cols-3">
                      <Field label="Account type" required>
                        <select value={b.accountType} onChange={(e) => upd({ accountType: e.target.value, verified: false })}>
                          {BANK_ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </Field>
                      <Field label={isWallet ? 'Wallet provider' : 'Bank name'} required><input value={b.bankName} onChange={(e) => upd({ bankName: e.target.value, verified: false })} placeholder={isWallet ? 'bKash / Nagad / Rocket' : ''} /></Field>
                      <Field label="Branch"><input value={b.branch} disabled={isWallet} onChange={(e) => upd({ branch: e.target.value })} /></Field>
                      <Field label="Account name" required><input value={b.accountName} onChange={(e) => upd({ accountName: e.target.value, verified: false })} /></Field>
                      <Field label={isWallet ? 'Wallet number' : 'Account number'} required><input value={b.accountNo} onChange={(e) => upd({ accountNo: e.target.value, verified: false })} /></Field>
                      <Field label="Routing number"><input value={b.routingNo} disabled={isWallet} onChange={(e) => upd({ routingNo: e.target.value })} /></Field>
                      <Field label="Purpose" className="span-3" hint="e.g. Trade payments, refunds, incentives, tender deposits">
                        <input value={b.purpose} onChange={(e) => upd({ purpose: e.target.value })} />
                      </Field>
                    </div>
                  </div>
                );
              })}
              <Alert kind="info">Each account is verified separately by the reviewer against a bank statement or cheque leaf. Changing an account's details clears its verification.</Alert>
            </div>
          )}

          {section === 6 && (
            <div className="stack">
              <div className="row-between"><h3>Business owners</h3><button className="btn btn-sm" onClick={addOwner}>+ Add owner</button></div>
              {c.owners.length === 0 && <p className="muted">At least one owner is required.</p>}
              {c.owners.map((o, i) => (
                <div key={o.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Field label="Name" required><input value={o.name} onChange={(e) => updList('owners', i, { name: e.target.value })} /></Field>
                  <Field label="NID / passport"><input value={o.idNumber} onChange={(e) => updList('owners', i, { idNumber: e.target.value })} /></Field>
                  <Field label="Ownership share %"><input type="number" min="0" max="100" value={o.share} onChange={(e) => updList('owners', i, { share: e.target.value })} /></Field>
                  <Field label="Mobile"><input value={o.mobile} onChange={(e) => updList('owners', i, { mobile: e.target.value })} /></Field>
                  <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => rmList('owners', i)}>Remove</button></div>
                </div>
              ))}
              <div className="row-between mt-16"><h3>Authorised representatives</h3><button className="btn btn-sm" onClick={addRep}>+ Add representative</button></div>
              <p className="muted small">Persons permitted to place orders or make payments on behalf of the business.</p>
              {c.representatives.map((r, i) => (
                <div key={r.id} className="form-grid cols-3" style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Field label="Name" required><input value={r.name} onChange={(e) => updList('representatives', i, { name: e.target.value })} /></Field>
                  <Field label="Designation"><input value={r.designation} onChange={(e) => updList('representatives', i, { designation: e.target.value })} /></Field>
                  <Field label="Mobile"><input value={r.mobile} onChange={(e) => updList('representatives', i, { mobile: e.target.value })} /></Field>
                  <label className="check"><input type="checkbox" checked={r.canOrder} onChange={(e) => updList('representatives', i, { canOrder: e.target.checked })} /> May place orders</label>
                  <label className="check"><input type="checkbox" checked={r.canPay} onChange={(e) => updList('representatives', i, { canPay: e.target.checked })} /> May make payments</label>
                  <div className="field" style={{ justifyContent: 'flex-end' }}><button className="btn btn-sm btn-ghost" onClick={() => rmList('representatives', i)}>Remove</button></div>
                </div>
              ))}
            </div>
          )}

          {section === 7 && (
            <div className="stack">
              <div className="row-between">
                <div>
                  <h3>References {typeCfg?.minReferences > 0 && <span className="req">*</span>}</h3>
                  <p className="small muted">People or organisations who can vouch for the customer: suppliers, bankers, customers, fellow dealers. {typeCfg?.minReferences > 0 ? `At least ${typeCfg.minReferences} required for ${typeCfg.name}.` : 'Optional for this customer type.'} The reviewer contacts each reference during verification.</p>
                </div>
                <button className="btn btn-sm" onClick={() => set({ references: [...c.references, emptyReference()] })}>+ Add reference</button>
              </div>
              {c.references.length === 0 && <p className="muted">No references recorded.</p>}
              {c.references.map((r, i) => (
                <div key={r.id} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div className="row-between mb-8">
                    <div className="row" style={{ gap: 8 }}>
                      <span className="strong">Reference {i + 1}</span>
                      {r.outcome && r.outcome !== 'Not contacted' && <span className={`badge ${r.outcome === 'Positive' ? 'badge-green' : r.outcome === 'Negative' ? 'badge-red' : 'badge-amber'}`}>{r.outcome}</span>}
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => rmList('references', i)}>Remove</button>
                  </div>
                  <div className="form-grid cols-3">
                    <Field label="Reference type" required><select value={r.type} onChange={(e) => updList('references', i, { type: e.target.value })}>{REFERENCE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
                    <Field label="Contact person" required><input value={r.name} onChange={(e) => updList('references', i, { name: e.target.value })} /></Field>
                    <Field label="Organisation"><input value={r.organisation} onChange={(e) => updList('references', i, { organisation: e.target.value })} placeholder="Company, bank or shop" /></Field>
                    <Field label="Designation"><input value={r.designation} onChange={(e) => updList('references', i, { designation: e.target.value })} /></Field>
                    <Field label="Mobile" hint="Mobile or email is required."><input value={r.mobile} onChange={(e) => updList('references', i, { mobile: e.target.value })} placeholder="01XXXXXXXXX" /></Field>
                    <Field label="Email"><input type="email" value={r.email} onChange={(e) => updList('references', i, { email: e.target.value })} /></Field>
                    <Field label="Relationship to customer"><input value={r.relationship} onChange={(e) => updList('references', i, { relationship: e.target.value })} placeholder="e.g. main supplier, banker, regular buyer" /></Field>
                    <Field label="Years known"><input type="number" min="0" value={r.yearsKnown} onChange={(e) => updList('references', i, { yearsKnown: e.target.value })} /></Field>
                    <Field label="Remarks"><input value={r.remarks} onChange={(e) => updList('references', i, { remarks: e.target.value })} /></Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 8 && (
            <DocumentManager
              documents={c.documents}
              requiredDocs={typeCfg?.requiredDocs || []}
              uploadedBy={currentUser.name}
              onChange={(docs) => set({ documents: docs })}
            />
          )}
        </div>
        <div className="card-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
          <button className="btn" disabled={section === 0} onClick={() => setSection((s) => s - 1)}>← Previous</button>
          <div className="row">
            <button className="btn" onClick={saveDraft}>Save draft</button>
            {section < SECTIONS.length - 1
              ? <button className="btn btn-primary" onClick={() => setSection((s) => s + 1)}>Next →</button>
              : canSubmit ? <button className="btn btn-primary" onClick={submit}>Save &amp; submit</button> : <button className="btn btn-primary" onClick={saveDraft}>Save changes</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

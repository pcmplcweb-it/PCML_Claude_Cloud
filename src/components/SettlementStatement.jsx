// Printable final-settlement statement: header meta, earnings, deductions,
// PF, tax estimate, flags, clearance summary, salary & tax certificate and
// signature blocks. Pure presentation of a computeSettlement() result
// (frozen or live); styled by the .statement rules in styles.css.
import { SEPARATION_SECTIONS } from '../hr/config';
import { departmentOf, designationName, fmtMoney2, fmtNum2, isWeeklyOff, serviceLength } from '../hr/helpers';
import { fmtDate, fmtDateTime } from '../utils/helpers';

const Amount = ({ v }) => <td className="amount">{fmtNum2(v)}</td>;

// Line table with zero rows marked (hidden on print) and a bold total row.
const Lines = ({ title, lines = [], totalLabel, total }) => (
  <table>
    <thead><tr><th style={{ width: '38%' }}>{title}</th><th>Formula</th><th style={{ width: '14%' }}>Citation</th><th className="amount" style={{ width: '16%' }}>BDT</th></tr></thead>
    <tbody>
      {lines.map((l) => (
        <tr key={l.key} className={l.amount === 0 ? 'zero' : ''}>
          <td>{l.label}</td>
          <td className="small">{l.formula}</td>
          <td className="cite">{l.cite}</td>
          <Amount v={l.amount} />
        </tr>
      ))}
      <tr className="total"><td colSpan={3}>{totalLabel}</td><Amount v={total} /></tr>
    </tbody>
  </table>
);

export default function SettlementStatement({ statement: st, employee: emp, settlement: sep, settings }) {
  if (!st || !emp || !sep) return <div className="statement"><p className="muted">No statement available.</p></div>;
  const m = st.meta || {};
  const t = st.totals || {};
  const tax = m.tax || {};
  const company = settings?.company || {};
  const cal = settings?.calendar || {};
  const section = SEPARATION_SECTIONS[sep.type] || '';
  const frozen = !!st.computedAt;
  const approval = (stage) => (sep.approvals || []).filter((a) => a.stage === stage && a.decision === 'Approved').slice(-1)[0];
  const hrApproval = approval('HR'); const finApproval = approval('Finance'); const mgmtApproval = approval('Management');
  // Holidays skipped inside the deadline window (weekly offs are reported separately in the sentence).
  const holidaysSkipped = (cal.holidays || []).filter((h) => h.date > sep.lastWorkingDay && h.date <= m.deadline && !isWeeklyOff(h.date, cal)).length;
  const deadlineText = m.deadline
    ? `${fmtDate(m.deadline)} — ${settings?.settlement?.deadlineWorkingDays || 30} working days (${(cal.weeklyOffs || []).join(', ')} and ${holidaysSkipped} holidays skipped; ${st.skippedDays ?? m.skippedDays ?? 0} non-working days in all)`
    : '—';
  const taxOverride = sep.inputs?.taxOverride !== '' && sep.inputs?.taxOverride != null;
  const ytdIncome = Number(sep.inputs?.ytdIncome) || 0;
  const fyStart = Number(settings?.tax?.fiscalYearStartMonth) || 7;
  const lwdYear = Number(String(sep.lastWorkingDay).slice(0, 4)) || Number(String(st.computedAt || '').slice(0, 4)) || 0;
  const lwdMonth = Number(String(sep.lastWorkingDay).slice(5, 7)) || 1;
  const fyFrom = lwdMonth >= fyStart ? lwdYear : lwdYear - 1;
  const fiscalYear = `${fyFrom}–${String(fyFrom + 1).slice(2)}`;
  const taxLine = (st.lines?.deductions || []).find((l) => l.key === 'tax');
  const signed = (sep.clearance || []).filter((r) => r.status !== 'Pending');

  return (
    <div className="statement">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Final Settlement Statement</h2>
          <div className="small">{company.name}{company.address ? ` · ${company.address}` : ''}</div>
        </div>
        <div className="right small">
          <div className="mono strong">{sep.code}</div>
          <div>{frozen ? `Computed ${fmtDateTime(st.computedAt)} by ${st.computedBy}` : 'Live preview — not yet finalised'}</div>
          <div>Status: {sep.status}</div>
        </div>
      </div>

      <div className="meta">
        <div><b>Employee</b><br />{emp.name} <span className="mono">({emp.code || 'draft'})</span></div>
        <div><b>Designation</b><br />{designationName(emp.employment?.designation)}</div>
        <div><b>Department / grade</b><br />{departmentOf(emp) || '—'} · {emp.employment?.grade || '—'}</div>
        <div><b>Date of joining</b><br />{fmtDate(emp.employment?.joinDate)}</div>
        <div><b>Confirmation</b><br />{emp.employment?.confirmationDate ? fmtDate(emp.employment.confirmationDate) : m.permanent ? '—' : 'Not confirmed'}</div>
        <div><b>Last working day</b><br />{fmtDate(sep.lastWorkingDay)}</div>
        <div><b>Separation</b><br />{sep.type}{section ? ` (${section})` : ''}{sep.misconductClause ? ` · s.${sep.misconductClause}` : ''}</div>
        <div><b>Notice</b><br />required {m.noticeRequired ?? '—'} · served {m.noticeServed ?? '—'} · waived {m.noticeWaived ?? 0} days{m.shortfallDays ? ` · shortfall ${m.shortfallDays}` : ''}{m.payInLieuDays ? ` · pay in lieu ${m.payInLieuDays}` : ''}</div>
        <div><b>Service</b><br />{m.serviceText} ({m.exactYears} yrs; {m.completedYears} completed, {m.rounding === 'strict' ? 'strict' : 'six-month'} rounding)</div>
        <div><b>Basic / gross</b><br />{fmtNum2(m.basic)} / {fmtNum2(m.gross)} per month</div>
        <div><b>Category / law version</b><br />{m.workerCategory} · {m.permanent ? 'permanent' : 'not permanent'} · <span className="mono">{st.lawVersion || m.law}</span></div>
        <div><b>Settlement deadline (s.123)</b><br />{deadlineText}</div>
      </div>

      <Lines title="Earnings" lines={st.lines?.earnings} totalLabel="Total earnings" total={t.earnings} />
      <Lines title="Deductions" lines={st.lines?.deductions} totalLabel="Total deductions" total={t.deductions} />
      <table>
        <tbody>
          <tr className="total"><td colSpan={3}>Net payable ({fmtNum2(t.earnings)} − {fmtNum2(t.deductions)})</td><Amount v={t.netPayable} /></tr>
        </tbody>
      </table>

      {m.pfMember && (
        <>
          <Lines title="Provident fund" lines={st.lines?.pf} totalLabel="Net PF payable" total={t.pfNet} />
          <table>
            <tbody>
              <tr className="total"><td colSpan={3}>Total to {m.payee === 'Nominee' ? 'nominee' : 'employee'} (net payable + PF)</td><Amount v={t.totalToEmployee} /></tr>
            </tbody>
          </table>
        </>
      )}

      <div className="box">
        <b>Income tax at source — estimate (ITA 2023 s.86)</b>
        <table style={{ marginTop: 6, marginBottom: 0 }}>
          <tbody>
            <tr><td>Income to date {fmtNum2(ytdIncome)} + taxable settlement {fmtNum2((tax.income || 0) - ytdIncome)}</td><Amount v={tax.income} /></tr>
            <tr><td>Less exemption (1/{settings?.tax?.exemptionDivisor || 3}, capped at {fmtNum2(settings?.tax?.exemptionCap)})</td><Amount v={-(tax.exempt || 0)} /></tr>
            <tr><td>Taxable income · threshold {fmtNum2(tax.threshold)} ({emp.tax?.category || 'general'})</td><Amount v={tax.taxable} /></tr>
            {(tax.lines || []).slice(1).map((l) => <tr key={l.label}><td>{l.label} on {fmtNum2(l.base)}</td><Amount v={l.amount} /></tr>)}
            <tr><td>Tax for the year{tax.tax > 0 && tax.slabTax < tax.tax ? ' (minimum tax applied)' : ''}</td><Amount v={tax.tax} /></tr>
            <tr><td>Less tax already deducted this year</td><Amount v={-(tax.paid || 0)} /></tr>
            <tr className="total"><td>{taxOverride ? 'Deducted (override entered)' : 'Estimated deduction at source'}</td><Amount v={taxLine?.amount ?? tax.tds} /></tr>
          </tbody>
        </table>
      </div>

      {(st.flags || []).length > 0 && (
        <div className="box">
          <b>Notes</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{st.flags.map((f) => <li key={f.text}>{f.tone === 'danger' ? '⚠ ' : f.tone === 'warn' ? '△ ' : ''}{f.text}</li>)}</ul>
        </div>
      )}

      <table>
        <thead><tr><th>Clearance</th><th>Status</th><th>Signed by</th><th className="amount">Recoverable</th></tr></thead>
        <tbody>
          {(sep.clearance || []).map((r) => (
            <tr key={r.dept}><td>{r.label}{r.remarks ? <span className="cite"> — {r.remarks}</span> : null}</td><td>{r.status}</td><td className="small">{r.signedBy ? `${r.signedBy} · ${fmtDate(r.signedAt)}` : '—'}</td><td className="amount">{r.recoverable ? fmtNum2(r.recoverable) : '—'}</td></tr>
          ))}
          <tr className="section"><td colSpan={4}>{signed.length} of {(sep.clearance || []).length} departments signed</td></tr>
        </tbody>
      </table>

      <div className="box">
        <b>Salary &amp; tax certificate (withholding statement) — fiscal year {fiscalYear}</b>
        <div className="meta" style={{ margin: '8px 0 0' }}>
          <div><b>Employer / TIN</b><br />{company.name}{company.tin ? ` · ${company.tin}` : ''}</div>
          <div><b>Employee / TIN</b><br />{emp.name} · {emp.tin || 'TIN not recorded'}</div>
          <div><b>Period</b><br />{fmtDate(`${fyFrom}-${String(fyStart).padStart(2, '0')}-01`)} – {fmtDate(sep.lastWorkingDay)}</div>
          <div><b>Salary paid to date</b><br />{fmtNum2(sep.inputs?.ytdIncome)}</div>
          <div><b>Settlement income</b><br />{fmtNum2(t.earnings)}</div>
          <div><b>Tax deducted at source</b><br />{fmtNum2((Number(sep.inputs?.ytdTaxPaid) || 0) + (taxLine?.amount || 0))} (incl. this settlement {fmtNum2(taxLine?.amount)})</div>
        </div>
      </div>

      {sep.status === 'Paid' && sep.payment?.paidAt && (
        <div className="box">
          <b>Payment</b>
          <div className="meta" style={{ margin: '8px 0 0' }}>
            <div><b>Paid on</b><br />{fmtDate(sep.payment.paidAt)} by {sep.payment.paidBy || '—'}</div>
            <div><b>Mode / reference</b><br />{sep.payment.mode} · <span className="mono">{sep.payment.reference || '—'}</span></div>
            <div><b>Amount</b><br />{fmtMoney2(sep.payment.amount)}</div>
            <div><b>Payee</b><br />{sep.payment.payee}{sep.payment.payeeName ? ` · ${sep.payment.payeeName}${sep.payment.payeeRelation ? ` (${sep.payment.payeeRelation})` : ''}` : ''}</div>
            <div><b>Account</b><br /><span className="mono">{sep.payment.bankAccountNo || '—'}</span></div>
            <div><b>PF</b><br />{sep.payment.pfPaidAt ? `${fmtDate(sep.payment.pfPaidAt)} · ${sep.payment.pfReference || ''}` : 'with settlement'}</div>
          </div>
        </div>
      )}

      <div className="sign">
        <div>Prepared by HR<br /><span className="cite">{st.computedBy || ''}{st.computedAt ? ` · ${fmtDate(st.computedAt)}` : ''}</span></div>
        <div>Checked by Finance<br /><span className="cite">{finApproval ? `${finApproval.by} · ${fmtDate(finApproval.at)}` : hrApproval ? `HR: ${hrApproval.by}` : ''}</span></div>
        <div>Approved by Managing Director<br /><span className="cite">{mgmtApproval ? `${mgmtApproval.by} · ${fmtDate(mgmtApproval.at)}` : ''}</span></div>
        <div>Received by {m.payee === 'Nominee' ? 'nominee' : 'employee'}<br /><span className="cite">{m.payee === 'Nominee' ? sep.nominee?.name || emp.nominee?.name || '' : emp.name}</span></div>
      </div>
    </div>
  );
}

// Certificate of service (BLA 2006 s.31), printable once issued on a paid settlement (A.2 #20).
export function ServiceCertificate({ employee: emp, settlement: sep, settings }) {
  if (!emp || !sep) return null;
  const company = settings?.company || {};
  const cert = sep.serviceCertificate || {};
  const joined = emp.employment?.joinDate;
  const len = serviceLength(joined, sep.lastWorkingDay, !!settings?.statutory?.countLastDayInclusive);
  const section = SEPARATION_SECTIONS[sep.type] || '';
  return (
    <div className="statement">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>Certificate of Service</h2>
          <div className="small">{company.name}{company.address ? ` · ${company.address}` : ''}</div>
        </div>
        <div className="right small">
          <div className="mono strong">{sep.code}-SC</div>
          <div>Issued {fmtDate(cert.issuedAt)}</div>
        </div>
      </div>
      <p style={{ margin: '18px 0' }}>
        This is to certify that <b>{emp.name}</b> (employee code <span className="mono">{emp.code}</span>) was employed by {company.name || 'the company'} as <b>{designationName(emp.employment?.designation)}</b>{departmentOf(emp) ? `, ${departmentOf(emp)}` : ''}, from <b>{fmtDate(joined)}</b> to <b>{fmtDate(sep.lastWorkingDay)}</b>, a period of {len.years} year(s), {len.months} month(s) and {len.days} day(s).
      </p>
      <div className="meta">
        <div><b>Employee</b><br />{emp.name} <span className="mono">({emp.code})</span></div>
        <div><b>Designation</b><br />{designationName(emp.employment?.designation)}</div>
        <div><b>Department / grade</b><br />{departmentOf(emp) || '—'} · {emp.employment?.grade || '—'}</div>
        <div><b>Date of joining</b><br />{fmtDate(joined)}</div>
        <div><b>Last working day</b><br />{fmtDate(sep.lastWorkingDay)}</div>
        <div><b>Length of service</b><br />{len.text}</div>
        <div><b>Nature of separation</b><br />{sep.type}{section ? ` (${section})` : ''}</div>
        <div><b>Issued</b><br />{fmtDate(cert.issuedAt)} by {cert.by || '—'}</div>
      </div>
      <p className="small">Issued under section 31 of the Bangladesh Labour Act 2006, which entitles every worker to a certificate of service on leaving employment.</p>
      <div className="sign">
        <div>Issued by HR<br /><span className="cite">{cert.by || ''}{cert.issuedAt ? ` · ${fmtDate(cert.issuedAt)}` : ''}</span></div>
        <div>Authorised signatory<br /><span className="cite">{company.name || ''}</span></div>
      </div>
    </div>
  );
}

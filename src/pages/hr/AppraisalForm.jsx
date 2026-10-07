import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pageAppraisalMode, pageAppraisalVisibility, redactAppraisalAudit } from '../../components/hrAppraisalModals';
import { Alert, Card, EmptyState, Field, GradeBadge, RatingPills, ReasonModal, ScoreBar, StatusBadge, WorkflowSteps } from '../../components/ui';
import { APPRAISAL_FLOW, APPRAISAL_STATUS, KPI_CATEGORIES, KPI_DIRECTIONS, KPI_METHODS, KPI_UNITS, PROBATION_DECISIONS, RECOMMENDATIONS, canHr } from '../../hr/config';
import { addDays, appraisalDueDate, appraisalOverdue, applySystemActuals, competencyAnchors, computeAppraisalScore, departmentOf, designationName, employeeName, fmtDate, fmtDateTime, gradeDistribution, hrScope, hrToday, isHrRole, recommendationFor, uid, validateAppraisalStage } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const A = APPRAISAL_STATUS;
const TERMINAL = [A.CLOSED, A.CANCELLED];
const BEFORE_PUBLISH = [A.KPI_SETTING, A.AGREED, A.SELF, A.MANAGER, A.HR, A.RETURNED];
const RESULT_VISIBLE = [A.PUBLISHED, A.ACKNOWLEDGED, A.DISPUTED, A.CLOSED];
const customKpi = (n) => ({ id: uid('kpi'), code: `CUST-${n}`, name: '', description: '', category: 'Operational', unit: 'Nos', direction: 'higher', method: 'A', target: '', thresholdPct: '80', stretchPct: '120', cap: '120', weight: '', isGate: false, source: 'manual', steps: [], actualSelf: '', selfComment: '', actualMgr: '', mgrComment: '', evidence: '', ach: null, score: null, weighted: null, custom: true });
const NUM = { width: 90, textAlign: 'right' };
const NO_BANDS = [];

export default function AppraisalForm() {
  const { id } = useParams();
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const asOf = hrToday(settings);
  const bands = settings.appraisal?.bands || NO_BANDS;
  const apr = state.appraisals.find((x) => x.id === id);
  const emp = state.employees.find((e) => e.id === apr?.employeeId);
  const [a, setA] = useState(() => (apr ? structuredClone(apr) : null));
  const [errors, setErrors] = useState([]);
  const [modal, setModal] = useState(null); // 'object' | 'return' | 'dispute' | 'resolve' | 'cancel'
  const scope = useMemo(() => hrScope(currentUser, state.employees), [currentUser, state.employees]);

  // The local draft follows the stored record whenever it changes (save, transition, user switch).
  useEffect(() => {
    setA(apr ? structuredClone(apr) : null); setErrors([]); setModal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, apr?.updatedAt]);

  // Page gating (components/hrAppraisalModals): no reviewer stage on one's own record; HR staff also set goals
  // on behalf once the KPI-setting deadline has passed; manager/HR fields hidden from the appraisee before Published.
  const mode = useMemo(() => (apr ? pageAppraisalMode(apr, { ...currentUser, asOf }, state.employees) : null), [apr, currentUser, asOf, state.employees]);
  const overdue = apr ? appraisalOverdue(apr, asOf) : 0;
  const vis = apr ? pageAppraisalVisibility(apr, currentUser) : null;
  const preview = useMemo(() => (a && emp ? computeAppraisalScore(a, emp, settings) : null), [a, emp, settings]);
  // Audit rows for this appraisal; field-level diffs are redacted to what this viewer may see.
  const seeMgr = !!vis?.managerFields; const seeHr = !!vis?.hrFields;
  const history = useMemo(() => state.audit.filter((x) => x.portal === 'hr' && x.refId === id).map((x) => redactAppraisalAudit(x, { managerFields: seeMgr, hrFields: seeHr })), [state.audit, id, seeMgr, seeHr]);
  const deptDist = useMemo(() => {
    if (!apr || !emp || !apr.cycleId) return [];
    const dept = departmentOf(emp);
    const peers = state.appraisals.filter((x) => x.cycleId === apr.cycleId && departmentOf(state.employees.find((e) => e.id === x.employeeId)) === dept);
    return gradeDistribution(peers, bands);
  }, [apr, emp, state.appraisals, state.employees, bands]);

  if (!apr || !a || !emp) return <Alert kind="warn">Appraisal not found. <Link to="/hr/appraisals">Back to list</Link></Alert>;
  const inScope = scope.kind === 'all' || scope.ids.has(apr.employeeId) || (!!currentUser.employeeId && apr.managerId === currentUser.employeeId);
  if (!inScope) return <Alert kind="warn">You do not have access to this appraisal. <Link to="/hr/appraisals">Back to list</Link></Alert>;

  const m = mode.mode;
  const onBehalf = mode.onBehalf;
  const suffix = onBehalf ? ' on behalf' : '';
  const canKpi = m === 'kpi'; const canSelf = m === 'self'; const canMgr = m === 'manager'; const canHrEdit = m === 'hr'; const canAck = m === 'ack';
  const editable = m !== 'read' && !TERMINAL.includes(apr.status);
  const cycle = state.appraisalCycles.find((c) => c.id === apr.cycleId);
  const ap = settings.appraisal || {};
  const minChars = Number(ap.ratingCommentMinChars) || 50;
  const due = appraisalDueDate(apr);
  const sc = preview.scores;
  const rec = recommendationFor(sc.gradeFinal, bands);
  const objectedBefore = (apr.history || []).filter((h) => h.status === A.KPI_SETTING).length > 1;
  const customCount = a.kpis.filter((k) => k.custom).length;
  const probation = apr.type === 'Probation';

  // Draft editing helpers.
  const set = (patch) => setA({ ...a, ...patch });
  const setSub = (key, patch) => set({ [key]: { ...a[key], ...patch } });
  const setKpi = (i, patch) => set({ kpis: a.kpis.map((k, j) => (j === i ? { ...k, ...patch } : k)) });
  const setComp = (i, patch) => set({ competencies: a.competencies.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const withAttendance = (draft) => (draft.attendance?.lockedAt ? draft : applySystemActuals(draft, state.attendance, settings));

  // Dispatch helpers: every stage action saves the computed draft first, then transitions.
  const fail = (errs) => { setErrors(errs); notify(errs[0], 'error'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const save = (draft = a) => { dispatch({ type: 'UPSERT_APPRAISAL', appraisal: computeAppraisalScore(draft, emp, settings), by }); };
  // extra.noBehalf: HR's own action (cancel) taken from an on-behalf view is not logged as on behalf.
  const transition = (status, label, extra = {}) => {
    const ob = onBehalf && !extra.noBehalf;
    dispatch({ type: 'APPRAISAL_TRANSITION', id: apr.id, status, label, by, reason: extra.reason, patch: extra.patch, detail: extra.detail, onBehalf: ob || undefined });
    setModal(null); setErrors([]);
    notify(extra.toast || `${label}${ob ? ' (on behalf)' : ''}.`);
  };
  // KPI lines must have unique, non-blank codes; custom lines also need a name and a 5–40 % weight.
  const kpiLineErrors = (draft) => {
    const e = []; const seen = new Set();
    draft.kpis.forEach((k, i) => {
      const code = String(k.code || '').trim().toUpperCase();
      if (!code) e.push(`KPI line ${i + 1}: code is required.`);
      else if (seen.has(code)) e.push(`${code}: KPI codes must be unique.`);
      seen.add(code);
      if (k.custom && !String(k.name || '').trim()) e.push(`${code || `KPI line ${i + 1}`}: name is required.`);
      if (k.custom && (Number(k.weight) < 5 || Number(k.weight) > 40)) e.push(`${code || `KPI line ${i + 1}`}: weight must be between 5 and 40.`);
    });
    return e;
  };
  const submit = (stages, status, label, extra = {}) => {
    const draft = extra.draft || a;
    const computed = computeAppraisalScore(draft, emp, settings);
    const errs = [...(stages.includes('kpi') ? kpiLineErrors(computed) : []), ...stages.flatMap((s) => validateAppraisalStage(computed, s, settings))];
    if (errs.length) { fail(errs); return; }
    dispatch({ type: 'UPSERT_APPRAISAL', appraisal: computed, by });
    transition(status, label, extra);
  };
  const withReason = (reason) => {
    if (modal === 'object') transition(A.KPI_SETTING, 'Goals Objected', { reason });
    if (modal === 'return') { save(); transition(A.RETURNED, 'Returned to Manager', { reason }); }
    if (modal === 'dispute') transition(A.DISPUTED, 'Result Disputed', { reason, patch: { acknowledgement: { ...apr.acknowledgement, response: 'Dispute', comment: reason }, dispute: { ...apr.dispute, comment: reason } } });
    if (modal === 'resolve') transition(A.PUBLISHED, 'Dispute Resolved', { reason, patch: { dispute: { ...apr.dispute, resolution: reason } } });
    if (modal === 'cancel') { if (editable) save(); transition(A.CANCELLED, 'Appraisal Cancelled', { reason, noBehalf: true }); }
  };
  const addCustom = () => {
    if (customCount >= Number(ap.maxCustomKpis)) { notify(`At most ${ap.maxCustomKpis} custom KPIs are allowed.`, 'error'); return; }
    let n = 1;
    while (a.kpis.some((k) => k.code === `CUST-${n}`)) n++;
    set({ kpis: [...a.kpis, customKpi(n)] });
  };

  const actions = [];
  if (editable) actions.push(<button key="save" className="btn" onClick={() => { save(); notify('Appraisal saved.'); }}>Save</button>);
  if (canKpi) actions.push(<button key="agree" className="btn btn-primary" onClick={() => submit(['kpi'], A.AGREED, 'Sent for Agreement', { detail: 'Goals sent to the employee for agreement' })}>Send for agreement{suffix}</button>);
  if (m === 'agree') {
    actions.push(<button key="accept" className="btn btn-success" onClick={() => transition(A.SELF, 'Goals Accepted', { detail: 'Goals accepted' })}>Accept goals{suffix}</button>);
    actions.push(<button key="object" className="btn btn-warn" disabled={objectedBefore} title={objectedBefore ? 'Goals can be objected to once' : ''} onClick={() => setModal('object')}>Object{suffix}</button>);
  }
  if (canSelf) actions.push(<button key="self" className="btn btn-primary" onClick={() => submit(['self'], A.MANAGER, 'Self-Assessment Submitted', { detail: 'Self-assessment submitted' })}>Submit self-assessment{suffix}</button>);
  if (canMgr) actions.push(<button key="mgr" className="btn btn-primary" onClick={() => submit(['manager'], A.HR, apr.status === A.RETURNED ? 'Resubmitted to HR' : 'Manager Review Submitted', { draft: withAttendance(a), detail: apr.status === A.RETURNED ? 'Manager review resubmitted' : 'Manager review submitted' })}>{apr.status === A.RETURNED ? 'Resubmit to HR' : 'Submit manager review'}{suffix}</button>);
  if (canHrEdit) {
    actions.push(<button key="return" className="btn btn-warn" onClick={() => setModal('return')}>Return to manager</button>);
    actions.push(<button key="publish" className="btn btn-success" disabled={!canHr(role, 'publish')} title={canHr(role, 'publish') ? '' : 'Only the HR Head publishes results'} onClick={() => submit(['hr', 'publish'], A.PUBLISHED, 'Result Published', { detail: `Published: grade ${sc.gradeFinal}, final ${sc.final}` })}>Publish result</button>);
  }
  if (canAck) {
    actions.push(<button key="ack" className="btn btn-success" onClick={() => transition(A.ACKNOWLEDGED, 'Result Acknowledged', { detail: 'Employee acknowledged the result', patch: { acknowledgement: { ...apr.acknowledgement, response: 'Agree', comment: a.acknowledgement.comment } } })}>Acknowledge</button>);
    actions.push(<button key="dispute" className="btn btn-danger" onClick={() => setModal('dispute')}>Raise dispute</button>);
  }
  if (m === 'resolve') actions.push(<button key="resolve" className="btn btn-primary" onClick={() => setModal('resolve')}>Resolve dispute</button>);
  if (canHr(role, 'cancelAppraisal') && !mode.isSelf && BEFORE_PUBLISH.includes(apr.status)) actions.push(<button key="cancel" className="btn btn-ghost" onClick={() => setModal('cancel')}>Cancel appraisal</button>);
  actions.push(<button key="print" className="btn btn-ghost" onClick={() => window.print()}>Print summary</button>);

  const kv = (rows) => <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v || '—'}</dd></div>)}</dl>;
  const gateBadge = (k, line) => (!k.isGate ? <span className="muted">—</span> : line.score == null ? <span className="badge badge-gray">gate</span> : line.score < Number(ap.gates?.gateKpiFailBelow) ? <span className="badge badge-red">gate fail</span> : <span className="badge badge-green">gate ok</span>);
  const weightSum = a.kpis.reduce((s, k) => s + Number(k.weight || 0), 0);
  const timeline = [...(apr.history || []).map((h) => ({ id: `h-${h.at}-${h.status}`, at: h.at, action: h.status, by: h.by, detail: h.note })), ...history].sort((x, y) => new Date(y.at) - new Date(x.at));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1>{apr.code} · <Link to={`/hr/employees/${emp.id}`}>{emp.name}</Link></h1>
            <StatusBadge status={apr.status} />
            {vis.managerFields && sc.gradeFinal && <GradeBadge grade={sc.gradeFinal} bands={bands} />}
            {apr.proRata && <span className="badge badge-amber">pro-rata</span>}
          </div>
          <p className="sub">{apr.type}{cycle ? ` · ${cycle.code} ${cycle.name}` : ''} · {fmtDate(apr.periodFrom)} → {fmtDate(apr.periodTo)} · {designationName(emp.employment.designation)}, {departmentOf(emp)} · manager {employeeName(apr.managerId, state.employees) || '—'} · template <span className="mono">{apr.templateCode || '—'}</span></p>
        </div>
        <div className="page-actions no-print">{actions}</div>
      </div>

      <WorkflowSteps status={apr.status} steps={APPRAISAL_FLOW} />
      <div className="chip-list">
        <span className="chip">{apr.code}</span><span className="chip">{emp.code} · {emp.name}</span><span className="chip">{apr.type}</span>
        {due && <span className={`chip ${overdue > 0 ? 'badge-red' : ''}`}>{overdue > 0 ? `${overdue} d overdue` : `due ${fmtDate(due)}`}</span>}
        {onBehalf && <span className="chip on">acting on behalf — deadline passed</span>}
        {m !== 'read' && !onBehalf && <span className="chip on">your stage: {m}</span>}
      </div>

      {errors.length > 0 && <Alert kind="danger" title={`${errors.length} item(s) must be completed`}><ul>{errors.slice(0, 10).map((e, n) => <li key={`${n}-${e}`}>{e}</li>)}{errors.length > 10 && <li>…and {errors.length - 10} more</li>}</ul></Alert>}
      {apr.statusReason && [A.RETURNED, A.CANCELLED, A.DISPUTED, A.KPI_SETTING].includes(apr.status) && <Alert kind={apr.status === A.CANCELLED ? 'danger' : 'warn'} title={`${apr.status}: reason`}>{apr.statusReason}</Alert>}
      {vis.managerFields && preview.gateFlags.length > 0 && preview.gateFlags.map((g) => <Alert key={g.code} kind="warn">{g.text} — grade capped at {g.cap}.</Alert>)}
      {probation && RESULT_VISIBLE.includes(apr.status) && isHrRole(role) && <Alert kind="info">Probation review published — record the decision on the <Link to={`/hr/employees/${emp.id}`}>employee file</Link> (Decide probation).</Alert>}

      {/* 1 — KPIs */}
      <Card title={`KPIs (${a.kpis.length})`} actions={<><span className={`badge ${weightSum === 100 ? 'badge-green' : 'badge-amber'}`}>Σ weight {weightSum}</span>{canKpi && <button className="btn btn-sm" onClick={addCustom} disabled={customCount >= Number(ap.maxCustomKpis)}>+ Add custom KPI</button>}{canMgr && <button className="btn btn-sm" onClick={() => set({ kpis: a.kpis.map((k) => (k.source === 'attendance' || k.actualMgr !== '' ? k : { ...k, actualMgr: k.actualSelf })) })}>Copy self actuals</button>}</>}>
        <div className="table-wrap"><table>
          <thead><tr><th>KPI</th><th>Target</th>{vis.selfFields && <th>Self actual</th>}{vis.managerFields && <><th>Actual</th><th className="right">Ach %</th><th className="right">Score</th><th className="right">Weighted</th><th>Gate</th></>}{canKpi && <th></th>}</tr></thead>
          <tbody>{a.kpis.map((k, i) => {
            const line = preview.kpis[i] || {};
            const auto = k.source === 'attendance';
            return (
              <tr key={k.id || k.code}>
                <td style={{ minWidth: 220 }}>
                  {canKpi && k.custom ? (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="row" style={{ gap: 6 }}><input className="mono" style={{ width: 90 }} value={k.code} onChange={(e) => setKpi(i, { code: e.target.value.toUpperCase() })} /><input placeholder="KPI name" value={k.name} onChange={(e) => setKpi(i, { name: e.target.value })} /></div>
                      <div className="row" style={{ gap: 6 }}>
                        <select value={k.category} onChange={(e) => setKpi(i, { category: e.target.value })}>{KPI_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
                        <select value={k.unit} onChange={(e) => setKpi(i, { unit: e.target.value })}>{KPI_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
                        <select value={k.direction} onChange={(e) => setKpi(i, { direction: e.target.value })}>{KPI_DIRECTIONS.map((d) => <option key={d}>{d}</option>)}</select>
                        <select value={k.method} onChange={(e) => setKpi(i, { method: e.target.value })}>{KPI_METHODS.filter((x) => x.code !== 'E').map((x) => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select>
                      </div>
                      <input placeholder="Description / formula" value={k.description} onChange={(e) => setKpi(i, { description: e.target.value })} />
                    </div>
                  ) : (
                    <><div className="strong"><span className="mono">{k.code}</span> · {k.name}{k.custom && <span className="badge badge-blue" style={{ marginLeft: 6 }}>custom</span>}{auto && <span className="badge badge-gray" style={{ marginLeft: 6 }} title="Filled from the attendance snapshot">auto</span>}</div><div className="small muted">{k.description}</div><div className="small muted">{k.category} · method {k.method} · {k.direction === 'lower' ? 'lower is better' : 'higher is better'}</div></>
                  )}
                </td>
                <td className="nowrap">
                  {canKpi ? (
                    <div className="stack" style={{ gap: 4 }}>
                      <Field label="Target"><input type="number" step="any" style={NUM} value={k.target} onChange={(e) => setKpi(i, { target: e.target.value })} /></Field>
                      <Field label="Weight %"><input type="number" min="5" max="40" style={NUM} value={k.weight} onChange={(e) => setKpi(i, { weight: e.target.value })} /></Field>
                      <label className="check small"><input type="checkbox" checked={!!k.isGate} onChange={(e) => setKpi(i, { isGate: e.target.checked })} /> gate</label>
                    </div>
                  ) : <><span className="mono">{k.target || '—'}</span> {k.unit}<div className="small muted">weight {k.weight}%{k.isGate ? ' · gate' : ''}</div></>}
                </td>
                {vis.selfFields && (
                  <td style={{ minWidth: 160 }}>
                    {canSelf && !auto ? (
                      <div className="stack" style={{ gap: 4 }}><input type="number" step="any" style={NUM} value={k.actualSelf} onChange={(e) => setKpi(i, { actualSelf: e.target.value })} /><textarea rows={2} placeholder="Comment / evidence" value={k.selfComment} onChange={(e) => setKpi(i, { selfComment: e.target.value })} /></div>
                    ) : <><span className="mono">{k.actualSelf === '' ? '—' : k.actualSelf}</span>{k.selfComment && <div className="small muted">{k.selfComment}</div>}</>}
                  </td>
                )}
                {vis.managerFields && (
                  <>
                    <td style={{ minWidth: 180 }}>
                      {canMgr && !auto ? (
                        <div className="stack" style={{ gap: 4 }}><input type="number" step="any" style={NUM} value={k.actualMgr} onChange={(e) => setKpi(i, { actualMgr: e.target.value })} /><textarea rows={2} placeholder="Manager comment" value={k.mgrComment} onChange={(e) => setKpi(i, { mgrComment: e.target.value })} /><input placeholder="Evidence (report, ref.)" value={k.evidence} onChange={(e) => setKpi(i, { evidence: e.target.value })} /></div>
                      ) : <><span className="mono">{k.actualMgr === '' ? '—' : k.actualMgr}</span>{auto && <span className="small muted"> (auto)</span>}{k.mgrComment && <div className="small muted">{k.mgrComment}</div>}{k.evidence && <div className="small muted">Evidence: {k.evidence}</div>}</>}
                    </td>
                    <td className="right mono">{line.ach ?? '—'}</td>
                    <td className="right mono">{line.score ?? '—'}</td>
                    <td className="right mono strong">{line.weighted ?? '—'}</td>
                    <td>{gateBadge(k, line)}</td>
                  </>
                )}
                {canKpi && <td>{k.custom && <button className="btn btn-sm btn-ghost" onClick={() => set({ kpis: a.kpis.filter((_, j) => j !== i) })}>✕</button>}</td>}
              </tr>
            );
          })}</tbody>
        </table></div>
        {vis.managerFields && <div className="row-between mt-16"><span className="strong">KPI score (weight {a.weights.kpi}%)</span><div style={{ width: 260 }}><ScoreBar value={sc.kpi ?? undefined} /></div></div>}
      </Card>

      {/* 2 — Competencies */}
      <Card title={`Competencies (${a.competencies.length})`}>
        <div className="table-wrap"><table>
          <thead><tr><th>Competency</th>{vis.selfFields && <th>Self</th>}{vis.managerFields && <th>Manager rating &amp; comment</th>}{vis.hrFields && <th>HR rating (±{ap.hrAdjustMax}) &amp; comment</th>}</tr></thead>
          <tbody>{a.competencies.map((c, i) => {
            const anchors = competencyAnchors(c.code);
            const extreme = [1, 5].includes(Number(c.mgrRating));
            const len = (c.mgrComment || '').trim().length;
            return (
              <tr key={c.code}>
                <td style={{ minWidth: 180 }}><div className="strong" title={anchors.map((t, n) => `${n + 1} — ${t}`).join('\n')}>{c.name} <span className="muted small">ⓘ</span></div><div className="small muted">weight {c.weight}%</div></td>
                {vis.selfFields && <td><RatingPills value={c.selfRating} disabled={!canSelf} anchors={anchors} onChange={(v) => setComp(i, { selfRating: v })} /></td>}
                {vis.managerFields && (
                  <td style={{ minWidth: 240 }}>
                    <RatingPills value={c.mgrRating} disabled={!canMgr} anchors={anchors} onChange={(v) => setComp(i, { mgrRating: v })} />
                    {canMgr ? <textarea rows={2} className="mt-8" placeholder={extreme ? `Required: at least ${minChars} characters for a rating of ${c.mgrRating}` : 'Comment (optional)'} value={c.mgrComment} onChange={(e) => setComp(i, { mgrComment: e.target.value })} /> : c.mgrComment && <div className="small muted mt-8">{c.mgrComment}</div>}
                    {canMgr && extreme && <div className={`small ${len < minChars ? 'muted' : ''}`} style={len < minChars ? { color: 'var(--danger)' } : undefined}>{len}/{minChars} characters</div>}
                  </td>
                )}
                {vis.hrFields && (
                  <td style={{ minWidth: 240 }}>
                    <RatingPills value={c.hrRating} disabled={!canHrEdit} anchors={anchors} onChange={(v) => setComp(i, { hrRating: v })} />
                    {canHrEdit ? <textarea rows={2} className="mt-8" placeholder="Comment (required when adjusting)" value={c.hrComment} onChange={(e) => setComp(i, { hrComment: e.target.value })} /> : c.hrComment && <div className="small muted mt-8">{c.hrComment}</div>}
                  </td>
                )}
              </tr>
            );
          })}</tbody>
        </table></div>
        {vis.managerFields && <div className="row-between mt-16"><span className="strong">Competency score (weight {a.weights.competency}%)</span><div style={{ width: 260 }}><ScoreBar value={sc.competency ?? undefined} /></div></div>}
      </Card>

      <div className="grid grid-2">
        {/* 3 — Attendance snapshot */}
        <Card title="Attendance snapshot" actions={(canMgr || canHrEdit) && <button className="btn btn-sm" onClick={() => set(applySystemActuals(a, state.attendance, settings, true))}>Refresh from attendance</button>}>
          {!a.attendance.lockedAt && (canMgr || canHrEdit) && <Alert kind="info">No snapshot yet — it is taken automatically when the manager review is submitted{a.attendanceMode === 'kpi' ? ' and fills the attendance KPI line' : ''}.</Alert>}
          {kv([
            ['Attendance', a.attendance.pct == null ? '' : `${a.attendance.pct}%`], ['Average lates / month', a.attendance.avgLates == null ? '' : String(a.attendance.avgLates)],
            ['Unapproved absence', `${a.attendance.unapproved || 0} day(s)`], ['Months covered', String(a.attendance.months || 0)], ['Attendance score', a.attendance.score == null ? '' : String(a.attendance.score)],
            ['Mode', a.attendanceMode === 'gate' ? 'Gate only (caps the grade)' : 'KPI line'], ['Snapshot taken', a.attendance.lockedAt ? fmtDateTime(a.attendance.lockedAt) : ''],
          ])}
          {vis.hrFields && (
            <div className="form-grid mt-16">
              <Field label="HR override attendance %" hint="Replaces the snapshot % for the attendance gate"><input type="number" step="any" disabled={!canHrEdit} value={a.hr.attendanceOverridePct} onChange={(e) => setSub('hr', { attendanceOverridePct: e.target.value })} /></Field>
              <Field label="Override reason"><input disabled={!canHrEdit} value={a.hr.attendanceOverrideReason} onChange={(e) => setSub('hr', { attendanceOverrideReason: e.target.value })} /></Field>
            </div>
          )}
        </Card>

        {/* 4 — Employee comments */}
        {vis.selfFields ? (
          <Card title="Employee comments">
            <div className="form-grid">
              <Field label="Key achievements in the period" className="span-2"><textarea rows={3} disabled={!canSelf} value={a.self.achievements} onChange={(e) => setSub('self', { achievements: e.target.value })} /></Field>
              <Field label="Overall comment" className="span-2"><textarea rows={3} disabled={!canSelf} value={a.self.overallComment} onChange={(e) => setSub('self', { overallComment: e.target.value })} /></Field>
            </div>
            {a.self.submittedAt && <p className="small muted mt-8">Self-assessment submitted {fmtDateTime(a.self.submittedAt)}.</p>}
          </Card>
        ) : <Card title="Employee comments"><EmptyState>Visible once the self-assessment is submitted.</EmptyState></Card>}
      </div>

      {vis.managerFields && (
        <div className="grid grid-2">
          {/* 5 — Manager assessment */}
          <Card title="Manager assessment">
            <div className="form-grid">
              <Field label="Strengths" className="span-2"><textarea rows={2} disabled={!canMgr} value={a.manager.strengths} onChange={(e) => setSub('manager', { strengths: e.target.value })} /></Field>
              <Field label="Areas for improvement" className="span-2"><textarea rows={2} disabled={!canMgr} value={a.manager.improvements} onChange={(e) => setSub('manager', { improvements: e.target.value })} /></Field>
              <Field label="Overall comment" className="span-2"><textarea rows={2} disabled={!canMgr} value={a.manager.overallComment} onChange={(e) => setSub('manager', { overallComment: e.target.value })} /></Field>
              {probation ? (
                <>
                  <Field label="Probation decision recommended" required><select disabled={!canMgr} value={a.probation.decision} onChange={(e) => setSub('probation', { decision: e.target.value })}>{PROBATION_DECISIONS.map((d) => <option key={d} value={d}>{d || '— select —'}</option>)}</select></Field>
                  <Field label="Decision note"><input disabled={!canMgr} value={a.probation.note} onChange={(e) => setSub('probation', { note: e.target.value })} /></Field>
                </>
              ) : (
                <>
                  <Field label="Recommendation" required><select disabled={!canMgr} value={a.manager.recommendation} onChange={(e) => setSub('manager', { recommendation: e.target.value, incrementPct: a.manager.incrementPct || rec.incrementPct })}>{RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r || '— select —'}</option>)}</select></Field>
                  <Field label="Increment %" hint={sc.gradeFinal ? `Band ${sc.gradeFinal} default ${rec.incrementPct}%` : 'Default follows the grade band'}><input type="number" step="any" disabled={!canMgr} value={a.manager.incrementPct} onChange={(e) => setSub('manager', { incrementPct: e.target.value })} /></Field>
                  <Field label="Promotion to (designation / grade)"><input disabled={!canMgr} value={a.manager.promotionTo} onChange={(e) => setSub('manager', { promotionTo: e.target.value })} /></Field>
                </>
              )}
            </div>
            {a.manager.submittedAt && <p className="small muted mt-8">Submitted {fmtDateTime(a.manager.submittedAt)} by {a.manager.by}.</p>}
          </Card>

          {/* 6 — HR review & calibration */}
          {vis.hrFields ? (
            <Card title="HR review & calibration">
              {kv([
                ['KPI score', sc.kpi == null ? '' : String(sc.kpi)], ['Competency score', sc.competency == null ? '' : String(sc.competency)], ['Final score', sc.final == null ? '' : String(sc.final)],
                ['Grade', <span key="grade" className="row" style={{ gap: 6 }}><GradeBadge grade={sc.gradeOriginal} bands={bands} />{sc.gradeFinal !== sc.gradeOriginal && <>→ <GradeBadge grade={sc.gradeFinal} bands={bands} /></>}</span>],
                ['Gate flags', preview.gateFlags.length ? preview.gateFlags.map((g) => `${g.text} (cap ${g.cap})`).join('; ') : 'none'],
                ['Department distribution', deptDist.length ? <div key="dist" className="chip-list">{deptDist.map((d) => <span key={d.code} className={`badge badge-${d.tone || 'gray'}`} title={`${d.name}: guided ${d.guidedPct}%`}>{d.code} {d.count} · {d.pct}% / {d.guidedPct}%</span>)}</div> : ''],
              ])}
              <div className="form-grid mt-16">
                <Field label="Grade override" hint="Requires a calibration note"><select disabled={!canHrEdit} value={a.hr.gradeOverride} onChange={(e) => setSub('hr', { gradeOverride: e.target.value })}><option value="">— computed —</option>{bands.map((b) => <option key={b.code} value={b.code}>{b.code} · {b.name}</option>)}</select></Field>
                <Field label="Calibration note" required={!!a.hr.gradeOverride}><input disabled={!canHrEdit} value={a.hr.calibrationNote} onChange={(e) => setSub('hr', { calibrationNote: e.target.value })} /></Field>
                <Field label="HR recommendation" hint={`Manager: ${a.manager.recommendation || '—'}`}><select disabled={!canHrEdit} value={a.hr.recommendation} onChange={(e) => setSub('hr', { recommendation: e.target.value, incrementPct: a.hr.incrementPct || a.manager.incrementPct || rec.incrementPct })}>{RECOMMENDATIONS.map((r) => <option key={r} value={r}>{r || '— as manager —'}</option>)}</select></Field>
                <Field label="Increment %" hint={`Manager: ${a.manager.incrementPct || '—'}%`}><input type="number" step="any" disabled={!canHrEdit} value={a.hr.incrementPct} onChange={(e) => setSub('hr', { incrementPct: e.target.value })} /></Field>
                <Field label="Promotion to"><input disabled={!canHrEdit} value={a.hr.promotionTo} onChange={(e) => setSub('hr', { promotionTo: e.target.value })} /></Field>
                <Field label="PIP end date"><input type="date" disabled={!canHrEdit || !a.hr.pip} value={a.hr.pipEndDate} onChange={(e) => setSub('hr', { pipEndDate: e.target.value })} /></Field>
                <label className="check span-2"><input type="checkbox" disabled={!canHrEdit} checked={!!a.hr.pip} onChange={(e) => setSub('hr', { pip: e.target.checked, pipEndDate: e.target.checked ? a.hr.pipEndDate || addDays(asOf, Number(emp.employment.workerCategory === 'Worker' ? ap.pipDaysWorker : ap.pipDays) || 90) : '' })} /> Place on a performance improvement plan{rec.pip ? ' (band default)' : ''}</label>
                <Field label="HR comment" className="span-2"><textarea rows={2} disabled={!canHrEdit} value={a.hr.comment} onChange={(e) => setSub('hr', { comment: e.target.value })} /></Field>
              </div>
              {a.hr.reviewedAt && <p className="small muted mt-8">Published {fmtDateTime(a.hr.reviewedAt)} by {a.hr.by}.</p>}
            </Card>
          ) : (
            <Card title="Score summary">
              {kv([
                ['KPI score', sc.kpi == null ? '' : String(sc.kpi)], ['Competency score', sc.competency == null ? '' : String(sc.competency)], ['Final score', sc.final == null ? '' : String(sc.final)],
                ['Grade', <GradeBadge key="grade" grade={sc.gradeFinal} bands={bands} />], ['Gate flags', preview.gateFlags.length ? preview.gateFlags.map((g) => g.text).join('; ') : 'none'],
              ])}
              <p className="small muted mt-8">Live preview from the current entries; HR calibration notes are not shown to managers.</p>
            </Card>
          )}
        </div>
      )}

      {/* 7 — Result */}
      {RESULT_VISIBLE.includes(apr.status) && (vis.managerFields || mode.isSelf) && (
        <Card title="Result" actions={<GradeBadge grade={apr.scores.gradeFinal} bands={bands} />}>
          <div className="grid grid-2">
            <div className="stack">
              <div className="row-between"><span className="strong">Final score</span><div style={{ width: 240 }}><ScoreBar value={apr.scores.final ?? undefined} /></div></div>
              {kv([
                ['KPI / competency', `${apr.scores.kpi ?? '—'} / ${apr.scores.competency ?? '—'}`],
                ['Recommendation', apr.hr.recommendation || apr.manager.recommendation], ['Increment', (apr.hr.incrementPct || apr.manager.incrementPct) ? `${apr.hr.incrementPct || apr.manager.incrementPct}%` : ''],
                ['Promotion', apr.hr.promotionTo || apr.manager.promotionTo], ['PIP', apr.hr.pip ? `until ${fmtDate(apr.hr.pipEndDate)}` : 'No'],
                ...(probation ? [['Probation decision', apr.probation.decision]] : []),
                ['Published', apr.hr.reviewedAt ? `${fmtDateTime(apr.hr.reviewedAt)} by ${apr.hr.by}` : ''],
              ])}
            </div>
            <div className="stack">
              {kv([['Strengths', apr.manager.strengths], ['Areas for improvement', apr.manager.improvements], ['Manager comment', apr.manager.overallComment]])}
              {canAck && <Field label="Your comment (optional, recorded with the acknowledgement)"><textarea rows={2} value={a.acknowledgement.comment} onChange={(e) => setSub('acknowledgement', { comment: e.target.value })} /></Field>}
              {apr.acknowledgement.at && <Alert kind={apr.acknowledgement.response === 'Dispute' ? 'warn' : 'success'}>{apr.acknowledgement.response === 'Dispute' ? 'Disputed' : 'Acknowledged'} {fmtDateTime(apr.acknowledgement.at)} by {apr.acknowledgement.by}{apr.acknowledgement.comment ? ` — ${apr.acknowledgement.comment}` : ''}</Alert>}
              {apr.dispute.resolution && <Alert kind="info" title="Dispute resolution">{apr.dispute.resolution} — {apr.dispute.resolvedBy}, {fmtDateTime(apr.dispute.resolvedAt)}</Alert>}
            </div>
          </div>
        </Card>
      )}

      {/* 8 — History */}
      <Card title="History">
        {timeline.length === 0 ? <EmptyState>No history recorded.</EmptyState> : (
          <ul className="timeline">{timeline.map((h) => <li key={h.id}><span className="when">{fmtDateTime(h.at)}</span><span><b>{h.action}</b> by {h.by}{h.detail && <span className="muted"> — {h.detail}</span>}</span></li>)}</ul>
        )}
      </Card>

      {modal === 'object' && <ReasonModal title="Object to the goals" label="What should change? (sent back to the manager)" confirmLabel="Object" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal === 'return' && <ReasonModal title={`Return to manager · ${apr.code}`} confirmLabel="Return" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal === 'dispute' && <ReasonModal title={`Raise a dispute · ${apr.code}`} label="Grounds for the dispute" danger confirmLabel="Raise dispute" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal === 'resolve' && <ReasonModal title={`Resolve dispute · ${apr.code}`} label="Resolution (shared with the employee)" confirmLabel="Resolve & republish" onConfirm={withReason} onClose={() => setModal(null)} />}
      {modal === 'cancel' && <ReasonModal title={`Cancel appraisal · ${apr.code}`} danger confirmLabel="Cancel appraisal" onConfirm={withReason} onClose={() => setModal(null)} />}
    </div>
  );
}

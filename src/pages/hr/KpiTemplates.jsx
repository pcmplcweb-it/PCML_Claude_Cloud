import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, EmptyState, Field } from '../../components/ui';
import { APPRAISAL_TYPES, DEFAULT_KPI_TEMPLATES, DEPARTMENTS, DESIGNATIONS, KPI_CATEGORIES, KPI_DIRECTIONS, KPI_METHODS, KPI_SOURCES, KPI_UNITS, canHr } from '../../hr/config';
import { scoreKpiLine, uid, validateTemplate } from '../../hr/helpers';
import { useStore } from '../../store/StoreContext';

const weightSum = (t) => (t.items || []).reduce((s, i) => s + Number(i.weight || 0), 0);
const emptyItem = (n) => ({ id: uid('kpi'), code: `KPI-${n}`, name: '', description: '', category: 'Operational', unit: 'Nos', direction: 'higher', method: 'A', target: '', thresholdPct: '80', stretchPct: '120', cap: '120', weight: '', isGate: false, source: 'manual', steps: [] });
const emptyTemplate = (n) => ({ id: uid('tpl'), code: `TPL-NEW${n}`, name: 'New template', designationCodes: [], departmentCodes: [], cycleTypes: ['Annual', 'Half-yearly'], weights: { kpi: 80, competency: 20 }, competencySet: 'staff', attendanceMode: 'kpi', active: true, description: '', items: [emptyItem(1)] });
const TEXT = { width: 150, textAlign: 'left' };

export default function KpiTemplates() {
  const { state, dispatch, currentUser, notify } = useStore();
  const role = currentUser.role;
  const by = currentUser.name;
  const settings = state.hrSettings;
  const [templates, setTemplates] = useState(() => structuredClone(state.kpiTemplates));
  const [selId, setSelId] = useState(state.kpiTemplates[0]?.id || '');
  const [errors, setErrors] = useState([]);
  const [sample, setSample] = useState({}); // item id → sample actual for the score preview

  useEffect(() => { setTemplates(structuredClone(state.kpiTemplates)); setErrors([]); }, [state.kpiTemplates]);

  const editable = canHr(role, 'manageKpi');
  const dis = !editable;
  const sel = templates.find((t) => t.id === selId) || templates[0] || null;
  const referenced = useMemo(() => new Set(state.appraisals.map((a) => a.templateId)), [state.appraisals]);
  const dirty = useMemo(() => JSON.stringify(templates) !== JSON.stringify(state.kpiTemplates), [templates, state.kpiTemplates]);

  const upd = (patch) => setTemplates(templates.map((t) => (t.id === sel.id ? { ...t, ...patch } : t)));
  const updItem = (i, patch) => upd({ items: sel.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const toggleIn = (key, code) => upd({ [key]: sel[key].includes(code) ? sel[key].filter((c) => c !== code) : [...sel[key], code] });
  const addItem = () => upd({ items: [...sel.items, emptyItem(sel.items.length + 1)] });
  const removeItem = (i) => upd({ items: sel.items.filter((_, k) => k !== i) });
  const updStep = (i, s, patch) => updItem(i, { steps: sel.items[i].steps.map((st, k) => (k === s ? { ...st, ...patch } : st)) });

  const addTemplate = () => { const t = emptyTemplate(templates.length + 1); setTemplates([...templates, t]); setSelId(t.id); };
  const duplicate = () => {
    const copy = { ...structuredClone(sel), id: uid('tpl'), code: `${sel.code}-COPY`, name: `${sel.name} (copy)`, designationCodes: [], departmentCodes: [], items: sel.items.map((i) => ({ ...i, id: uid('kpi') })) };
    setTemplates([...templates, copy]); setSelId(copy.id);
  };
  const remove = () => {
    if (referenced.has(sel.id)) { notify('This template is referenced by appraisals; mark it inactive instead.', 'error'); return; }
    if (!window.confirm(`Delete template ${sel.code}?`)) return;
    const rest = templates.filter((t) => t.id !== sel.id);
    setTemplates(rest); setSelId(rest[0]?.id || '');
  };
  const restore = () => {
    if (!window.confirm('Replace the current templates with the built-in defaults? Unsaved edits are lost.')) return;
    const fresh = structuredClone(DEFAULT_KPI_TEMPLATES);
    setTemplates(fresh); setSelId(fresh[0].id); setErrors([]);
  };
  const save = () => {
    const errs = templates.flatMap((t) => validateTemplate(t, settings).map((e) => `${t.code || t.name}: ${e}`));
    if (new Set(templates.map((t) => t.code.trim().toUpperCase())).size !== templates.length) errs.push('Template codes must be unique.');
    templates.forEach((t) => { if (new Set(t.items.map((i) => i.code.trim().toUpperCase())).size !== t.items.length) errs.push(`${t.code}: KPI codes must be unique within the template.`); });
    setErrors(errs);
    if (errs.length) { notify(errs[0], 'error'); return; }
    dispatch({ type: 'SET_KPI_TEMPLATES', kpiTemplates: templates, by });
    notify('KPI templates saved.');
  };

  const sum = sel ? weightSum(sel) : 0;
  const preview = useMemo(() => {
    if (!sel) return { lines: [], kpi: null };
    const lines = sel.items.map((it) => {
      const actual = sample[it.id] ?? '';
      const r = scoreKpiLine(it, actual, settings);
      return { item: it, actual, ...r, weighted: r.score == null ? null : Math.round(r.score * Number(it.weight || 0)) / 100 };
    });
    const any = lines.some((l) => l.weighted != null);
    return { lines, kpi: any ? Math.min(100, Math.round(lines.reduce((s, l) => s + (l.weighted || 0), 0) * 100) / 100) : null };
  }, [sel, sample, settings]);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>KPI templates</h1><p className="sub">One template per designation group: KPI lines, scoring method, gates and the KPI / competency split used when a cycle opens.</p></div>
        {editable && (
          <div className="page-actions">
            <button className="btn" onClick={restore}>Restore defaults</button>
            <button className="btn" onClick={addTemplate}>+ Add template</button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty}>Save changes</button>
          </div>
        )}
      </div>

      {!editable && <Alert kind="info">Templates are read-only for your role; HR Officer, HR Head or Administrator can change them.</Alert>}
      {errors.length > 0 && <Alert kind="danger" title={`${errors.length} issue(s) must be fixed before saving`}><ul>{errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}{errors.length > 10 && <li>…and {errors.length - 10} more</li>}</ul></Alert>}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 1fr) 3fr', gap: 16 }}>
        <Card title={`Templates (${templates.length})`} bodyClass="stack">
          {templates.length === 0 ? <EmptyState>No templates. Add one or restore the defaults.</EmptyState> : templates.map((t) => {
            const w = weightSum(t);
            return (
              <div key={t.id} className="clickable" onClick={() => setSelId(t.id)} style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: sel?.id === t.id ? 'var(--primary-soft)' : 'transparent', cursor: 'pointer' }}>
                <div className="row-between"><span className="strong">{t.name}</span><span className={`badge ${w === 100 ? 'badge-green' : 'badge-amber'}`}>Σ {w}</span></div>
                <div className="small muted mono">{t.code}</div>
                <div className="small muted">{(t.designationCodes || []).join(', ') || (t.departmentCodes || []).join(', ') || 'no designation'} · {t.items.length} KPI{t.items.length === 1 ? '' : 's'}{t.active === false ? ' · inactive' : ''}{referenced.has(t.id) ? ' · in use' : ''}</div>
              </div>
            );
          })}
        </Card>

        {!sel ? <Card><EmptyState>Select a template to edit it.</EmptyState></Card> : (
          <div className="stack">
            <Card title={`${sel.name} · ${sel.code}`} actions={editable && <><button className="btn btn-sm" onClick={duplicate}>Duplicate</button><button className="btn btn-sm btn-ghost" disabled={referenced.has(sel.id)} title={referenced.has(sel.id) ? 'Referenced by appraisals — set inactive instead' : ''} onClick={remove}>Delete</button></>}>
              <div className="form-grid cols-3">
                <Field label="Code" required><input className="mono" disabled={dis} value={sel.code} onChange={(e) => upd({ code: e.target.value.toUpperCase() })} /></Field>
                <Field label="Name" required><input disabled={dis} value={sel.name} onChange={(e) => upd({ name: e.target.value })} /></Field>
                <label className="check" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" disabled={dis} checked={sel.active !== false} onChange={(e) => upd({ active: e.target.checked })} /> Active (used when cycles open)</label>
                <Field label="Description" className="span-3"><input disabled={dis} value={sel.description} onChange={(e) => upd({ description: e.target.value })} /></Field>
                <Field label="KPI weight %" required hint="KPI + competency = 100"><input type="number" min="0" max="100" disabled={dis} value={sel.weights.kpi} onChange={(e) => upd({ weights: { kpi: Number(e.target.value), competency: 100 - Number(e.target.value) } })} /></Field>
                <Field label="Competency weight %" required><input type="number" min="0" max="100" disabled={dis} value={sel.weights.competency} onChange={(e) => upd({ weights: { kpi: 100 - Number(e.target.value), competency: Number(e.target.value) } })} /></Field>
                <Field label="Competency set" hint="Manager set adds Leadership and Planning"><select disabled={dis} value={sel.competencySet} onChange={(e) => upd({ competencySet: e.target.value })}><option value="staff">Staff</option><option value="manager">Manager</option></select></Field>
                <Field label="Attendance mode" hint="kpi: scored line · gate: caps the grade only"><select disabled={dis} value={sel.attendanceMode} onChange={(e) => upd({ attendanceMode: e.target.value })}><option value="kpi">KPI line</option><option value="gate">Gate only</option></select></Field>
                <Field label="Cycle types" className="span-2">
                  <div className="chip-list">{APPRAISAL_TYPES.map((c) => <label key={c} className={`chip ${sel.cycleTypes.includes(c) ? 'on' : ''}`} style={{ cursor: dis ? 'default' : 'pointer' }}><input type="checkbox" style={{ display: 'none' }} disabled={dis} checked={sel.cycleTypes.includes(c)} onChange={() => toggleIn('cycleTypes', c)} />{sel.cycleTypes.includes(c) ? '✓ ' : ''}{c}</label>)}</div>
                </Field>
                <Field label="Designations" className="span-3" hint="Designation match wins over department match when a cycle opens">
                  <div className="chip-list">{DESIGNATIONS.map((d) => <label key={d.code} className={`chip ${sel.designationCodes.includes(d.code) ? 'on' : ''}`} style={{ cursor: dis ? 'default' : 'pointer' }} title={d.name}><input type="checkbox" style={{ display: 'none' }} disabled={dis} checked={sel.designationCodes.includes(d.code)} onChange={() => toggleIn('designationCodes', d.code)} />{sel.designationCodes.includes(d.code) ? '✓ ' : ''}{d.code}</label>)}</div>
                </Field>
                <Field label="Departments (fallback)" className="span-3">
                  <div className="chip-list">{DEPARTMENTS.map((d) => <label key={d.code} className={`chip ${sel.departmentCodes.includes(d.code) ? 'on' : ''}`} style={{ cursor: dis ? 'default' : 'pointer' }} title={d.name}><input type="checkbox" style={{ display: 'none' }} disabled={dis} checked={sel.departmentCodes.includes(d.code)} onChange={() => toggleIn('departmentCodes', d.code)} />{sel.departmentCodes.includes(d.code) ? '✓ ' : ''}{d.code}</label>)}</div>
                </Field>
              </div>
            </Card>

            <Card title={`KPI lines (${sel.items.length})`} actions={<><span className={`badge ${sum === 100 ? 'badge-green' : 'badge-amber'}`}>Σ weight {sum}</span>{editable && <button className="btn btn-sm" onClick={addItem} disabled={sel.items.length >= 10}>+ Add KPI</button>}</>}>
              <div className="table-wrap"><table className="att-grid">
                <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>Direction</th><th>Method</th><th className="right">Target</th><th className="right">Thr %</th><th className="right">Str %</th><th className="right">Cap</th><th className="right">Weight</th><th>Gate</th><th>Source</th><th></th></tr></thead>
                <tbody>{sel.items.map((it, i) => (
                  <Row key={it.id} it={it} i={i} dis={dis} updItem={updItem} updStep={updStep} removeItem={removeItem} />
                ))}</tbody>
              </table></div>
              <p className="small muted mt-8">Methods: A linear % of target (capped) · B threshold / target / stretch (0 → 50 → 100 → 120) · C rating 1–5 × 20 · D milestone fraction · E step table (first matching bound). Gate KPIs scoring below {settings.appraisal?.gates?.gateKpiFailBelow} cap the grade at {settings.appraisal?.gates?.gateKpiCap}.</p>
            </Card>

            <Card title="Preview score" actions={<span className="badge badge-blue">KPI score {preview.kpi ?? '—'}</span>}>
              <p className="small muted mb-8">Enter a sample actual per line to see how the method scores it (weighted = score × weight ÷ 100; the KPI score is the sum capped at 100).</p>
              <div className="table-wrap"><table className="att-grid">
                <thead><tr><th>KPI</th><th className="right">Target</th><th className="right">Sample actual</th><th className="right">Achievement %</th><th className="right">Score</th><th className="right">Weighted</th></tr></thead>
                <tbody>{preview.lines.map((l) => (
                  <tr key={l.item.id}>
                    <td><span className="mono">{l.item.code}</span> <span className="small muted">{l.item.name}</span></td>
                    <td className="right mono">{l.item.target || '—'} {l.item.unit}</td>
                    <td className="right"><input type="number" step="any" value={l.actual} onChange={(e) => setSample({ ...sample, [l.item.id]: e.target.value })} /></td>
                    <td className="right mono">{l.ach ?? '—'}</td>
                    <td className="right mono">{l.score ?? '—'}</td>
                    <td className="right mono strong">{l.weighted ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// One editable KPI line plus its step table when the method is E.
function Row({ it, i, dis, updItem, updStep, removeItem }) {
  return (
    <>
      <tr>
        <td><input className="mono" style={{ width: 80, textAlign: 'left' }} disabled={dis} value={it.code} onChange={(e) => updItem(i, { code: e.target.value.toUpperCase() })} /></td>
        <td><input style={TEXT} disabled={dis} value={it.name} onChange={(e) => updItem(i, { name: e.target.value })} title={it.description} /></td>
        <td><select disabled={dis} value={it.category} onChange={(e) => updItem(i, { category: e.target.value })}>{KPI_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
        <td><select disabled={dis} value={it.unit} onChange={(e) => updItem(i, { unit: e.target.value })}>{KPI_UNITS.map((u) => <option key={u}>{u}</option>)}</select></td>
        <td><select disabled={dis} value={it.direction} onChange={(e) => updItem(i, { direction: e.target.value })}>{KPI_DIRECTIONS.map((d) => <option key={d}>{d}</option>)}</select></td>
        <td><select disabled={dis} value={it.method} title={KPI_METHODS.find((m) => m.code === it.method)?.name} onChange={(e) => updItem(i, { method: e.target.value, steps: e.target.value === 'E' && !it.steps.length ? [{ bound: it.target || '', score: '100' }] : it.steps })}>{KPI_METHODS.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.name}</option>)}</select></td>
        <td><input type="number" step="any" disabled={dis} value={it.target} onChange={(e) => updItem(i, { target: e.target.value })} /></td>
        <td><input type="number" disabled={dis || it.method !== 'B'} value={it.thresholdPct} onChange={(e) => updItem(i, { thresholdPct: e.target.value })} /></td>
        <td><input type="number" disabled={dis || it.method !== 'B'} value={it.stretchPct} onChange={(e) => updItem(i, { stretchPct: e.target.value })} /></td>
        <td><input type="number" disabled={dis} value={it.cap} onChange={(e) => updItem(i, { cap: e.target.value })} /></td>
        <td><input type="number" min="5" max="40" disabled={dis} value={it.weight} onChange={(e) => updItem(i, { weight: e.target.value })} /></td>
        <td className="center"><input type="checkbox" disabled={dis} checked={!!it.isGate} onChange={(e) => updItem(i, { isGate: e.target.checked })} /></td>
        <td><select disabled={dis} value={it.source} onChange={(e) => updItem(i, { source: e.target.value })}>{KPI_SOURCES.map((s) => <option key={s}>{s}</option>)}</select></td>
        <td>{!dis && <button className="btn btn-sm btn-ghost" onClick={() => removeItem(i)} title="Remove line">✕</button>}</td>
      </tr>
      {it.method === 'E' && (
        <tr>
          <td colSpan={14} style={{ background: 'var(--surface-2)' }}>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="small strong">Step table ({it.direction === 'lower' ? 'actual ≤ bound' : 'actual ≥ bound'} → score, first match wins)</span>
              {it.steps.map((s, k) => (
                <span key={k} className="row" style={{ gap: 4, alignItems: 'center' }}>
                  <input type="number" step="any" disabled={dis} value={s.bound} placeholder="bound" onChange={(e) => updStep(i, k, { bound: e.target.value })} />
                  <span className="muted">→</span>
                  <input type="number" disabled={dis} value={s.score} placeholder="score" onChange={(e) => updStep(i, k, { score: e.target.value })} />
                  {!dis && <button className="btn btn-sm btn-ghost" onClick={() => updItem(i, { steps: it.steps.filter((_, j) => j !== k) })}>✕</button>}
                </span>
              ))}
              {!dis && <button className="btn btn-sm" onClick={() => updItem(i, { steps: [...it.steps, { bound: '', score: '' }] })}>+ Step</button>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

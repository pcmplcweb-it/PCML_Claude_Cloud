import { useEffect, useState } from 'react';
import { Alert, Card, Field } from '../components/ui';
import { DEFAULT_CUSTOMER_TYPES, DOC_TYPES, PERMISSIONS, ROLES } from '../data/config';
import { useStore } from '../store/StoreContext';

export default function Settings() {
  const { state, dispatch, notify } = useStore();
  const [types, setTypes] = useState(() => structuredClone(state.customerTypes));
  const [tab, setTab] = useState(0);

  // Keep the editor in step with the store (e.g. after "Reset demo data").
  useEffect(() => { setTypes(structuredClone(state.customerTypes)); }, [state.customerTypes]);

  const upd = (i, patch) => setTypes(types.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const toggleDoc = (i, doc) => {
    const t = types[i];
    upd(i, { requiredDocs: t.requiredDocs.includes(doc) ? t.requiredDocs.filter((d) => d !== doc) : [...t.requiredDocs, doc] });
  };
  const addType = () => setTypes([...types, { code: `TYPE${types.length + 1}`, name: 'New customer type', description: '', requiredDocs: [DOC_TYPES.NID], requireBank: false, requireLocation: false, requireBusinessReg: false, minReferences: 1, reviewMonths: 12 }]);
  const removeType = (i) => {
    const inUse = state.customers.some((c) => c.customerType === types[i].code);
    if (inUse) { notify('This type is used by existing customers and cannot be removed.', 'error'); return; }
    setTypes(types.filter((_, k) => k !== i));
  };
  const save = () => {
    if (types.some((t) => !t.code.trim() || !t.name.trim())) { notify('Every type needs a code and a name.', 'error'); return; }
    if (new Set(types.map((t) => t.code.trim())).size !== types.length) { notify('Customer type codes must be unique.', 'error'); return; }
    dispatch({ type: 'SET_TYPES', customerTypes: types });
    notify('Customer type configuration saved.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Required documents and verification depth are configured per customer type.</p></div>
        <div className="page-actions">
          <button className="btn" onClick={() => setTypes(structuredClone(DEFAULT_CUSTOMER_TYPES))}>Restore defaults</button>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          <button className={`tab ${tab === 0 ? 'active' : ''}`} onClick={() => setTab(0)}>Customer types</button>
          <button className={`tab ${tab === 1 ? 'active' : ''}`} onClick={() => setTab(1)}>Roles &amp; permissions</button>
        </div>
        <div className="card-body stack">
          {tab === 0 && (
            <>
              {types.map((t, i) => (
                <Card key={t.code || `new-${i}`} title={`${t.name} (${t.code})`} actions={<button className="btn btn-sm btn-ghost" onClick={() => removeType(i)}>Remove</button>}>
                  <div className="form-grid cols-3">
                    <Field label="Code"><input value={t.code} onChange={(e) => upd(i, { code: e.target.value.toUpperCase() })} disabled={state.customers.some((c) => c.customerType === t.code)} /></Field>
                    <Field label="Name"><input value={t.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
                    <Field label="Review cycle (months)"><input type="number" min="1" value={t.reviewMonths} onChange={(e) => upd(i, { reviewMonths: Number(e.target.value) })} /></Field>
                    <Field label="Minimum references" hint="References required before submission."><input type="number" min="0" value={t.minReferences ?? 0} onChange={(e) => upd(i, { minReferences: Number(e.target.value) })} /></Field>
                    <Field label="Description" className="span-2"><input value={t.description} onChange={(e) => upd(i, { description: e.target.value })} /></Field>
                    <label className="check"><input type="checkbox" checked={t.requireBusinessReg} onChange={(e) => upd(i, { requireBusinessReg: e.target.checked })} /> Trade license &amp; TIN mandatory</label>
                    <label className="check"><input type="checkbox" checked={t.requireBank} onChange={(e) => upd(i, { requireBank: e.target.checked })} /> Bank account mandatory</label>
                    <label className="check"><input type="checkbox" checked={t.requireLocation} onChange={(e) => upd(i, { requireLocation: e.target.checked })} /> Outlet GPS mandatory</label>
                    <Field label="Required documents" className="span-3">
                      <div className="chip-list">
                        {Object.values(DOC_TYPES).map((d) => (
                          <label key={d} className={`chip ${t.requiredDocs.includes(d) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={t.requiredDocs.includes(d)} onChange={() => toggleDoc(i, d)} />{t.requiredDocs.includes(d) ? '✓ ' : ''}{d}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                </Card>
              ))}
              <button className="btn" onClick={addType}>+ Add customer type</button>
            </>
          )}

          {tab === 1 && (
            <>
              <Alert kind="info">Permissions are defined in code for this demo. The matrix below shows which roles may perform each action; sensitive identity, tax and bank numbers are masked for roles without "View sensitive data".</Alert>
              <div className="table-wrap"><table>
                <thead><tr><th>Action</th>{Object.values(ROLES).map((r) => <th key={r}>{r}</th>)}</tr></thead>
                <tbody>{Object.entries(PERMISSIONS).map(([action, roles]) => (
                  <tr key={action}>
                    <td className="strong">{{ create: 'Create application', edit: 'Edit application / upload documents', submit: 'Submit for verification', verify: 'Verify documents & risk', returnForCorrection: 'Return for correction', approve: 'Approve / activate', reject: 'Reject', suspend: 'Suspend', reinstate: 'Reinstate', creditDecide: 'Decide credit', creditRequest: 'Request credit', viewSensitive: 'View sensitive data', viewDocuments: 'View documents', settings: 'Change settings', audit: 'View audit trail', review: 'Record periodic review' }[action] || action}</td>
                    {Object.values(ROLES).map((r) => <td key={r} className="center">{roles.includes(r) ? <span className="badge badge-green">✓</span> : <span className="muted">—</span>}</td>)}
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

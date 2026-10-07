import { useEffect, useState } from 'react';
import { Alert, Card, Field } from '../../components/ui';
import { DEFAULT_SUPPLIER_TYPES, KYS_PERMISSIONS, KYS_ROLES, SUPPLIER_DOC_TYPES } from '../../kys/config';
import { useStore } from '../../store/StoreContext';
import { uid } from '../../utils/helpers';

const ACTION_LABELS = {
  create: 'Create application', edit: 'Edit application / upload documents', submit: 'Submit for evaluation', evaluate: 'Evaluate (documents, site, references, risk)',
  returnForCorrection: 'Return for correction', approve: 'Approve supplier', reject: 'Reject', suspend: 'Suspend', blacklist: 'Blacklist', reinstate: 'Reinstate',
  termsDecide: 'Decide commercial terms', termsRequest: 'Request commercial terms', viewSensitive: 'View sensitive data', viewDocuments: 'View documents',
  settings: 'Change settings', audit: 'View audit trail', review: 'Record periodic review',
};
// _key is a stable React key for each card; the code is editable so it can't be the key.
const withKeys = (list) => structuredClone(list).map((t) => ({ ...t, _key: uid('st') }));

export default function SupplierSettings() {
  const { state, dispatch, notify } = useStore();
  const [types, setTypes] = useState(() => withKeys(state.supplierTypes));
  const [tab, setTab] = useState(0);

  useEffect(() => { setTypes(withKeys(state.supplierTypes)); }, [state.supplierTypes]);

  const upd = (i, patch) => setTypes(types.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const toggleDoc = (i, doc) => {
    const t = types[i];
    upd(i, { requiredDocs: t.requiredDocs.includes(doc) ? t.requiredDocs.filter((d) => d !== doc) : [...t.requiredDocs, doc] });
  };
  const addType = () => setTypes([...types, { _key: uid('st'), code: `TYPE${types.length + 1}`, name: 'New supplier type', description: '', requiredDocs: [SUPPLIER_DOC_TYPES.TRADE_LICENSE, SUPPLIER_DOC_TYPES.TIN], requireSiteAudit: false, requireFinancials: false, requireBank: true, minReferences: 1, reviewMonths: 12 }]);
  const removeType = (i) => {
    if (state.suppliers.some((s) => s.supplierType === types[i].code)) { notify('This type is used by existing suppliers and cannot be removed.', 'error'); return; }
    setTypes(types.filter((_, k) => k !== i));
  };
  const save = () => {
    if (types.some((t) => !t.code.trim() || !t.name.trim())) { notify('Every type needs a code and a name.', 'error'); return; }
    if (new Set(types.map((t) => t.code.trim())).size !== types.length) { notify('Supplier type codes must be unique.', 'error'); return; }
    const missing = [...new Set(state.suppliers.map((s) => s.supplierType))].filter((c) => c && !types.some((t) => t.code.trim() === c));
    if (missing.length) { notify(`Supplier type(s) ${missing.join(', ')} are used by existing suppliers and must be kept.`, 'error'); return; }
    dispatch({ type: 'SET_SUPPLIER_TYPES', supplierTypes: types.map(({ _key, ...t }) => t) });
    notify('Supplier type configuration saved.');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Required documents and evaluation depth are configured per supplier type.</p></div>
        <div className="page-actions">
          <button className="btn" onClick={() => setTypes(withKeys(DEFAULT_SUPPLIER_TYPES))}>Restore defaults</button>
          <button className="btn btn-primary" onClick={save}>Save changes</button>
        </div>
      </div>

      <div className="card">
        <div className="tabs" style={{ padding: '0 12px' }}>
          <button className={`tab ${tab === 0 ? 'active' : ''}`} onClick={() => setTab(0)}>Supplier types</button>
          <button className={`tab ${tab === 1 ? 'active' : ''}`} onClick={() => setTab(1)}>Roles &amp; permissions</button>
        </div>
        <div className="card-body stack">
          {tab === 0 && (
            <>
              {types.map((t, i) => (
                <Card key={t._key} title={`${t.name} (${t.code})`} actions={<button className="btn btn-sm btn-ghost" onClick={() => removeType(i)}>Remove</button>}>
                  <div className="form-grid cols-3">
                    <Field label="Code"><input value={t.code} onChange={(e) => upd(i, { code: e.target.value.toUpperCase() })} disabled={state.suppliers.some((s) => s.supplierType === t.code)} /></Field>
                    <Field label="Name"><input value={t.name} onChange={(e) => upd(i, { name: e.target.value })} /></Field>
                    <Field label="Review cycle (months)"><input type="number" min="1" value={t.reviewMonths} onChange={(e) => upd(i, { reviewMonths: Number(e.target.value) })} /></Field>
                    <Field label="Minimum references"><input type="number" min="0" value={t.minReferences ?? 0} onChange={(e) => upd(i, { minReferences: Number(e.target.value) })} /></Field>
                    <Field label="Description" className="span-2"><input value={t.description} onChange={(e) => upd(i, { description: e.target.value })} /></Field>
                    <label className="check"><input type="checkbox" checked={t.requireSiteAudit} onChange={(e) => upd(i, { requireSiteAudit: e.target.checked })} /> Site audit mandatory</label>
                    <label className="check"><input type="checkbox" checked={t.requireFinancials} onChange={(e) => upd(i, { requireFinancials: e.target.checked })} /> Turnover / financials mandatory</label>
                    <label className="check"><input type="checkbox" checked={t.requireBank} onChange={(e) => upd(i, { requireBank: e.target.checked })} /> Bank account mandatory</label>
                    <Field label="Required documents" className="span-3">
                      <div className="chip-list">
                        {Object.values(SUPPLIER_DOC_TYPES).map((d) => (
                          <label key={d} className={`chip ${t.requiredDocs.includes(d) ? 'on' : ''}`} style={{ cursor: 'pointer' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={t.requiredDocs.includes(d)} onChange={() => toggleDoc(i, d)} />{t.requiredDocs.includes(d) ? '✓ ' : ''}{d}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                </Card>
              ))}
              <button className="btn" onClick={addType}>+ Add supplier type</button>
            </>
          )}

          {tab === 1 && (
            <>
              <Alert kind="info">Permissions are defined in code for this demo. The Administrator role is shared with the KYC portal.</Alert>
              <div className="table-wrap"><table>
                <thead><tr><th>Action</th>{Object.values(KYS_ROLES).map((r) => <th key={r}>{r}</th>)}</tr></thead>
                <tbody>{Object.entries(KYS_PERMISSIONS).map(([action, roles]) => (
                  <tr key={action}>
                    <td className="strong">{ACTION_LABELS[action] || action}</td>
                    {Object.values(KYS_ROLES).map((r) => <td key={r} className="center">{roles.includes(r) ? <span className="badge badge-green">✓</span> : <span className="muted">—</span>}</td>)}
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

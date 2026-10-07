// Small report building blocks shared by the HR report and dashboard pages
// (same markup as the KYS reports, which keep their own local copies).

export const TONE = { gray: '#5b6675', blue: '#2a62c7', indigo: '#4b4fc4', purple: '#7a3fb3', green: '#1e7e4b', amber: '#b26a00', red: '#c62828' };

export const BarList = ({ rows, color }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
          <div className="bar"><span style={{ width: `${(r.value / max) * 100}%`, background: r.color || color || 'var(--primary)' }} /></div>
          <span className="right mono">{r.value}</span>
        </div>
      ))}
    </div>
  );
};

export const toCsv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

export const exportCsv = (rows, fileName) => {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName; a.click();
  URL.revokeObjectURL(a.href);
};

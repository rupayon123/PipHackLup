export function MetricCard({
  label,
  value,
  detail
}: Readonly<{
  label: string;
  value: string;
  detail: string;
}>) {
  return (
    <section className="card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      <p className="small">{detail}</p>
    </section>
  );
}

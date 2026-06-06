export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions
}: Readonly<{
  eyebrow: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}>) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="title">{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {actions ? <div className="button-row">{actions}</div> : null}
    </header>
  );
}

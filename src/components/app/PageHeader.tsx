export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 border-b border-dashed border-line pb-8 md:flex-row md:items-end md:justify-between">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="h2 mt-6">{title}</h1>
        {description ? <div className="lead mt-3 max-w-[640px]">{description}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="relative border border-dashed border-line bg-white/50 px-8 py-14 text-center grain">
      <p className="font-serif text-[26px] leading-[1.1] tracking-[-0.02em] text-black">{title}</p>
      {children ? <div className="body-copy mx-auto mt-3 max-w-[520px]">{children}</div> : null}
      {action ? <div className="mt-6 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

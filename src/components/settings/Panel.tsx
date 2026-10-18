export function Panel({
  title,
  description,
  children,
  footer,
  tone = "default",
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section className={`border bg-white ${tone === "danger" ? "border-danger/30" : "border-black/15"}`}>
      <header className="border-b border-dashed border-line px-6 py-5">
        <h2 className="h4">{title}</h2>
        {description ? <div className="mt-1.5 text-[14px] leading-[22px] text-body">{description}</div> : null}
      </header>
      {children ? <div className="px-6 py-5">{children}</div> : null}
      {footer ? <footer className="border-t border-dashed border-line bg-paper px-6 py-3">{footer}</footer> : null}
    </section>
  );
}

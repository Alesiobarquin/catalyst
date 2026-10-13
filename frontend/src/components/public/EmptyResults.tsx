import Link from "next/link";

interface EmptyResultsProps {
  title: string;
  children: React.ReactNode;
  onViewReport: () => void;
  filtered?: boolean;
  resetPath?: string;
  showMethodLink?: boolean;
}

export function EmptyResults({ title, children, onViewReport, filtered, resetPath = "/", showMethodLink = true }: EmptyResultsProps) {
  return (
    <section className="empty-results">
      <span className="empty-record-mark" aria-hidden="true">—</span>
      <div className="empty-results-copy">
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      <div className="empty-results-actions">
        {filtered ? <Link className="button-secondary" href={resetPath}>Clear filters</Link> : <button type="button" className="button-secondary" onClick={onViewReport}>View scan report</button>}
        {showMethodLink && <Link className="inline-action" href="/architecture">How the pipeline works <span aria-hidden="true">→</span></Link>}
      </div>
    </section>
  );
}

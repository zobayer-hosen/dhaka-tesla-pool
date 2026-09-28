import { Card } from './Card';

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}

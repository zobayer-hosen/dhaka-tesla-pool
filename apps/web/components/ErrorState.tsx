import { Button } from './Button';
import { Card } from './Card';

// Shown instead of a white screen when a request fails, e.g. the API is down.
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50 py-8 text-center">
      <p className="font-medium text-rose-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Card>
  );
}

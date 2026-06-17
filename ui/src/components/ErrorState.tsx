import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  message: string;
  details?: string;
  retry?: () => void;
}

export function ErrorState({ message, details, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-muted/50 p-4 mb-4">
        <AlertCircle className="h-10 w-10 text-destructive/60" aria-hidden={true} />
      </div>
      <p className="text-sm text-destructive mb-1">{message}</p>
      {details && (
        <p className="text-xs text-muted-foreground mb-4">{details}</p>
      )}
      {retry && (
        <Button variant="outline" size="sm" onClick={retry} className="mt-3">
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

import type { ImplementationStatus } from "@/api/socialPlatforms";
import { cn } from "@/lib/utils";

const variants: Record<ImplementationStatus, { className: string; label: string }> = {
  implemented: {
    className: "border-green-500 text-green-600 dark:text-green-400",
    label: "Implemented",
  },
  in_progress: {
    className: "border-yellow-500 text-yellow-600 dark:text-yellow-400",
    label: "In progress",
  },
  not_implemented: {
    className: "border-gray-400 text-gray-500 dark:text-gray-400",
    label: "Not implemented",
  },
};

interface Props {
  status: ImplementationStatus;
  className?: string;
}

export function PlatformImplementationBadge({ status, className }: Props) {
  const v = variants[status];
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-xs font-medium",
        v.className,
        className,
      )}
    >
      {v.label}
    </span>
  );
}

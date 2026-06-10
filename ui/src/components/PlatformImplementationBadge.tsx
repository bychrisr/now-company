import type { ImplementationStatus } from "@/api/socialPlatforms";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

const variantClass: Record<ImplementationStatus, string> = {
  implemented: "border-green-500 text-green-600 dark:text-green-400",
  in_progress: "border-yellow-500 text-yellow-600 dark:text-yellow-400",
  not_implemented: "border-gray-400 text-gray-500 dark:text-gray-400",
};

// Mapeia status do schema (snake_case) → chave i18n (camelCase) em platforms.impl.*
const i18nKey: Record<ImplementationStatus, string> = {
  implemented: "implemented",
  in_progress: "inProgress",
  not_implemented: "notImplemented",
};

interface Props {
  status: ImplementationStatus;
  className?: string;
}

export function PlatformImplementationBadge({ status, className }: Props) {
  const { t } = useTranslation();
  const label = t(`platforms.impl.${i18nKey[status]}`) as string;
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-xs font-medium",
        variantClass[status],
        className,
      )}
    >
      {label}
    </span>
  );
}

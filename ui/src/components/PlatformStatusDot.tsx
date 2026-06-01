import type { PlatformHealthStatus } from "@/api/socialPlatforms";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "@/i18n";

const colorClass: Record<PlatformHealthStatus, string> = {
  healthy: "bg-green-500",
  warning: "bg-yellow-400",
  error: "bg-red-500",
};

interface Props {
  status: PlatformHealthStatus;
}

export function PlatformStatusDot({ status }: Props) {
  const { t } = useTranslation();
  // Mapeia o status do health para chave i18n — os nomes batem 1:1 com platforms.health.*
  const label = t(`platforms.health.${status}`) as string;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full cursor-default ${colorClass[status]}`}
          aria-label={label}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

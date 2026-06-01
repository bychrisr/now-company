import type { PlatformHealthStatus } from "@/api/socialPlatforms";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const colorClass: Record<PlatformHealthStatus, string> = {
  healthy: "bg-green-500",
  warning: "bg-yellow-400",
  error: "bg-red-500",
};

const label: Record<PlatformHealthStatus, string> = {
  healthy: "Operational",
  warning: "Attention",
  error: "Not configured",
};

interface Props {
  status: PlatformHealthStatus;
}

export function PlatformStatusDot({ status }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full cursor-default ${colorClass[status]}`}
          aria-label={label[status]}
        />
      </TooltipTrigger>
      <TooltipContent>{label[status]}</TooltipContent>
    </Tooltip>
  );
}

import type { SyncStatus } from "@/lib/cloud";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  success: "bg-success/12 text-success border-success/25",
  warning: "bg-warning/18 text-warning-foreground border-warning/40",
  destructive: "bg-destructive/10 text-destructive border-destructive/25",
  conflict: "bg-accent text-accent-foreground border-primary/30",
  info: "bg-info/12 text-info border-info/25",
  muted: "bg-muted text-muted-foreground border-border",
};

function toneFor(status: string) {
  switch (status) {
    case "SYNCHRONIZED":
    case "SUCCESS":
      return "success";
    case "PARTIAL":
    case "SKIPPED":
      return "warning";
    case "FAILED":
      return "destructive";
    case "CONFLICT":
      return "conflict";
    case "SYNCING":
    case "INFO":
      return "info";
    default:
      return "muted";
  }
}

export function StatusBadge({
  status,
  className,
}: {
  status: SyncStatus | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        TONES[toneFor(status)],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

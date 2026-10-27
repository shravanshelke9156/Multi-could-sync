import { PROVIDER_META, type Provider, type SyncStatus } from "@/lib/cloud";

const MARK: Record<string, string> = {
  SYNCHRONIZED: "✓",
  PENDING: "•",
  SYNCING: "…",
  FAILED: "✗",
  PARTIAL: "!",
  CONFLICT: "≠",
};

const COLOR: Record<string, string> = {
  SYNCHRONIZED: "text-success",
  FAILED: "text-destructive",
  CONFLICT: "text-primary",
  SYNCING: "text-info",
};

export function CloudPill({
  provider,
  status,
  compact,
}: {
  provider: Provider;
  status: SyncStatus | undefined;
  compact?: boolean;
}) {
  const meta = PROVIDER_META[provider];
  const s = status ?? "PENDING";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="size-2 rounded-full" style={{ backgroundColor: meta.colorVar }} />
      {compact ? null : <span className="text-foreground">{meta.short}</span>}
      <span className={COLOR[s] ?? "text-muted-foreground"}>{MARK[s] ?? "•"}</span>
    </span>
  );
}

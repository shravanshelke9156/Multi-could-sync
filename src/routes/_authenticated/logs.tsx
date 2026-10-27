import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { listLogs } from "@/lib/sync.functions";
import { PROVIDER_META, formatDate } from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({
    meta: [
      { title: "Sync logs — Multi-Cloud File Sync" },
      {
        name: "description",
        content: "Full audit trail of every synchronization operation, retry and failure.",
      },
      { property: "og:title", content: "Sync logs — Multi-Cloud File Sync" },
      { property: "og:description", content: "Operation, provider, status, message and retries." },
    ],
  }),
  component: LogsPage,
});

function LogsPage() {
  const logsFn = useServerFn(listLogs);
  const logs = useQuery({ queryKey: ["logs", 200], queryFn: () => logsFn({ data: { limit: 200 } }) });

  return (
    <AppShell
      title="Synchronization logs"
      description="Every operation attempted against a cloud provider, with status, message and retry count."
    >
      <div className="surface-panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">File</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 font-semibold">Operation</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Message</th>
              <th className="px-4 py-3 font-semibold">Retries</th>
              <th className="px-4 py-3 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(logs.data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 text-xs whitespace-nowrap text-muted-foreground">
                  {formatDate(l.created_at)}
                </td>
                <td className="px-4 py-3">{l.filename ?? "—"}</td>
                <td className="px-4 py-3">{l.provider ? PROVIDER_META[l.provider].label : "System"}</td>
                <td className="px-4 py-3">{l.operation}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{l.message ?? "—"}</td>
                <td className="px-4 py-3">{l.retry_count}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {l.duration_ms ? `${l.duration_ms} ms` : "—"}
                </td>
              </tr>
            ))}
            {logs.data?.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                  No log entries yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { UploadPanel } from "@/components/UploadPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { getStats, listLogs, listClouds } from "@/lib/sync.functions";
import { PROVIDER_META, formatBytes, formatDate } from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Multi-Cloud File Sync" },
      { name: "description", content: "Synchronization overview across your cloud providers." },
      { property: "og:title", content: "Dashboard — Multi-Cloud File Sync" },
      { property: "og:description", content: "Files, sync status, cloud health and recent activity." },
    ],
  }),
  component: Dashboard,
});

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="surface-panel p-5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function Dashboard() {
  const statsFn = useServerFn(getStats);
  const logsFn = useServerFn(listLogs);
  const cloudsFn = useServerFn(listClouds);

  const stats = useQuery({ queryKey: ["stats"], queryFn: () => statsFn() });
  const logs = useQuery({ queryKey: ["logs", 8], queryFn: () => logsFn({ data: { limit: 8 } }) });
  const clouds = useQuery({ queryKey: ["clouds"], queryFn: () => cloudsFn() });

  const s = stats.data;

  return (
    <AppShell
      title="Dashboard"
      description="Overview of your files and their replication across three cloud providers."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total files" value={s?.total ?? 0} />
        <StatCard label="Synchronized" value={s?.synchronized ?? 0} tone="text-success" />
        <StatCard label="Pending" value={s?.pending ?? 0} />
        <StatCard label="Failed / partial" value={(s?.failed ?? 0) + (s?.partial ?? 0)} tone="text-destructive" />
        <StatCard label="Conflicts" value={s?.conflicts ?? 0} tone="text-primary" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-6">
          <UploadPanel />

          <div className="surface-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="font-semibold">Recent synchronization activity</h2>
              <Link to="/logs" className="text-xs font-medium text-primary hover:underline">
                View all logs
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {(logs.data ?? []).map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="w-24 shrink-0 text-xs font-medium">
                    {log.provider ? PROVIDER_META[log.provider].label : "System"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {log.operation}
                    {log.filename ? ` · ${log.filename}` : ""}
                  </span>
                  <StatusBadge status={log.status} />
                </li>
              ))}
              {logs.data?.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  No activity yet — upload a file to start.
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Cloud providers</h2>
              <Link to="/clouds" className="text-xs font-medium text-primary hover:underline">
                Manage
              </Link>
            </div>
            <ul className="mt-4 space-y-4">
              {(clouds.data ?? []).map((c) => (
                <li key={c.provider} className="flex items-start gap-3">
                  <span
                    className="mt-1.5 size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: PROVIDER_META[c.provider].colorVar }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{PROVIDER_META[c.provider].label}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.files} files · last sync {formatDate(c.lastSync)}
                    </p>
                  </div>
                  <StatusBadge
                    status={
                      !c.enabled
                        ? "DISABLED"
                        : c.sim_state === "AVAILABLE"
                          ? "CONNECTED"
                          : c.sim_state
                    }
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="surface-panel p-5">
            <h2 className="font-semibold">Storage</h2>
            <p className="mt-2 text-3xl font-bold">{formatBytes(s?.totalBytes ?? 0)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Master copy size, replicated to each enabled provider.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

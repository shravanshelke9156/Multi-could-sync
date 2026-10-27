import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  getFileDetail,
  runSync,
  simulateDrift,
  resolveConflict,
  getDownloadUrl,
} from "@/lib/sync.functions";
import {
  PROVIDERS,
  PROVIDER_META,
  formatBytes,
  formatDate,
  shortHash,
  type Provider,
} from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/file/$fileId")({
  head: () => ({
    meta: [
      { title: "File details — Multi-Cloud File Sync" },
      { name: "description", content: "Versions, per-cloud hashes, conflicts and sync history." },
      { property: "og:title", content: "File details — Multi-Cloud File Sync" },
      { property: "og:description", content: "Inspect replication state for a single file." },
    ],
  }),
  component: FileDetail,
});

function FileDetail() {
  const { fileId } = Route.useParams();
  const detailFn = useServerFn(getFileDetail);
  const syncFn = useServerFn(runSync);
  const driftFn = useServerFn(simulateDrift);
  const resolveFn = useServerFn(resolveConflict);
  const urlFn = useServerFn(getDownloadUrl);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ["file", fileId], queryFn: () => detailFn({ data: { fileId } }) });

  async function act(fn: () => Promise<unknown>, okMessage: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMessage);
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (!q.data) {
    return (
      <AppShell title="File details">
        <p className="text-sm text-muted-foreground">{q.isError ? "File not found." : "Loading…"}</p>
      </AppShell>
    );
  }

  const { file, versions, clouds, logs } = q.data;
  const hasConflict = clouds.some((c) => c.status === "CONFLICT");

  return (
    <AppShell
      title={file.filename}
      description={`${formatBytes(Number(file.file_size))} · version ${file.current_version} · ${file.mime_type ?? "unknown type"}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/files">Back to files</Link>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              act(async () => {
                const { url } = await urlFn({ data: { storagePath: file.storage_path } });
                window.open(url, "_blank");
              }, "Download link opened")
            }
          >
            Download
          </Button>
          <Button
            disabled={busy}
            onClick={() => act(() => syncFn({ data: { fileId, onlyFailed: true } }), "Retry finished")}
          >
            Retry failed
          </Button>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          <div className="surface-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Cloud replicas</h2>
              <StatusBadge status={file.overall_status} />
            </div>
            <p className="hash-text mt-2 text-muted-foreground">
              Master SHA-256: {shortHash(file.current_hash)}
            </p>

            <ul className="mt-4 space-y-3">
              {PROVIDERS.map((p) => {
                const copy = clouds.find((c) => c.provider === p);
                const differs = copy?.hash && copy.hash !== file.current_hash;
                return (
                  <li key={p} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: PROVIDER_META[p].colorVar }}
                      />
                      <span className="font-medium">{PROVIDER_META[p].label}</span>
                      <StatusBadge status={copy?.status ?? "PENDING"} />
                      <span className="ml-auto flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            act(
                              () => driftFn({ data: { fileId, provider: p as Provider } }),
                              "Divergent copy simulated",
                            )
                          }
                        >
                          Simulate drift
                        </Button>
                        {differs ? (
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () => resolveFn({ data: { fileId, provider: p as Provider } }),
                                "Conflict resolved — this copy is now the master",
                              )
                            }
                          >
                            Use this version
                          </Button>
                        ) : null}
                      </span>
                    </div>
                    <p className="hash-text mt-2 text-muted-foreground">
                      hash {shortHash(copy?.hash)} · id {copy?.cloud_file_id ?? "—"} · synced{" "}
                      {formatDate(copy?.last_synced)}
                    </p>
                  </li>
                );
              })}
            </ul>

            {hasConflict ? (
              <p className="mt-4 rounded-lg border border-primary/30 bg-accent p-3 text-sm text-accent-foreground">
                <strong>Conflict detected.</strong> Copies of this file differ between providers.
                Nothing was overwritten — choose which version becomes the synchronized one.
              </p>
            ) : null}
          </div>

          <div className="surface-panel overflow-hidden">
            <h2 className="border-b border-border px-5 py-3 font-semibold">Sync history</h2>
            <ul className="divide-y divide-border">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">
                    {formatDate(log.created_at)}
                  </span>
                  <span className="w-24 shrink-0 text-xs font-medium">
                    {log.provider ? PROVIDER_META[log.provider].label : "System"}
                  </span>
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {log.operation}
                    {log.message ? ` — ${log.message}` : ""}
                  </span>
                  <StatusBadge status={log.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="surface-panel overflow-hidden">
          <h2 className="border-b border-border px-5 py-3 font-semibold">Version history</h2>
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Version {v.version_number}</span>
                  {v.version_number === file.current_version ? (
                    <StatusBadge status="CURRENT" />
                  ) : null}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatBytes(Number(v.file_size))}
                  </span>
                </div>
                <p className="hash-text mt-1 text-muted-foreground">{shortHash(v.hash)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(v.created_at)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

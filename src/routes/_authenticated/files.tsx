import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { UploadPanel } from "@/components/UploadPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { CloudPill } from "@/components/CloudPill";
import { Button } from "@/components/ui/button";
import { listFiles, runSync, deleteFile, getDownloadUrl } from "@/lib/sync.functions";
import { PROVIDERS, formatBytes, formatDate } from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({
    meta: [
      { title: "Files — Multi-Cloud File Sync" },
      { name: "description", content: "All uploaded files with per-provider replication status." },
      { property: "og:title", content: "Files — Multi-Cloud File Sync" },
      { property: "og:description", content: "Versions, sizes and cloud status for every file." },
    ],
  }),
  component: FilesPage,
});

function FilesPage() {
  const filesFn = useServerFn(listFiles);
  const syncFn = useServerFn(runSync);
  const deleteFn = useServerFn(deleteFile);
  const urlFn = useServerFn(getDownloadUrl);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const files = useQuery({ queryKey: ["files"], queryFn: () => filesFn() });

  async function retry(fileId: string) {
    setBusy(fileId);
    try {
      const res = await syncFn({ data: { fileId, onlyFailed: true } });
      toast[res.overall === "SYNCHRONIZED" ? "success" : "warning"](
        `Retry finished: ${res.results.filter((r) => r.ok).length}/${res.results.length} clouds in sync`,
      );
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setBusy(null);
    }
  }

  async function download(storagePath: string) {
    try {
      const { url } = await urlFn({ data: { storagePath } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function remove(fileId: string, filename: string) {
    if (!confirm(`Delete "${filename}" and all its cloud copies?`)) return;
    setBusy(fileId);
    try {
      await deleteFn({ data: { fileId } });
      toast.success("File deleted from all providers");
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Files" description="Every file, its current version and its cloud replicas.">
      <UploadPanel />

      <div className="surface-panel mt-6 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3 font-semibold">File name</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Clouds</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last updated</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(files.data ?? []).map((f) => (
              <tr key={f.id} className="align-middle">
                <td className="px-4 py-3 font-medium">
                  <Link to="/file/$fileId" params={{ fileId: f.id }} className="hover:underline">
                    {f.filename}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatBytes(Number(f.file_size))}</td>
                <td className="px-4 py-3 text-muted-foreground">v{f.current_version}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-3">
                    {PROVIDERS.map((p) => (
                      <CloudPill
                        key={p}
                        provider={p}
                        status={f.clouds.find((c) => c.provider === p)?.status}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={f.overall_status} />
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(f.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/file/$fileId" params={{ fileId: f.id }}>
                        View
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => download(f.storage_path)}>
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy === f.id}
                      onClick={() => retry(f.id)}
                    >
                      {busy === f.id ? "…" : "Retry"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      disabled={busy === f.id}
                      onClick={() => remove(f.id, f.filename)}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {files.data?.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No files yet. Upload one above to see the sync engine run.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

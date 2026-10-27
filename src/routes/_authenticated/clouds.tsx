import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { listClouds, setCloudState } from "@/lib/sync.functions";
import { PROVIDER_META, SIM_STATES, formatDate, type SimState } from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/clouds")({
  head: () => ({
    meta: [
      { title: "Cloud status — Multi-Cloud File Sync" },
      {
        name: "description",
        content: "Availability of AWS S3, Google Drive and Azure Blob, with outage simulation.",
      },
      { property: "og:title", content: "Cloud status — Multi-Cloud File Sync" },
      { property: "og:description", content: "Monitor and simulate cloud provider availability." },
    ],
  }),
  component: CloudsPage,
});

function CloudsPage() {
  const cloudsFn = useServerFn(listClouds);
  const setStateFn = useServerFn(setCloudState);
  const queryClient = useQueryClient();
  const clouds = useQuery({ queryKey: ["clouds"], queryFn: () => cloudsFn() });

  async function update(provider: string, patch: { simState?: SimState; enabled?: boolean }) {
    try {
      await setStateFn({ data: { provider: provider as never, ...patch } });
      await queryClient.invalidateQueries();
      toast.success("Provider updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <AppShell
      title="Clouds"
      description="Provider health, live connection status and demo conditions used by synchronization."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {(clouds.data ?? []).map((c) => (
          <div key={c.provider} className="surface-panel p-5">
            <div className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: PROVIDER_META[c.provider].colorVar }}
              />
              <h2 className="font-semibold">{PROVIDER_META[c.provider].label}</h2>
              <span className="ml-auto">
                <StatusBadge
                  status={!c.enabled ? "DISABLED" : c.sim_state === "AVAILABLE" ? "CONNECTED" : c.sim_state}
                />
              </span>
            </div>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Mode</dt>
                <dd className="font-medium">{c.mode === "REAL" ? "Real cloud" : "Demo"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Files stored</dt>
                <dd className="font-medium">{c.files}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last sync</dt>
                <dd className="font-medium">{formatDate(c.lastSync)}</dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-sm">Enabled for sync</span>
              <Switch
                checked={c.enabled}
                onCheckedChange={(v) => update(c.provider, { enabled: v })}
              />
            </div>

            {c.mode === "DEMO" ? (
              <>
                <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Simulate condition
                </p>
                <div className="mt-2 grid gap-2">
                  {SIM_STATES.map((s) => (
                    <Button
                      key={s.value}
                      variant={c.sim_state === s.value ? "default" : "outline"}
                      size="sm"
                      className="justify-start"
                      onClick={() => update(c.provider, { simState: s.value })}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {SIM_STATES.find((s) => s.value === c.sim_state)?.help}
                </p>
              </>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Live connection — upload results come directly from this provider.
              </p>
            )}
          </div>
        ))}
      </div>
    </AppShell>
  );
}

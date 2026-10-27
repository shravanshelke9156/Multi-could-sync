import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { listClouds } from "@/lib/sync.functions";
import { PROVIDER_META } from "@/lib/cloud";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Cloud configuration — Multi-Cloud File Sync" },
      {
        name: "description",
        content: "Connection state for each cloud provider and the environment variables required.",
      },
      { property: "og:title", content: "Cloud configuration — Multi-Cloud File Sync" },
      { property: "og:description", content: "Configure real cloud credentials safely." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const cloudsFn = useServerFn(listClouds);
  const clouds = useQuery({ queryKey: ["clouds"], queryFn: () => cloudsFn() });

  return (
    <AppShell
      title="Settings"
      description="Connection status for each provider. Private access details are never shown here."
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
                <StatusBadge status={c.mode === "REAL" ? "CONNECTED" : "DEMO"} />
              </span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {c.mode === "REAL"
                ? c.provider === "google_drive"
                  ? "Your connected Google Drive receives real file uploads."
                  : "Credentials detected — real cloud API calls are used for this provider."
                : c.provider === "google_drive"
                  ? "Connect a Google Drive account to send files to your real Drive."
                  : "No credentials detected — this provider runs in simulated Demo Mode."}
            </p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {c.provider === "google_drive" ? "Connection" : "Required variables"}
            </p>
            <ul className="hash-text mt-2 space-y-1 text-muted-foreground">
              {PROVIDER_META[c.provider].envKeys.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="surface-panel mt-6 p-5">
        <h2 className="font-semibold">How the two modes work</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Demo Mode</strong> is the default. The
            synchronization engine simulates each provider, including outages, slow responses and
            upload failures, so the whole workflow can be demonstrated without any account.
          </li>
          <li>
            <strong className="text-foreground">Real Cloud Mode</strong> activates per provider as
            soon as its secure connection is available. Secret values are never sent to the browser
            and never appear in this interface.
          </li>
          <li>
            An <code className="hash-text">.env.example</code> file documents every variable. The
            real <code className="hash-text">.env</code> must never be committed.
          </li>
        </ul>
      </div>
    </AppShell>
  );
}

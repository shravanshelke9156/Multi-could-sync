import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Multi-Cloud File Synchronization System" },
      {
        name: "description",
        content:
          "Upload a file once and replicate it across AWS S3, Google Drive and Azure Blob Storage with SHA-256 change detection, versioning, conflict resolution, retry and full sync logs.",
      },
      { property: "og:title", content: "Multi-Cloud File Synchronization System" },
      {
        property: "og:description",
        content:
          "A cloud computing project: data replication, fault tolerance, file versioning and conflict detection across three cloud providers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  ["Data replication", "Every upload is pushed to AWS S3, Google Drive and Azure Blob."],
  ["Fault tolerance", "Failed providers are logged and retried — successful copies are skipped."],
  ["SHA-256 detection", "Changes are found by content hash, never by filename."],
  ["File versioning", "Each change creates a new version with its own hash and timestamp."],
  ["Conflict detection", "Divergent copies are flagged; you choose the master version."],
  ["Sync logs", "Every operation, status, message, retry and duration is recorded."],
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <span className="brand-gradient grid size-8 place-items-center rounded-lg text-sm font-bold text-primary-foreground">
            MC
          </span>
          <span className="font-semibold">Multi-Cloud Sync</span>
        </div>
        <Link
          to="/auth"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Open dashboard
        </Link>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 pb-16">
        <p className="text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          Cloud computing project
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          Multi-Cloud File Synchronization System
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Upload a file once. The synchronization engine replicates it to three cloud providers,
          records every attempt, detects changes by content hash, and lets you retry or resolve
          conflicts.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Get started
          </Link>
          <Link
            to="/auth"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-secondary"
          >
            Sign in
          </Link>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="surface-panel p-5">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <div className="surface-panel mt-10 p-6">
          <h2 className="font-semibold">Runs in two modes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            <strong className="text-foreground">Demo Mode</strong> simulates the three providers so
            the whole system — including outages, retries and conflicts — can be demonstrated with
            no credentials. <strong className="text-foreground">Real Cloud Mode</strong> activates
            automatically per provider once its credentials are configured as environment
            variables. Credentials are never stored in the code or shown in the interface.
          </p>
        </div>
      </section>
    </div>
  );
}

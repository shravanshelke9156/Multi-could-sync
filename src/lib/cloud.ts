// Browser-safe shared constants & helpers for the multi-cloud sync system.

export type Provider = "aws_s3" | "google_drive" | "azure_blob";

export type SyncStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCHRONIZED"
  | "PARTIAL"
  | "FAILED"
  | "CONFLICT";

export type SimState = "AVAILABLE" | "UNAVAILABLE" | "SLOW" | "UPLOAD_FAILURE";

export const PROVIDERS: Provider[] = ["aws_s3", "google_drive", "azure_blob"];

export const PROVIDER_META: Record<
  Provider,
  { label: string; short: string; colorVar: string; envKeys: string[] }
> = {
  aws_s3: {
    label: "AWS S3",
    short: "S3",
    colorVar: "var(--aws)",
    envKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_BUCKET_NAME"],
  },
  google_drive: {
    label: "Google Drive",
    short: "Drive",
    colorVar: "var(--gdrive)",
    envKeys: ["Connected Google Drive account"],
  },
  azure_blob: {
    label: "Azure Blob",
    short: "Azure",
    colorVar: "var(--azure)",
    envKeys: ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_CONTAINER_NAME"],
  },
};

export const SIM_STATES: { value: SimState; label: string; help: string }[] = [
  { value: "AVAILABLE", label: "Cloud available", help: "Uploads succeed normally." },
  { value: "UNAVAILABLE", label: "Cloud unavailable", help: "Provider unreachable — sync fails." },
  { value: "SLOW", label: "Slow response", help: "Succeeds after a long delay." },
  { value: "UPLOAD_FAILURE", label: "Upload failure", help: "Connects, but the transfer fails." },
];

export function statusTone(status: SyncStatus) {
  switch (status) {
    case "SYNCHRONIZED":
      return "success" as const;
    case "PARTIAL":
      return "warning" as const;
    case "FAILED":
      return "destructive" as const;
    case "CONFLICT":
      return "conflict" as const;
    case "SYNCING":
      return "info" as const;
    default:
      return "muted" as const;
  }
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortHash(hash?: string | null) {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-4)}`;
}

/** SHA-256 of the file contents, computed in the browser. */
export async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

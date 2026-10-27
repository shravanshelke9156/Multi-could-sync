// Cloud storage provider abstraction.
//
// The synchronisation engine never talks to a specific cloud SDK — it only
// talks to this interface. Each provider has a demo implementation (used when
// no credentials are configured) and reports whether real credentials exist.

import type { Provider, SimState } from "./cloud";

export interface UploadResult {
  cloudFileId: string;
  durationMs: number;
}

export class ProviderError extends Error {
  durationMs: number;
  constructor(message: string, durationMs: number) {
    super(message);
    this.name = "ProviderError";
    this.durationMs = durationMs;
  }
}

const REQUIRED_ENV: Record<Provider, string[]> = {
  aws_s3: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION", "AWS_BUCKET_NAME"],
  google_drive: ["GOOGLE_DRIVE_API_KEY", "LOVABLE_API_KEY"],
  azure_blob: ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_CONTAINER_NAME"],
};

/** Real cloud mode is active for a provider only when all its env vars exist. */
export function providerMode(provider: Provider): "REAL" | "DEMO" {
  const keys = REQUIRED_ENV[provider];
  const ok = keys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.length > 0;
  });
  return ok ? "REAL" : "DEMO";
}

export function isLegacyDemoDriveId(cloudFileId?: string | null): boolean {
  return typeof cloudFileId === "string" && cloudFileId.startsWith("gdrive_");
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PREFIX: Record<Provider, string> = {
  aws_s3: "s3",
  google_drive: "gdrive",
  azure_blob: "azblob",
};

/**
 * Demo implementation: simulates a remote transfer, honouring the simulated
 * availability state the user picked on the Clouds page.
 */
async function demoUpload(
  provider: Provider,
  sim: SimState,
  objectKey: string,
): Promise<UploadResult> {
  const start = Date.now();

  if (sim === "UNAVAILABLE") {
    await delay(250);
    throw new ProviderError(
      `${objectKey}: endpoint unreachable (HTTP 503 Service Unavailable)`,
      Date.now() - start,
    );
  }

  if (sim === "UPLOAD_FAILURE") {
    await delay(450);
    throw new ProviderError(
      `${objectKey}: transfer aborted — remote checksum mismatch`,
      Date.now() - start,
    );
  }

  await delay(sim === "SLOW" ? 2200 : 300 + Math.floor(Math.random() * 350));

  const id = `${PREFIX[provider]}_${Math.random().toString(36).slice(2, 12)}`;
  return { cloudFileId: id, durationMs: Date.now() - start };
}

/**
 * Upload one object to one provider.
 *
 * Real cloud mode: when credentials for the provider are configured, plug the
 * SDK/REST call in here (AWS S3 PutObject, Drive files.create, Azure Blob
 * PutBlob). The engine, database and UI need no changes — only this function.
 */
export async function uploadToProvider(args: {
  provider: Provider;
  sim: SimState;
  objectKey: string;
  content?: ArrayBuffer;
  filename?: string;
  mimeType?: string;
  existingCloudFileId?: string;
}): Promise<UploadResult> {
  if (args.provider === "google_drive" && providerMode("google_drive") === "REAL") {
    if (!args.content || !args.filename) {
      throw new ProviderError("File content is required for a real Google Drive upload", 0);
    }
    return uploadToGoogleDrive(args);
  }

  return demoUpload(args.provider, args.sim, args.objectKey);
}

async function uploadToGoogleDrive(args: {
  content?: ArrayBuffer;
  filename?: string;
  mimeType?: string;
  existingCloudFileId?: string;
}): Promise<UploadResult> {
  const startedAt = Date.now();
  if (!args.content || !args.filename) {
    throw new ProviderError("File content is required for a real Google Drive upload", 0);
  }
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const driveApiKey = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovableApiKey || !driveApiKey) {
    throw new ProviderError("Google Drive connection is not configured", Date.now() - startedAt);
  }

  const gatewayUrl = "https://connector-gateway.lovable.dev/google_drive";
  const authHeaders = {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": driveApiKey,
  };
  const mimeType = args.mimeType || "application/octet-stream";
  if (args.content.byteLength === 0) {
    const emptyFilePath = args.existingCloudFileId
      ? `/drive/v3/files/${encodeURIComponent(args.existingCloudFileId)}?fields=id%2Cname`
      : "/drive/v3/files?fields=id%2Cname";
    const emptyFileResponse = await fetch(`${gatewayUrl}${emptyFilePath}`, {
      method: args.existingCloudFileId ? "PATCH" : "POST",
      headers: { ...authHeaders, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ name: args.filename, mimeType }),
    });
    if (!emptyFileResponse.ok) {
      const errorBody = await emptyFileResponse.text();
      console.error(`Google Drive file creation failed [${emptyFileResponse.status}]: ${errorBody}`);
      throw new ProviderError(
        `Google Drive upload failed [${emptyFileResponse.status}]: ${errorBody}`,
        Date.now() - startedAt,
      );
    }
    const emptyFile = (await emptyFileResponse.json()) as { id?: string };
    if (!emptyFile.id) {
      throw new ProviderError("Google Drive did not return a file ID", Date.now() - startedAt);
    }
    return { cloudFileId: emptyFile.id, durationMs: Date.now() - startedAt };
  }

  const uploadPath = args.existingCloudFileId
    ? `/upload/drive/v3/files/${encodeURIComponent(args.existingCloudFileId)}`
    : "/upload/drive/v3/files";
  const startResponse = await fetch(
    `${gatewayUrl}${uploadPath}?uploadType=resumable&fields=id%2Cname`,
    {
      method: args.existingCloudFileId ? "PATCH" : "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(args.content.byteLength),
      },
      body: JSON.stringify({ name: args.filename }),
    },
  );
  if (!startResponse.ok) {
    const errorBody = await startResponse.text();
    console.error(`Google Drive upload setup failed [${startResponse.status}]: ${errorBody}`);
    throw new ProviderError(
      `Google Drive upload failed [${startResponse.status}]: ${errorBody}`,
      Date.now() - startedAt,
    );
  }

  const sessionLocation = startResponse.headers.get("location");
  if (!sessionLocation) {
    throw new ProviderError("Google Drive did not return an upload session", Date.now() - startedAt);
  }

  let sessionUrl: URL;
  try {
    sessionUrl = new URL(sessionLocation);
  } catch {
    throw new ProviderError("Google Drive returned an invalid upload session", Date.now() - startedAt);
  }
  if (!sessionUrl.pathname.startsWith("/upload/drive/v3/files")) {
    throw new ProviderError("Google Drive returned an unsupported upload session", Date.now() - startedAt);
  }

  const uploadResponse = await fetch(
    `${gatewayUrl}${sessionUrl.pathname}${sessionUrl.search}`,
    {
      method: "PUT",
      headers: {
        ...authHeaders,
        "Content-Type": mimeType,
        "Content-Range": args.content.byteLength
          ? `bytes 0-${args.content.byteLength - 1}/${args.content.byteLength}`
          : "bytes */0",
      },
      body: new Blob([args.content], { type: mimeType }),
    },
  );
  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    console.error(`Google Drive upload failed [${uploadResponse.status}]: ${errorBody}`);
    throw new ProviderError(
      `Google Drive upload failed [${uploadResponse.status}]: ${errorBody}`,
      Date.now() - startedAt,
    );
  }

  const created = (await uploadResponse.json()) as { id?: string };
  if (!created.id) {
    throw new ProviderError("Google Drive did not return a file ID", Date.now() - startedAt);
  }
  return { cloudFileId: created.id, durationMs: Date.now() - startedAt };
}

export async function deleteFromProvider(args: {
  provider: Provider;
  cloudFileId: string;
}): Promise<void> {
  await delay(120);
  void args;
}

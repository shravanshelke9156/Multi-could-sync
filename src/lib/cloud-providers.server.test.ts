import assert from "node:assert/strict";
import { isLegacyDemoDriveId, providerMode, uploadToProvider } from "./cloud-providers.server";

const originalDriveKey = process.env["GOOGLE_DRIVE_API_KEY"];
const originalLovableKey = process.env["LOVABLE_API_KEY"];
const originalFetch = globalThis.fetch;

function restoreEnvironment() {
  globalThis.fetch = originalFetch;
  if (originalDriveKey === undefined) delete process.env["GOOGLE_DRIVE_API_KEY"];
  else process.env["GOOGLE_DRIVE_API_KEY"] = originalDriveKey;
  if (originalLovableKey === undefined) delete process.env["LOVABLE_API_KEY"];
  else process.env["LOVABLE_API_KEY"] = originalLovableKey;
}

async function run() {
  try {
    process.env["GOOGLE_DRIVE_API_KEY"] = "test-drive-connection";
    process.env["LOVABLE_API_KEY"] = "test-gateway-credential";
    assert.equal(providerMode("google_drive"), "REAL");

    delete process.env["LOVABLE_API_KEY"];
    assert.equal(providerMode("google_drive"), "DEMO");
    process.env["LOVABLE_API_KEY"] = "test-gateway-credential";
    delete process.env["GOOGLE_DRIVE_API_KEY"];
    assert.equal(providerMode("google_drive"), "DEMO");
    assert.equal(isLegacyDemoDriveId("gdrive_old-demo-id"), true);
    assert.equal(isLegacyDemoDriveId("1AbCdEfGoogleDriveFileId"), false);

    process.env["GOOGLE_DRIVE_API_KEY"] = "test-drive-connection";
    const createRequests: { url: string; method: string; headers: Headers }[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      createRequests.push({
        url: String(input),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
      });
      if (createRequests.length === 1) {
        return new Response(null, {
          status: 200,
          headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=test" },
        });
      }
      return Response.json({ id: "drive-created-file" });
    };

    const upload = await uploadToProvider({
      provider: "google_drive",
      sim: "AVAILABLE",
      objectKey: "user/report.txt",
      filename: "report.txt",
      mimeType: "text/plain",
      content: new TextEncoder().encode("report contents").buffer,
    });
    assert.equal(upload.cloudFileId, "drive-created-file");
    assert.equal(createRequests.length, 2);
    assert.match(createRequests[0]?.url ?? "", /\/upload\/drive\/v3\/files\?uploadType=resumable/);
    assert.equal(createRequests[0]?.method, "POST");
    assert.equal(createRequests[0]?.headers.get("X-Upload-Content-Type"), "text/plain");
    assert.equal(createRequests[1]?.method, "PUT");
    assert.match(createRequests[1]?.url ?? "", /\/upload\/drive\/v3\/files\?upload_id=test/);
    assert.equal(createRequests[1]?.headers.get("Content-Range"), "bytes 0-14/15");

    const updateRequests: { url: string; method: string }[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      updateRequests.push({ url: String(input), method: init?.method ?? "GET" });
      if (updateRequests.length === 1) {
        return new Response(null, {
          status: 200,
          headers: {
            location: "https://www.googleapis.com/upload/drive/v3/files/file-123?upload_id=test",
          },
        });
      }
      return Response.json({ id: "file-123" });
    };

    const updated = await uploadToProvider({
      provider: "google_drive",
      sim: "AVAILABLE",
      objectKey: "user/report.txt",
      filename: "report.txt",
      content: new TextEncoder().encode("updated").buffer,
      existingCloudFileId: "file-123",
    });
    assert.equal(updated.cloudFileId, "file-123");
    assert.match(updateRequests[0]?.url ?? "", /\/upload\/drive\/v3\/files\/file-123\?uploadType=resumable/);
    assert.equal(updateRequests[0]?.method, "PATCH");
    assert.equal(updateRequests[1]?.method, "PUT");
    console.info("Google Drive provider checks passed (4 scenarios).");
  } finally {
    restoreEnvironment();
  }
}

await run();
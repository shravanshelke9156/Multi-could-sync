import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PROVIDERS, type Provider, type SyncStatus } from "./cloud";

const providerEnum = z.enum(["aws_s3", "google_drive", "azure_blob"]);

/* ------------------------------------------------------------------ reads */

export const listFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: files, error } = await context.supabase
      .from("files")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: copies } = await context.supabase.from("cloud_files").select("*");

    return (files ?? []).map((f) => ({
      ...f,
      clouds: (copies ?? []).filter((c) => c.file_id === f.id),
    }));
  });

export const getStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: files } = await context.supabase.from("files").select("overall_status, file_size");
    const rows = files ?? [];
    const count = (s: SyncStatus) => rows.filter((r) => r.overall_status === s).length;
    return {
      total: rows.length,
      synchronized: count("SYNCHRONIZED"),
      pending: count("PENDING") + count("SYNCING"),
      partial: count("PARTIAL"),
      failed: count("FAILED"),
      conflicts: count("CONFLICT"),
      totalBytes: rows.reduce((sum, r) => sum + Number(r.file_size ?? 0), 0),
    };
  });

export const listLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) =>
    z.object({ limit: z.number().min(1).max(500).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: logs, error } = await context.supabase
      .from("sync_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

export const listClouds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { providerMode } = await import("./cloud-providers.server");

    let { data: configs } = await context.supabase.from("cloud_config").select("*");
    if (!configs || configs.length < PROVIDERS.length) {
      await context.supabase
        .from("cloud_config")
        .upsert(
          PROVIDERS.map((p) => ({ user_id: context.userId, provider: p })),
          { onConflict: "user_id,provider", ignoreDuplicates: true },
        );
      configs = (await context.supabase.from("cloud_config").select("*")).data ?? [];
    }

    const { data: copies } = await context.supabase.from("cloud_files").select("provider, status, last_synced");

    return PROVIDERS.map((p) => {
      const cfg = configs!.find((c) => c.provider === p)!;
      const mine = (copies ?? []).filter((c) => c.provider === p);
      const synced = mine.filter((c) => c.status === "SYNCHRONIZED");
      const last = mine
        .map((c) => c.last_synced)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        provider: p as Provider,
        enabled: cfg.enabled,
        sim_state: cfg.sim_state,
        mode: providerMode(p),
        files: synced.length,
        lastSync: last ?? null,
      };
    });
  });

export const getFileDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: file, error } = await context.supabase
      .from("files")
      .select("*")
      .eq("id", data.fileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("File not found");

    const [{ data: versions }, { data: clouds }, { data: logs }] = await Promise.all([
      context.supabase
        .from("file_versions")
        .select("*")
        .eq("file_id", data.fileId)
        .order("version_number", { ascending: false }),
      context.supabase.from("cloud_files").select("*").eq("file_id", data.fileId),
      context.supabase
        .from("sync_logs")
        .select("*")
        .eq("file_id", data.fileId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    return { file, versions: versions ?? [], clouds: clouds ?? [], logs: logs ?? [] };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storagePath: string }) =>
    z.object({ storagePath: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.storagePath.startsWith(`${context.userId}/`)) throw new Error("Forbidden");
    const { data: signed, error } = await context.supabase.storage
      .from("user-files")
      .createSignedUrl(data.storagePath, 120);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/* ----------------------------------------------------------------- writes */

/** Registers an uploaded object: creates the file or a new version of it. */
export const ingestUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(255),
        mimeType: z.string().max(200).nullable().optional(),
        size: z.number().min(0),
        hash: z.string().length(64),
        storagePath: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    if (!data.storagePath.startsWith(`${userId}/`)) throw new Error("Forbidden");

    const { data: existing } = await supabase
      .from("files")
      .select("*")
      .eq("filename", data.filename)
      .maybeSingle();

    const log = (row: Record<string, unknown>) =>
      supabase.from("sync_logs").insert({ user_id: userId, ...row } as never);

    if (existing) {
      if (existing.current_hash === data.hash) {
        await log({
          file_id: existing.id,
          filename: data.filename,
          operation: "Hash check",
          status: "SKIPPED",
          message: "Identical SHA-256 — file unchanged, no re-upload needed",
        });
        return { fileId: existing.id, outcome: "UNCHANGED" as const, version: existing.current_version };
      }

      const nextVersion = existing.current_version + 1;
      await supabase.from("file_versions").insert({
        file_id: existing.id,
        user_id: userId,
        version_number: nextVersion,
        hash: data.hash,
        file_size: data.size,
        storage_path: data.storagePath,
      });
      await supabase
        .from("files")
        .update({
          current_hash: data.hash,
          current_version: nextVersion,
          file_size: data.size,
          mime_type: data.mimeType ?? null,
          storage_path: data.storagePath,
          overall_status: "PENDING",
        })
        .eq("id", existing.id);
      await supabase
        .from("cloud_files")
        .update({ status: "PENDING" })
        .eq("file_id", existing.id);
      await log({
        file_id: existing.id,
        filename: data.filename,
        operation: "Change detected",
        status: "INFO",
        message: `FILE CHANGED — hash ${existing.current_hash.slice(0, 8)}… → ${data.hash.slice(0, 8)}…, version ${nextVersion} created`,
      });
      return { fileId: existing.id, outcome: "NEW_VERSION" as const, version: nextVersion };
    }

    const { data: created, error } = await supabase
      .from("files")
      .insert({
        user_id: userId,
        filename: data.filename,
        mime_type: data.mimeType ?? null,
        file_size: data.size,
        current_hash: data.hash,
        current_version: 1,
        overall_status: "PENDING",
        storage_path: data.storagePath,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("file_versions").insert({
      file_id: created.id,
      user_id: userId,
      version_number: 1,
      hash: data.hash,
      file_size: data.size,
      storage_path: data.storagePath,
    });
    await supabase.from("cloud_files").insert(
      PROVIDERS.map((p) => ({
        file_id: created.id,
        user_id: userId,
        provider: p,
        status: "PENDING" as const,
      })),
    );
    await log({
      file_id: created.id,
      filename: data.filename,
      operation: "Upload received",
      status: "INFO",
      message: `SHA-256 ${data.hash.slice(0, 16)}… computed, version 1 created`,
    });

    return { fileId: created.id, outcome: "CREATED" as const, version: 1 };
  });

/** The synchronisation engine: replicates a file to every enabled provider. */
export const runSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string; onlyFailed?: boolean }) =>
    z.object({ fileId: z.string().uuid(), onlyFailed: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      uploadToProvider,
      providerMode,
      isLegacyDemoDriveId,
      ProviderError,
    } = await import("./cloud-providers.server");
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: file } = await supabase.from("files").select("*").eq("id", data.fileId).maybeSingle();
    if (!file) throw new Error("File not found");

    const { data: configs } = await supabase.from("cloud_config").select("*");
    const { data: copies } = await supabase.from("cloud_files").select("*").eq("file_id", file.id);

    await supabase.from("files").update({ overall_status: "SYNCING" }).eq("id", file.id);

    const results: { provider: Provider; ok: boolean; message: string }[] = [];

    for (const provider of PROVIDERS) {
      const cfg = configs?.find((c) => c.provider === provider);
      const copy = copies?.find((c) => c.provider === provider);
      if (!cfg?.enabled) {
        results.push({ provider, ok: false, message: "Provider disabled in settings" });
        continue;
      }

      // Skip copies that already hold the current hash — no redundant uploads.
      const realDrive = provider === "google_drive" && providerMode("google_drive") === "REAL";
      const replacesDemoDriveCopy = realDrive && isLegacyDemoDriveId(copy?.cloud_file_id);
      const alreadyCurrent =
        copy?.status === "SYNCHRONIZED" &&
        copy.hash === file.current_hash &&
        !replacesDemoDriveCopy;
      if (
        alreadyCurrent ||
        (data.onlyFailed && copy?.status === "SYNCHRONIZED" && !replacesDemoDriveCopy)
      ) {
        results.push({ provider, ok: true, message: "Already up to date — skipped" });
        continue;
      }

      const retryCount = data.onlyFailed ? ((copy?.status === "FAILED" ? 1 : 0) as number) : 0;
      const objectKey = `${userId}/${file.filename}`;

      try {
        let content: ArrayBuffer | undefined;
        if (provider === "google_drive" && providerMode("google_drive") === "REAL") {
          if (!file.storage_path.startsWith(`${userId}/`)) throw new Error("Forbidden");
          const { data: source, error } = await supabase.storage
            .from("user-files")
            .download(file.storage_path);
          if (error || !source) throw new Error(error?.message ?? "Could not read the uploaded file");
          content = await source.arrayBuffer();
        }

        const res = await uploadToProvider({
          provider,
          sim: cfg.sim_state,
          objectKey,
          filename: file.filename,
          ...(content ? { content } : {}),
          ...(file.mime_type ? { mimeType: file.mime_type } : {}),
        ...(provider === "google_drive" && copy?.cloud_file_id && !replacesDemoDriveCopy
            ? { existingCloudFileId: copy.cloud_file_id }
            : {}),
        });
        await supabase
          .from("cloud_files")
          .update({
            status: "SYNCHRONIZED",
            hash: file.current_hash,
            cloud_file_id: res.cloudFileId,
            last_synced: new Date().toISOString(),
          })
          .eq("file_id", file.id)
          .eq("provider", provider);
        await supabase.from("sync_logs").insert({
          user_id: userId,
          file_id: file.id,
          filename: file.filename,
          provider,
          operation: data.onlyFailed ? "Retry" : "Upload",
          status: "SUCCESS",
          message: `Stored as ${res.cloudFileId}`,
          retry_count: retryCount,
          duration_ms: res.durationMs,
        });
        results.push({ provider, ok: true, message: "Synced" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        const durationMs = err instanceof ProviderError ? err.durationMs : null;
        await supabase
          .from("cloud_files")
          .update({ status: "FAILED" })
          .eq("file_id", file.id)
          .eq("provider", provider);
        await supabase.from("sync_logs").insert({
          user_id: userId,
          file_id: file.id,
          filename: file.filename,
          provider,
          operation: data.onlyFailed ? "Retry" : "Upload",
          status: "FAILED",
          message,
          retry_count: retryCount,
          duration_ms: durationMs,
        });
        results.push({ provider, ok: false, message });
      }

      await supabase
        .from("cloud_config")
        .update({ last_checked: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", provider);
    }

    const okCount = results.filter((r) => r.ok).length;
    const overall: SyncStatus =
      okCount === results.length ? "SYNCHRONIZED" : okCount === 0 ? "FAILED" : "PARTIAL";
    await supabase.from("files").update({ overall_status: overall }).eq("id", file.id);

    await supabase.from("sync_logs").insert({
      user_id: userId,
      file_id: file.id,
      filename: file.filename,
      operation: "Sync complete",
      status: overall,
      message: `${okCount}/${results.length} providers in sync`,
    });

    return { overall, results };
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string }) => z.object({ fileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: file } = await context.supabase
      .from("files")
      .select("*")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) throw new Error("File not found");

    const { data: versions } = await context.supabase
      .from("file_versions")
      .select("storage_path")
      .eq("file_id", file.id);
    const paths = Array.from(new Set([file.storage_path, ...(versions ?? []).map((v) => v.storage_path)]));
    await context.supabase.storage.from("user-files").remove(paths);

    await context.supabase.from("files").delete().eq("id", file.id);
    await context.supabase.from("sync_logs").insert({
      user_id: context.userId,
      filename: file.filename,
      operation: "Delete",
      status: "SUCCESS",
      message: "File and all cloud replicas removed",
    });
    return { ok: true };
  });

export const setCloudState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        provider: providerEnum,
        simState: z.enum(["AVAILABLE", "UNAVAILABLE", "SLOW", "UPLOAD_FAILURE"]).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { last_checked: new Date().toISOString() };
    if (data.simState) patch["sim_state"] = data.simState;
    if (typeof data.enabled === "boolean") patch["enabled"] = data.enabled;

    const { error } = await context.supabase
      .from("cloud_config")
      .update(patch as never)
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);

    await context.supabase.from("sync_logs").insert({
      user_id: context.userId,
      provider: data.provider,
      operation: "Provider config",
      status: "INFO",
      message: `State set to ${data.simState ?? (data.enabled ? "ENABLED" : "DISABLED")}`,
    });
    return { ok: true };
  });

/** Demo helper: makes one provider hold a different version of the file. */
export const simulateDrift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string; provider: Provider }) =>
    z.object({ fileId: z.string().uuid(), provider: providerEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: file } = await context.supabase
      .from("files")
      .select("*")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) throw new Error("File not found");

    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const driftHash = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await context.supabase
      .from("cloud_files")
      .update({ hash: driftHash, status: "CONFLICT", last_synced: new Date().toISOString() })
      .eq("file_id", file.id)
      .eq("provider", data.provider);
    await context.supabase.from("files").update({ overall_status: "CONFLICT" }).eq("id", file.id);
    await context.supabase.from("sync_logs").insert({
      user_id: context.userId,
      file_id: file.id,
      filename: file.filename,
      provider: data.provider,
      operation: "Conflict check",
      status: "CONFLICT",
      message: `Remote copy changed independently — hash ${driftHash.slice(0, 8)}… differs from ${file.current_hash.slice(0, 8)}…`,
    });
    return { ok: true };
  });

/** Resolve a conflict by electing one provider's copy as the truth. */
export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileId: string; provider: Provider }) =>
    z.object({ fileId: z.string().uuid(), provider: providerEnum }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: file } = await context.supabase
      .from("files")
      .select("*")
      .eq("id", data.fileId)
      .maybeSingle();
    if (!file) throw new Error("File not found");

    const { data: winner } = await context.supabase
      .from("cloud_files")
      .select("*")
      .eq("file_id", file.id)
      .eq("provider", data.provider)
      .maybeSingle();
    if (!winner?.hash) throw new Error("That provider has no stored copy yet");

    const nextVersion = file.current_version + 1;
    await context.supabase.from("file_versions").insert({
      file_id: file.id,
      user_id: context.userId,
      version_number: nextVersion,
      hash: winner.hash,
      file_size: file.file_size,
      storage_path: file.storage_path,
    });
    await context.supabase
      .from("files")
      .update({ current_hash: winner.hash, current_version: nextVersion, overall_status: "PENDING" })
      .eq("id", file.id);
    await context.supabase
      .from("cloud_files")
      .update({ status: "PENDING" })
      .eq("file_id", file.id)
      .neq("provider", data.provider);
    await context.supabase
      .from("cloud_files")
      .update({ status: "SYNCHRONIZED" })
      .eq("file_id", file.id)
      .eq("provider", data.provider);
    await context.supabase.from("sync_logs").insert({
      user_id: context.userId,
      file_id: file.id,
      filename: file.filename,
      provider: data.provider,
      operation: "Conflict resolved",
      status: "SUCCESS",
      message: `Copy from ${data.provider} elected as master (v${nextVersion})`,
    });

    return { ok: true };
  });

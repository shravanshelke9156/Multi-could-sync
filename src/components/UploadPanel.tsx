import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ingestUpload, runSync } from "@/lib/sync.functions";
import { sha256OfFile } from "@/lib/cloud";
import { Button } from "@/components/ui/button";

export function UploadPanel() {
  const ingest = useServerFn(ingestUpload);
  const sync = useServerFn(runSync);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    for (const file of Array.from(files)) {
      try {
        setStep(`Hashing ${file.name}…`);
        const hash = await sha256OfFile(file);

        setStep(`Storing ${file.name}…`);
        const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
        const { error } = await supabase.storage.from("user-files").upload(path, file);
        if (error) throw new Error(error.message);

        const res = await ingest({
          data: {
            filename: file.name,
            mimeType: file.type || null,
            size: file.size,
            hash,
            storagePath: path,
          },
        });

        if (res.outcome === "UNCHANGED") {
          toast.info(`${file.name} is unchanged — same SHA-256, nothing re-uploaded.`);
          continue;
        }

        setStep(`Replicating ${file.name} to 3 clouds…`);
        const result = await sync({ data: { fileId: res.fileId } });
        const ok = result.results.filter((r) => r.ok).length;
        const msg = `${file.name} v${res.version}: ${ok}/${result.results.length} clouds in sync`;
        if (result.overall === "SYNCHRONIZED") toast.success(msg);
        else if (result.overall === "PARTIAL") toast.warning(msg);
        else toast.error(msg);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      }
    }

    setStep(null);
    if (inputRef.current) inputRef.current.value = "";
    await queryClient.invalidateQueries();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      className={`surface-panel flex flex-col items-center justify-center gap-3 border-dashed p-8 text-center transition-colors ${
        dragging ? "border-primary bg-accent/50" : ""
      }`}
    >
      <div className="brand-gradient grid size-11 place-items-center rounded-xl text-lg text-primary-foreground">
        ↑
      </div>
      <div>
        <p className="font-semibold">Upload a file once — it replicates everywhere</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag &amp; drop, or choose a file. SHA-256 is computed before it leaves your browser.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={!!step}>
        {step ? "Working…" : "Choose file"}
      </Button>
      {step ? <p className="text-xs text-muted-foreground">{step}</p> : null}
    </div>
  );
}

"use client";

import { RiImageAddLine, RiCodeSSlashLine } from "@remixicon/react";
import { useRef, useState } from "react";

/** Textarea with an upload button that inserts image/video markdown at the cursor. */
export function MarkdownField({
  name,
  defaultValue,
  guideId,
  rows = 12,
  placeholder,
  files,
}: {
  name: string;
  defaultValue: string;
  guideId: string;
  rows?: number;
  placeholder?: string;
  files: string[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkPath, setLinkPath] = useState(files[0] ?? "");

  function insert(text: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const pad = before && !before.endsWith("\n") ? "\n\n" : "";
    ta.value = `${before}${pad}${text}\n${after}`;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = (before + pad + text).length + 1;
  }

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("guideId", guideId);
    const res = await fetch("/api/assets", { method: "POST", body: fd });
    const data = (await res.json()) as { markdown?: string; error?: string };
    setBusy(false);
    if (!res.ok || !data.markdown) setError(data.error ?? "Upload failed");
    else insert(data.markdown);
  }

  return (
    <div className="border border-black/[0.19] bg-white focus-within:border-ink">
      <div className="flex flex-wrap items-center gap-1 border-b border-dashed border-line bg-paper px-2 py-1">
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} disabled={busy}>
          <RiImageAddLine size={13} /> {busy ? "Uploading…" : "Image or video"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,video/mp4,video/webm,video/quicktime,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
        {files.length > 0 ? (
          <span className="flex items-center gap-1">
            <select className="h-6 max-w-[220px] border border-black/15 bg-white px-1 font-mono text-[11px]" value={linkPath} onChange={(e) => setLinkPath(e.target.value)} aria-label="File for code link">
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => insert(`[${linkPath.split("/").pop()}](diff:${linkPath}#L1-L10)`)}
              title="Insert a link that highlights lines in the diff"
            >
              <RiCodeSSlashLine size={13} /> Code link
            </button>
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] tracking-[0.08em] text-black/40 uppercase">Markdown · Mermaid · Tables</span>
      </div>
      <textarea
        ref={ref}
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        placeholder={placeholder}
        className="block w-full resize-y bg-white px-3 py-2.5 font-mono text-[12.5px] leading-[20px] text-ink outline-none"
      />
      {error ? <p className="border-t border-dashed border-line px-3 py-1.5 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}

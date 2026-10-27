import { useRef, useState } from "react";
import { ExternalLink, FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import {
  ordersService,
  storageService,
  type OrderDocument,
} from "@/services";
import { Button } from "@/components/ui/button";

interface OrderDocumentsProps {
  orderId: number;
  documents: OrderDocument[];
  /** Upload/delete is only possible while the order is submitted. */
  canEdit: boolean;
  onChanged: () => void;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const OrderDocuments = ({
  orderId,
  documents,
  canEdit,
  onChanged,
}: OrderDocumentsProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<number | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: number | "upload", action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setBusy(null);
    }
  };

  const open = async (doc: OrderDocument) => {
    const url = await storageService.getSignedUrl(doc.file_path, 600);
    if (url) window.open(url, "_blank", "noopener");
    else setError("Dokumen tidak dapat dibuka.");
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada Delivery Order (DO) yang diunggah.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left hover:underline"
                onClick={() => open(doc)}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{doc.file_name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatSize(doc.size_bytes)}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  disabled={busy !== null}
                  title="Hapus dokumen"
                  onClick={() =>
                    run(doc.id, () => ordersService.deleteDocument(doc))
                  }
                >
                  {busy === doc.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <div>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                run("upload", () => ordersService.uploadDocument(orderId, file));
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {busy === "upload" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            Unggah Delivery Order (DO) (PDF, JPG atau PNG, maks. 5 MB)
          </Button>
        </div>
      )}
    </div>
  );
};

export default OrderDocuments;

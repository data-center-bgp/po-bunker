import { useEffect, useState, type ChangeEvent } from "react";
import { AlertCircle, Loader2, PenLine } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import { useSignedUrl } from "@/lib/useSignedUrl";
import { storageService } from "@/services";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MySignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MySignatureDialog = ({ open, onOpenChange }: MySignatureDialogProps) => {
  const { user, refreshUser } = useAuth();
  const currentUrl = useSignedUrl(user?.signature_path);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setFile(e.target.files?.[0] ?? null);
  };

  const handleSave = async () => {
    if (!file || !user) return;
    setSaving(true);
    setError(null);
    try {
      await storageService.uploadSignature(user.id, file);
      await refreshUser();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save signature");
    } finally {
      setSaving(false);
    }
  };

  const shown = preview ?? currentUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            My signature
          </DialogTitle>
          <DialogDescription>
            Printed on purchase orders you approve. Use a PNG or JPG on a white
            or transparent background, under 1 MB. Orders you already approved
            keep the signature they were approved with.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex h-32 items-center justify-center rounded-md border bg-white">
          {shown ? (
            <img src={shown} alt="Signature" className="max-h-28 object-contain" />
          ) : (
            <span className="text-sm text-muted-foreground">
              No signature uploaded yet
            </span>
          )}
        </div>

        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleChange}
          disabled={saving}
          className="text-sm"
        />

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!file || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save signature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MySignatureDialog;

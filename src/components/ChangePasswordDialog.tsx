import { useEffect, useState, type FormEvent } from "react";
import { authService } from "@/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";

const MIN_PASSWORD = 8;

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// Lets any signed-in user change their own password. Their other sessions end.
const ChangePasswordDialog = ({ isOpen, onClose }: ChangePasswordDialogProps) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setDone(false);
    setSaving(false);
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!current) return setError("Kata sandi saat ini wajib diisi");
    if (next.length < MIN_PASSWORD) {
      return setError(`Kata sandi baru minimal ${MIN_PASSWORD} karakter`);
    }
    if (next !== confirm) return setError("Konfirmasi kata sandi tidak sama");

    setSaving(true);
    try {
      await authService.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah kata sandi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Ubah Kata Sandi
          </DialogTitle>
          <DialogDescription>
            Setelah diubah, perangkat lain yang sedang masuk akan keluar.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              Kata sandi berhasil diubah.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Tutup</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="pw-current">Kata sandi saat ini</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-new">Kata sandi baru</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder={`Minimal ${MIN_PASSWORD} karakter`}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">Ulangi kata sandi baru</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Batal
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;

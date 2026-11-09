import { useEffect, useState, type FormEvent } from "react";
import {
  USER_ROLE_LABELS,
  usersService,
  type AppUser,
  type UserRole,
} from "@/services";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  UserRound,
  Wand2,
} from "lucide-react";

const ROLE_HELP: Record<UserRole, string> = {
  admin:
    "Akses penuh, termasuk mengelola pengguna serta data kapal dan kategori.",
  staff:
    "Membuat, menyelesaikan, dan membatalkan PO; mengelola perusahaan, mitra, wilayah, produk, satuan, kode budget, dan sinkronisasi kapal.",
  viewer: "Hanya dapat melihat data.",
};

const MIN_PASSWORD = 8;

// A readable random password without look-alike characters (0/O, 1/l/I).
const generatePassword = (): string => {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
};

interface UserDialogProps {
  isOpen: boolean;
  /** The user being edited; null opens the "add user" form. */
  user: AppUser | null;
  /** Id of the signed-in admin: own role and status cannot be changed. */
  currentUserId: string | undefined;
  onSuccess: () => void;
  onCancel: () => void;
}

const UserDialog = ({
  isOpen,
  user,
  currentUserId,
  onSuccess,
  onCancel,
}: UserDialogProps) => {
  const isEditing = !!user;
  const isSelf = !!user && user.id === currentUserId;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("staff");
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // reset password (edit mode)
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setEmail(user?.email ?? "");
    setName(user?.name ?? "");
    setRole(user?.role ?? "staff");
    setActive(user?.active ?? true);
    setPassword("");
    setNewPassword("");
    setResetDone(null);
  }, [isOpen, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Nama wajib diisi");
      return;
    }
    if (!isEditing) {
      if (!email.trim()) {
        setError("Email wajib diisi");
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(`Kata sandi awal minimal ${MIN_PASSWORD} karakter`);
        return;
      }
    }

    setSaving(true);
    try {
      if (user) {
        await usersService.updateUser(user.id, {
          name: name.trim(),
          role,
          active,
        });
      } else {
        await usersService.createUser({
          email: email.trim(),
          name: name.trim(),
          role,
          password,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengguna");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;
    setError(null);
    setResetDone(null);
    if (newPassword.length < MIN_PASSWORD) {
      setError(`Kata sandi baru minimal ${MIN_PASSWORD} karakter`);
      return;
    }
    setResetting(true);
    try {
      await usersService.resetPassword(user.id, newPassword);
      setResetDone(
        "Kata sandi diperbarui. Sesi pengguna ini berakhir; sampaikan kata sandi baru kepada mereka.",
      );
      setNewPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengatur ulang kata sandi",
      );
    } finally {
      setResetting(false);
    }
  };

  const busy = saving || resetting;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !busy && onCancel()}
    >
      <DialogContent className="max-h-[90vh] max-w-md overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            {isEditing ? "Ubah Pengguna" : "Tambah Pengguna"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Ubah nama, peran, atau status akses pengguna ini."
              : "Buat akun baru dengan kata sandi awal. Pengguna dapat menggantinya dari menu akun."}
          </DialogDescription>
        </DialogHeader>

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
            <Label htmlFor="user-email">Email</Label>
            <Input
              id="user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@barokahperkasagroup.com"
              disabled={isEditing || busy}
              autoFocus={!isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-name">Nama</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama lengkap"
              disabled={busy}
              autoFocus={isEditing}
            />
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="user-password">Kata sandi awal</Label>
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Minimal ${MIN_PASSWORD} karakter`}
                  autoComplete="off"
                  disabled={busy}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPassword(generatePassword())}
                  disabled={busy}
                  title="Buat kata sandi acak"
                >
                  <Wand2 className="h-4 w-4" />
                  Buat
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Catat dan sampaikan kata sandi ini kepada pengguna; setelah
                disimpan tidak dapat dilihat lagi.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Peran</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as UserRole)}
              disabled={busy || isSelf}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(USER_ROLE_LABELS) as UserRole[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {USER_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}</p>
          </div>

          {isEditing && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  disabled={busy || isSelf}
                />
                Akses aktif
              </label>
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? "Anda tidak dapat mengubah peran atau menonaktifkan akun Anda sendiri."
                  : "Pengguna nonaktif tidak dapat membuka PO Bunker, tetapi riwayat PO-nya tetap tersimpan."}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : isEditing ? (
                "Simpan"
              ) : (
                "Tambah"
              )}
            </Button>
          </DialogFooter>
        </form>

        {isEditing && (
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="user-reset" className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" />
              Atur ulang kata sandi
            </Label>
            <div className="flex gap-2">
              <Input
                id="user-reset"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`Kata sandi baru (minimal ${MIN_PASSWORD})`}
                autoComplete="off"
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewPassword(generatePassword())}
                disabled={busy}
                title="Buat kata sandi acak"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleReset}
                disabled={busy || !newPassword}
              >
                {resetting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Atur"
                )}
              </Button>
            </div>
            {resetDone && (
              <p className="flex items-start gap-1.5 text-xs text-green-700">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {resetDone}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;

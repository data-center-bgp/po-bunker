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
import { AlertCircle, Loader2, UserRound } from "lucide-react";

const ROLE_HELP: Record<UserRole, string> = {
  admin:
    "Akses penuh, termasuk mengelola pengguna serta data kapal, produk, dan kode budget.",
  staff:
    "Membuat, menyelesaikan, dan membatalkan PO; mengelola perusahaan, mitra, dan wilayah.",
  viewer: "Hanya dapat melihat data.",
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSaving(false);
    setEmail(user?.email ?? "");
    setName(user?.name ?? "");
    setRole(user?.role ?? "staff");
    setActive(user?.active ?? true);
  }, [isOpen, user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEditing && !email.trim()) {
      setError("Email wajib diisi");
      return;
    }
    if (isEditing && !name.trim()) {
      setError("Nama wajib diisi");
      return;
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
        await usersService.addUser({
          email: email.trim(),
          name: name.trim(),
          role,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengguna");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !saving && onCancel()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            {isEditing ? "Ubah Pengguna" : "Tambah Pengguna"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Ubah nama, peran, atau status akses pengguna ini."
              : "Beri akun login CGA yang sudah ada akses ke PO Bunker. Akun belum ada? Buat dulu di Supabase."}
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
              disabled={isEditing || saving}
              autoFocus={!isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-name">Nama</Label>
            <Input
              id="user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                isEditing
                  ? "Nama lengkap"
                  : "Kosongkan untuk memakai nama dari akun"
              }
              disabled={saving}
              autoFocus={isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label>Peran</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as UserRole)}
              disabled={saving || isSelf}
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
                  disabled={saving || isSelf}
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
              ) : isEditing ? (
                "Simpan"
              ) : (
                "Tambah"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;

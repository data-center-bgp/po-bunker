import { useCallback, useEffect, useMemo, useState } from "react";
import {
  USER_ROLE_LABELS,
  usersService,
  type AppUser,
  type UserRole,
} from "@/services";
import { useAuth } from "@/contexts/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Info, Pencil, Plus, Search } from "lucide-react";
import UserDialog from "./UserDialog";

const ROLE_VARIANT: Record<UserRole, "warning" | "info" | "secondary"> = {
  admin: "warning",
  staff: "info",
  viewer: "secondary",
};

type Filter = "all" | UserRole;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "admin", label: USER_ROLE_LABELS.admin },
  { key: "staff", label: USER_ROLE_LABELS.staff },
  { key: "viewer", label: USER_ROLE_LABELS.viewer },
];

const formatSignIn = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Belum pernah";

const UserPage = () => {
  const { user: me, isAdmin } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setUsers(await usersService.getUsers());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat data pengguna",
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void fetchUsers();
  }, [isAdmin, fetchUsers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(
      (u) =>
        (filter === "all" || u.role === filter) &&
        (!q ||
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)),
    );
  }, [users, query, filter]);

  const countOf = (f: Filter) =>
    f === "all" ? users.length : users.filter((u) => u.role === f).length;

  const openAdd = () => {
    setEditing(null);
    setShowDialog(true);
  };
  const openEdit = (u: AppUser) => {
    setEditing(u);
    setShowDialog(true);
  };
  const closeDialog = () => {
    setShowDialog(false);
    setEditing(null);
  };
  const handleSuccess = () => {
    closeDialog();
    void fetchUsers();
  };

  if (!isAdmin) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Halaman ini hanya dapat diakses oleh admin.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pengguna</h2>
          <p className="text-muted-foreground">
            Atur siapa yang boleh memakai PO Bunker dan perannya.
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Akun login dibuat di Supabase dan dipakai bersama aplikasi CGA lain,
          sehingga kata sandi tidak diatur di sini. Halaman ini hanya mengatur
          akses ke PO Bunker: orang baru perlu punya akun login terlebih dahulu,
          lalu ditambahkan dengan emailnya.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Cari nama atau email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={filter === key ? "default" : "outline"}
              onClick={() => setFilter(key)}
            >
              {label}
              <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">
                {countOf(key)}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat data pengguna...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {users.length === 0
              ? "Belum ada pengguna."
              : "Tidak ada pengguna yang sesuai."}
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terakhir masuk</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className={u.active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.id === me?.id && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Anda
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANT[u.role]}>
                        {USER_ROLE_LABELS[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "success" : "secondary"}>
                        {u.active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSignIn(u.last_sign_in_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(u)}
                        title="Ubah"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <UserDialog
        isOpen={showDialog}
        user={editing}
        currentUserId={me?.id}
        onSuccess={handleSuccess}
        onCancel={closeDialog}
      />
    </div>
  );
};

export default UserPage;

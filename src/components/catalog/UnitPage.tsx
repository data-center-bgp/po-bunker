import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { catalogService, type Uom } from "@/services";
import { useAuth } from "@/contexts/useAuth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, Loader2, Pencil, Plus, Ruler, Search } from "lucide-react";

const UnitPage = () => {
  const { canWrite } = useAuth();
  const [units, setUnits] = useState<Uom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Uom | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setUnits(await catalogService.getUnits());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data satuan");
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUnits();
  }, [fetchUnits]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? units.filter((u) => u.name.toLowerCase().includes(q)) : units;
  }, [units, query]);

  const openForm = (u: Uom | null) => {
    setEditing(u);
    setName(u?.name ?? "");
    setFormError(null);
    setShowForm(true);
  };
  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value) {
      setFormError("Nama satuan wajib diisi");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) await catalogService.updateUnit(editing.id, value);
      else await catalogService.createUnit(value);
      setShowForm(false);
      setEditing(null);
      void fetchUnits();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan satuan",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Satuan</h2>
          <p className="text-muted-foreground">
            Satuan ukuran produk, misalnya Liter, Ton, atau Unit.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => openForm(null)}>
            <Plus className="h-4 w-4" />
            Tambah Satuan
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cari satuan..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Hasil</h3>
          {!loading && <Badge variant="secondary">{filtered.length} satuan</Badge>}
        </div>
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat data satuan...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {units.length === 0
              ? "Belum ada satuan."
              : "Tidak ada satuan yang sesuai dengan pencarian."}
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  {canWrite && (
                    <TableHead className="text-right">Aksi</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openForm(u)}
                          title="Ubah"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-primary" />
              {editing ? "Ubah Satuan" : "Tambah Satuan"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Nama baru juga tampil pada PO lama yang memakai satuan ini."
                : "Nama satuan harus unik."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="unit-name">
                Nama <span className="text-destructive">*</span>
              </Label>
              <Input
                id="unit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Ton"
                disabled={saving}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
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
                ) : editing ? (
                  "Simpan"
                ) : (
                  "Tambah"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnitPage;

import { useState, useEffect, useMemo } from "react";
import { regionsService, type Region } from "@/services";
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
import {
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
} from "lucide-react";
import RegionForm from "@/components/api/RegionForm";

const PAGE_SIZE = 20;

const RegionPage = () => {
  const { canWrite } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);

  const fetchRegions = async () => {
    try {
      setLoading(true);
      setError(null);
      setRegions(await regionsService.getRegions());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat data wilayah",
      );
      setRegions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegions();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return regions;
    return regions.filter((r) => r.name?.toLowerCase().includes(q));
  }, [regions, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setCurrentPage(1);
  };

  const start = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, filtered.length);

  const handleAddNew = () => {
    setEditingRegion(null);
    setShowForm(true);
  };

  const handleEdit = (region: Region) => {
    setEditingRegion(region);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingRegion(null);
    fetchRegions();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingRegion(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Wilayah</h2>
          <p className="text-muted-foreground">
            Telusuri, cari, dan kelola wilayah.
          </p>
        </div>
        {canWrite && (
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4" />
            Tambah Wilayah
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cari berdasarkan nama wilayah..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Results */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Hasil</h3>
          {!loading && (
            <Badge variant="secondary">{filtered.length} wilayah</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat data wilayah...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {regions.length === 0
              ? "Wilayah tidak ditemukan."
              : "Tidak ada wilayah yang sesuai dengan pencarian."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Induk</TableHead>
                    <TableHead>Kode BPS</TableHead>
                    <TableHead>Perusahaan</TableHead>
                    <TableHead>Aktif</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.code || "-"}</TableCell>
                      <TableCell>{r.level_region || "-"}</TableCell>
                      <TableCell>{r.parent_name || "-"}</TableCell>
                      <TableCell>
                        {r.bps_code != null ? r.bps_code : "-"}
                      </TableCell>
                      <TableCell>
                        {r.companies_count}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.active ? "success" : "secondary"}
                        >
                          {r.active ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(r)}
                            title="Ubah"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Menampilkan {start}–{end} dari {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Sebelumnya
                </Button>
                <span className="text-muted-foreground">
                  Halaman {safePage} dari {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Create / Edit Modal */}
      <RegionForm
        isOpen={showForm}
        onSuccess={handleFormSuccess}
        onCancel={handleFormCancel}
        region={editingRegion}
        regions={regions}
      />
    </div>
  );
};

export default RegionPage;
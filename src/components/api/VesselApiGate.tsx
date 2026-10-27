import { useState, useEffect, useMemo } from "react";
import {
  lookupsService,
  type Vessel,
  type VesselSyncResult,
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
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";

const PAGE_SIZE = 20;

const VesselApiGate = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<VesselSyncResult | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchVessels = async () => {
    try {
      setLoading(true);
      setError(null);
      setVessels(await lookupsService.getVessels());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data kapal");
      setVessels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVessels();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      setSyncResult(await lookupsService.syncVesselsFromSms());
      await fetchVessels();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyinkronkan kapal");
    } finally {
      setSyncing(false);
    }
  };

  const lastSynced = vessels.reduce<string | null>(
    (latest, v) => (v.synced_at && (!latest || v.synced_at > latest) ? v.synced_at : latest),
    null,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vessels;
    return vessels.filter(
      (v) =>
        v.name?.toLowerCase().includes(q) || v.code?.toLowerCase().includes(q),
    );
  }, [vessels, query]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Kapal</h2>
          <p className="text-muted-foreground">
            Telusuri dan cari kapal.
            {lastSynced &&
              ` Terakhir disinkronkan ${new Date(lastSynced).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}.`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Sinkronkan dari SMS
          </Button>
        )}
      </div>

      {syncResult && (
        <div className="flex items-center gap-2 rounded-lg border border-green-600/40 bg-green-600/10 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Sinkronisasi {syncResult.total} kapal: {syncResult.created} baru,{" "}
          {syncResult.updated + syncResult.adopted} diperbarui,{" "}
          {syncResult.deactivated} dinonaktifkan
          {syncResult.skipped > 0 && `, ${syncResult.skipped} dilewati`}.
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Cari berdasarkan nama atau kode kapal..."
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
            <Badge variant="secondary">{filtered.length} kapal</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Memuat data kapal...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {vessels.length === 0
              ? "Kapal tidak ditemukan."
              : "Tidak ada kapal yang sesuai dengan pencarian."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Armada</TableHead>
                    <TableHead>Kepala Operasi</TableHead>
                    <TableHead>Perusahaan</TableHead>
                    <TableHead>Tonase Kotor</TableHead>
                    <TableHead>Tanda Panggilan</TableHead>
                    <TableHead>IMO</TableHead>
                    <TableHead>Aktif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.code || "-"}</TableCell>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>{v.type?.name || "-"}</TableCell>
                      <TableCell>{v.fleet_name || "-"}</TableCell>
                      <TableCell>{v.operation_head_name || "-"}</TableCell>
                      <TableCell title={v.headcount_name ?? undefined}>
                        {v.headcount_code || "-"}
                      </TableCell>
                      <TableCell>
                        {v.gross_tonage || v.gross_tonage === 0
                          ? v.gross_tonage
                          : "-"}
                      </TableCell>
                      <TableCell>{v.call_sign ? v.call_sign : "-"}</TableCell>
                      <TableCell>{v.imo_no ? v.imo_no : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={v.active ? "success" : "secondary"}>
                          {v.active ? "Aktif" : "Nonaktif"}
                        </Badge>
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
    </div>
  );
};

export default VesselApiGate;

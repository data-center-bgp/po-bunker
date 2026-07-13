import { useState, useEffect, useMemo } from "react";
import { ordersApi, type Region } from "@/services/api";
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
      const response = await ordersApi.getRegions();
      setRegions(response.regions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch regions",
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
          <h2 className="text-2xl font-bold tracking-tight">Regions</h2>
          <p className="text-muted-foreground">
            Browse, search, and manage regions.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4" />
          Add New Region
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by region name..."
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
          <h3 className="text-sm font-semibold">Results</h3>
          {!loading && (
            <Badge variant="secondary">{filtered.length} region(s)</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading regions...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {regions.length === 0
              ? "No regions found."
              : "No regions match your search."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>BPS Code</TableHead>
                    <TableHead>Companies</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
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
                        {r.companies_count != null ? r.companies_count : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={r.active ? "success" : "secondary"}
                        >
                          {r.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(r)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Showing {start}–{end} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </Button>
                <span className="text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                >
                  Next
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
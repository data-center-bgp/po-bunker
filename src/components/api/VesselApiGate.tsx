import { useState, useEffect, useMemo } from "react";
import { ordersApi, type Vessel } from "@/services/api";
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
import { AlertCircle, Search, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

const VesselApiGate = () => {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchVessels = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await ordersApi.getVessels();
        setVessels(response.shipping_vessels || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch vessels",
        );
        setVessels([]);
      } finally {
        setLoading(false);
      }
    };
    fetchVessels();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vessels;
    return vessels.filter((v) => v.name?.toLowerCase().includes(q));
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Shipping Vessels</h2>
        <p className="text-muted-foreground">
          Browse and search shipping vessels.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by vessel name..."
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
            <Badge variant="secondary">{filtered.length} vessel(s)</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading vessels...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {vessels.length === 0
              ? "No vessels found."
              : "No vessels match your search."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Business Unit</TableHead>
                    <TableHead>Gross Tonnage</TableHead>
                    <TableHead>Call Sign</TableHead>
                    <TableHead>IMO</TableHead>
                    <TableHead>Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>{v.type_name || "-"}</TableCell>
                      <TableCell>{v.operator_name || "-"}</TableCell>
                      <TableCell>{v.owner_name || "-"}</TableCell>
                      <TableCell>{v.bussines_unit_id_name || "-"}</TableCell>
                      <TableCell>
                        {v.gross_tonage || v.gross_tonage === 0
                          ? v.gross_tonage
                          : "-"}
                      </TableCell>
                      <TableCell>{v.call_sign ? v.call_sign : "-"}</TableCell>
                      <TableCell>{v.imo_no ? v.imo_no : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={v.active ? "success" : "secondary"}>
                          {v.active ? "Active" : "Inactive"}
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
    </div>
  );
};

export default VesselApiGate;

import { useState, useEffect, useMemo } from "react";
import { ordersApi, type Partner } from "@/services/api";
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
import PartnerForm from "@/components/api/PartnerForm";

const PAGE_SIZE = 20;

const PartnerPage = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ordersApi.getPartners();
      setPartners(response.partners || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch partners",
      );
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPartners();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter((p) =>
      p.display_name?.toLowerCase().includes(q),
    );
  }, [partners, query]);

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
    setEditingPartner(null);
    setShowForm(true);
  };

  const handleEdit = (partner: Partner) => {
    setEditingPartner(partner);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingPartner(null);
    fetchPartners();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingPartner(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Vendor/Customer
          </h2>
          <p className="text-muted-foreground">
            Browse, search, and manage business partners.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4" />
          Add New Partner
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by partner name..."
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
            <Badge variant="secondary">{filtered.length} partner(s)</Badge>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading partners...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {partners.length === 0
              ? "No partners found."
              : "No partners match your search."}
          </div>
        ) : (
          <>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.display_name || p.name}
                      </TableCell>
                      <TableCell>{p.type || "-"}</TableCell>
                      <TableCell>
                        {p.is_company ? "Yes" : "No"}
                      </TableCell>
                      <TableCell>{p.email || "-"}</TableCell>
                      <TableCell>{p.phone || p.mobile || "-"}</TableCell>
                      <TableCell>{p.parent_name || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={p.active ? "success" : "secondary"}
                        >
                          {p.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(p)}
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
      <PartnerForm
        isOpen={showForm}
        onSuccess={handleFormSuccess}
        onCancel={handleFormCancel}
        partner={editingPartner}
        partners={partners}
      />
    </div>
  );
};

export default PartnerPage;
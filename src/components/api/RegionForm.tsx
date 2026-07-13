import { useState, useEffect, type FormEvent } from "react";
import { ordersApi, type Region } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { AlertCircle, Loader2, MapPin } from "lucide-react";

interface RegionFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  region?: Region | null;
  regions: Region[];
}

interface RegionFormData {
  name: string;
  code: string;
  description: string;
  active: boolean;
  level_region: string;
  bps_code: string;
  parent_id: string;
}

const initialData: RegionFormData = {
  name: "",
  code: "",
  description: "",
  active: true,
  level_region: "",
  bps_code: "",
  parent_id: "",
};

const RegionForm = ({
  isOpen,
  onSuccess,
  onCancel,
  region = null,
  regions,
}: RegionFormProps) => {
  const [formData, setFormData] = useState<RegionFormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!region && !!region.id;

  useEffect(() => {
    if (!isOpen) return;
    if (!region) {
      setFormData(initialData);
      return;
    }
    setFormData({
      name: region.name || "",
      code: region.code || "",
      description:
        typeof region.description === "string" ? region.description : "",
      active: region.active !== false,
      level_region: region.level_region || "",
      bps_code:
        region.bps_code != null ? String(region.bps_code) : "",
      parent_id: region.parent_id != null ? String(region.parent_id) : "",
    });
    setError(null);
  }, [isOpen, region]);

  const handleChange = (
    field: keyof RegionFormData,
    value: string | boolean,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError("Name is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim() || null,
        description: formData.description.trim() || null,
        active: formData.active,
        level_region: formData.level_region.trim() || null,
        bps_code:
          formData.bps_code.trim() !== ""
            ? Number(formData.bps_code)
            : null,
        parent_id:
          formData.parent_id !== ""
            ? Number(formData.parent_id)
            : null,
      };

      if (isEditing && region) {
        await ordersApi.updateRegion(region.id, payload);
      } else {
        await ordersApi.createRegion(payload);
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Failed to update region"
            : "Failed to create region",
      );
      console.error(
        isEditing ? "Error updating region:" : "Error creating region:",
        err,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData(initialData);
    setError(null);
    onCancel();
  };

  // Exclude the region being edited from the parent list to avoid self-parenting
  const parentOptions = regions.filter(
    (r) => r.id !== region?.id,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {isEditing ? "Edit Region" : "Create New Region"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details below to modify this region."
              : "Fill in the details below to create a new region."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="region-form"
          onSubmit={handleSubmit}
          className="flex flex-col"
        >
          <div className="max-h-[calc(90vh-200px)] overflow-auto px-6 py-4">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="region-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="region-name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. Jakarta"
                  disabled={loading}
                />
              </div>

              {/* Code */}
              <div className="space-y-2">
                <Label htmlFor="region-code">Code</Label>
                <Input
                  id="region-code"
                  value={formData.code}
                  onChange={(e) => handleChange("code", e.target.value)}
                  placeholder="e.g. JKT"
                  disabled={loading}
                />
              </div>

              {/* Level Region */}
              <div className="space-y-2">
                <Label htmlFor="region-level">Level Region</Label>
                <Input
                  id="region-level"
                  value={formData.level_region}
                  onChange={(e) =>
                    handleChange("level_region", e.target.value)
                  }
                  placeholder="e.g. province"
                  disabled={loading}
                />
              </div>

              {/* BPS Code */}
              <div className="space-y-2">
                <Label htmlFor="region-bps">BPS Code</Label>
                <Input
                  id="region-bps"
                  type="number"
                  value={formData.bps_code}
                  onChange={(e) => handleChange("bps_code", e.target.value)}
                  placeholder="e.g. 31"
                  disabled={loading}
                />
              </div>

              {/* Parent Region */}
              <div className="space-y-2">
                <Label htmlFor="region-parent">Parent Region</Label>
                <Select
                  value={formData.parent_id}
                  onValueChange={(value) => handleChange("parent_id", value)}
                >
                  <SelectTrigger id="region-parent" disabled={loading}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {parentOptions.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                        {r.code ? ` (${r.code})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="region-description">Description</Label>
                <Textarea
                  id="region-description"
                  value={formData.description}
                  onChange={(e) =>
                    handleChange("description", e.target.value)
                  }
                  placeholder="Optional notes about this region"
                  disabled={loading}
                  rows={3}
                />
              </div>

              {/* Active */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="region-active"
                  className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  checked={formData.active}
                  onChange={(e) => handleChange("active", e.target.checked)}
                  disabled={loading}
                />
                <Label htmlFor="region-active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter className="px-6 pb-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" form="region-form" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : isEditing ? (
              "Update Region"
            ) : (
              "Create Region"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RegionForm;
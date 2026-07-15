import { useState, useEffect, type FormEvent } from "react";
import {
  ordersApi,
  type Partner,
  type Vessel,
  type CreatePartnerRequest,
} from "@/services/api";
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
import { AlertCircle, Loader2, Building2 } from "lucide-react";

interface PartnerFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  partner?: Partner | null;
  partners: Partner[];
}

interface PartnerFormData {
  name: string;
  type: string;
  is_company: boolean;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  vat: string;
  street: string;
  street2: string;
  city: string;
  zip: string;
  vessel_id: string;
  parent_id: string;
  customer: boolean;
  supplier: boolean;
  active: boolean;
}

const initialData: PartnerFormData = {
  name: "",
  type: "contact",
  is_company: false,
  email: "",
  phone: "",
  mobile: "",
  website: "",
  vat: "",
  street: "",
  street2: "",
  city: "",
  zip: "",
  vessel_id: "",
  parent_id: "",
  customer: false,
  supplier: false,
  active: true,
};

const PartnerForm = ({
  isOpen,
  onSuccess,
  onCancel,
  partner = null,
  partners,
}: PartnerFormProps) => {
  const [formData, setFormData] = useState<PartnerFormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vessels, setVessels] = useState<Vessel[]>([]);

  const isEditing = !!partner && !!partner.id;

  useEffect(() => {
    if (!isOpen) return;

    if (!partner) {
      setFormData(initialData);
      setError(null);
      return;
    }

    setFormData({
      name: partner.name || "",
      type: partner.type || "contact",
      is_company: !!partner.is_company,
      email: partner.email ? String(partner.email) : "",
      phone: partner.phone ? String(partner.phone) : "",
      mobile: partner.mobile ? String(partner.mobile) : "",
      website: partner.website ? String(partner.website) : "",
      vat: partner.vat ? String(partner.vat) : "",
      street: partner.street ? String(partner.street) : "",
      street2: partner.street2 ? String(partner.street2) : "",
      city: partner.city ? String(partner.city) : "",
      zip: partner.zip ? String(partner.zip) : "",
      vessel_id: partner.vessel_id != null ? String(partner.vessel_id) : "",
      parent_id: partner.parent_id != null ? String(partner.parent_id) : "",
      customer: (partner.customer_rank ?? 0) > 0,
      supplier: (partner.supplier_rank ?? 0) > 0,
      active: partner.active !== false,
    });
    setError(null);
  }, [isOpen, partner]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    ordersApi
      .getVessels()
      .then((res) => {
        if (!cancelled) setVessels(res.shipping_vessels || []);
      })
      .catch(() => {
        if (!cancelled) setVessels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleChange = (
    field: keyof PartnerFormData,
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
      const payload: CreatePartnerRequest = {
        name: formData.name.trim(),
        active: formData.active,
      };

      if (formData.type.trim()) payload.type = formData.type.trim();
      payload.is_company = formData.is_company;
      if (formData.email.trim()) payload.email = formData.email.trim();
      if (formData.phone.trim()) payload.phone = formData.phone.trim();
      if (formData.mobile.trim()) payload.mobile = formData.mobile.trim();
      if (formData.website.trim()) payload.website = formData.website.trim();
      if (formData.vat.trim()) payload.vat = formData.vat.trim();
      if (formData.street.trim()) payload.street = formData.street.trim();
      if (formData.street2.trim()) payload.street2 = formData.street2.trim();
      if (formData.city.trim()) payload.city = formData.city.trim();
      if (formData.zip.trim()) payload.zip = formData.zip.trim();
      if (formData.vessel_id !== "")
        payload.vessel_id = Number(formData.vessel_id);
      if (formData.parent_id !== "")
        payload.parent_id = Number(formData.parent_id);
      if (formData.customer) payload.customer = true;
      if (formData.supplier) payload.supplier = true;

      if (isEditing && partner) {
        await ordersApi.updatePartner(partner.id, payload);
      } else {
        await ordersApi.createPartner(payload);
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Failed to update partner"
            : "Failed to create partner",
      );
      console.error(
        isEditing ? "Error updating partner:" : "Error creating partner:",
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

  // Parent options: companies only, excluding self
  const parentOptions = partners.filter(
    (p) => p.is_company && p.id !== partner?.id,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {isEditing ? "Edit Partner" : "Create New Partner"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details below to modify this vendor/customer."
              : "Fill in the details below to create a new vendor/customer."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="partner-form"
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
                <Label htmlFor="partner-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="partner-name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. PT Samudera Jaya"
                  disabled={loading}
                />
              </div>

              {/* Type + is_company */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-type">Type</Label>
                  <Input
                    id="partner-type"
                    value={formData.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    placeholder="e.g. contact"
                    disabled={loading}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      checked={formData.is_company}
                      onChange={(e) =>
                        handleChange("is_company", e.target.checked)
                      }
                      disabled={loading}
                    />
                    <span className="text-sm">Is a company</span>
                  </label>
                </div>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-email">Email</Label>
                  <Input
                    id="partner-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="info@example.com"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-website">Website</Label>
                  <Input
                    id="partner-website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => handleChange("website", e.target.value)}
                    placeholder="https://example.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-phone">Phone</Label>
                  <Input
                    id="partner-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+6221..."
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-mobile">Mobile</Label>
                  <Input
                    id="partner-mobile"
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => handleChange("mobile", e.target.value)}
                    placeholder="+62812..."
                    disabled={loading}
                  />
                </div>
              </div>

              {/* VAT + Address */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-vat">VAT</Label>
                  <Input
                    id="partner-vat"
                    value={formData.vat}
                    onChange={(e) => handleChange("vat", e.target.value)}
                    placeholder="e.g. 01.123.456.7-890.000"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="partner-zip">ZIP</Label>
                  <Input
                    id="partner-zip"
                    value={formData.zip}
                    onChange={(e) => handleChange("zip", e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-street">Street</Label>
                <Input
                  id="partner-street"
                  value={formData.street}
                  onChange={(e) => handleChange("street", e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-street2">Street 2</Label>
                <Input
                  id="partner-street2"
                  value={formData.street2}
                  onChange={(e) => handleChange("street2", e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-city">City</Label>
                  <Input
                    id="partner-city"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Parent + Vessel */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="partner-parent">Parent Company</Label>
                  <Select
                    value={formData.parent_id}
                    onValueChange={(value) =>
                      handleChange("parent_id", value)
                    }
                  >
                    <SelectTrigger id="partner-parent" disabled={loading}>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.display_name || p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="partner-vessel">Vessel</Label>
                  <Select
                    value={formData.vessel_id}
                    onValueChange={(value) =>
                      handleChange("vessel_id", value)
                    }
                  >
                    <SelectTrigger id="partner-vessel" disabled={loading}>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {vessels.map((v) => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Customer / Supplier / Active */}
              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={formData.customer}
                    onChange={(e) =>
                      handleChange("customer", e.target.checked)
                    }
                    disabled={loading}
                  />
                  <span className="text-sm">Customer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={formData.supplier}
                    onChange={(e) =>
                      handleChange("supplier", e.target.checked)
                    }
                    disabled={loading}
                  />
                  <span className="text-sm">Supplier</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                    checked={formData.active}
                    onChange={(e) => handleChange("active", e.target.checked)}
                    disabled={loading}
                  />
                  <span className="text-sm">Active</span>
                </label>
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
          <Button type="submit" form="partner-form" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : isEditing ? (
              "Update Partner"
            ) : (
              "Create Partner"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PartnerForm;
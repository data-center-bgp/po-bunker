import { useState, useEffect, type FormEvent } from "react";
import {
  ordersApi,
  type Company,
  type Region,
  type CreateCompanyRequest,
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
import { AlertCircle, Loader2, Building } from "lucide-react";

const NONE_VALUE = "__none__";

interface CompanyFormProps {
  isOpen: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  company?: Company | null;
}

interface CompanyFormData {
  name: string;
  code_company: string;
  code_company_general: string;
  active: boolean;
  email: string;
  phone: string;
  website: string;
  vat: string;
  street: string;
  street2: string;
  city: string;
  zip: string;
  region_id: string;
  currency_id: string;
  bussines_unit_id: string;
}

const initialData: CompanyFormData = {
  name: "",
  code_company: "",
  code_company_general: "",
  active: true,
  email: "",
  phone: "",
  website: "",
  vat: "",
  street: "",
  street2: "",
  city: "",
  zip: "",
  region_id: "",
  currency_id: "",
  bussines_unit_id: "",
};

const CompanyForm = ({
  isOpen,
  onSuccess,
  onCancel,
  company = null,
}: CompanyFormProps) => {
  const [formData, setFormData] = useState<CompanyFormData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);

  const isEditing = !!company && !!company.id;

  useEffect(() => {
    if (!isOpen) return;

    if (!company) {
      setFormData(initialData);
      setError(null);
      return;
    }

    setFormData({
      name: company.name || "",
      code_company: company.code_company || "",
      code_company_general: company.code_company_general || "",
      active: company.active !== false,
      email: company.email ? String(company.email) : "",
      phone: company.phone ? String(company.phone) : "",
      website: company.website ? String(company.website) : "",
      vat: company.vat ? String(company.vat) : "",
      street: company.street ? String(company.street) : "",
      street2: company.street2 ? String(company.street2) : "",
      city: company.city ? String(company.city) : "",
      zip: company.zip ? String(company.zip) : "",
      region_id: company.region_id != null ? String(company.region_id) : "",
      currency_id:
        company.currency_id != null ? String(company.currency_id) : "",
      bussines_unit_id:
        company.bussines_unit_id != null
          ? String(company.bussines_unit_id)
          : "",
    });
    setError(null);
  }, [isOpen, company]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    ordersApi
      .getRegions()
      .then((res) => {
        if (!cancelled) setRegions(res.regions || []);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleChange = (
    field: keyof CompanyFormData,
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
      const payload: CreateCompanyRequest = {
        name: formData.name.trim(),
        active: formData.active,
      };

      if (formData.code_company.trim())
        payload.code_company = formData.code_company.trim();
      if (formData.code_company_general.trim())
        payload.code_company_general = formData.code_company_general.trim();
      if (formData.email.trim()) payload.email = formData.email.trim();
      if (formData.phone.trim()) payload.phone = formData.phone.trim();
      if (formData.website.trim()) payload.website = formData.website.trim();
      if (formData.vat.trim()) payload.vat = formData.vat.trim();
      if (formData.street.trim()) payload.street = formData.street.trim();
      if (formData.street2.trim()) payload.street2 = formData.street2.trim();
      if (formData.city.trim()) payload.city = formData.city.trim();
      if (formData.zip.trim()) payload.zip = formData.zip.trim();
      if (formData.region_id !== "")
        payload.region_id = Number(formData.region_id);
      if (formData.currency_id !== "")
        payload.currency_id = Number(formData.currency_id);
      if (formData.bussines_unit_id !== "")
        payload.bussines_unit_id = Number(formData.bussines_unit_id);

      if (isEditing && company) {
        await ordersApi.updateCompany(company.id, payload);
      } else {
        await ordersApi.createCompany(payload);
      }
      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isEditing
            ? "Failed to update company"
            : "Failed to create company",
      );
      console.error(
        isEditing ? "Error updating company:" : "Error creating company:",
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            {isEditing ? "Edit Company" : "Create New Company"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details below to modify this company."
              : "Fill in the details below to create a new company."}
          </DialogDescription>
        </DialogHeader>

        <form
          id="company-form"
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
                <Label htmlFor="company-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="company-name"
                  value={formData.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. PT Barokah Gemilang Perkasa"
                  disabled={loading}
                />
              </div>

              {/* Code + General Code */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-code">Code</Label>
                  <Input
                    id="company-code"
                    value={formData.code_company}
                    onChange={(e) =>
                      handleChange("code_company", e.target.value)
                    }
                    placeholder="e.g. BGP"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-code-general">General Code</Label>
                  <Input
                    id="company-code-general"
                    value={formData.code_company_general}
                    onChange={(e) =>
                      handleChange("code_company_general", e.target.value)
                    }
                    placeholder="e.g. BGP"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-email">Email</Label>
                  <Input
                    id="company-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="info@example.com"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-website">Website</Label>
                  <Input
                    id="company-website"
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
                  <Label htmlFor="company-phone">Phone</Label>
                  <Input
                    id="company-phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+6221..."
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-vat">VAT</Label>
                  <Input
                    id="company-vat"
                    value={formData.vat}
                    onChange={(e) => handleChange("vat", e.target.value)}
                    placeholder="e.g. 01.123.456.7-890.000"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <Label htmlFor="company-street">Street</Label>
                <Input
                  id="company-street"
                  value={formData.street}
                  onChange={(e) => handleChange("street", e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-street2">Street 2</Label>
                <Input
                  id="company-street2"
                  value={formData.street2}
                  onChange={(e) => handleChange("street2", e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-city">City</Label>
                  <Input
                    id="company-city"
                    value={formData.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-zip">ZIP</Label>
                  <Input
                    id="company-zip"
                    value={formData.zip}
                    onChange={(e) => handleChange("zip", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-region">Region</Label>
                  <Select
                    value={formData.region_id || NONE_VALUE}
                    onValueChange={(value) =>
                      handleChange(
                        "region_id",
                        value === NONE_VALUE ? "" : value,
                      )
                    }
                  >
                    <SelectTrigger id="company-region" disabled={loading}>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>None</SelectItem>
                      {regions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                          {r.code ? ` (${r.code})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company-currency">Currency ID</Label>
                  <Input
                    id="company-currency"
                    type="number"
                    value={formData.currency_id}
                    onChange={(e) =>
                      handleChange("currency_id", e.target.value)
                    }
                    placeholder="e.g. 12 (IDR)"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-bu">Business Unit ID</Label>
                  <Input
                    id="company-bu"
                    type="number"
                    value={formData.bussines_unit_id}
                    onChange={(e) =>
                      handleChange("bussines_unit_id", e.target.value)
                    }
                    placeholder="e.g. 5"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Active */}
              <div className="flex items-center gap-2 pt-2">
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
          <Button type="submit" form="company-form" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isEditing ? "Updating..." : "Creating..."}
              </>
            ) : isEditing ? (
              "Update Company"
            ) : (
              "Create Company"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyForm;
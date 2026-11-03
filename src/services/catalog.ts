import { supabase } from "@/lib/supabase";
import { toError, unwrap } from "./helpers";
import type {
  CodeBudget,
  CodeBudgetInput,
  Product,
  ProductCategory,
  ProductInput,
  Uom,
} from "./types";

// Maintenance of products, units of measure and code budgets (admin and staff,
// migration 0010). Unlike lookupsService these also return inactive rows.
const PRODUCT_SELECT =
  "*, category:category_id(id,name), uom:uom_id(id,name), code_budget:code_budget_id(id,name)";

export const catalogService = {
  getProducts: async (): Promise<Product[]> =>
    unwrap(
      await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .order("name")
        .overrideTypes<Product[], { merge: false }>(),
      "Gagal memuat data produk",
    ),

  getCategories: async (): Promise<ProductCategory[]> =>
    unwrap(
      await supabase
        .from("product_categories")
        .select("id,name")
        .order("name")
        .overrideTypes<ProductCategory[], { merge: false }>(),
      "Gagal memuat kategori produk",
    ),

  createProduct: async (input: ProductInput): Promise<void> => {
    const { error } = await supabase.from("products").insert(input);
    if (error) throw toError(error, "Gagal membuat produk");
  },

  updateProduct: async (id: number, input: ProductInput): Promise<void> => {
    const { error } = await supabase.from("products").update(input).eq("id", id);
    if (error) throw toError(error, "Gagal memperbarui produk");
  },

  getUnits: async (): Promise<Uom[]> =>
    unwrap(
      await supabase
        .from("uoms")
        .select("id,name")
        .order("name")
        .overrideTypes<Uom[], { merge: false }>(),
      "Gagal memuat data satuan",
    ),

  createUnit: async (name: string): Promise<void> => {
    const { error } = await supabase.from("uoms").insert({ name });
    if (error) throw toError(error, "Gagal membuat satuan");
  },

  updateUnit: async (id: number, name: string): Promise<void> => {
    const { error } = await supabase.from("uoms").update({ name }).eq("id", id);
    if (error) throw toError(error, "Gagal memperbarui satuan");
  },

  getCodeBudgets: async (): Promise<CodeBudget[]> =>
    unwrap(
      await supabase
        .from("code_budgets")
        .select("id,name,code,active")
        .order("name")
        .overrideTypes<CodeBudget[], { merge: false }>(),
      "Gagal memuat kode budget",
    ),

  createCodeBudget: async (input: CodeBudgetInput): Promise<void> => {
    const { error } = await supabase.from("code_budgets").insert(input);
    if (error) throw toError(error, "Gagal membuat kode budget");
  },

  updateCodeBudget: async (
    id: number,
    input: CodeBudgetInput,
  ): Promise<void> => {
    const { error } = await supabase
      .from("code_budgets")
      .update(input)
      .eq("id", id);
    if (error) throw toError(error, "Gagal memperbarui kode budget");
  },
};

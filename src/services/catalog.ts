import { api } from "@/lib/api";
import type {
  CodeBudget,
  CodeBudgetInput,
  Product,
  ProductCategory,
  ProductInput,
  Uom,
} from "./types";

// Maintenance of products, units of measure and code budgets (admin and
// staff). Unlike lookupsService these also return inactive rows.
export const catalogService = {
  getProducts: (): Promise<Product[]> => api.get<Product[]>("/products"),

  getCategories: (): Promise<ProductCategory[]> =>
    api.get<ProductCategory[]>("/product-categories"),

  createProduct: async (input: ProductInput): Promise<void> => {
    await api.post<Product>("/products", input);
  },

  updateProduct: async (id: number, input: ProductInput): Promise<void> => {
    await api.put<Product>(`/products/${id}`, input);
  },

  getUnits: (): Promise<Uom[]> => api.get<Uom[]>("/uoms"),

  createUnit: async (name: string): Promise<void> => {
    await api.post<Uom>("/uoms", { name });
  },

  updateUnit: async (id: number, name: string): Promise<void> => {
    await api.put<Uom>(`/uoms/${id}`, { name });
  },

  getCodeBudgets: (): Promise<CodeBudget[]> =>
    api.get<CodeBudget[]>("/code-budgets"),

  createCodeBudget: async (input: CodeBudgetInput): Promise<void> => {
    await api.post<CodeBudget>("/code-budgets", input);
  },

  updateCodeBudget: async (
    id: number,
    input: CodeBudgetInput,
  ): Promise<void> => {
    await api.put<CodeBudget>(`/code-budgets/${id}`, input);
  },
};

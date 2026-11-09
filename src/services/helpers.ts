// Services let ApiError (see src/lib/api.ts) propagate: its message is already
// Indonesian, so components can show `err.message` as they always did.
export { ApiError } from "@/lib/api";

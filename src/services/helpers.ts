import type { PostgrestError } from "@supabase/supabase-js";

// Supabase returns errors as plain objects; the UI expects `Error` instances.
export const toError = (error: PostgrestError, fallback: string): Error => {
  if (error.code === "23505") {
    return new Error("A record with the same unique value already exists.");
  }
  if (error.code === "23503") {
    return new Error("This record is still referenced by other data.");
  }
  return new Error(error.message || fallback);
};

export const unwrap = <T>(
  result: { data: T | null; error: PostgrestError | null },
  fallback: string,
): T => {
  if (result.error) throw toError(result.error, fallback);
  if (result.data === null) throw new Error(fallback);
  return result.data;
};

export const unwrapVoid = (
  result: { error: PostgrestError | null },
  fallback: string,
): void => {
  if (result.error) throw toError(result.error, fallback);
};

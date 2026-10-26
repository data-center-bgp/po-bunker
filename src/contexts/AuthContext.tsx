import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { ApprovalLevel, Profile, UserRole } from "@/services/types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  signature_path: string | null;
  approval_levels: ApprovalLevel[];
}

export interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until the stored session (if any) has been checked. */
  loading: boolean;
  /** admin and staff can create/edit; viewers are read-only. */
  canWrite: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the signed-in user's profile (e.g. after uploading a signature). */
  refreshUser: () => Promise<void>;
}

const NO_ACCESS_MESSAGE =
  "This account does not have access to PO Bunker. Please contact an administrator.";

const notReady = () => {
  throw new Error("AuthProvider is missing");
};

const defaultAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  loading: true,
  canWrite: false,
  login: notReady,
  logout: notReady,
  refreshUser: notReady,
};

export const AuthContext = createContext<AuthContextType>(defaultAuthContext);

// The Supabase project is shared with other apps, so a valid Supabase login is
// not enough: the user also needs an active row in po_bunker.profiles (RLS only
// lets such users read it, so a missing row means no access).
const loadProfile = async (session: Session): Promise<AuthUser | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,name,email,role,active,signature_path,approval_levels")
    .eq("id", session.user.id)
    .maybeSingle<Profile>();
  if (error) throw new Error(error.message);
  if (!data || !data.active) return null;
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    signature_path: data.signature_path,
    approval_levels: data.approval_levels ?? [],
  };
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applySession = async (session: Session | null) => {
      if (!session) {
        if (!cancelled) setUser(null);
        return;
      }
      try {
        const profile = await loadProfile(session);
        if (cancelled) return;
        if (!profile) {
          await supabase.auth.signOut();
          setUser(null);
          return;
        }
        setUser(profile);
      } catch (err) {
        console.error("Failed to load profile:", err);
        if (!cancelled) setUser(null);
      }
    };

    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      if (!cancelled) setLoading(false);
    });

    // Don't call supabase from inside this callback directly (it can
    // deadlock the auth client); defer to the next tick.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        setTimeout(() => {
          void applySession(session);
        }, 0);
      },
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(
        error.status === 400 ? "Invalid email or password" : error.message,
      );
    }
    const profile = await loadProfile(data.session);
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error(NO_ACCESS_MESSAGE);
    }
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    const profile = await loadProfile(data.session);
    if (profile) setUser(profile);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        canWrite: user?.role === "admin" || user?.role === "staff",
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

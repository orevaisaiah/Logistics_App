import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  clearTokens,
  onSignedOut,
  readTokens,
  setTokens,
} from "../api";
import { removePushToken } from "../push";
import type { Me } from "../types";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut"; notice?: string }
  | { status: "signedIn"; me: Me };

type Auth = {
  state: AuthState;
  requestCode: (phone: string) => Promise<void>;
  verifyCode: (phone: string, code: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const loadMe = useCallback(async () => {
    const me = await api<Me>("/v1/me");
    if (me.role !== "RIDER" || !me.rider) {
      await clearTokens();
      setState({
        status: "signedOut",
        notice: "This number is not a rider account.",
      });
      return;
    }
    setState({ status: "signedIn", me });
  }, []);

  // The API client tells us when the session has really ended
  useEffect(
    () =>
      onSignedOut(() =>
        setState({
          status: "signedOut",
          notice: "Your session ended. Please sign in again.",
        }),
      ),
    [],
  );

  // When the app opens: if there are saved tokens, find out who they belong to
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tokens = await readTokens();
      if (!tokens) {
        if (!cancelled) setState({ status: "signedOut" });
        return;
      }
      try {
        await loadMe();
      } catch (err) {
        if (cancelled) return;
        // No connection must not sign the rider out; only a refused session does (handled by onSignedOut)
        if (err instanceof ApiError && err.code === "NETWORK")
          setState({
            status: "signedOut",
            notice:
              "No connection. Connect to the internet and open the app again.",
          });
        else setState({ status: "signedOut" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const value = useMemo<Auth>(
    () => ({
      state,
      requestCode: async (phone) => {
        await api("/v1/auth/otp/request", { method: "POST", body: { phone } });
      },
      verifyCode: async (phone, code, fullName) => {
        const result = await api<{
          user: { role: string };
          accessToken: string;
          refreshToken: string;
        }>("/v1/auth/otp/verify", {
          method: "POST",
          body: {
            phone,
            code,
            role: "RIDER",
            ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
          },
        });
        // A number that already belongs to a business or staff account must not get a rider session
        if (result.user.role !== "RIDER") {
          await api("/v1/auth/logout", {
            method: "POST",
            body: { refreshToken: result.refreshToken },
          }).catch(() => undefined);
          throw new Error(
            "This phone number belongs to a business or staff account. Use a different number to ride.",
          );
        }
        await setTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
        await loadMe();
      },
      signOut: async () => {
        // Stop alerts for this account reaching this phone (needs the sign-in, so it comes first)
        await removePushToken().catch(() => undefined);
        // Go offline first, so the rider is not left looking available
        await api("/v1/rider/status", {
          method: "POST",
          body: { online: false },
        }).catch(() => undefined);
        const tokens = await readTokens();
        if (tokens)
          await api("/v1/auth/logout", {
            method: "POST",
            body: { refreshToken: tokens.refreshToken },
          }).catch(() => undefined);
        await clearTokens();
        setState({ status: "signedOut" });
      },
      refreshMe: async () => {
        try {
          await loadMe();
        } catch {
          // keep showing what we have
        }
      },
    }),
    [state, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

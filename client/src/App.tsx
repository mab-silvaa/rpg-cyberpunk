import { useCallback, useEffect, useState } from "react";
import type { User } from "@vtt/shared";
import { api } from "./api";
import { Home } from "./Home";
import { Login } from "./Login";
import { ConfirmProvider } from "./ui";

/** undefined = ainda verificando a sessão; null = sem sessão. */
export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.me().then(setUser, () => setUser(null));
  }, []);

  const logout = useCallback(() => setUser(null), []);

  if (user === undefined) return null;
  return (
    <ConfirmProvider>
      {user ? <Home user={user} onLogout={logout} /> : <Login onLogin={setUser} />}
    </ConfirmProvider>
  );
}

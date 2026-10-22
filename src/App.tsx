import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/useAuth";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return isAuthenticated ? <Dashboard /> : <Login />;
}

export default App;

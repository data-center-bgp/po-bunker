import { useAuth } from "@/contexts/AuthContext";
import Login from "@/components/Login";
import Dashboard from "@/components/Dashboard";

function App() {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Dashboard /> : <Login />;
}

export default App;

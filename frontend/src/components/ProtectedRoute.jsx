import { Navigate } from "react-router-dom";
import { useAuth } from "../context/auth";
export default function ProtectedRoute({ children }) {
  const { user, loading, error, retry, logout } = useAuth();
  if (loading) return <p role="status">Checking your InterviewAce session...</p>;
  if (error) return <div role="alert"><h1>InterviewAce</h1><p>{error}</p><button onClick={retry}>Retry</button><button onClick={logout}>Log out</button></div>;
  return user ? children : <Navigate to="/login" replace />;
}

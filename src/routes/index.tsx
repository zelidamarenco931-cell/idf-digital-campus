import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, primaryRole } from "@/lib/auth";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading, roles } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">A carregar…</div>;
  if (!user) return <Navigate to="/login" />;
  const r = primaryRole(roles);
  return <Navigate to={r === "admin" ? "/admin/dashboard" : r === "instructor" ? "/instructor/dashboard" : "/student/dashboard"} />;
}

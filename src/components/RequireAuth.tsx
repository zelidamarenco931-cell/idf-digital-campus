import { useAuth, primaryRole, type Role } from "@/lib/auth";
import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppLayout } from "./AppLayout";

export function RequireAuth({ children, allow }: { children: ReactNode; allow?: Role[] }) {
  const { user, loading, roles } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        A carregar…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (allow && allow.length > 0) {
    const role = primaryRole(roles);
    if (!allow.includes(role)) {
      return <Navigate to={role === "admin" ? "/admin/dashboard" : role === "instructor" ? "/instructor/dashboard" : "/student/dashboard"} />;
    }
  }
  return <AppLayout>{children}</AppLayout>;
}

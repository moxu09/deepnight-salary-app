"use client";
import { useErpAccess } from "@/lib/useErpAccess";

export function useQiunaiAdminGuard() {
  const { loading, isAdmin, access, refresh } = useErpAccess("deepnight");
  return { adminLoading: loading, isAdmin, admin: access?.assignment || access?.legacyAdmin || null, access, refresh };
}

"use client"

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

export function useUserRole() {
  const user = useQuery(api.auth.loggedInUser)

  return {
    user,
    role: user?.role ?? null,
    isAdmin: user?.role === "admin",
    isPhysician: user?.role === "physician" || user?.role === "admin",
    isViewer: user?.role === "viewer",
    physicianId: user?.physicianId ?? null,
    isLoading: user === undefined,
  }
}

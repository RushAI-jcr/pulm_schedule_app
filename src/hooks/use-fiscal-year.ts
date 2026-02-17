"use client"

import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"

export function useFiscalYear() {
  const fiscalYear = useQuery(api.functions.fiscalYears.getCurrentFiscalYear)

  return {
    fiscalYear: fiscalYear ?? null,
    status: fiscalYear?.status ?? null,
    isCollecting: fiscalYear?.status === "collecting",
    isBuilding: fiscalYear?.status === "building",
    isPublished: fiscalYear?.status === "published",
    isSetup: fiscalYear?.status === "setup",
    isLoading: fiscalYear === undefined,
  }
}

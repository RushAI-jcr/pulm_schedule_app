"use client"

import { useState, useCallback } from "react"
import { useQuery } from "convex/react"
import { ScrollText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react"
import { api } from "../../../../../convex/_generated/api"
import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { PageSkeleton } from "@/components/shared/loading-skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 25

export default function AuditPage() {
  const [cursor, setCursor] = useState<string | undefined>(undefined)
  const [actionFilter, setActionFilter] = useState("")
  const [entityTypeFilter, setEntityTypeFilter] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([])

  const data = useQuery(api.functions.auditLog.getCurrentFiscalYearAuditLog, {
    cursor,
    limit: PAGE_SIZE,
    actionFilter: actionFilter || undefined,
    entityTypeFilter: entityTypeFilter || undefined,
  })

  const handleNextPage = useCallback(() => {
    if (data?.nextCursor) {
      setCursorStack((prev) => [...prev, cursor])
      setCursor(data.nextCursor)
    }
  }, [data?.nextCursor, cursor])

  const handlePrevPage = useCallback(() => {
    const prev = cursorStack[cursorStack.length - 1]
    setCursorStack((s) => s.slice(0, -1))
    setCursor(prev)
  }, [cursorStack])

  if (data === undefined) {
    return (
      <>
        <PageHeader title="Audit Log" description="Track all scheduling changes and actions" />
        <PageSkeleton />
      </>
    )
  }

  if (!data.fiscalYear) {
    return (
      <>
        <PageHeader title="Audit Log" description="Track all scheduling changes and actions" />
        <div className="flex-1 p-6">
          <EmptyState
            icon={ScrollText}
            title="No active fiscal year"
            description="Create and activate a fiscal year first."
          />
        </div>
      </>
    )
  }

  const pageNumber = cursorStack.length + 1
  const totalPages = Math.ceil(data.totalCount / PAGE_SIZE)

  return (
    <>
      <PageHeader
        title="Audit Log"
        description={`${data.fiscalYear.label} · ${data.totalCount} entries`}
      />
      <div className="flex-1 p-4 md:p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setCursor(undefined)
              setCursorStack([])
            }}
            className="sm:w-48"
          />
          <Input
            placeholder="Filter by entity type..."
            value={entityTypeFilter}
            onChange={(e) => {
              setEntityTypeFilter(e.target.value)
              setCursor(undefined)
              setCursorStack([])
            }}
            className="sm:w-48"
          />
        </div>

        {/* Log entries */}
        {data.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit entries"
            description={actionFilter || entityTypeFilter ? "No entries match your filters." : "No audit log entries yet."}
          />
        ) : (
          <div className="rounded-lg border divide-y">
            {data.items.map((item) => {
              const isExpanded = expandedId === String(item._id)
              const hasDiff = item.before || item.after

              return (
                <div key={String(item._id)} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{item.action}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{item.entityType}</Badge>
                        <span className="text-xs text-muted-foreground">
                          by {item.userName}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(item.timestamp).toLocaleString()} &middot; {item.entityId}
                      </p>
                    </div>
                    {hasDiff && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : String(item._id))}
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>

                  {isExpanded && hasDiff && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {item.before && (
                        <div className="rounded bg-rose-50 dark:bg-rose-950/20 p-2">
                          <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 mb-1">Before</p>
                          <pre className="text-[10px] text-rose-800 dark:text-rose-300 overflow-x-auto whitespace-pre-wrap">
                            {item.before}
                          </pre>
                        </div>
                      )}
                      {item.after && (
                        <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 p-2">
                          <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">After</p>
                          <pre className="text-[10px] text-emerald-800 dark:text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                            {item.after}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {data.totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {pageNumber} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={!data.nextCursor}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Calendar,
  ClipboardList,
  ArrowLeftRight,
  User,
  LayoutDashboard,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useUserRole } from "@/hooks/use-user-role"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type NavItem = {
  label: string
  href: string
  icon: typeof Calendar
}

const physicianTabs: NavItem[] = [
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Preferences", href: "/preferences", icon: ClipboardList },
  { label: "Trades", href: "/trades", icon: ArrowLeftRight },
  { label: "Profile", href: "/profile", icon: User },
]

const adminTabs: NavItem[] = [
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Admin", href: "/admin", icon: LayoutDashboard },
  { label: "Trades", href: "/trades", icon: ArrowLeftRight },
  { label: "Profile", href: "/profile", icon: User },
]

const adminOverflow: NavItem[] = [
  { label: "Preferences", href: "/preferences", icon: ClipboardList },
  { label: "Master Calendar", href: "/admin/calendar", icon: Calendar },
  { label: "Rotations", href: "/admin/rotations", icon: ClipboardList },
  { label: "Reports", href: "/admin/reports", icon: LayoutDashboard },
  { label: "Audit Log", href: "/admin/audit", icon: ClipboardList },
  { label: "Settings", href: "/admin/settings", icon: MoreHorizontal },
]

function isActiveTab(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileNav() {
  const pathname = usePathname()
  const { isAdmin } = useUserRole()

  const tabs = isAdmin ? adminTabs : physicianTabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex h-14 items-center justify-around">
        {tabs.map((tab) => {
          const active = isActiveTab(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs",
                active
                  ? "text-primary font-medium"
                  : "text-muted-foreground"
              )}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          )
        })}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs text-muted-foreground">
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="mb-2">
              {adminOverflow.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}

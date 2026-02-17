"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@workos-inc/authkit-nextjs/components"
import {
  Calendar,
  ClipboardList,
  ArrowLeftRight,
  User,
  LayoutDashboard,
  FileText,
  BarChart3,
  ScrollText,
  Settings,
  LogOut,
  Target,
  Stethoscope,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/shared/components/theme/ThemeToggle"
import { useUserRole } from "@/hooks/use-user-role"
import { useFiscalYear } from "@/hooks/use-fiscal-year"

type NavItem = {
  label: string
  href: string
  icon: typeof Calendar
}

const schedulingItems: NavItem[] = [
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "Preferences", href: "/preferences", icon: ClipboardList },
  { label: "Trades", href: "/trades", icon: ArrowLeftRight },
  { label: "Profile", href: "/profile", icon: User },
]

const adminItems: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Master Calendar", href: "/admin/calendar", icon: Calendar },
  { label: "Rotations", href: "/admin/rotations", icon: Stethoscope },
  { label: "cFTE Targets", href: "/admin/cfte", icon: Target },
  { label: "Requests", href: "/admin/requests", icon: FileText },
  { label: "Reports", href: "/admin/reports", icon: BarChart3 },
  { label: "Audit Log", href: "/admin/audit", icon: ScrollText },
  { label: "Settings", href: "/admin/settings", icon: Settings },
]

function isActiveLink(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === "/admin"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.charAt(0) ?? ""
  const l = lastName?.charAt(0) ?? ""
  return (f + l).toUpperCase() || "?"
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, isAdmin, isLoading: roleLoading } = useUserRole()
  const { isCollecting } = useFiscalYear()
  const { signOut } = useAuth()

  const visibleSchedulingItems = schedulingItems.filter((item) => {
    if (item.href === "/preferences" && !isCollecting) return false
    return true
  })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/calendar">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Calendar className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">PCCM Calendar</span>
                  <span className="text-xs text-muted-foreground">Rush University</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Scheduling</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSchedulingItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActiveLink(pathname, item.href)}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActiveLink(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {roleLoading ? "..." : getInitials(user?.firstName, user?.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-1 flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium truncate">
                  {user?.firstName} {user?.lastName}
                </span>
                <Badge variant="outline" className="w-fit text-[10px] px-1 py-0">
                  {user?.role ?? "..."}
                </Badge>
              </div>
              <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                <ThemeToggle />
                <button
                  onClick={() => signOut()}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

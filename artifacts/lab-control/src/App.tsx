import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Cable,
  Download,
  FileText,
  LayoutDashboard,
  Monitor,
  Server,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Route, Router as WouterRouter, Switch, Link, useLocation } from "wouter";
import { Toaster } from "sonner";

import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import Agents from "@/pages/agents";
import Alerts from "@/pages/alerts";
import Antivirus from "@/pages/antivirus";
import Computers from "@/pages/computers";
import Dashboard from "@/pages/dashboard";
import Events from "@/pages/events";
import Firewall from "@/pages/firewall";
import NotFound from "@/pages/not-found";
import Peripherals from "@/pages/peripherals";
import Reports from "@/pages/reports";
import Sessions from "@/pages/sessions";
import UsbPolicies from "@/pages/usb-policies";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const NAV_SECTIONS: Array<{
  label: string | null;
  items: Array<{ href: string; label: string; icon: typeof Server }>;
}> = [
  {
    label: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/computers", label: "Computers", icon: Monitor },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle },
      { href: "/usb-policies", label: "USB Policy", icon: ShieldCheck },
      { href: "/peripherals", label: "Peripherals", icon: Cable },
      { href: "/sessions", label: "Sessions", icon: Users },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/antivirus", label: "Antivirus", icon: ShieldAlert },
      { href: "/firewall", label: "Firewall", icon: ShieldCheck },
    ],
  },
  {
    label: null,
    items: [
      { href: "/reports", label: "Reports", icon: FileText },
      { href: "/events", label: "Events", icon: Activity },
      { href: "/agents", label: "Agent", icon: Download },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  return <p className="tabular-nums">{now.toLocaleString()}</p>;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Server className="size-4" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold">Lab Command Center</p>
        <p className="text-[11px] text-muted-foreground">Computer Lab Manager</p>
      </div>
    </div>
  );
}

function Sidebar() {
  const [location] = useLocation();
  return (
    <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-4">
        <Brand />
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-3">
        {NAV_SECTIONS.map((section, index) => (
          <div key={index} className="space-y-1">
            {section.label ? (
              <p className="px-3 pt-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {section.label}
              </p>
            ) : null}
            {section.items.map((item) => {
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t p-4 text-xs text-muted-foreground">
        <LiveClock />
      </div>
    </aside>
  );
}

function MobileNav() {
  const [location] = useLocation();
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-3 md:hidden">
      <Brand />
      <nav className="flex gap-1">
        {NAV_ITEMS.map((item) => {
          const active = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                "flex size-9 items-center justify-center rounded-md transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4" />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileNav />
          <main className="flex-1 p-4 md:p-6 lg:p-8">
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/computers" component={Computers} />
              <Route path="/alerts" component={Alerts} />
              <Route path="/usb-policies" component={UsbPolicies} />
              <Route path="/peripherals" component={Peripherals} />
              <Route path="/antivirus" component={Antivirus} />
              <Route path="/firewall" component={Firewall} />
              <Route path="/sessions" component={Sessions} />
              <Route path="/reports" component={Reports} />
              <Route path="/events" component={Events} />
              <Route path="/agents" component={Agents} />
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Layout />
        </WouterRouter>
        <Toaster position="top-right" richColors />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

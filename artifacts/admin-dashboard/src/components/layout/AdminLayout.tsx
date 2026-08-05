import { Link, useLocation } from "wouter";
import { 
  Key, 
  Users, 
  Activity, 
  Settings, 
  LogOut, 
  LayoutDashboard,
  ShoppingCart,
  PackageCheck,
} from "lucide-react";
import { useAdminLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/keys", label: "Quản lý Key", icon: Key },
  { href: "/plans", label: "Gói bán", icon: PackageCheck },
  { href: "/orders", label: "Đơn hàng", icon: ShoppingCart },
  { href: "/users", label: "Người dùng", icon: Users },
  { href: "/logs", label: "Nhật ký", icon: Activity },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const logout = useAdminLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/login");
      },
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row bg-background dark text-foreground">
      {/* Sidebar */}
      <aside className="flex w-full flex-col border-r border-border bg-card md:w-64">
        <div className="flex h-16 items-center border-b border-border px-6">
          <div className="flex items-center gap-2 font-mono font-bold text-lg text-primary tracking-tight">
            <Key className="h-5 w-5" />
            <span>K-OPS</span>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground" 
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto custom-scrollbar">
        <div className="container mx-auto p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
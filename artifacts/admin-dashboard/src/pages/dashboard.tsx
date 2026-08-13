import {
  useGetAdminStats,
  getGetAdminStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Key, Users, Activity, AlertTriangle, ShieldCheck, XCircle, ShoppingCart, TrendingUp, Package, Clock } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function fmtVND(v: number) {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(0) + "K";
  return v.toLocaleString("vi-VN");
}

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
      refetchInterval: 30_000,
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse"></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-14"></CardHeader>
              <CardContent className="h-12"></CardContent>
            </Card>
          ))}
        </div>
        <Card className="animate-pulse">
          <CardHeader className="h-14"></CardHeader>
          <CardContent className="h-64"></CardContent>
        </Card>
      </div>
    );
  }

  if (!stats) return null;

  const keyCards = [
    {
      title: "Tổng Key",
      value: stats.totalKeys.toLocaleString(),
      icon: Key,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Key hoạt động",
      value: stats.activeKeys.toLocaleString(),
      icon: ShieldCheck,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "Kho (chưa dùng)",
      value: stats.inactiveKeys.toLocaleString(),
      icon: Package,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Sắp hết hạn",
      value: stats.expiringSoon.toLocaleString(),
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  const orderCards = [
    {
      title: "Tổng người dùng",
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Lượt dùng hôm nay",
      value: stats.todayUses.toLocaleString(),
      icon: Activity,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      title: "Đơn chờ thanh toán",
      value: stats.pendingOrders.toLocaleString(),
      icon: Clock,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      title: "Doanh thu hôm nay",
      value: fmtVND(stats.todayRevenue) + "đ",
      subtitle: `Tổng: ${fmtVND(stats.totalRevenue)}đ`,
      icon: TrendingUp,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tổng quan hệ thống</h1>
        <p className="text-muted-foreground mt-1">
          Số liệu thống kê và hoạt động hệ thống theo thời gian thực.
        </p>
      </div>

      {/* Key stats */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">License Keys</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keyCards.map((stat, i) => (
            <Card key={i} className="hover:border-border/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-1.5 rounded-md ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Order & revenue stats */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">Người dùng & Doanh thu</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {orderCards.map((stat, i) => (
            <Card key={i} className="hover:border-border/80 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`p-1.5 rounded-md ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-mono">{stat.value}</div>
                {stat.subtitle && (
                  <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Usage chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Lượt sử dụng 7 ngày qua</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Tổng {stats.deliveredOrders.toLocaleString()} đơn đã giao</p>
          </div>
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.usageChart}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorUses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => String(val)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  itemStyle={{ color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}
                  formatter={(value) => [value, "Lượt dùng"]}
                />
                <Area
                  type="monotone"
                  dataKey="uses"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorUses)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick status summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <div className="text-sm font-medium">Key hết hạn / bị thu hồi</div>
              <div className="text-2xl font-bold font-mono text-destructive">{stats.expiredKeys.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <div className="text-sm font-medium">Key sắp hết hạn (7 ngày)</div>
              <div className="text-2xl font-bold font-mono text-amber-500">{stats.expiringSoon.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-green-500 shrink-0" />
            <div>
              <div className="text-sm font-medium">Tổng doanh thu</div>
              <div className="text-2xl font-bold font-mono text-green-500">{fmtVND(stats.totalRevenue)}đ</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

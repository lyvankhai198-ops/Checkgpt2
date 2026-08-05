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
import { Key, Users, Activity, AlertTriangle, ShieldCheck, XCircle } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function Dashboard() {
  const { data: stats, isLoading } = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded-md animate-pulse"></div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
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

  const statCards = [
    {
      title: "Tổng Key",
      value: stats.totalKeys,
      icon: Key,
      color: "text-blue-500",
    },
    {
      title: "Key hoạt động",
      value: stats.activeKeys,
      icon: ShieldCheck,
      color: "text-emerald-500",
    },
    {
      title: "Tổng người dùng",
      value: stats.totalUsers,
      icon: Users,
      color: "text-primary",
    },
    {
      title: "Lượt dùng hôm nay",
      value: stats.todayUses,
      icon: Activity,
      color: "text-orange-500",
    },
    {
      title: "Sắp hết hạn",
      value: stats.expiringSoon,
      icon: AlertTriangle,
      color: "text-amber-500",
    },
    {
      title: "Hết hạn/Thu hồi",
      value: stats.expiredKeys,
      icon: XCircle,
      color: "text-destructive",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tổng quan hệ thống</h1>
        <p className="text-muted-foreground mt-1">
          Số liệu thống kê và hoạt động hệ thống.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((stat, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{stat.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lượt sử dụng 7 ngày qua</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={stats.usageChart}
                margin={{
                  top: 5,
                  right: 10,
                  left: 0,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="colorUses" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
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
    </div>
  );
}
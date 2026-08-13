import { useState } from "react";
import { useListOrders, getListOrdersQueryKey, useGetAdminStats, getGetAdminStatsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:   { label: "⏳ Chờ TT",   cls: "border-amber-500/40 text-amber-400" },
    paid:      { label: "💰 Đã TT",    cls: "border-blue-500/40 text-blue-400" },
    delivered: { label: "✅ Đã giao",  cls: "border-emerald-500/40 text-emerald-400" },
    failed:    { label: "❌ Thất bại", cls: "border-red-500/40 text-red-400" },
    expired:   { label: "⏰ Hết hạn",  cls: "border-muted-foreground/40 text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

function planBadge(plan: string) {
  return plan === "basic"
    ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">🟢 Basic</Badge>
    : <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-xs">🟣 Pro</Badge>;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });
}

function fmtAmount(v: number) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Orders() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [status, setStatus] = useState("all");

  const { data: statsData } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() },
  });

  const { data, isLoading } = useListOrders(
    { page, limit, status: status !== "all" ? status : undefined },
    { query: { queryKey: getListOrdersQueryKey({ page, limit, status: status !== "all" ? status : undefined }), refetchInterval: 15_000 } }
  );

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-primary" /> Đơn hàng
        </h1>
        <p className="text-muted-foreground mt-1">Lịch sử thanh toán và giao key tự động.</p>
      </div>

      {/* Summary cards with real counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Chờ TT", key: "pending", cls: "text-amber-400", count: statsData?.pendingOrders ?? "—" },
          { label: "Đã giao", key: "delivered", cls: "text-emerald-400", count: statsData?.deliveredOrders ?? "—" },
          { label: "Thất bại", key: "failed", cls: "text-red-400", count: "—" },
          { label: "Tổng", key: "all", cls: "text-foreground", count: data?.total ?? "—" },
        ].map(({ label, key, cls, count }) => (
          <Card key={key} className={`cursor-pointer hover:border-primary/40 transition-colors ${status === key ? "border-primary/60" : ""}`} onClick={() => { setStatus(key); setPage(1); }}>
            <CardContent className="p-4 text-center">
              <div className={`text-2xl font-bold font-mono ${cls}`}>
                {typeof count === "number" ? count.toLocaleString() : count}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-4 p-4 border-b border-border">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Lọc trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="pending">⏳ Chờ thanh toán</SelectItem>
                <SelectItem value="paid">💰 Đã thanh toán</SelectItem>
                <SelectItem value="delivered">✅ Đã giao key</SelectItem>
                <SelectItem value="failed">❌ Thất bại</SelectItem>
                <SelectItem value="expired">⏰ Hết hạn</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {data?.total ?? 0} đơn hàng
            </span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Telegram</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead>Số tiền</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead>Giao lúc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      <div className="animate-pulse">Đang tải...</div>
                    </TableCell>
                  </TableRow>
                ) : !data?.orders?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      Chưa có đơn hàng nào
                    </TableCell>
                  </TableRow>
                ) : (
                  data.orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                          {order.orderCode}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-medium">{order.telegramId}</div>
                          {order.username && (
                            <div className="text-xs text-muted-foreground">@{order.username}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{planBadge(order.plan ?? "basic")}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtAmount(order.amount ?? 0)}</TableCell>
                      <TableCell>{statusBadge(order.status ?? "pending")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(order.createdAt)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDate(order.deliveredAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

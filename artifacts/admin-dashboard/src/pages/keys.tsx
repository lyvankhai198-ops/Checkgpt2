import { useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import {
  useListKeys,
  getListKeysQueryKey,
  useCreateKeys,
  useUpdateKey,
  useExportKeysCsv,
  getExportKeysCsvUrl,
  useGetInventory,
  getGetInventoryQueryKey,
  useAutoStock,
  useDeleteAllKeys,
  useAdminGetPlans,
  useGetKeyFullDetail,
  getGetKeyFullDetailQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Download, MoreHorizontal, Plus, Search, ShieldOff, ShieldAlert,
  Key as KeyIcon, CheckCircle2, Copy, Package, Trash2, User, Activity,
  Clock, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createKeySchema = z.object({
  count: z.coerce.number().min(1).max(100).default(1),
  durationMinutes: z.coerce.number().optional(),
  neverExpires: z.boolean().default(false),
  maxTotalUses: z.coerce.number().optional(),
  dailyLimit: z.coerce.number().optional(),
  maxConcurrent: z.coerce.number().min(1).default(1),
  allowedTelegramId: z.string().optional(),
  lockToTelegram: z.boolean().default(false),
  note: z.string().optional(),
  plan: z.string().optional(),
});

function statusLabel(s: string) {
  if (s === "active")   return "HOẠT ĐỘNG";
  if (s === "inactive") return "SẴN SÀNG";
  if (s === "locked")   return "ĐÃ KHÓA";
  if (s === "expired")  return "HẾT HẠN";
  return "ĐÃ THU HỒI";
}
function statusClass(s: string) {
  if (s === "active")   return "border-emerald-500/40 text-emerald-400";
  if (s === "inactive") return "border-sky-500/40 text-sky-400";
  if (s === "locked")   return "border-amber-500/40 text-amber-400";
  if (s === "expired")  return "border-muted-foreground/40 text-muted-foreground";
  return "border-destructive/40 text-destructive";
}

// ── Key Detail Modal ──────────────────────────────────────────────────────────
function KeyDetailModal({ keyId, onClose }: { keyId: number; onClose: () => void }) {
  const { data, isLoading } = useGetKeyFullDetail(keyId, {
    query: { queryKey: getGetKeyFullDetailQueryKey(keyId) },
  });

  const { toast } = useToast();
  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    toast({ title: "Đã copy vào clipboard" });
  };
  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
  };

  return (
    <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <KeyIcon className="h-5 w-5 text-muted-foreground" />
          Chi tiết Key
        </DialogTitle>
      </DialogHeader>

      {isLoading && (
        <div className="py-12 text-center text-muted-foreground">Đang tải...</div>
      )}

      {data && (() => {
        const { key, activatedUser, activations, recentLogs, usageStats } = data;
        return (
          <div className="space-y-5">
            {/* ── Key info ── */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-mono text-sm bg-background border border-border px-3 py-1.5 rounded select-all truncate flex-1">
                    {key.keyDisplay}
                  </span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => copyToClipboard(key.keyDisplay)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Badge variant="outline" className={statusClass(key.status as string)}>
                  {statusLabel(key.status as string)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Gói</div>
                  <div>{key.plan ? (
                    <Badge variant="outline" className={key.plan === "pro" ? "border-purple-500/40 text-purple-400 text-xs" : "border-emerald-500/40 text-emerald-400 text-xs"}>
                      {key.plan === "pro" ? "🟣 Pro" : "🟢 Basic"}
                    </Badge>
                  ) : <span className="text-muted-foreground">Tuỳ chỉnh</span>}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Tổng lượt dùng</div>
                  <div className="font-medium">{key.totalUses} {key.maxTotalUses ? `/ ${key.maxTotalUses}` : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Hôm nay</div>
                  <div className="font-medium">{key.dailyUses} {key.dailyLimit ? `/ ${key.dailyLimit}` : ""}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Đồng thời</div>
                  <div className="font-medium">{key.concurrentSlots} / {key.maxConcurrent}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Hết hạn</div>
                  <div className="font-medium">{key.expiresAt ? format(new Date(key.expiresAt), "dd/MM/yyyy HH:mm") : "Không bao giờ"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">Tạo lúc</div>
                  <div className="font-medium">{format(new Date(key.createdAt), "dd/MM/yyyy HH:mm")}</div>
                </div>
              </div>

              {key.note && (
                <div className="text-xs text-muted-foreground bg-background/50 border border-border/50 rounded px-3 py-2">
                  📝 {key.note}
                </div>
              )}
            </div>

            {/* ── Activated user ── */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <User className="h-4 w-4 text-muted-foreground" /> Người dùng kích hoạt
              </h3>
              {activatedUser ? (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
                      {(activatedUser.firstName ?? activatedUser.username ?? activatedUser.telegramId ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {activatedUser.firstName ?? activatedUser.username ?? "—"}
                        {activatedUser.username && activatedUser.firstName && (
                          <span className="text-muted-foreground font-normal ml-1">@{activatedUser.username}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">Telegram ID: {activatedUser.telegramId}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Số lượt trial</div>
                      <div className="font-medium">{activatedUser.trialCount}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Dùng lần cuối</div>
                      <div className="font-medium">
                        {activatedUser.lastUsedAt ? format(new Date(activatedUser.lastUsedAt), "dd/MM HH:mm") : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Tham gia</div>
                      <div className="font-medium">{activatedUser.createdAt ? format(new Date(activatedUser.createdAt), "dd/MM/yyyy") : "—"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground text-center">
                  {key.status === "inactive" ? "Key chưa được kích hoạt" : "Không có thông tin người dùng"}
                </div>
              )}
            </div>

            {/* ── Usage stats ── */}
            {usageStats && usageStats.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4 text-muted-foreground" /> Thống kê hoạt động
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {usageStats.map((stat) => (
                    <div key={stat.action} className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                      <div className="text-xl font-bold">{stat.count}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 capitalize">{stat.action.replace(/_/g, " ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Activations ── */}
            {activations && activations.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Lịch sử kích hoạt ({activations.length})
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Telegram ID</TableHead>
                        <TableHead className="text-xs">Thiết bị</TableHead>
                        <TableHead className="text-xs">Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activations.map((act) => (
                        <TableRow key={act.id}>
                          <TableCell className="text-xs font-mono">{act.telegramId}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{act.deviceInfo ?? "—"}</TableCell>
                          <TableCell className="text-xs">{act.activatedAt ? format(new Date(act.activatedAt), "dd/MM/yyyy HH:mm") : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* ── Recent logs ── */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" /> Nhật ký gần đây (20 log cuối)
              </h3>
              {recentLogs && recentLogs.length > 0 ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Thời gian</TableHead>
                        <TableHead className="text-xs">Hành động</TableHead>
                        <TableHead className="text-xs">Telegram</TableHead>
                        <TableHead className="text-xs">Lỗi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(log.createdAt), "dd/MM HH:mm:ss")}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{log.telegramId ?? "—"}</TableCell>
                          <TableCell className="text-xs text-destructive truncate max-w-[140px]" title={log.errorMessage ?? ""}>
                            {log.errorMessage ?? ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground text-center">
                  Chưa có log nào
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </DialogContent>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Keys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdKeys, setCreatedKeys] = useState<{rawKey: string; keyDisplay: string}[] | null>(null);
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [autoStockResult, setAutoStockResult] = useState<{ plan: string; keys: { id?: number; key?: string; display?: string }[] } | null>(null);
  const [deleteScope, setDeleteScope] = useState<"expired_revoked" | "expired" | "revoked" | "inactive" | "all">("expired_revoked");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);

  const planParam = planFilter !== "all" ? planFilter : undefined;
  const { data, isLoading } = useListKeys(
    { page, limit, search: search || undefined, status: status !== "all" ? status : undefined, plan: planParam },
    { query: { queryKey: getListKeysQueryKey({ page, limit, search: search || undefined, status: status !== "all" ? status : undefined, plan: planParam }) } }
  );

  const { data: inventory } = useGetInventory({
    query: { queryKey: getGetInventoryQueryKey(), refetchInterval: 30_000 },
  });

  const getPlans = useAdminGetPlans();
  const { data: plansData } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getPlans(),
  });

  const createMutation = useCreateKeys();
  const updateMutation = useUpdateKey();
  const autoStockMutation = useAutoStock();
  const deleteAllFn = useDeleteAllKeys();
  const deleteAllMutation = useMutation({
    mutationFn: () => deleteAllFn(deleteScope),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventoryQueryKey() });
      setIsDeleteOpen(false);
      toast({ title: `✅ Đã xoá ${res.deleted} key` });
    },
    onError: () => toast({ title: "❌ Lỗi xoá key", variant: "destructive" }),
  });

  const handleAutoStock = (plan: string) => {
    autoStockMutation.mutate(
      { data: { plan } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetInventoryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
          if (res.created === 0) {
            toast({ title: "Kho đã đủ", description: res.message ?? `Kho ${plan} đã đạt mục tiêu.` });
          } else {
            setAutoStockResult({ plan, keys: res.keys ?? [] });
          }
        },
        onError: () => toast({ title: "Lỗi", description: "Không thể bổ sung kho.", variant: "destructive" }),
      }
    );
  };

  const form = useForm<z.infer<typeof createKeySchema>>({
    resolver: zodResolver(createKeySchema),
    defaultValues: {
      count: 1,
      maxConcurrent: 1,
      neverExpires: false,
      lockToTelegram: false,
    },
  });

  const onSubmitCreate = (values: z.infer<typeof createKeySchema>) => {
    const payload = {
      ...values,
      durationMinutes: values.neverExpires ? null : values.durationMinutes,
    };
    createMutation.mutate({ data: payload }, {
      onSuccess: (res) => {
        setCreatedKeys(res.keys);
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
        toast({ title: "Thành công", description: `Đã tạo ${res.keys.length} key.` });
        form.reset();
      },
      onError: () => toast({ title: "Lỗi", description: "Lỗi khi tạo key.", variant: "destructive" }),
    });
  };

  const handleAction = (e: React.MouseEvent, id: number, action: "revoke" | "lock" | "unlock" | "extend") => {
    e.stopPropagation();
    let extraMinutes = undefined;
    if (action === "extend") {
      const days = window.prompt("Gia hạn thêm bao nhiêu ngày?");
      if (!days || isNaN(Number(days))) return;
      extraMinutes = Number(days) * 24 * 60;
    }
    if (action === "revoke" && !window.confirm("Bạn có chắc chắn muốn thu hồi key này? Hành động này không thể hoàn tác.")) return;
    updateMutation.mutate({ id, data: { action, extraMinutes } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
        toast({ title: "Thành công", description: "Thao tác thành công." });
      },
      onError: () => toast({ title: "Lỗi", description: "Lỗi khi thực hiện thao tác.", variant: "destructive" }),
    });
  };

  const handleExport = () => { window.location.href = getExportKeysCsvUrl(); };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    toast({ title: "Đã copy", description: "Đã copy vào clipboard." });
  };
  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
  };

  const filteredKeys = data?.keys ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Key</h1>
          <p className="text-muted-foreground mt-1">Quản lý và cấp phát Key truy cập.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Xuất CSV
          </Button>
          <Button
            variant="outline"
            className="border-red-500/40 text-red-400 hover:bg-red-500/10"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Xoá key
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Tạo tuỳ chỉnh</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tạo hàng loạt</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="count" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Số lượng</FormLabel>
                        <FormControl><Input type="number" min={1} max={100} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="maxConcurrent" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tối đa đồng thời</FormLabel>
                        <FormControl><Input type="number" min={1} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="durationMinutes" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Thời hạn (Phút)</FormLabel>
                        <FormControl>
                          <Input type="number" disabled={form.watch("neverExpires")} {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="neverExpires" render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-8">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="font-normal">Không hết hạn</FormLabel>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="maxTotalUses" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tổng lượt tối đa</FormLabel>
                        <FormControl><Input type="number" placeholder="Không giới hạn" {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dailyLimit" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Giới hạn/ngày</FormLabel>
                        <FormControl><Input type="number" placeholder="Không giới hạn" {...field} value={field.value || ""} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="plan" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gói</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? ""}>
                        <FormControl>
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Tuỳ chỉnh (không gán gói)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">Tuỳ chỉnh</SelectItem>
                          {(plansData ?? []).map(p => (
                            <SelectItem key={p.slug} value={p.slug}>{p.emoji} {p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="note" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ghi chú</FormLabel>
                      <FormControl>
                        <Input placeholder="Ghi chú tham khảo (tùy chọn)" {...field} value={field.value || ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Đang tạo..." : "Tạo mới"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Auto-stock result dialog ── */}
      {autoStockResult && (
        <Dialog open={!!autoStockResult} onOpenChange={() => setAutoStockResult(null)}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>✅ Đã tạo {autoStockResult.keys.length} key gói {autoStockResult.plan}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-3">
              ⚠️ Sao chép key ngay bây giờ — key đầy đủ chỉ hiển thị một lần duy nhất ở đây.
            </p>
            <div className="space-y-1 max-h-[320px] overflow-y-auto">
              {autoStockResult.keys.map((k) => (
                <div key={k.id ?? k.key} className="flex items-center gap-2 group">
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded flex-1 select-all">{k.key ?? "—"}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(k.key ?? "")}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                const text = autoStockResult.keys.map(k => k.key ?? "").filter(Boolean).join("\n");
                copyToClipboard(text);
              }}>
                <Copy className="mr-2 h-4 w-4" /> Sao chép tất cả
              </Button>
              <Button onClick={() => setAutoStockResult(null)}>Đóng</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete All Dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Xoá key hàng loạt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Chọn nhóm key cần xoá:</p>
            {([
              { value: "expired_revoked", label: "🧹 Hết hạn + Đã thu hồi", desc: "Dọn dẹp key cũ không dùng nữa" },
              { value: "expired",         label: "⚫ Hết hạn",               desc: "Chỉ xoá key đã hết hạn" },
              { value: "revoked",         label: "🔴 Đã thu hồi",            desc: "Chỉ xoá key đã bị thu hồi" },
              { value: "inactive",        label: "🔵 Sẵn sàng (chưa dùng)", desc: "Xoá key mới chưa kích hoạt" },
              { value: "all",             label: "☠️ TẤT CẢ key",           desc: "⚠️ Xoá toàn bộ — không thể hoàn tác!" },
            ] as const).map((opt) => (
              <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                deleteScope === opt.value ? "border-red-500/60 bg-red-500/10" : "border-border hover:border-border/80 hover:bg-muted/30"
              }`}>
                <input
                  type="radio" name="deleteScope" value={opt.value}
                  checked={deleteScope === opt.value} onChange={() => setDeleteScope(opt.value)}
                  className="mt-0.5 accent-red-500"
                />
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>Huỷ</Button>
            <Button variant="destructive" onClick={() => deleteAllMutation.mutate()} disabled={deleteAllMutation.isPending}>
              {deleteAllMutation.isPending ? "Đang xoá..." : "🗑️ Xoá ngay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Key detail modal ── */}
      <Dialog open={selectedKeyId !== null} onOpenChange={(o) => { if (!o) setSelectedKeyId(null); }}>
        {selectedKeyId !== null && (
          <KeyDetailModal keyId={selectedKeyId} onClose={() => setSelectedKeyId(null)} />
        )}
      </Dialog>

      {/* ── Inventory cards ── */}
      <div className="grid grid-cols-2 gap-4">
        {(plansData ?? []).map((plan) => {
          const inv = (inventory as Record<string, { available: number; sold: number; total: number }>)?.[plan.slug];
          return (
            <Card key={plan.slug} className="border border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Kho {plan.emoji} {plan.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-3 gap-2 text-center text-sm mb-3">
                  <div>
                    <div className="text-2xl font-bold">{inv?.available ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Còn lại</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-muted-foreground">{inv?.sold ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Đã bán</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-muted-foreground">{inv?.total ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">Tổng</div>
                  </div>
                </div>
                <Button
                  size="sm" variant="outline" className="w-full text-xs"
                  disabled={autoStockMutation.isPending}
                  onClick={() => handleAutoStock(plan.slug)}
                >
                  {autoStockMutation.isPending ? "Đang tạo..." : "⚡ Bổ sung kho tự động"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Keys table ── */}
      <Card>
        <CardContent className="p-0">
          {/* Quick-filter tabs + search/plan row */}
          <div className="p-4 pb-3 space-y-3">
            {/* Status tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {([
                { value: "all",      label: "Tất cả" },
                { value: "active",   label: "🟢 Kích hoạt" },
                { value: "inactive", label: "🔵 Sẵn sàng" },
                { value: "locked",   label: "🟡 Đã khóa" },
                { value: "expired",  label: "⚫ Hết hạn" },
                { value: "revoked",  label: "🔴 Thu hồi" },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                    status === tab.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search + plan filter in one row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm key..."
                  className="pl-9 bg-background h-9 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-sm shrink-0">
                  <SelectValue placeholder="Tất cả gói" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả gói</SelectItem>
                  <SelectItem value="basic">🟢 Basic</SelectItem>
                  <SelectItem value="pro">🟣 Pro</SelectItem>
                  <SelectItem value="custom">Tuỳ chỉnh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Activated-key cards — shown only when tab = "active" */}
          {status === "active" && (
            <div className="p-4 space-y-3 border-b border-border">
              <p className="text-xs text-muted-foreground">
                {filteredKeys.filter(k => k.activatedUser).length} / {filteredKeys.length} key có thông tin người dùng
              </p>
              {isLoading ? (
                <div className="text-sm text-muted-foreground text-center py-4">Đang tải...</div>
              ) : filteredKeys.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">Không có key đang hoạt động</div>
              ) : (
                <div className="grid gap-2">
                  {filteredKeys.map((key) => (
                    <div
                      key={key.id}
                      onClick={() => setSelectedKeyId(key.id)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      {/* User avatar */}
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                        key.activatedUser
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {key.activatedUser
                          ? (key.activatedUser.firstName ?? key.activatedUser.username ?? key.activatedUser.telegramId ?? "?").charAt(0).toUpperCase()
                          : "?"}
                      </div>

                      {/* User + key info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {key.activatedUser
                              ? (key.activatedUser.username ? `@${key.activatedUser.username}` : key.activatedUser.firstName ?? key.activatedUser.telegramId)
                              : <span className="text-muted-foreground italic">Chưa rõ người dùng</span>
                            }
                          </span>
                          {key.plan && (
                            <Badge variant="outline" className={`text-xs ${key.plan === "pro" ? "border-purple-500/40 text-purple-400" : "border-emerald-500/40 text-emerald-400"}`}>
                              {key.plan === "pro" ? "Pro" : "Basic"}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="font-mono text-xs text-muted-foreground truncate">
                            {key.keyDisplay.slice(0, 16)}…
                          </span>
                          {key.activatedUser && (
                            <span className="text-xs text-muted-foreground shrink-0">
                              ID: {key.activatedUser.telegramId}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Usage */}
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">{key.totalUses}</div>
                        <div className="text-xs text-muted-foreground">lượt</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Sử dụng</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Đang tải...</TableCell>
                  </TableRow>
                ) : filteredKeys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Không có dữ liệu</TableCell>
                  </TableRow>
                ) : (
                  filteredKeys.map((key) => (
                    <TableRow
                      key={key.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedKeyId(key.id)}
                    >
                      {/* Key display */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-mono bg-muted px-2 py-1 rounded text-xs select-all"
                            title={key.keyDisplay}
                          >
                            {key.keyDisplay.length > 12 ? key.keyDisplay.slice(0, 14) + "…" : key.keyDisplay}
                          </span>
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            title="Sao chép"
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(key.keyDisplay); }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {key.note && <div className="text-xs text-muted-foreground mt-1">{key.note}</div>}
                      </TableCell>

                      {/* Plan */}
                      <TableCell>
                        {key.plan === "basic" && (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">🟢 Basic</Badge>
                        )}
                        {key.plan === "pro" && (
                          <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-xs">🟣 Pro</Badge>
                        )}
                        {!key.plan && <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge variant="outline" className={statusClass(key.status as string)}>
                          {statusLabel(key.status as string)}
                        </Badge>
                      </TableCell>

                      {/* Activated user */}
                      <TableCell>
                        {key.activatedUser ? (
                          <div className="flex items-center gap-1.5">
                            <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold shrink-0">
                              {(key.activatedUser?.firstName ?? key.activatedUser?.username ?? key.activatedUser?.telegramId ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-medium leading-none">
                                {key.activatedUser.username
                                  ? `@${key.activatedUser.username}`
                                  : (key.activatedUser.firstName ?? key.activatedUser.telegramId)}
                              </div>
                              <div className="text-xs text-muted-foreground leading-none mt-0.5">{key.activatedUser.telegramId}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Usage */}
                      <TableCell>
                        <div className="text-sm">
                          <div>Tổng: {key.totalUses}{key.maxTotalUses ? ` / ${key.maxTotalUses}` : ""}</div>
                          <div>Ngày: {key.dailyUses}{key.dailyLimit ? ` / ${key.dailyLimit}` : ""}</div>
                        </div>
                      </TableCell>

                      {/* Expiry */}
                      <TableCell className="text-sm">
                        {key.expiresAt ? format(new Date(key.expiresAt), "dd/MM/yyyy") : "Không bao giờ"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedKeyId(key.id); }}>
                              <ChevronRight className="mr-2 h-4 w-4" /> Xem chi tiết
                            </DropdownMenuItem>
                            {key.status === "active" && (
                              <DropdownMenuItem onClick={(e) => handleAction(e, key.id, "lock")}>
                                <ShieldAlert className="mr-2 h-4 w-4" /> Khóa
                              </DropdownMenuItem>
                            )}
                            {key.status === "locked" && (
                              <DropdownMenuItem onClick={(e) => handleAction(e, key.id, "unlock")}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Mở khóa
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={(e) => handleAction(e, key.id, "extend")}>
                              <KeyIcon className="mr-2 h-4 w-4" /> Gia hạn
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                              onClick={(e) => handleAction(e, key.id, "revoke")}
                            >
                              <ShieldOff className="mr-2 h-4 w-4" /> Thu hồi
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data && data.total > limit && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <div className="text-sm text-muted-foreground">
                Hiển thị {(page - 1) * limit + 1} đến {Math.min(page * limit, data.total)} của {data.total} key
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                  Trước
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * limit >= data.total}>
                  Tiếp
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Created keys dialog ── */}
      <Dialog open={!!createdKeys} onOpenChange={(o) => !o && setCreatedKeys(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Key đã tạo</DialogTitle>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md font-mono text-sm max-h-[300px] overflow-y-auto whitespace-pre-wrap select-all">
            {createdKeys?.map(k => k.rawKey).join("\n")}
          </div>
          <DialogFooter>
            <Button onClick={() => { if (createdKeys) copyToClipboard(createdKeys.map(k => k.rawKey).join("\n")); }}>
              <Copy className="mr-2 h-4 w-4" /> Copy tất cả
            </Button>
            <Button variant="secondary" onClick={() => setCreatedKeys(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

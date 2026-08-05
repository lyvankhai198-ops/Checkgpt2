import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, MoreHorizontal, Plus, Search, ShieldOff, ShieldAlert, Key as KeyIcon, CheckCircle2, Copy, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLAN_PRESETS = {
  basic: { durationMinutes: 1440, maxTotalUses: 20, maxConcurrent: 1, neverExpires: false, note: "Gói Basic" },
  pro:   { durationMinutes: 43200, maxTotalUses: 30, maxConcurrent: 10, neverExpires: false, note: "Gói Pro" },
} as const;

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
  plan: z.enum(["basic", "pro"]).optional(),
});

export default function Keys() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdKeys, setCreatedKeys] = useState<{rawKey: string, keyDisplay: string}[] | null>(null);
  const [planFilter, setPlanFilter] = useState<string>("all");

  const { data, isLoading } = useListKeys(
    { page, limit, search: search || undefined, status: status !== "all" ? status : undefined },
    { query: { queryKey: getListKeysQueryKey({ page, limit, search: search || undefined, status: status !== "all" ? status : undefined }) } }
  );

  const { data: inventory } = useGetInventory({
    query: { queryKey: getGetInventoryQueryKey(), refetchInterval: 30_000 },
  });

  const createMutation = useCreateKeys();
  const updateMutation = useUpdateKey();
  const autoStockMutation = useAutoStock();

  const handleAutoStock = (plan: "basic" | "pro") => {
    autoStockMutation.mutate(
      { data: { plan } },
      {
        onSuccess: (res) => {
          queryClient.invalidateQueries({ queryKey: getGetInventoryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
          if (res.created === 0) {
            toast({ title: "Kho đã đủ", description: res.message ?? `Kho ${plan} đã đạt mục tiêu.` });
          } else {
            toast({ title: "Đã bổ sung kho", description: `Tạo thêm ${res.created} key ${plan}. Kho hiện: ${res.newAvailable}/${res.target}.` });
          }
        },
        onError: () => toast({ title: "Lỗi", description: "Không thể bổ sung kho.", variant: "destructive" }),
      }
    );
  };

  const openQuickCreate = (plan: "basic" | "pro") => {
    const preset = PLAN_PRESETS[plan];
    form.reset({ count: 1, ...preset, plan, dailyLimit: undefined, allowedTelegramId: undefined, lockToTelegram: false });
    setIsCreateOpen(true);
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
      onError: () => {
        toast({ title: "Lỗi", description: "Lỗi khi tạo key.", variant: "destructive" });
      }
    });
  };

  const handleAction = (id: number, action: "revoke" | "lock" | "unlock" | "extend") => {
    let extraMinutes = undefined;
    if (action === "extend") {
      const days = window.prompt("Gia hạn thêm bao nhiêu ngày?");
      if (!days || isNaN(Number(days))) return;
      extraMinutes = Number(days) * 24 * 60;
    }

    if (action === "revoke" && !window.confirm("Bạn có chắc chắn muốn thu hồi key này? Hành động này không thể hoàn tác.")) {
      return;
    }

    updateMutation.mutate({ id, data: { action, extraMinutes } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
        toast({ title: "Thành công", description: `Thao tác thành công.` });
      },
      onError: () => {
        toast({ title: "Lỗi", description: `Lỗi khi thực hiện thao tác.`, variant: "destructive" });
      }
    });
  };

  const handleExport = () => {
    window.location.href = getExportKeysCsvUrl();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Đã copy", description: "Đã copy vào clipboard." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quản lý Key</h1>
          <p className="text-muted-foreground mt-1">Quản lý và cấp phát Key truy cập.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Xuất CSV
          </Button>
          <Button variant="outline" className="border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10" onClick={() => openQuickCreate("basic")}>
            <Package className="mr-2 h-4 w-4" /> Tạo Key Basic
          </Button>
          <Button variant="outline" className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={() => openQuickCreate("pro")}>
            <Package className="mr-2 h-4 w-4" /> Tạo Key Pro
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Tạo tuỳ chỉnh
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tạo hàng loạt</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Số lượng</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} max={100} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="maxConcurrent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tối đa đồng thời</FormLabel>
                          <FormControl>
                            <Input type="number" min={1} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="durationMinutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Thời hạn (Phút)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              disabled={form.watch("neverExpires")}
                              {...field} 
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="neverExpires"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 mt-8">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">Không hết hạn</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="maxTotalUses"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tổng lượt tối đa</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Không giới hạn" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dailyLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Giới hạn/ngày</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Không giới hạn" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="plan"
                    render={({ field }) => (
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
                            <SelectItem value="basic">🟢 Basic</SelectItem>
                            <SelectItem value="pro">🟣 Pro</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ghi chú</FormLabel>
                        <FormControl>
                          <Input placeholder="Ghi chú tham khảo (tùy chọn)" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

      {/* ── Inventory cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {(["basic", "pro"] as const).map((plan) => {
          const inv = inventory?.[plan];
          const isBasic = plan === "basic";
          return (
            <Card key={plan} className={`border ${isBasic ? "border-emerald-500/20" : "border-purple-500/20"}`}>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className={`text-sm font-medium flex items-center gap-2 ${isBasic ? "text-emerald-400" : "text-purple-400"}`}>
                  <Package className="h-4 w-4" />
                  Kho {isBasic ? "🟢 Basic" : "🟣 Pro"}
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
                  size="sm"
                  variant="outline"
                  className={`w-full text-xs ${isBasic ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10" : "border-purple-500/30 text-purple-400 hover:bg-purple-500/10"}`}
                  disabled={autoStockMutation.isPending}
                  onClick={() => handleAutoStock(plan)}
                >
                  {autoStockMutation.isPending ? "Đang tạo..." : "⚡ Bổ sung kho tự động"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row p-4 gap-4 border-b border-border">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm key..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background">
                <SelectValue placeholder="Lọc theo trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả</SelectItem>
                <SelectItem value="active">Hoạt động</SelectItem>
                <SelectItem value="locked">Đã khóa</SelectItem>
                <SelectItem value="expired">Hết hạn</SelectItem>
                <SelectItem value="revoked">Đã thu hồi</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-full sm:w-[160px] bg-background">
                <SelectValue placeholder="Lọc theo gói" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả gói</SelectItem>
                <SelectItem value="basic">🟢 Basic</SelectItem>
                <SelectItem value="pro">🟣 Pro</SelectItem>
                <SelectItem value="custom">Tuỳ chỉnh</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Gói</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Sử dụng</TableHead>
                  <TableHead>Đồng thời</TableHead>
                  <TableHead>Hết hạn</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Đang tải...</TableCell>
                  </TableRow>
                ) : data?.keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Không có dữ liệu</TableCell>
                  </TableRow>
                ) : (
                  data?.keys
                    .filter(key => planFilter === "all" || (planFilter === "custom" ? !key.plan : key.plan === planFilter))
                    .map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono bg-muted px-2 py-1 rounded text-xs select-all">
                            {key.keyDisplay}
                          </span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(key.keyDisplay)}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        {key.note && <div className="text-xs text-muted-foreground mt-1">{key.note}</div>}
                      </TableCell>
                      <TableCell>
                        {key.plan === "basic" && (
                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-xs">🟢 Basic</Badge>
                        )}
                        {key.plan === "pro" && (
                          <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-xs">🟣 Pro</Badge>
                        )}
                        {!key.plan && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            key.status === "active" ? "default" :
                            key.status === "locked" ? "secondary" :
                            key.status === "expired" ? "outline" : "destructive"
                          }
                          className={
                            key.status === "active" ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" :
                            key.status === "locked" ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20" :
                            key.status === "revoked" ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : ""
                          }
                        >
                          {key.status === "active" ? "HOẠT ĐỘNG" :
                           key.status === "locked" ? "ĐÃ KHÓA" :
                           key.status === "expired" ? "HẾT HẠN" : "ĐÃ THU HỒI"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>Tổng: {key.totalUses} {key.maxTotalUses ? `/ ${key.maxTotalUses}` : ''}</div>
                          <div>Hàng ngày: {key.dailyUses} {key.dailyLimit ? `/ ${key.dailyLimit}` : ''}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {key.concurrentSlots} / {key.maxConcurrent}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {key.expiresAt ? format(new Date(key.expiresAt), "PPp") : "Không bao giờ"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {key.status === "active" && (
                              <DropdownMenuItem onClick={() => handleAction(key.id, "lock")}>
                                <ShieldAlert className="mr-2 h-4 w-4" /> Khóa
                              </DropdownMenuItem>
                            )}
                            {key.status === "locked" && (
                              <DropdownMenuItem onClick={() => handleAction(key.id, "unlock")}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Mở khóa
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleAction(key.id, "extend")}>
                              <KeyIcon className="mr-2 h-4 w-4" /> Gia hạn
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                              onClick={() => handleAction(key.id, "revoke")}
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
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Trước
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * limit >= data.total}
                >
                  Tiếp
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!createdKeys} onOpenChange={(o) => !o && setCreatedKeys(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Key đã tạo</DialogTitle>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-md font-mono text-sm max-h-[300px] overflow-y-auto whitespace-pre-wrap select-all">
            {createdKeys?.map(k => k.rawKey).join('\n')}
          </div>
          <DialogFooter>
            <Button onClick={() => {
              if (createdKeys) {
                copyToClipboard(createdKeys.map(k => k.rawKey).join('\n'));
              }
            }}>
              <Copy className="mr-2 h-4 w-4" /> Copy tất cả
            </Button>
            <Button variant="secondary" onClick={() => setCreatedKeys(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
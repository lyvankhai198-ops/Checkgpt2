import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetSettings,
  getGetSettingsQueryKey,
  useUpdateSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

const settingsSchema = z.object({
  telegramBotToken: z.string().optional(),
  timezone: z.string().optional(),
  defaultDurationMinutes: z.coerce.number().min(1).default(43200),
  defaultMaxUses: z.coerce.number().optional().nullable(),
  defaultDailyLimit: z.coerce.number().optional().nullable(),
  defaultMaxConcurrent: z.coerce.number().min(1).default(1),
  notifyExpiryDays: z.coerce.number().min(0).default(3),
  welcomeMessage: z.string().optional(),
  // Payment — bank
  paymentEnabled: z.boolean().default(false),
  bankName: z.string().optional(),
  bankBin: z.string().optional(),
  bankAccount: z.string().optional(),
  bankHolder: z.string().optional(),
  sepayApiKey: z.string().optional(),
  // Payment — USDT
  usdtWallet: z.string().optional(),
  usdtRateVnd: z.coerce.number().min(1000).default(25000),
  // Admin contact shown in payment messages
  adminContact: z.string().optional(),
  proxyList: z.string().optional(),
});

export default function Settings() {
  const { toast } = useToast();
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const updateMutation = useUpdateSettings();

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      telegramBotToken: "",
      timezone: "UTC",
      defaultDurationMinutes: 43200,
      defaultMaxUses: null,
      defaultDailyLimit: null,
      defaultMaxConcurrent: 1,
      notifyExpiryDays: 3,
      welcomeMessage: "Welcome to ChatGPT Account Checker Bot!",
      paymentEnabled: false,
      bankName: "MB Bank",
      bankBin: "MB",
      bankAccount: "",
      bankHolder: "",
      sepayApiKey: "",
    },
  });

  useEffect(() => {
    if (data?.settings) {
      form.reset({
        telegramBotToken: data.settings.telegramBotToken || "",
        timezone: data.settings.timezone || "UTC",
        defaultDurationMinutes: data.settings.defaultDurationMinutes || 43200,
        defaultMaxUses: data.settings.defaultMaxUses,
        defaultDailyLimit: data.settings.defaultDailyLimit,
        defaultMaxConcurrent: data.settings.defaultMaxConcurrent || 1,
        notifyExpiryDays: data.settings.notifyExpiryDays || 3,
        welcomeMessage: data.settings.welcomeMessage || "",
        paymentEnabled: (data.settings.paymentEnabled ?? 0) === 1,
        bankName: data.settings.bankName ?? "MB Bank",
        bankBin: data.settings.bankBin ?? "MB",
        bankAccount: data.settings.bankAccount ?? "",
        bankHolder: data.settings.bankHolder ?? "",
        sepayApiKey: data.settings.sepayApiKey ? "" : "", // always blank — masked server-side
        usdtWallet: (data.settings as any).usdtWallet ?? "",
        usdtRateVnd: (data.settings as any).usdtRateVnd ?? 25000,
        adminContact: (data.settings as any).adminContact ?? "",
        proxyList: (data.settings as any).proxyList ?? "",
      });
    }
  }, [data, form]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Thành công", description: "Đã cập nhật cấu hình hệ thống." });
        },
        onError: () => {
          toast({ title: "Lỗi", description: "Lỗi khi cập nhật cấu hình.", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-card rounded-md"></div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cài đặt hệ thống</h1>
        <p className="text-muted-foreground mt-1">Cấu hình các tham số hệ thống và mặc định.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Cấu hình Telegram Bot</CardTitle>
              <CardDescription>Cấu hình kết nối cho giao diện bot Telegram.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="telegramBotToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Token Bot</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz" className="font-mono bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tin nhắn chào mừng</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Tin nhắn gửi cho người dùng mới..." className="bg-background min-h-[100px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mặc định Key</CardTitle>
              <CardDescription>Giá trị mặc định khi tạo key mới.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="defaultDurationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thời hạn (Phút)</FormLabel>
                    <FormControl>
                      <Input type="number" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultMaxConcurrent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tối đa đồng thời</FormLabel>
                    <FormControl>
                      <Input type="number" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultMaxUses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tổng lượt tối đa</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Không giới hạn" className="bg-background" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultDailyLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Giới hạn/ngày</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Không giới hạn" className="bg-background" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notifyExpiryDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cảnh báo hết hạn (ngày)</FormLabel>
                    <FormControl>
                      <Input type="number" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Múi giờ</FormLabel>
                    <FormControl>
                      <Input placeholder="UTC" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>💳 Thanh toán tự động (SePay)</CardTitle>
              <CardDescription>Cấu hình ngân hàng để nhận chuyển khoản và giao key tự động qua SePay webhook.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="paymentEnabled" render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <input type="checkbox" checked={!!field.value} onChange={e => field.onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">Bật thanh toán tự động</FormLabel>
                </FormItem>
              )} />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="bankName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên ngân hàng</FormLabel>
                    <FormControl><Input placeholder="MB Bank" className="bg-background" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bankBin" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mã ngân hàng (VietQR)</FormLabel>
                    <FormControl><Input placeholder="MB" className="bg-background" {...field} value={field.value ?? ""} /></FormControl>
                    <p className="text-xs text-muted-foreground">MB, VCB, TCB, ACB, BIDV…</p>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bankAccount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số tài khoản</FormLabel>
                    <FormControl><Input placeholder="2626288188888" className="bg-background font-mono" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="bankHolder" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên chủ tài khoản</FormLabel>
                    <FormControl><Input placeholder="NGUYEN VAN A" className="bg-background uppercase" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="sepayApiKey" render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key SePay</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Nhập API Key từ dashboard SePay"
                      className="bg-background font-mono"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Để trống nếu chưa thay đổi (đang ẩn).</p>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400 space-y-1">
                <div className="font-medium">⚙️ Cấu hình webhook trên SePay dashboard:</div>
                <div>URL webhook:</div>
                <code className="block bg-muted px-2 py-1 rounded text-foreground select-all break-all">
                  {window.location.origin.replace(/\/admin-dashboard.*/, "")}/api/payment/webhook
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>💎 Thanh toán USDT (thủ công)</CardTitle>
              <CardDescription>Dành cho khách dùng ngôn ngữ Tiếng Anh — hiển thị địa chỉ ví thay vì QR bank. Admin giao key thủ công sau khi nhận USDT.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="usdtWallet" render={({ field }) => (
                <FormItem>
                  <FormLabel>Địa chỉ ví USDT (TRC20)</FormLabel>
                  <FormControl>
                    <Input placeholder="TRC20 wallet address..." className="bg-background font-mono text-sm" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Để trống = tắt thanh toán USDT, hiện liên hệ admin.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="usdtRateVnd" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tỷ giá: 1 USDT = ? VND</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="25000" className="bg-background" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Ví dụ: 25000 = 1 USDT ≈ 25.000đ. Bot dùng tỷ giá này để tính số USDT cần chuyển.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="adminContact" render={({ field }) => (
                <FormItem>
                  <FormLabel>📞 Liên hệ admin (hiển thị trong tin nhắn thanh toán)</FormLabel>
                  <FormControl>
                    <Input placeholder="@username hoặc https://t.me/username" className="bg-background" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">Bot sẽ hiển thị thông tin này sau khi khách thanh toán USDT hoặc khi chưa cấu hình bank. VD: @admin123</p>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>🌐 Proxy</CardTitle>
              <CardDescription>Danh sách proxy dùng khi check tài khoản — luân phiên tự động (round-robin). Để trống = check trực tiếp từ VPS.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField control={form.control} name="proxyList" render={({ field }) => (
                <FormItem>
                  <FormLabel>Danh sách proxy (mỗi proxy 1 dòng)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={"http://user:pass@host:port\nhttp://user:pass@host2:port\nsocks5://host:port"}
                      className="bg-background font-mono text-xs min-h-[120px]"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Hỗ trợ HTTP, HTTPS, SOCKS5. Format: <code>http://user:pass@host:port</code>. Proxy do khách gửi (web checker) sẽ được ưu tiên hơn danh sách này.
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cài đặt Dùng thử</CardTitle>
              <CardDescription>Cấu hình số lần dùng thử cho người dùng.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Số lần thử miễn phí</label>
                <Input value={3} disabled className="bg-muted text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Thay đổi cần sửa code</p>
              </div>
              <div title="Tính năng đang phát triển">
                <Button type="button" variant="outline" disabled>
                  Reset tất cả lượt thử
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
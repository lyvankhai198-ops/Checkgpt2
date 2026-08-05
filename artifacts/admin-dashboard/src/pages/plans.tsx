import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminGetPlans, useAdminUpdatePlan } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Pencil, PackageCheck } from "lucide-react";

type Plan = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  enabled: boolean;
  price: number;
  description: string;
  durationDays: number | null;
  maxTotalUses: number | null;
  dailyLimit: number | null;
  maxConcurrent: number;
  bulkEnabled: boolean;
};

function fmtPrice(v: number) {
  return v.toLocaleString("vi-VN") + "đ";
}

export default function Plans() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const getPlans = useAdminGetPlans();
  const updatePlan = useAdminUpdatePlan();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getPlans(),
  });

  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>({});

  function openEdit(plan: Plan) {
    setEditPlan(plan);
    setForm({ ...plan });
  }

  function closeEdit() {
    setEditPlan(null);
    setForm({});
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editPlan) return;
      return updatePlan(editPlan.slug, form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "✅ Đã lưu", description: "Cập nhật gói thành công." });
      closeEdit();
    },
    onError: () => toast({ title: "❌ Lỗi", description: "Không thể lưu gói.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      updatePlan(slug, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }),
    onError: () => toast({ title: "❌ Lỗi", description: "Không thể bật/tắt gói.", variant: "destructive" }),
  });

  if (isLoading) return <div className="text-muted-foreground p-8 text-center">Đang tải...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <PackageCheck className="h-6 w-6 text-primary" /> Quản lý Gói bán
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bật/tắt và tuỳ chỉnh mô tả, giá, giới hạn từng gói hiển thị trong bot.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(plans as Plan[]).map((plan) => (
          <div key={plan.slug} className="rounded-xl border border-border bg-card p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{plan.emoji}</span>
                <div>
                  <p className="font-semibold text-base">{plan.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{plan.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={plan.enabled ? "default" : "secondary"}>
                  {plan.enabled ? "Đang bán" : "Tắt"}
                </Badge>
                <Switch
                  checked={plan.enabled}
                  disabled={toggleMutation.isPending}
                  onCheckedChange={(v) => toggleMutation.mutate({ slug: plan.slug, enabled: v })}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Giá</p>
                <p className="font-semibold text-primary">{fmtPrice(plan.price)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Thời hạn</p>
                <p className="font-semibold">{plan.durationDays ? `${plan.durationDays} ngày` : "Không giới hạn"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Tổng lượt</p>
                <p className="font-semibold">{plan.maxTotalUses ?? "∞"}</p>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">Tài khoản/lần</p>
                <p className="font-semibold">Tối đa {plan.maxConcurrent}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {plan.bulkEnabled
                ? <span className="text-green-400">✅ Hỗ trợ check hàng loạt</span>
                : <span className="text-red-400">🚫 Không hỗ trợ check hàng loạt</span>}
            </div>

            <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => openEdit(plan)}>
              <Pencil className="h-3.5 w-3.5" /> Tuỳ chỉnh gói
            </Button>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editPlan} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="dark bg-card border-border sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tuỳ chỉnh gói — {editPlan?.name}</DialogTitle>
          </DialogHeader>

          {editPlan && (
            <div className="space-y-4 py-2">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tên gói</Label>
                  <Input value={form.name ?? ""} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Emoji</Label>
                  <Input value={form.emoji ?? ""} onChange={(e) => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🟢" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Giá (VND)</Label>
                <Input type="number" value={form.price ?? 0}
                  onChange={(e) => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Thời hạn (ngày) — bỏ trống = không giới hạn</Label>
                  <Input type="number" placeholder="Không giới hạn"
                    value={form.durationDays ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, durationDays: e.target.value === "" ? null : Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tổng lượt dùng — bỏ trống = không giới hạn</Label>
                  <Input type="number" placeholder="Không giới hạn"
                    value={form.maxTotalUses ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, maxTotalUses: e.target.value === "" ? null : Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Giới hạn lượt/ngày — bỏ trống = không giới hạn</Label>
                  <Input type="number" placeholder="Không giới hạn"
                    value={form.dailyLimit ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, dailyLimit: e.target.value === "" ? null : Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tài khoản tối đa mỗi lần check</Label>
                  <Input type="number" min={1} max={50}
                    value={form.maxConcurrent ?? 1}
                    onChange={(e) => setForm(f => ({ ...f, maxConcurrent: Number(e.target.value) }))} />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Hỗ trợ check hàng loạt</p>
                  <p className="text-xs text-muted-foreground">Cho phép upload file .txt nhiều tài khoản</p>
                </div>
                <Switch
                  checked={form.bulkEnabled ?? false}
                  onCheckedChange={(v) => setForm(f => ({ ...f, bulkEnabled: v }))}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Hiển thị gói này</p>
                  <p className="text-xs text-muted-foreground">Tắt để ẩn gói khỏi menu mua trong bot</p>
                </div>
                <Switch
                  checked={form.enabled ?? true}
                  onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))}
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Mô tả gói (hiển thị trong bot — hỗ trợ HTML Telegram)</Label>
                <Textarea
                  rows={8}
                  className="font-mono text-xs"
                  value={form.description ?? ""}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="⏱ Thời hạn: <b>1 ngày</b>..."
                />
                <p className="text-xs text-muted-foreground">Tags hỗ trợ: &lt;b&gt;, &lt;i&gt;, &lt;code&gt;, &lt;pre&gt;</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Huỷ</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Đang lưu..." : "💾 Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

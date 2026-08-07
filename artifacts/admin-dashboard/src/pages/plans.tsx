import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAdminGetPlans, useAdminUpdatePlan, useCreateKeys } from "@workspace/api-client-react";
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
import { Pencil, PackageCheck, Plus, Copy, Trash2 } from "lucide-react";

type Plan = {
  id: number;
  slug: string;
  name: string;
  emoji: string;
  color: string | null;
  enabled: boolean;
  price: number;
  description: string;
  durationDays: number | null;
  maxTotalUses: number | null;
  dailyLimit: number | null;
  maxConcurrent: number;
  bulkEnabled: boolean;
  maxBulkLines: number;
};

function fmtPrice(v: number) {
  return v.toLocaleString("vi-VN") + "đ";
}

const PRESET_COLORS = [
  "#22c55e", "#a855f7", "#3b82f6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#f97316",
  "#6366f1", "#14b8a6", "#84cc16", "#8b5cf6",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: value === c ? "white" : "transparent",
            }}
            onClick={() => onChange(c)}
          />
        ))}
        {/* Custom color input */}
        <label className="w-6 h-6 rounded-full border-2 border-dashed border-border cursor-pointer flex items-center justify-center overflow-hidden hover:scale-110 transition-transform" title="Màu tùy chỉnh">
          <input
            type="color"
            value={value || "#6366f1"}
            onChange={(e) => onChange(e.target.value)}
            className="w-8 h-8 opacity-0 cursor-pointer absolute"
          />
          <span className="text-[10px] text-muted-foreground select-none">+</span>
        </label>
      </div>
      {value && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: value }} />
          <span className="font-mono">{value}</span>
        </div>
      )}
    </div>
  );
}

export default function Plans() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const getPlans = useAdminGetPlans();
  const updatePlan = useAdminUpdatePlan();
  const createKeysMutation = useCreateKeys();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getPlans(),
  });

  // ── Edit dialog ────────────────────────────────────────────────────────────
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [form, setForm] = useState<Partial<Plan>>({});

  function openEdit(plan: Plan) { setEditPlan(plan); setForm({ ...plan }); }
  function closeEdit() { setEditPlan(null); setForm({}); }

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
    onError: () => toast({ title: "❌ Lỗi", description: "Không thể lưu.", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      updatePlan(slug, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-plans"] }),
    onError: () => toast({ title: "❌ Lỗi", description: "Không thể bật/tắt.", variant: "destructive" }),
  });

  // ── Create new plan dialog ─────────────────────────────────────────────────
  const [showNewPlan, setShowNewPlan] = useState(false);
  const emptyNew = (): Partial<Plan> => ({
    slug: "", name: "", emoji: "🟡", color: "#f59e0b", enabled: true,
    price: 0, description: "", durationDays: null, maxTotalUses: null,
    dailyLimit: null, maxConcurrent: 1, bulkEnabled: false, maxBulkLines: 10,
  });
  const [newForm, setNewForm] = useState<Partial<Plan>>(emptyNew());

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("admin_token") ?? "";
      const res = await fetch("/checkgpt-api/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(newForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Lỗi tạo gói");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "✅ Đã tạo gói mới", description: newForm.name });
      setShowNewPlan(false);
      setNewForm(emptyNew());
    },
    onError: (e: Error) => toast({ title: "❌ Lỗi", description: e.message, variant: "destructive" }),
  });

  // ── Delete plan ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      const token = localStorage.getItem("admin_token") ?? "";
      const res = await fetch(`/checkgpt-api/api/admin/plans/${slug}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Xoá thất bại");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast({ title: "🗑️ Đã xoá gói" });
    },
    onError: () => toast({ title: "❌ Lỗi xoá gói", variant: "destructive" }),
  });

  // ── Create key dialog ──────────────────────────────────────────────────────
  const [createPlan, setCreatePlan] = useState<Plan | null>(null);
  const [createCount, setCreateCount] = useState(1);
  const [createdKeys, setCreatedKeys] = useState<{ rawKey: string }[] | null>(null);

  function openCreate(plan: Plan) { setCreatePlan(plan); setCreateCount(1); }
  function closeCreate() { setCreatePlan(null); }

  const doCreateKeys = () => {
    if (!createPlan) return;
    createKeysMutation.mutate(
      {
        data: {
          count: createCount,
          plan: createPlan.slug as "basic" | "pro",
          durationMinutes: createPlan.durationDays ? createPlan.durationDays * 24 * 60 : undefined,
          neverExpires: !createPlan.durationDays,
          maxTotalUses: createPlan.maxTotalUses ?? undefined,
          dailyLimit: createPlan.dailyLimit ?? undefined,
          maxConcurrent: createPlan.maxConcurrent,
          note: `Gói ${createPlan.name}`,
        },
      },
      {
        onSuccess: (res) => {
          setCreatedKeys(res.keys as { rawKey: string }[]);
          closeCreate();
          toast({ title: `✅ Tạo ${res.keys.length} key`, description: `Gói ${createPlan.name}` });
        },
        onError: () => toast({ title: "❌ Lỗi tạo key", variant: "destructive" }),
      }
    );
  };

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else { fallbackCopy(text); }
    toast({ title: "Đã copy" });
  };
  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text; el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
  };

  if (isLoading) return <div className="text-muted-foreground p-8 text-center">Đang tải...</div>;

  // ── Plan edit form fields (reused for both edit and create) ────────────────
  function PlanFormFields({ f, setF }: { f: Partial<Plan>; setF: (fn: (prev: Partial<Plan>) => Partial<Plan>) => void }) {
    return (
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Tên gói</Label>
            <Input value={f.name ?? ""} onChange={(e) => setF(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Emoji</Label>
            <Input value={f.emoji ?? ""} onChange={(e) => setF(p => ({ ...p, emoji: e.target.value }))} placeholder="🟡" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Màu sắc gói</Label>
          <ColorPicker value={f.color ?? "#6366f1"} onChange={(c) => setF(p => ({ ...p, color: c }))} />
        </div>

        <div className="space-y-1.5">
          <Label>Giá (VND)</Label>
          <Input type="number" value={f.price ?? 0}
            onChange={(e) => setF(p => ({ ...p, price: Number(e.target.value) }))} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Thời hạn (ngày) — bỏ trống = không hết hạn</Label>
            <Input type="number" placeholder="Không hết hạn"
              value={f.durationDays ?? ""}
              onChange={(e) => setF(p => ({ ...p, durationDays: e.target.value === "" ? null : Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tổng lượt — bỏ trống = không giới hạn</Label>
            <Input type="number" placeholder="Không giới hạn"
              value={f.maxTotalUses ?? ""}
              onChange={(e) => setF(p => ({ ...p, maxTotalUses: e.target.value === "" ? null : Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Giới hạn lượt/ngày — bỏ trống = không giới hạn</Label>
            <Input type="number" placeholder="Không giới hạn"
              value={f.dailyLimit ?? ""}
              onChange={(e) => setF(p => ({ ...p, dailyLimit: e.target.value === "" ? null : Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Tài khoản tối đa mỗi lần</Label>
            <Input type="number" min={1} max={50}
              value={f.maxConcurrent ?? 1}
              onChange={(e) => setF(p => ({ ...p, maxConcurrent: Number(e.target.value) }))} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
          <div>
            <p className="text-sm font-medium">Hỗ trợ check hàng loạt (Bulk)</p>
            <p className="text-xs text-muted-foreground">Cho phép upload file .txt</p>
          </div>
          <Switch checked={f.bulkEnabled ?? false} onCheckedChange={(v) => setF(p => ({ ...p, bulkEnabled: v }))} />
        </div>

        {f.bulkEnabled && (
          <div className="space-y-1.5">
            <Label>Tối đa dòng mỗi lần bulk check</Label>
            <Input type="number" min={1} max={500}
              value={f.maxBulkLines ?? 10}
              onChange={(e) => setF(p => ({ ...p, maxBulkLines: Number(e.target.value) }))} />
            <p className="text-xs text-muted-foreground">Giới hạn số tài khoản tối đa mỗi lần gửi file</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-3">
          <div>
            <p className="text-sm font-medium">Hiển thị gói này</p>
            <p className="text-xs text-muted-foreground">Tắt để ẩn khỏi menu mua trong bot</p>
          </div>
          <Switch checked={f.enabled ?? true} onCheckedChange={(v) => setF(p => ({ ...p, enabled: v }))} />
        </div>

        <div className="space-y-1.5">
          <Label>Mô tả gói trong bot (hỗ trợ HTML Telegram)</Label>
          <Textarea
            rows={8}
            className="font-mono text-xs"
            value={f.description ?? ""}
            onChange={(e) => setF(p => ({ ...p, description: e.target.value }))}
            placeholder="⏱ Thời hạn: <b>1 ngày</b>..."
          />
          <p className="text-xs text-muted-foreground">Tags hỗ trợ: &lt;b&gt;, &lt;i&gt;, &lt;code&gt;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackageCheck className="h-6 w-6 text-primary" /> Quản lý Gói bán
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bật/tắt, tuỳ chỉnh và tạo key cho từng gói. Thay đổi có hiệu lực ngay lập tức trên bot.
          </p>
        </div>
        <Button size="sm" className="gap-2 shrink-0" onClick={() => { setNewForm(emptyNew()); setShowNewPlan(true); }}>
          <Plus className="h-4 w-4" /> Thêm gói mới
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(plans as Plan[]).map((plan) => {
          const accent = plan.color ?? "#6366f1";
          return (
            <div
              key={plan.slug}
              className="rounded-xl border border-border bg-card p-5 space-y-4 overflow-hidden relative"
              style={{ borderLeft: `4px solid ${accent}` }}
            >
              {/* Color dot */}
              <div
                className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full opacity-70"
                style={{ backgroundColor: accent }}
              />

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
                  <p className="font-semibold" style={{ color: accent }}>{fmtPrice(plan.price)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Thời hạn</p>
                  <p className="font-semibold">{plan.durationDays ? `${plan.durationDays} ngày` : "Không hết hạn"}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Tổng lượt</p>
                  <p className="font-semibold">{plan.maxTotalUses ?? "Không giới hạn"}</p>
                </div>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Tài khoản/lần</p>
                  <p className="font-semibold">Tối đa {plan.maxConcurrent}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {plan.bulkEnabled
                  ? <span className="text-green-400">✅ Hỗ trợ check hàng loạt (tối đa {plan.maxBulkLines} dòng)</span>
                  : <span className="text-red-400">🚫 Không hỗ trợ check hàng loạt</span>}
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={() => openEdit(plan)}>
                  <Pencil className="h-3.5 w-3.5" /> Tuỳ chỉnh
                </Button>
                <Button size="sm" className="flex-1 gap-2" style={{ backgroundColor: accent, color: "#fff" }} onClick={() => openCreate(plan)}>
                  <Plus className="h-3.5 w-3.5" /> Tạo key
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 px-2"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`Xoá gói "${plan.name}"? Hành động này không thể hoàn tác.`))
                      deleteMutation.mutate(plan.slug);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editPlan} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="dark bg-card border-border sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tuỳ chỉnh gói — {editPlan?.name}</DialogTitle>
          </DialogHeader>
          {editPlan && <PlanFormFields f={form} setF={setForm} />}
          <DialogFooter>
            <Button variant="outline" onClick={closeEdit}>Huỷ</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Đang lưu..." : "💾 Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Plan Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showNewPlan} onOpenChange={(open) => !open && setShowNewPlan(false)}>
        <DialogContent className="dark bg-card border-border sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>✨ Thêm gói mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>Slug (ID gói — chỉ chữ thường, số, dấu gạch ngang)</Label>
            <Input
              value={newForm.slug ?? ""}
              onChange={(e) => setNewForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
              placeholder="vip, weekly, trial-plus..."
            />
            <p className="text-xs text-muted-foreground">Không thể thay đổi sau khi tạo. VD: "vip", "weekly"</p>
          </div>
          <PlanFormFields f={newForm} setF={setNewForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPlan(false)}>Huỷ</Button>
            <Button
              onClick={() => createPlanMutation.mutate()}
              disabled={createPlanMutation.isPending || !newForm.slug || !newForm.name}
            >
              {createPlanMutation.isPending ? "Đang tạo..." : "✨ Tạo gói"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Key Dialog ────────────────────────────────────────────────── */}
      <Dialog open={!!createPlan} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className="dark bg-card border-border sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              Tạo key — {createPlan?.emoji} {createPlan?.name}
            </DialogTitle>
          </DialogHeader>
          {createPlan && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-muted/40 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Thời hạn</span><span>{createPlan.durationDays ? `${createPlan.durationDays} ngày` : "Không hết hạn"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tổng lượt</span><span>{createPlan.maxTotalUses ?? "Không giới hạn"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tài khoản/lần</span><span>Tối đa {createPlan.maxConcurrent}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Giá niêm yết</span><span className="font-semibold" style={{ color: createPlan.color ?? "#6366f1" }}>{fmtPrice(createPlan.price)}</span></div>
              </div>
              <div className="space-y-1.5">
                <Label>Số lượng key cần tạo</Label>
                <Input
                  type="number" min={1} max={500}
                  value={createCount}
                  onChange={(e) => setCreateCount(Math.max(1, Number(e.target.value)))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeCreate}>Huỷ</Button>
            <Button
              onClick={doCreateKeys}
              disabled={createKeysMutation.isPending}
              style={{ backgroundColor: createPlan?.color ?? undefined }}
            >
              {createKeysMutation.isPending ? "Đang tạo..." : `✨ Tạo ${createCount} key`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Created Keys Result ──────────────────────────────────────────────── */}
      <Dialog open={!!createdKeys} onOpenChange={(o) => !o && setCreatedKeys(null)}>
        <DialogContent className="dark bg-card border-border sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>✅ Đã tạo {createdKeys?.length} key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded p-3">
            ⚠️ Sao chép key ngay — key đầy đủ chỉ hiển thị một lần ở đây.
          </p>
          <div className="space-y-1 max-h-[320px] overflow-y-auto custom-scrollbar">
            {createdKeys?.map((k, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-mono text-xs bg-muted px-2 py-1 rounded flex-1 select-all">{k.rawKey}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(k.rawKey)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (createdKeys) copyToClipboard(createdKeys.map(k => k.rawKey).join("\n"));
            }}>
              <Copy className="mr-2 h-4 w-4" /> Copy tất cả
            </Button>
            <Button onClick={() => setCreatedKeys(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

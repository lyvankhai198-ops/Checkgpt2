import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListKeys,
  getListKeysQueryKey,
  useCreateKeys,
  useUpdateKey,
  useExportKeysCsv,
  getExportKeysCsvUrl
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
import { Download, MoreHorizontal, Plus, Search, ShieldOff, ShieldAlert, Key as KeyIcon, CheckCircle2, Copy } from "lucide-react";
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

  const { data, isLoading } = useListKeys(
    { page, limit, search: search || undefined, status: status !== "all" ? status : undefined },
    { query: { queryKey: getListKeysQueryKey({ page, limit, search: search || undefined, status: status !== "all" ? status : undefined }) } }
  );

  const createMutation = useCreateKeys();
  const updateMutation = useUpdateKey();

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
        toast({ title: "Success", description: `Created ${res.keys.length} key(s).` });
        form.reset();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to create keys.", variant: "destructive" });
      }
    });
  };

  const handleAction = (id: number, action: "revoke" | "lock" | "unlock" | "extend") => {
    let extraMinutes = undefined;
    if (action === "extend") {
      const days = window.prompt("How many days to extend?");
      if (!days || isNaN(Number(days))) return;
      extraMinutes = Number(days) * 24 * 60;
    }

    if (action === "revoke" && !window.confirm("Are you sure you want to revoke this key? This is irreversible.")) {
      return;
    }

    updateMutation.mutate({ id, data: { action, extraMinutes } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListKeysQueryKey() });
        toast({ title: "Success", description: `Key ${action}d successfully.` });
      },
      onError: () => {
        toast({ title: "Error", description: `Failed to ${action} key.`, variant: "destructive" });
      }
    });
  };

  const handleExport = () => {
    window.location.href = getExportKeysCsvUrl();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">License Keys</h1>
          <p className="text-muted-foreground mt-1">Manage and provision access keys.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New Keys
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Generate License Keys</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Count</FormLabel>
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
                          <FormLabel>Max Concurrent Devices</FormLabel>
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
                          <FormLabel>Duration (Minutes)</FormLabel>
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
                          <FormLabel className="font-normal">Never Expires</FormLabel>
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
                          <FormLabel>Max Total Uses</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Unlimited" {...field} value={field.value || ""} />
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
                          <FormLabel>Daily Limit</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Unlimited" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="note"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Note</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional reference note" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? "Generating..." : "Generate"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row p-4 gap-4 border-b border-border">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search keys..."
                className="pl-9 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-[180px] bg-background">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="locked">Locked</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Concurrent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : data?.keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No keys found.</TableCell>
                  </TableRow>
                ) : (
                  data?.keys.map((key) => (
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
                          {key.status.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>Total: {key.totalUses} {key.maxTotalUses ? `/ ${key.maxTotalUses}` : ''}</div>
                          <div>Daily: {key.dailyUses} {key.dailyLimit ? `/ ${key.dailyLimit}` : ''}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {key.concurrentSlots} / {key.maxConcurrent}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {key.expiresAt ? format(new Date(key.expiresAt), "PPp") : "Never"}
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
                                <ShieldAlert className="mr-2 h-4 w-4" /> Lock
                              </DropdownMenuItem>
                            )}
                            {key.status === "locked" && (
                              <DropdownMenuItem onClick={() => handleAction(key.id, "unlock")}>
                                <CheckCircle2 className="mr-2 h-4 w-4" /> Unlock
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleAction(key.id, "extend")}>
                              <KeyIcon className="mr-2 h-4 w-4" /> Extend Expiry
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                              onClick={() => handleAction(key.id, "revoke")}
                            >
                              <ShieldOff className="mr-2 h-4 w-4" /> Revoke
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
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data.total)} of {data.total} keys
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={page * limit >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!createdKeys} onOpenChange={(o) => !o && setCreatedKeys(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Keys Generated</DialogTitle>
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
              <Copy className="mr-2 h-4 w-4" /> Copy All
            </Button>
            <Button variant="secondary" onClick={() => setCreatedKeys(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
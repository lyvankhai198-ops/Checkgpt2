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
      });
    }
  }, [data, form]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "Success", description: "System settings updated." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to update settings.", variant: "destructive" });
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
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
        <p className="text-muted-foreground mt-1">Configure global parameters and defaults.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Telegram Bot Configuration</CardTitle>
              <CardDescription>Connection settings for the Telegram bot interface.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="telegramBotToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bot Token</FormLabel>
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
                    <FormLabel>Welcome Message</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Message sent to new users..." className="bg-background min-h-[100px]" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>License Key Defaults</CardTitle>
              <CardDescription>Default values when generating new keys.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="defaultDurationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (Minutes)</FormLabel>
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
                    <FormLabel>Max Concurrent Uses</FormLabel>
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
                    <FormLabel>Max Total Uses</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Unlimited" className="bg-background" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
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
                    <FormLabel>Daily Limit</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Unlimited" className="bg-background" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)} />
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
                    <FormLabel>Expiry Warning (Days)</FormLabel>
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
                    <FormLabel>System Timezone</FormLabel>
                    <FormControl>
                      <Input placeholder="UTC" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
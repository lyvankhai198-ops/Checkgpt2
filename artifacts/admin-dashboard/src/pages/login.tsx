import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAdminLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useAdminLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({
            title: "Đăng nhập thành công",
            description: "Chào mừng bạn đến với hệ thống.",
          });
          setLocation("/");
        },
        onError: () => {
          toast({
            title: "Đăng nhập thất bại",
            description: "Sai tên đăng nhập hoặc mật khẩu.",
            variant: "destructive",
          });
        },
      }
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background dark p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Key className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Đăng nhập quản trị
          </h1>
          <p className="text-sm text-muted-foreground">
            Xác thực để truy cập hệ thống
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tên đăng nhập</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="admin"
                        autoComplete="username"
                        className="bg-background font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mật khẩu</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        className="bg-background font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Đang tải..." : "Đăng nhập"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListUsers,
  getListUsersQueryKey,
  useResetUserTrial,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Users() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const resetMutation = useResetUserTrial();

  const handleResetTrial = (telegramId: string) => {
    if (window.confirm("Bạn có chắc chắn muốn reset lượt thử của người dùng này?")) {
      resetMutation.mutate({ telegramId }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "Thành công", description: "Đã reset lượt thử" });
        },
        onError: () => {
          toast({ title: "Lỗi", description: "Lỗi khi reset lượt thử", variant: "destructive" });
        }
      });
    }
  };

  const { data, isLoading } = useListUsers(
    { page, limit },
    { query: { queryKey: getListUsersQueryKey({ page, limit }) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Người dùng Telegram</h1>
        <p className="text-muted-foreground mt-1">Theo dõi người dùng bot và trạng thái dùng thử.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Lượt thử</TableHead>
                  <TableHead>Key hiện tại</TableHead>
                  <TableHead>Hoạt động lần cuối</TableHead>
                  <TableHead>Ngày tham gia</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Đang tải...</TableCell>
                  </TableRow>
                ) : data?.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Không có dữ liệu</TableCell>
                  </TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-sm">{user.telegramId}</TableCell>
                      <TableCell>
                        <div className="font-medium">{user.firstName || "Chưa rõ"}</div>
                        {user.username && <div className="text-xs text-muted-foreground">@{user.username}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{user.trialCount}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.currentKeyId ? (
                          <Badge variant="outline" className="font-mono text-xs">ID: {user.currentKeyId}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">Không có</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.lastUsedAt ? format(new Date(user.lastUsedAt), "PPp") : "Chưa từng"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(user.createdAt), "PP")}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 border-amber-500/20"
                          onClick={() => handleResetTrial(user.telegramId)}
                          disabled={resetMutation.isPending}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reset Thử
                        </Button>
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
                Hiển thị {(page - 1) * limit + 1} đến {Math.min(page * limit, data.total)} của {data.total} người dùng
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
    </div>
  );
}
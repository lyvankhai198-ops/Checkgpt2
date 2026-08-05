import { useState } from "react";
import {
  useListUsageLogs,
  getListUsageLogsQueryKey,
  useListAuditLogs,
  getListAuditLogsQueryKey,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function Logs() {
  const [usagePage, setUsagePage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const limit = 20;

  const { data: usageData, isLoading: isUsageLoading } = useListUsageLogs(
    { page: usagePage, limit },
    { query: { queryKey: getListUsageLogsQueryKey({ page: usagePage, limit }) } }
  );

  const { data: auditData, isLoading: isAuditLoading } = useListAuditLogs(
    { page: auditPage, limit },
    { query: { queryKey: getListAuditLogsQueryKey({ page: auditPage, limit }) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Nhật ký</h1>
        <p className="text-muted-foreground mt-1">Lịch sử truy cập và giám sát hệ thống.</p>
      </div>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage">Nhật ký sử dụng</TabsTrigger>
          <TabsTrigger value="audit">Nhật ký quản trị</TabsTrigger>
        </TabsList>

        <TabsContent value="usage">
          <Card>
            <CardContent className="p-0">
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Thao tác</TableHead>
                      <TableHead>Telegram ID</TableHead>
                      <TableHead>Key ID</TableHead>
                      <TableHead>Địa chỉ IP</TableHead>
                      <TableHead>Lỗi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUsageLoading ? (
                      <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : usageData?.logs.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Không có dữ liệu</TableCell></TableRow>
                    ) : (
                      usageData?.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(log.createdAt), "PPp")}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">{log.action}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{log.telegramId || "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{log.keyId || "-"}</TableCell>
                          <TableCell className="font-mono text-xs">{log.ipAddress || "-"}</TableCell>
                          <TableCell className="text-sm text-destructive">{log.errorMessage || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {usageData && usageData.total > limit && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Hiển thị {(usagePage - 1) * limit + 1} đến {Math.min(usagePage * limit, usageData.total)} của {usageData.total} mục
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setUsagePage(p => Math.max(1, p - 1))} disabled={usagePage === 1}>Trước</Button>
                    <Button variant="outline" size="sm" onClick={() => setUsagePage(p => p + 1)} disabled={usagePage * limit >= usageData.total}>Tiếp</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="p-0">
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Admin ID</TableHead>
                      <TableHead>Thao tác</TableHead>
                      <TableHead>Đối tượng</TableHead>
                      <TableHead>Địa chỉ IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isAuditLoading ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Đang tải...</TableCell></TableRow>
                    ) : auditData?.logs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Không có dữ liệu</TableCell></TableRow>
                    ) : (
                      auditData?.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(log.createdAt), "PPp")}</TableCell>
                          <TableCell className="font-mono text-sm">{log.adminId || "Hệ thống"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">{log.action}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{log.targetType} {log.targetId ? `#${log.targetId}` : ""}</TableCell>
                          <TableCell className="font-mono text-xs">{log.ipAddress || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {auditData && auditData.total > limit && (
                <div className="flex items-center justify-between p-4 border-t border-border">
                  <div className="text-sm text-muted-foreground">
                    Hiển thị {(auditPage - 1) * limit + 1} đến {Math.min(auditPage * limit, auditData.total)} của {auditData.total} mục
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1}>Trước</Button>
                    <Button variant="outline" size="sm" onClick={() => setAuditPage(p => p + 1)} disabled={auditPage * limit >= auditData.total}>Tiếp</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
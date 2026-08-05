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
        <h1 className="text-3xl font-bold tracking-tight">System Logs</h1>
        <p className="text-muted-foreground mt-1">Audit trails and usage telemetry.</p>
      </div>

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usage">Usage Logs</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="usage">
          <Card>
            <CardContent className="p-0">
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Telegram ID</TableHead>
                      <TableHead>Key ID</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isUsageLoading ? (
                      <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : usageData?.logs.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No usage logs found.</TableCell></TableRow>
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
                    Showing {(usagePage - 1) * limit + 1} to {Math.min(usagePage * limit, usageData.total)} of {usageData.total} entries
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setUsagePage(p => Math.max(1, p - 1))} disabled={usagePage === 1}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setUsagePage(p => p + 1)} disabled={usagePage * limit >= usageData.total}>Next</Button>
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
                      <TableHead>Time</TableHead>
                      <TableHead>Admin ID</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>IP Address</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isAuditLoading ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : auditData?.logs.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No audit logs found.</TableCell></TableRow>
                    ) : (
                      auditData?.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm whitespace-nowrap">{format(new Date(log.createdAt), "PPp")}</TableCell>
                          <TableCell className="font-mono text-sm">{log.adminId || "System"}</TableCell>
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
                    Showing {(auditPage - 1) * limit + 1} to {Math.min(auditPage * limit, auditData.total)} of {auditData.total} entries
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setAuditPage(p => p + 1)} disabled={auditPage * limit >= auditData.total}>Next</Button>
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
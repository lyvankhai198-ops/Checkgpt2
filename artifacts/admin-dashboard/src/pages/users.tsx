import { useState } from "react";
import {
  useListUsers,
  getListUsersQueryKey,
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

export default function Users() {
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const { data, isLoading } = useListUsers(
    { page, limit },
    { query: { queryKey: getListUsersQueryKey({ page, limit }) } }
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Telegram Users</h1>
        <p className="text-muted-foreground mt-1">Monitor bot users and their trial status.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Trial Count</TableHead>
                  <TableHead>Current Key</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Loading...</TableCell>
                  </TableRow>
                ) : data?.users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No users found.</TableCell>
                  </TableRow>
                ) : (
                  data?.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono text-sm">{user.telegramId}</TableCell>
                      <TableCell>
                        <div className="font-medium">{user.firstName || "Unknown"}</div>
                        {user.username && <div className="text-xs text-muted-foreground">@{user.username}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{user.trialCount}</Badge>
                      </TableCell>
                      <TableCell>
                        {user.currentKeyId ? (
                          <Badge variant="outline" className="font-mono text-xs">ID: {user.currentKeyId}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user.lastUsedAt ? format(new Date(user.lastUsedAt), "PPp") : "Never"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(user.createdAt), "PP")}
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
                Showing {(page - 1) * limit + 1} to Math.min(page * limit, data.total) of {data.total} users
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
    </div>
  );
}
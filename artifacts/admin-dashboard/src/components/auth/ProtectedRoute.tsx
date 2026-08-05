import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAdminMe, getAdminMeQueryKey } from "@workspace/api-client-react";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useAdminMe({
    query: {
      queryKey: getAdminMeQueryKey(),
      retry: false,
    },
  });

  useEffect(() => {
    if (!isLoading && isError) {
      setLocation("/login");
    }
  }, [isLoading, isError, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    );
  }

  if (isError) {
    return null;
  }

  return <>{children}</>;
}
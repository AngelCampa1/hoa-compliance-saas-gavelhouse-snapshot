import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { PageContainer } from "@/components/ui/page-container";

export const Route = createFileRoute("/owner")({
  component: OwnerPortalLayout,
});

function OwnerPortalLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  async function handleSignOut() {
    // Clear all cached tenant data before navigating away so a subsequent
    // sign-in on the same device cannot briefly see the previous user's PII.
    queryClient.clear();
    await authClient.signOut();
    await navigate({ to: "/login" });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <PageContainer className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandLogo className="h-9 w-auto" />
            </div>
            {session && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </Button>
            )}
          </div>
        </PageContainer>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  );
}

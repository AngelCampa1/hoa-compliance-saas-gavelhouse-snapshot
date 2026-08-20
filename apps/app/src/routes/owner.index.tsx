import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/")({
  component: OwnerPortalHome,
});

function OwnerPortalHome() {
  return <Navigate to="/portal" search={{ token: undefined }} replace />;
}

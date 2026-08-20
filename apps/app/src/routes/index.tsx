import { createFileRoute, redirect } from "@tanstack/react-router";
import type { RouterContext } from "./__root";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }: { context: RouterContext }) => {
    if (!context.session) throw redirect({ to:"/login" });
    throw redirect({ to:"/dashboard" });
  },
  component: () => null,
});

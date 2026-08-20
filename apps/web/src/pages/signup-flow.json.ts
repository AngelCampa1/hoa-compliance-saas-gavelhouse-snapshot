import type { APIRoute } from "astro";
import { buildPublicSignupFlowConfig } from "../lib/public-signup-flow";

import { siteConfig } from "../config/site";

export const GET: APIRoute = () =>
  new Response(JSON.stringify(buildPublicSignupFlowConfig(siteConfig)), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });

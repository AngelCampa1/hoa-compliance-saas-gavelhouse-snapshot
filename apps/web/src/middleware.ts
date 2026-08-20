import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware((context, next) => {
  const url = new URL(context.request.url);

  if (
    url.hostname === "www.gavelhouse.app" ||
    url.hostname === "boardstack.app" ||
    url.hostname === "www.boardstack.app"
  ) {
    url.hostname = "gavelhouse.app";
    url.protocol = "https:";
    return context.redirect(url.toString(), 301);
  }

  return next();
});

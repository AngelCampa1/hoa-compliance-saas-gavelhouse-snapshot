import { Hono } from "hono";
import type { Env } from "../../types/env.js";
import portfoliosRouter from "./portfolios.js";
import rollupRouter from "./rollup.js";

const portfolioRouter = new Hono<{ Bindings: Env }>();

portfolioRouter.route("/", portfoliosRouter);
portfolioRouter.route("/", rollupRouter);

export default portfolioRouter;

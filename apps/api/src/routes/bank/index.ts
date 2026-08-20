import { Hono } from "hono";
import type { Env } from "../../types/env.js";
import statementsRouter from "./statements.js";
import reconciliationsRouter from "./reconciliations.js";

const bankRouter = new Hono<{ Bindings: Env }>();

bankRouter.route("/", statementsRouter);
bankRouter.route("/", reconciliationsRouter);

export default bankRouter;

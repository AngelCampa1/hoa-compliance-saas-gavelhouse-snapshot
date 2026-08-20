import { Hono } from "hono";
import type { Env } from "../../types/env.js";
import homeownersRouter from "./homeowners.js";
import violationsRouter from "./violations.js";
import archRequestsRouter from "./archRequests.js";
import meetingsRouter from "./meetings.js";
import ownerPortalRouter from "./ownerPortal.js";
import boardTransitionsRouter from "./boardTransitions.js";

const governanceRouter = new Hono<{ Bindings: Env }>();

governanceRouter.route("/", homeownersRouter);
governanceRouter.route("/", violationsRouter);
governanceRouter.route("/", archRequestsRouter);
governanceRouter.route("/", meetingsRouter);
governanceRouter.route("/", ownerPortalRouter);
governanceRouter.route("/", boardTransitionsRouter);

export default governanceRouter;

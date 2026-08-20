import { Hono } from "hono";
import type { Env } from "../../types/env.js";
import trialBalanceRouter from "./trialBalance.js";
import balanceSheetRouter from "./balanceSheet.js";
import incomeStatementRouter from "./incomeStatement.js";
import generalLedgerRouter from "./generalLedger.js";
import auditPackRouter from "./auditPack.js";
import roleHandoffRouter from "./roleHandoff.js";

const reportsRouter = new Hono<{ Bindings: Env }>();

reportsRouter.route("/", trialBalanceRouter);
reportsRouter.route("/", balanceSheetRouter);
reportsRouter.route("/", incomeStatementRouter);
reportsRouter.route("/", generalLedgerRouter);
reportsRouter.route("/", auditPackRouter);
reportsRouter.route("/", roleHandoffRouter);

export default reportsRouter;

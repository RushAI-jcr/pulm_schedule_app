/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as functions_fiscalYears from "../functions/fiscalYears.js";
import type * as functions_physicians from "../functions/physicians.js";
import type * as functions_rotations from "../functions/rotations.js";
import type * as functions_scheduleRequests from "../functions/scheduleRequests.js";
import type * as functions_tradeRequests from "../functions/tradeRequests.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cfte from "../lib/cfte.js";
import type * as lib_workflowPolicy from "../lib/workflowPolicy.js";
import type * as router from "../router.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "functions/fiscalYears": typeof functions_fiscalYears;
  "functions/physicians": typeof functions_physicians;
  "functions/rotations": typeof functions_rotations;
  "functions/scheduleRequests": typeof functions_scheduleRequests;
  "functions/tradeRequests": typeof functions_tradeRequests;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/cfte": typeof lib_cfte;
  "lib/workflowPolicy": typeof lib_workflowPolicy;
  router: typeof router;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

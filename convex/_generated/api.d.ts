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
import type * as functions_auditLog from "../functions/auditLog.js";
import type * as functions_calendarEvents from "../functions/calendarEvents.js";
import type * as functions_cfteTargets from "../functions/cfteTargets.js";
import type * as functions_clinicTypes from "../functions/clinicTypes.js";
import type * as functions_fiscalYears from "../functions/fiscalYears.js";
import type * as functions_masterCalendar from "../functions/masterCalendar.js";
import type * as functions_physicianClinics from "../functions/physicianClinics.js";
import type * as functions_physicians from "../functions/physicians.js";
import type * as functions_rotationPreferences from "../functions/rotationPreferences.js";
import type * as functions_rotations from "../functions/rotations.js";
import type * as functions_scheduleRequests from "../functions/scheduleRequests.js";
import type * as functions_tradeRequests from "../functions/tradeRequests.js";
import type * as http from "../http.js";
import type * as lib_auditLog from "../lib/auditLog.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_cfte from "../lib/cfte.js";
import type * as lib_cfteTargets from "../lib/cfteTargets.js";
import type * as lib_clinicTypes from "../lib/clinicTypes.js";
import type * as lib_fiscalYear from "../lib/fiscalYear.js";
import type * as lib_masterCalendar from "../lib/masterCalendar.js";
import type * as lib_masterCalendarAssignments from "../lib/masterCalendarAssignments.js";
import type * as lib_physicianClinics from "../lib/physicianClinics.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_workflowPolicy from "../lib/workflowPolicy.js";
import type * as router from "../router.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "functions/auditLog": typeof functions_auditLog;
  "functions/calendarEvents": typeof functions_calendarEvents;
  "functions/cfteTargets": typeof functions_cfteTargets;
  "functions/clinicTypes": typeof functions_clinicTypes;
  "functions/fiscalYears": typeof functions_fiscalYears;
  "functions/masterCalendar": typeof functions_masterCalendar;
  "functions/physicianClinics": typeof functions_physicianClinics;
  "functions/physicians": typeof functions_physicians;
  "functions/rotationPreferences": typeof functions_rotationPreferences;
  "functions/rotations": typeof functions_rotations;
  "functions/scheduleRequests": typeof functions_scheduleRequests;
  "functions/tradeRequests": typeof functions_tradeRequests;
  http: typeof http;
  "lib/auditLog": typeof lib_auditLog;
  "lib/auth": typeof lib_auth;
  "lib/cfte": typeof lib_cfte;
  "lib/cfteTargets": typeof lib_cfteTargets;
  "lib/clinicTypes": typeof lib_clinicTypes;
  "lib/fiscalYear": typeof lib_fiscalYear;
  "lib/masterCalendar": typeof lib_masterCalendar;
  "lib/masterCalendarAssignments": typeof lib_masterCalendarAssignments;
  "lib/physicianClinics": typeof lib_physicianClinics;
  "lib/rateLimit": typeof lib_rateLimit;
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

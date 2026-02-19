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
import type * as functions_autoFillConfig from "../functions/autoFillConfig.js";
import type * as functions_calendarEvents from "../functions/calendarEvents.js";
import type * as functions_cfteTargets from "../functions/cfteTargets.js";
import type * as functions_clinicTypes from "../functions/clinicTypes.js";
import type * as functions_fiscalYears from "../functions/fiscalYears.js";
import type * as functions_fixFiscalYearStatus from "../functions/fixFiscalYearStatus.js";
import type * as functions_masterCalendar from "../functions/masterCalendar.js";
import type * as functions_physicianClinics from "../functions/physicianClinics.js";
import type * as functions_physicianRotationRules from "../functions/physicianRotationRules.js";
import type * as functions_physicians from "../functions/physicians.js";
import type * as functions_reports from "../functions/reports.js";
import type * as functions_resetFY2526Calendar from "../functions/resetFY2526Calendar.js";
import type * as functions_rotationPreferences from "../functions/rotationPreferences.js";
import type * as functions_rotations from "../functions/rotations.js";
import type * as functions_scheduleRequests from "../functions/scheduleRequests.js";
import type * as functions_seedClinicAssignments from "../functions/seedClinicAssignments.js";
import type * as functions_seedRealCalendar from "../functions/seedRealCalendar.js";
import type * as functions_tradeRequests from "../functions/tradeRequests.js";
import type * as functions_userSettings from "../functions/userSettings.js";
import type * as http from "../http.js";
import type * as lib_auditLog from "../lib/auditLog.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_autoFill from "../lib/autoFill.js";
import type * as lib_autoFillHolidays from "../lib/autoFillHolidays.js";
import type * as lib_autoFillScorer from "../lib/autoFillScorer.js";
import type * as lib_autoFillSolver from "../lib/autoFillSolver.js";
import type * as lib_calendarEvents from "../lib/calendarEvents.js";
import type * as lib_cfte from "../lib/cfte.js";
import type * as lib_cfteTargets from "../lib/cfteTargets.js";
import type * as lib_clinicTypes from "../lib/clinicTypes.js";
import type * as lib_fiscalYear from "../lib/fiscalYear.js";
import type * as lib_masterCalendar from "../lib/masterCalendar.js";
import type * as lib_masterCalendarAssignments from "../lib/masterCalendarAssignments.js";
import type * as lib_masterCalendarPublish from "../lib/masterCalendarPublish.js";
import type * as lib_physicianClinics from "../lib/physicianClinics.js";
import type * as lib_physicianLinking from "../lib/physicianLinking.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_rotationPreferenceReadiness from "../lib/rotationPreferenceReadiness.js";
import type * as lib_scheduleImport from "../lib/scheduleImport.js";
import type * as lib_scheduleRequestHelpers from "../lib/scheduleRequestHelpers.js";
import type * as lib_sorting from "../lib/sorting.js";
import type * as lib_userSettings from "../lib/userSettings.js";
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
  "functions/autoFillConfig": typeof functions_autoFillConfig;
  "functions/calendarEvents": typeof functions_calendarEvents;
  "functions/cfteTargets": typeof functions_cfteTargets;
  "functions/clinicTypes": typeof functions_clinicTypes;
  "functions/fiscalYears": typeof functions_fiscalYears;
  "functions/fixFiscalYearStatus": typeof functions_fixFiscalYearStatus;
  "functions/masterCalendar": typeof functions_masterCalendar;
  "functions/physicianClinics": typeof functions_physicianClinics;
  "functions/physicianRotationRules": typeof functions_physicianRotationRules;
  "functions/physicians": typeof functions_physicians;
  "functions/reports": typeof functions_reports;
  "functions/resetFY2526Calendar": typeof functions_resetFY2526Calendar;
  "functions/rotationPreferences": typeof functions_rotationPreferences;
  "functions/rotations": typeof functions_rotations;
  "functions/scheduleRequests": typeof functions_scheduleRequests;
  "functions/seedClinicAssignments": typeof functions_seedClinicAssignments;
  "functions/seedRealCalendar": typeof functions_seedRealCalendar;
  "functions/tradeRequests": typeof functions_tradeRequests;
  "functions/userSettings": typeof functions_userSettings;
  http: typeof http;
  "lib/auditLog": typeof lib_auditLog;
  "lib/auth": typeof lib_auth;
  "lib/autoFill": typeof lib_autoFill;
  "lib/autoFillHolidays": typeof lib_autoFillHolidays;
  "lib/autoFillScorer": typeof lib_autoFillScorer;
  "lib/autoFillSolver": typeof lib_autoFillSolver;
  "lib/calendarEvents": typeof lib_calendarEvents;
  "lib/cfte": typeof lib_cfte;
  "lib/cfteTargets": typeof lib_cfteTargets;
  "lib/clinicTypes": typeof lib_clinicTypes;
  "lib/fiscalYear": typeof lib_fiscalYear;
  "lib/masterCalendar": typeof lib_masterCalendar;
  "lib/masterCalendarAssignments": typeof lib_masterCalendarAssignments;
  "lib/masterCalendarPublish": typeof lib_masterCalendarPublish;
  "lib/physicianClinics": typeof lib_physicianClinics;
  "lib/physicianLinking": typeof lib_physicianLinking;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/roles": typeof lib_roles;
  "lib/rotationPreferenceReadiness": typeof lib_rotationPreferenceReadiness;
  "lib/scheduleImport": typeof lib_scheduleImport;
  "lib/scheduleRequestHelpers": typeof lib_scheduleRequestHelpers;
  "lib/sorting": typeof lib_sorting;
  "lib/userSettings": typeof lib_userSettings;
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

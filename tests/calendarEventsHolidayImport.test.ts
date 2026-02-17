import { describe, expect, it } from "vitest";
import {
  buildHolidayEventKey,
  findFiscalWeekForDate,
  getCalendarYearsInDateRange,
  mapCalendarificReligiousObservancesToFiscalWeeks,
  normalizeInstitutionalConferenceName,
  mapUsPublicHolidaysToFiscalWeeks,
} from "../convex/lib/calendarEvents";

describe("calendar event holiday import helpers", () => {
  it("builds deterministic event keys", () => {
    expect(buildHolidayEventKey("2027-01-01", "  New   Year's Day ")).toBe(
      "2027-01-01::new year's day",
    );
  });

  it("returns calendar years for fiscal-year date ranges", () => {
    expect(getCalendarYearsInDateRange("2026-06-29", "2027-06-27")).toEqual([2026, 2027]);
    expect(getCalendarYearsInDateRange("2027-01-01", "2027-12-31")).toEqual([2027]);
  });

  it("maps US public holidays to fiscal weeks and filters unsupported rows", () => {
    const mapped = mapUsPublicHolidaysToFiscalWeeks({
      fiscalYearStartDate: "2026-12-29",
      fiscalYearEndDate: "2027-01-18",
      weeks: [
        { _id: "w1", weekNumber: 1, startDate: "2026-12-29", endDate: "2027-01-04" },
        { _id: "w2", weekNumber: 2, startDate: "2027-01-05", endDate: "2027-01-11" },
        { _id: "w3", weekNumber: 3, startDate: "2027-01-12", endDate: "2027-01-18" },
      ],
      holidays: [
        {
          date: "2027-01-01",
          name: "New Year's Day",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
        {
          date: "2027-01-01",
          name: "  New    Year's Day  ",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
        {
          date: "2027-01-06",
          name: " ",
          localName: "Three Kings Day",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
        {
          date: "2027-01-10",
          name: "Some State Holiday",
          countryCode: "US",
          global: false,
          types: ["Public"],
        },
        {
          date: "2027-01-11",
          name: "Not a Public Holiday",
          countryCode: "US",
          global: true,
          types: ["Optional"],
        },
        {
          date: "2026-12-25",
          name: "Christmas Day",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
        {
          date: "2027/01/18",
          name: "Malformed Date",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
        {
          date: "2027-01-18",
          name: "Martin Luther King, Jr. Day",
          countryCode: "US",
          global: true,
          types: ["Public"],
        },
      ],
    });

    expect(mapped).toEqual([
      {
        weekId: "w1",
        weekNumber: 1,
        date: "2027-01-01",
        name: "New Year's Day",
      },
      {
        weekId: "w2",
        weekNumber: 2,
        date: "2027-01-06",
        name: "Three Kings Day",
      },
      {
        weekId: "w3",
        weekNumber: 3,
        date: "2027-01-18",
        name: "Martin Luther King, Jr. Day",
      },
    ]);
  });

  it("maps Calendarific religious observances to fiscal weeks", () => {
    const mapped = mapCalendarificReligiousObservancesToFiscalWeeks({
      fiscalYearStartDate: "2026-12-29",
      fiscalYearEndDate: "2027-01-18",
      weeks: [
        { _id: "w1", weekNumber: 1, startDate: "2026-12-29", endDate: "2027-01-04" },
        { _id: "w2", weekNumber: 2, startDate: "2027-01-05", endDate: "2027-01-11" },
        { _id: "w3", weekNumber: 3, startDate: "2027-01-12", endDate: "2027-01-18" },
      ],
      holidays: [
        {
          name: "Epiphany",
          date: { iso: "2027-01-06" },
          type: ["Religious"],
        },
        {
          name: "Orthodox Christmas",
          date: { iso: "2027-01-07T00:00:00+00:00" },
          type: ["religious", "observance"],
        },
        {
          name: "Not Religious",
          date: { iso: "2027-01-08" },
          type: ["Observance"],
        },
        {
          name: "Outside Range",
          date: { iso: "2027-02-01" },
          type: ["Religious"],
        },
        {
          name: " ",
          date: { iso: "2027-01-09" },
          type: ["Religious"],
        },
      ],
    });

    expect(mapped).toEqual([
      {
        weekId: "w2",
        weekNumber: 2,
        date: "2027-01-06",
        name: "Epiphany",
      },
      {
        weekId: "w2",
        weekNumber: 2,
        date: "2027-01-07",
        name: "Orthodox Christmas",
      },
    ]);
  });

  it("normalizes institutional conference names", () => {
    expect(normalizeInstitutionalConferenceName(" chest ")).toBe("CHEST");
    expect(normalizeInstitutionalConferenceName("SCCM")).toBe("SCCM");
    expect(normalizeInstitutionalConferenceName("ats")).toBe("ATS");
    expect(normalizeInstitutionalConferenceName("UNKNOWN")).toBe(null);
  });

  it("finds fiscal week for an ISO date", () => {
    const week = findFiscalWeekForDate(
      [
        { _id: "w1", startDate: "2026-06-29", endDate: "2026-07-05" },
        { _id: "w2", startDate: "2026-07-06", endDate: "2026-07-12" },
      ],
      "2026-07-08",
    );
    expect(week?._id).toBe("w2");

    expect(
      findFiscalWeekForDate(
        [
          { _id: "w1", startDate: "2026-06-29", endDate: "2026-07-05" },
        ],
        "2026/07/05",
      ),
    ).toBe(null);
  });
});

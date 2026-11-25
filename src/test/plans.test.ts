import { describe, it, expect } from "vitest";
import { PLANS, perDay } from "@/lib/plans";
describe("subscription plans", () => {
  it("7 days costs $25", () => expect(PLANS.find(p => p.days === 7)?.price).toBe(25));
  it("15 days costs $30", () => expect(PLANS.find(p => p.days === 15)?.price).toBe(30));
  it("30 days costs $50", () => expect(PLANS.find(p => p.days === 30)?.price).toBe(50));
  it("per-day of 30-day plan", () => expect(perDay(PLANS[2]!)).toBe(1.67));
});

export type Plan = { id: string; days: number; price: number; name: string; tag?: string };
export const PLANS: Plan[] = [
  { id: "7d", days: 7, price: 25, name: "Starter" },
  { id: "15d", days: 15, price: 30, name: "Popular", tag: "Most popular" },
  { id: "30d", days: 30, price: 50, name: "Pro", tag: "Best value" },
];
export const perDay = (p: Plan) => Math.round((p.price / p.days) * 100) / 100;
export const WHATSAPP = "923195066209";
export const planLink = (p: Plan, email?: string) =>
  `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi DepthLens, I want the ${p.days}-day plan ($${p.price}).${email ? ` Account: ${email}` : ""}`)}`;

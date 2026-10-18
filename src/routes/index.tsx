import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/terminal" });
  },
  head: () => ({
    meta: [
      { title: "DepthLens — Crypto Order Flow" },
      { name: "description", content: "DepthLens crypto order flow terminal for Binance futures." },
      { property: "og:title", content: "DepthLens — Crypto Order Flow" },
      { property: "og:description", content: "Live Binance futures charts and order flow tools." },
    ],
  }),
});

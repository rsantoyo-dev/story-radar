import type { Metadata } from "next";

import { SpendingPageClient } from "./spending-page-client";

export const metadata: Metadata = { title: "Spending · Press Craftor" };

/** All data loads client-side through the authorized credits API. */
export default function SpendingPage() {
  return <SpendingPageClient />;
}

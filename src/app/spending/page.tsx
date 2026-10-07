import type { Metadata } from "next";

import { requirePageAccess } from "@/app/modules/auth/access";

import { SpendingPageClient } from "./spending-page-client";

export const metadata: Metadata = { title: "Spending · Press Craftor" };

/** All data loads client-side through the authorized credits API. */
export default async function SpendingPage() {
  await requirePageAccess("/spending");
  return <SpendingPageClient />;
}

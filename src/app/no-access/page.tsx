import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/app/modules/auth/access";
import { CenteredPanel } from "@/app/ui/primitives";

import { SignOutButton } from "../account/sign-out-button";

export const metadata = { title: "No workspace yet · Press Craftor" };

export default async function NoAccessPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect("/login");

  return <CenteredPanel title="You are signed in, but not in a workspace yet">
    <p>{user.email} is not a member of any workspace. Ask an owner or admin of your team to invite this email, then open the link in the invitation.</p>
    <SignOutButton />
  </CenteredPanel>;
}

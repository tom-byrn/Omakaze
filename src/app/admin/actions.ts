"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { deleteStoredGitHubApp } from "@/lib/github/app";

export async function removeStoredAppAction() {
  const user = await requireUser();
  if (!user.isInstanceAdmin) return { error: "Not allowed" };
  await deleteStoredGitHubApp();
  revalidatePath("/admin");
  return { ok: true };
}

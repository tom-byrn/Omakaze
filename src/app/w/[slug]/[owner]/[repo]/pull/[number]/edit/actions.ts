"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { findWorkspaceRepo, getRepoContext } from "@/lib/github/connections";
import { parseRefLines } from "@/lib/guides/ref-lines";
import {
  addSection,
  deleteSection,
  finishGuide,
  getGuide,
  getSections,
  GuideError,
  reorderSections,
  startGuide,
  updateGuideMeta,
  updateSection,
} from "@/lib/guides/service";
import { getMembership, getWorkspaceBySlug } from "@/lib/workspaces";

type State = { ok?: boolean; error?: string; message?: string } | undefined;

async function guideFor(slug: string, guideId: string) {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws || !(await getMembership(ws.id, user.id))) throw new Error("Not found");
  const guide = await getGuide(guideId);
  if (!guide || guide.workspaceId !== ws.id) throw new Error("Guide not found");
  return { user, ws, guide };
}

function msg(err: unknown): State {
  return { error: err instanceof GuideError || err instanceof Error ? err.message : "Something went wrong" };
}

export async function startManualGuideAction(slug: string, owner: string, repoName: string, prNumber: number) {
  const user = await requireUser();
  const ws = await getWorkspaceBySlug(slug);
  if (!ws || !(await getMembership(ws.id, user.id))) throw new Error("Not found");
  const repo = await findWorkspaceRepo(ws.id, owner, repoName);
  if (!repo) throw new Error("Repository not found");
  const { guide } = await startGuide({
    workspaceId: ws.id,
    ctx: await getRepoContext(repo.id),
    prNumber,
    source: "manual",
    createdVia: "ui",
    author: user.name,
    userId: user.id,
    status: "draft",
  });
  redirect(`/w/${slug}/${repo.fullName}/pull/${prNumber}/edit?v=${guide.version}`);
}

export async function saveGuideMetaAction(slug: string, guideId: string, _prev: State, form: FormData): Promise<State> {
  try {
    await guideFor(slug, guideId);
    await updateGuideMeta(guideId, { title: String(form.get("title") ?? ""), summary: String(form.get("summary") ?? "") });
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true, message: "Saved." };
  } catch (err) {
    return msg(err);
  }
}

export async function saveSectionAction(slug: string, guideId: string, sectionId: string, _prev: State, form: FormData): Promise<State> {
  try {
    await guideFor(slug, guideId);
    const { warnings } = await updateSection(sectionId, {
      title: String(form.get("title") ?? ""),
      body: String(form.get("body") ?? ""),
      refs: parseRefLines(String(form.get("refs") ?? "")),
    });
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true, message: warnings.length ? `Saved with warnings: ${warnings.map((w) => `${w.ref}: ${w.message}`).join("; ")}` : "Saved." };
  } catch (err) {
    return msg(err);
  }
}

export async function addSectionAction(slug: string, guideId: string, _prev: State, form: FormData): Promise<State> {
  try {
    await guideFor(slug, guideId);
    await addSection(guideId, {
      title: String(form.get("title") ?? "").trim() || "New section",
      body: String(form.get("body") ?? ""),
      refs: parseRefLines(String(form.get("refs") ?? "")),
    });
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true, message: "Section added." };
  } catch (err) {
    return msg(err);
  }
}

export async function deleteSectionAction(slug: string, guideId: string, sectionId: string): Promise<State> {
  try {
    await guideFor(slug, guideId);
    await deleteSection(sectionId);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return msg(err);
  }
}

export async function moveSectionAction(slug: string, guideId: string, sectionId: string, direction: -1 | 1): Promise<State> {
  try {
    await guideFor(slug, guideId);
    const ids = (await getSections(guideId)).map((s) => s.id);
    const i = ids.indexOf(sectionId);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= ids.length) return { ok: true };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderSections(guideId, ids);
    revalidatePath(`/w/${slug}`, "layout");
    return { ok: true };
  } catch (err) {
    return msg(err);
  }
}

export async function publishGuideAction(slug: string, guideId: string, viewPath: string): Promise<State> {
  try {
    const { user } = await guideFor(slug, guideId);
    await finishGuide(guideId, { actorUserId: user.id });
  } catch (err) {
    return msg(err);
  }
  redirect(viewPath);
}

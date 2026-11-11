import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

import { useOverlay } from '@/components/Overlays';

import { api } from './api';
import { pullKey, pullsKey } from './queries';
import { useAccount } from './session';
import type { PullDetail } from './types';

/** Mark a section reviewed or not, updating the cached guide right away. */
export function useToggleReviewed(repo: string, number: number) {
  const account = useAccount();
  const client = useQueryClient();
  const { flash } = useOverlay();
  return useCallback(
    async (guideId: string, sectionId: string, reviewed: boolean) => {
      const key = pullKey(account, repo, number);
      const patch = (d: PullDetail | undefined) => {
        if (!d?.guide || d.guide.id !== guideId) return d;
        return {
          ...d,
          guide: {
            ...d.guide,
            sections: d.guide.sections.map((s) =>
              s.id !== sectionId
                ? s
                : { ...s, reviewedBy: reviewed ? [...new Set([...s.reviewedBy, d.me.id])] : s.reviewedBy.filter((u) => u !== d.me.id), reviewChange: reviewed ? null : s.reviewChange },
            ),
          },
        };
      };
      const before = client.getQueriesData<PullDetail>({ queryKey: key });
      client.setQueriesData<PullDetail>({ queryKey: key }, patch);
      void Haptics.impactAsync(reviewed ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
      try {
        await api(account, `/api/guides/${guideId}/progress`, { method: 'POST', body: { sectionId, reviewed } });
        void client.invalidateQueries({ queryKey: pullsKey(account) });
      } catch (err) {
        for (const [k, v] of before) client.setQueryData(k, v);
        flash(err instanceof Error ? err.message : 'Could not save your review mark', 'error');
      }
    },
    [account, client, repo, number, flash],
  );
}

/** Start AI generation of a new guide version. */
export function useGenerate(repo: string, number: number) {
  const account = useAccount();
  const client = useQueryClient();
  const { flash } = useOverlay();
  return useCallback(
    async (prUrl: string) => {
      try {
        const res = await api<{ version: number }>(account, '/api/v1/generate', { method: 'POST', body: { pr: prUrl } });
        await client.invalidateQueries({ queryKey: pullKey(account, repo, number) });
        void client.invalidateQueries({ queryKey: pullsKey(account) });
        flash(`Writing version ${res.version}…`);
        return res.version;
      } catch (err) {
        flash(err instanceof Error ? err.message : 'Could not start generation', 'error');
        return null;
      }
    },
    [account, client, repo, number, flash],
  );
}

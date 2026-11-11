import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import type { Account } from './accounts';
import { api, apiText } from './api';
import { useAccount, useSession } from './session';
import type {
  ActivityItem,
  CommentsResponse,
  FileView,
  GuideStatusResponse,
  Insights,
  Me,
  Member,
  NotificationSettings,
  PullDetail,
  PullFilter,
  PullList,
  ShareLink,
  StateFilter,
} from './types';

/**
 * Refetch a query when its screen comes back into focus and the data is stale. Native tabs keep
 * every tab mounted, so switching tabs alone doesn't refetch.
 */
export function useRefetchOnFocus(q: { isStale: boolean; refetch: () => unknown }) {
  const ref = useRef(q);
  useEffect(() => {
    ref.current = q;
  });
  useFocusEffect(
    useCallback(() => {
      if (ref.current.isStale) void ref.current.refetch();
    }, []),
  );
}

/** `api` bound to the active account. */
export function useApi() {
  const account = useAccount();
  return useCallback(<T,>(path: string, init?: Parameters<typeof api>[2]) => api<T>(account, path, init), [account]);
}

export function useMe() {
  const account = useAccount();
  const { syncAccount } = useSession();
  const q = useQuery({ queryKey: [account.id, 'me'], queryFn: () => api<Me>(account, '/api/mobile/me'), staleTime: 60_000 });
  useEffect(() => {
    if (q.data) syncAccount(account.id, q.data);
  }, [q.data, account.id, syncAccount]);
  return q;
}

export function pullsKey(account: Account) {
  return [account.id, 'pulls'] as const;
}

export function usePulls(params: { state: StateFilter; filter: PullFilter; repo: string | null; q: string }) {
  const account = useAccount();
  return useQuery({
    queryKey: [...pullsKey(account), params],
    // The first load also refreshes repositories GitHub hasn't been asked about for a minute.
    queryFn: () => api<PullList>(account, '/api/mobile/pulls', { query: { ...params, sync: '1' } }),
    placeholderData: (prev) => prev,
  });
}

/** Refresh the pull request cache from GitHub, then the list (pull to refresh). */
export async function syncPulls(account: Account, params: { state: StateFilter; filter: PullFilter; repo: string | null; q: string }) {
  return api<PullList>(account, '/api/mobile/pulls', {
    query: { state: params.state, filter: params.filter, repo: params.repo, q: params.q, sync: 'force' },
  });
}

export function pullKey(account: Account, repo: string, number: number) {
  return [account.id, 'pull', repo, number] as const;
}

export function usePull(repo: string, number: number, version: number | null) {
  const account = useAccount();
  return useQuery({
    queryKey: [...pullKey(account, repo, number), version],
    queryFn: () => api<PullDetail>(account, '/api/mobile/pull', { query: { repo, number, v: version } }),
    placeholderData: (prev) => prev,
  });
}

export function useFileView(guideId: string | undefined, path: string) {
  const account = useAccount();
  return useQuery({
    queryKey: [account.id, 'file', guideId, path],
    queryFn: () => api<FileView>(account, `/api/guides/${guideId}/file`, { query: { path } }),
    enabled: Boolean(guideId),
    staleTime: 60 * 60_000,
  });
}

export function commentsKey(account: Account, guideId: string) {
  return [account.id, 'comments', guideId] as const;
}

export function useComments(guideId: string | undefined) {
  const account = useAccount();
  return useQuery({
    queryKey: commentsKey(account, guideId ?? ''),
    queryFn: () => api<CommentsResponse>(account, `/api/guides/${guideId}/comments`),
    enabled: Boolean(guideId),
    staleTime: 30_000,
  });
}

export function useGuideStatus(guideId: string | undefined, generating: boolean) {
  const account = useAccount();
  const client = useQueryClient();
  const q = useQuery({
    queryKey: [account.id, 'status', guideId],
    queryFn: () => api<GuideStatusResponse>(account, `/api/guides/${guideId}/status`),
    enabled: Boolean(guideId) && generating,
    refetchInterval: 2500,
  });
  const done = q.data && q.data.status !== 'generating';
  useEffect(() => {
    if (done) void client.invalidateQueries({ queryKey: [account.id, 'pull'] });
  }, [done, client, account.id]);
  return q;
}

export function useShareLinks(repo: string | null, number: number | null, enabled = true) {
  const account = useAccount();
  return useQuery({
    queryKey: [account.id, 'shares', repo, number],
    queryFn: () => api<{ canCreate: boolean; links: ShareLink[] }>(account, '/api/mobile/share-links', { query: { repo, number } }),
    enabled,
  });
}

export function useActivity() {
  const account = useAccount();
  return useInfiniteQuery({
    queryKey: [account.id, 'activity'],
    queryFn: ({ pageParam }) => api<{ items: ActivityItem[]; next: string | null }>(account, '/api/mobile/activity', { query: { before: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
  });
}

export function useInsights(days: number, repo: string | null) {
  const account = useAccount();
  return useQuery({
    queryKey: [account.id, 'insights', days, repo],
    queryFn: () => api<Insights>(account, '/api/mobile/insights', { query: { days, repo } }),
    placeholderData: (prev) => prev,
    staleTime: 5 * 60_000,
  });
}

export function useNotificationSettings() {
  const account = useAccount();
  return useQuery({ queryKey: [account.id, 'notifications'], queryFn: () => api<NotificationSettings>(account, '/api/mobile/notifications') });
}

export function useMembers() {
  const account = useAccount();
  return useQuery({ queryKey: [account.id, 'members'], queryFn: () => api<{ members: Member[]; me: string }>(account, '/api/mobile/members') });
}

export function guideMarkdown(account: Account, guideId: string) {
  return apiText(account, `/api/guides/${guideId}/export`, { query: { format: 'md' } });
}

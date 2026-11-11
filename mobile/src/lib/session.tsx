import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { forgetTokens, loadAccounts, newAccountId, readTokens, saveAccounts, saveTokens, type Account } from './accounts';
import { useOverlay } from '@/components/Overlays';

import { api, setSessionExpiredHandler } from './api';
import { authorize, revoke } from './oauth';
import { unregisterPush } from './push';
import type { Me } from './types';

type SessionValue = {
  ready: boolean;
  accounts: Account[];
  account: Account | null;
  /** Browser sign-in to a server; resolves to the account, or null when cancelled. */
  signIn: (server: string) => Promise<Account | null>;
  signOut: (id: string) => Promise<void>;
  switchTo: (id: string) => void;
  /** Refresh what the account list shows (name, role, workspace name) from /api/mobile/me. */
  syncAccount: (id: string, me: Me) => void;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { notice } = useOverlay();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The latest list for callbacks; commit() updates it right away so back-to-back calls see each other.
  const state = useRef({ accounts, activeId });
  useEffect(() => {
    state.current = { accounts, activeId };
  }, [accounts, activeId]);

  useEffect(() => {
    loadAccounts().then(({ accounts: list, activeId: id }) => {
      setAccounts(list);
      setActiveId(id);
      setReady(true);
    });
  }, []);

  const commit = useCallback(async (list: Account[], id: string | null) => {
    state.current = { accounts: list, activeId: id };
    setAccounts(list);
    setActiveId(id);
    await saveAccounts(list, id);
  }, []);

  const remove = useCallback(
    async (id: string) => {
      const list = state.current.accounts.filter((a) => a.id !== id);
      const next = state.current.activeId === id ? (list[0]?.id ?? null) : state.current.activeId;
      await forgetTokens(id);
      queryClient.removeQueries({ queryKey: [id] });
      await commit(list, next);
    },
    [commit, queryClient],
  );

  useEffect(() => {
    setSessionExpiredHandler((id) => {
      const acc = state.current.accounts.find((a) => a.id === id);
      if (!acc) return;
      void remove(id);
      void notice('Signed out', `Your session for ${acc.workspace.name} expired. Sign in again to continue.`);
    });
    return () => setSessionExpiredHandler(null);
  }, [remove, notice]);

  const signIn = useCallback(
    async (server: string) => {
      const result = await authorize(server);
      if (!result) return null;
      const draft: Account = {
        id: newAccountId(),
        server,
        clientId: result.clientId,
        workspace: { id: '', slug: '', name: '' },
        user: { id: '', name: '', email: null, avatarUrl: null },
        role: 'member',
      };
      await saveTokens(draft.id, result.tokens);
      let me: Me;
      try {
        me = await api<Me>(draft, '/api/mobile/me');
      } catch (err) {
        await forgetTokens(draft.id);
        throw err;
      }
      const existing = state.current.accounts.find((a) => a.server === server && a.workspace.id === me.workspace.id && a.user.id === me.user.id);
      const account: Account = {
        ...draft,
        id: existing?.id ?? draft.id,
        workspace: me.workspace,
        user: { id: me.user.id, name: me.user.name, email: me.user.email, avatarUrl: me.user.avatarUrl },
        role: me.role,
      };
      if (existing) {
        // Signing in again to the same workspace replaces the old tokens.
        const old = await readTokens(existing.id);
        if (old) void revoke(existing.server, existing.clientId, old.refreshToken || old.accessToken);
        await saveTokens(existing.id, result.tokens);
        await forgetTokens(draft.id);
      }
      const list = existing ? state.current.accounts.map((a) => (a.id === existing.id ? account : a)) : [...state.current.accounts, account];
      queryClient.setQueryData([account.id, 'me'], me);
      await commit(list, account.id);
      return account;
    },
    [commit, queryClient],
  );

  const signOut = useCallback(
    async (id: string) => {
      const acc = state.current.accounts.find((a) => a.id === id);
      if (!acc) return;
      await unregisterPush(acc).catch(() => {});
      const tokens = await readTokens(id);
      if (tokens) await revoke(acc.server, acc.clientId, tokens.refreshToken || tokens.accessToken);
      await remove(id);
    },
    [remove],
  );

  const switchTo = useCallback(
    (id: string) => {
      if (state.current.accounts.some((a) => a.id === id)) void commit(state.current.accounts, id);
    },
    [commit],
  );

  const syncAccount = useCallback(
    (id: string, me: Me) => {
      const acc = state.current.accounts.find((a) => a.id === id);
      if (!acc) return;
      const next: Account = {
        ...acc,
        workspace: me.workspace,
        user: { id: me.user.id, name: me.user.name, email: me.user.email, avatarUrl: me.user.avatarUrl },
        role: me.role,
      };
      if (JSON.stringify(next) === JSON.stringify(acc)) return;
      void commit(
        state.current.accounts.map((a) => (a.id === id ? next : a)),
        state.current.activeId,
      );
    },
    [commit],
  );

  const value = useMemo<SessionValue>(
    () => ({ ready, accounts, account: accounts.find((a) => a.id === activeId) ?? null, signIn, signOut, switchTo, syncAccount }),
    [ready, accounts, activeId, signIn, signOut, switchTo, syncAccount],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** The active account; only for screens behind the signed-in layout. */
export function useAccount(): Account {
  const { account } = useSession();
  if (!account) throw new Error('No active account');
  return account;
}

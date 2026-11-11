import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View, type HostInstance } from 'react-native';

import { AppBar } from '@/components/Chrome';
import { useOverlay } from '@/components/Overlays';
import { PullRow } from '@/components/PullRow';
import { Banner, Empty, ErrorView, FilterTabs, Icon, Loading, PageHeader, Rule, Segmented, T } from '@/components/ui';
import { pullsKey, syncPulls, useMe, usePulls, useRefetchOnFocus } from '@/lib/queries';
import { useAccount } from '@/lib/session';
import { Fonts, useTheme } from '@/lib/theme';
import type { PullFilter, PullListItem, StateFilter } from '@/lib/types';

const FILTERS: { value: PullFilter; label: string }[] = [
  { value: 'needs-review', label: 'Needs my review' },
  { value: 'mine', label: 'Mine' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'all', label: 'All' },
];
const STATES: { value: StateFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
];

type Group = { repo: string; pulls: PullListItem[] };

export default function Pulls() {
  const { colors } = useTheme();
  const account = useAccount();
  const client = useQueryClient();
  const me = useMe();
  const { openMenu } = useOverlay();
  const repoRef = useRef<HostInstance>(null);
  const [filter, setFilter] = useState<PullFilter>('needs-review');
  const [state, setState] = useState<StateFilter>('open');
  const [repo, setRepo] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const params = { state, filter, repo, q };
  const list = usePulls(params);
  useRefetchOnFocus(list);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      client.setQueryData([...pullsKey(account), params], await syncPulls(account, params));
      void me.refetch();
    } catch {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const data = list.data;
  // Grouped by repository, like the web dashboard.
  const groups = useMemo<Group[]>(() => {
    const out = new Map<string, PullListItem[]>();
    for (const p of data?.pulls ?? []) out.set(p.repository, [...(out.get(p.repository) ?? []), p]);
    return [...out].map(([r, pulls]) => ({ repo: r, pulls }));
  }, [data]);
  const workspaceName = me.data?.workspace.name ?? account.workspace.name;

  const header = (
    <View>
      <PageHeader eyebrow={`Workspace · ${workspaceName}`} title="Pull requests." />
      <View style={{ paddingTop: 18, gap: 16 }}>
        <FilterTabs options={FILTERS.map((f) => ({ ...f, count: data?.filterCounts[f.value], badge: f.value === 'needs-review' }))} value={filter} onChange={setFilter} />
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Segmented options={STATES.map((s) => ({ ...s, count: data?.counts[s.value] }))} value={state} onChange={setState} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Icon name="SearchLine" size={15} color={colors.sub} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Search title, author, branch or #"
                placeholderTextColor={colors.sub}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                style={{ flex: 1, fontFamily: Fonts.sans, fontSize: 14, color: colors.fg }}
              />
            </View>
            {(me.data?.repos.length ?? 0) > 1 ? (
              <Pressable
                ref={repoRef}
                onPress={() =>
                  openMenu(
                    [
                      { label: 'All repositories', isOn: repo === null, onPress: () => setRepo(null) },
                      ...(me.data?.repos ?? []).map((r) => ({ label: r.fullName, isOn: repo === r.fullName, onPress: () => setRepo(r.fullName) })),
                    ],
                    repoRef.current,
                    'Repository',
                  )
                }
                style={({ pressed }) => ({ height: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.press : colors.surface })}>
                <Icon name="Filter3Line" size={15} color={repo ? colors.ink : colors.ui} />
                <Text style={{ fontFamily: Fonts.sans, fontSize: 13, color: repo ? colors.ink : colors.ui }}>{repo ? repo.split('/')[1] : 'Repos'}</Text>
              </Pressable>
            ) : null}
          </View>
          {filter !== 'all' && data && !data.viewerLogin ? (
            <Banner tone="warn">Link your GitHub account on the web (Account page) so requests, your pull requests and assignments can be matched to you.</Banner>
          ) : null}
          {data?.syncErrors.length ? <Banner tone="danger">{`Some repositories could not be refreshed: ${data.syncErrors[0]}`}</Banner> : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <AppBar />
      {list.isLoading && !data ? (
        <Loading />
      ) : list.error && !data ? (
        <ErrorView error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.repo}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: 32 }}
          renderItem={({ item: g }) => <RepoGroup group={g} viewerLogin={data?.viewerLogin ?? null} />}
          ListEmptyComponent={
            me.data && me.data.repos.length === 0 ? (
              <Empty title="No repositories yet.">An admin adds repositories to this workspace on the web (Repositories).</Empty>
            ) : filter === 'needs-review' && (state === 'merged' || state === 'closed') ? (
              <Empty title="Only open pull requests need review." />
            ) : q ? (
              <Empty title="No matching pull requests." />
            ) : (
              <Empty title={filter === 'needs-review' ? 'Nothing needs your review.' : 'No pull requests.'}>
                {filter === 'needs-review' ? 'Pull requests where your review is requested, or with guide sections you have not reviewed, show up here.' : 'Try another filter or state.'}
              </Empty>
            )
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.meta} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

/** `RepoGroup`: a bordered panel with the repository as a mono header. */
function RepoGroup({ group, viewerLogin }: { group: Group; viewerLogin: string | null }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginHorizontal: 20, marginTop: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.paper }}>
        <Text style={{ fontFamily: Fonts.mono, fontSize: 12, letterSpacing: 0.72, textTransform: 'uppercase', color: colors.ink, flexShrink: 1 }} numberOfLines={1}>
          {group.repo}
        </Text>
        <T variant="label" color={colors.faint}>
          {group.pulls.length} shown
        </T>
      </View>
      <Rule />
      {group.pulls.map((p, i) => (
        <PullRow key={p.number} pr={p} viewerLogin={viewerLogin} first={i === 0} />
      ))}
    </View>
  );
}

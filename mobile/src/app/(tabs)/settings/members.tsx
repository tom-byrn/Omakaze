import { FlatList, View } from 'react-native';

import { ScreenHeader } from '@/components/Chrome';
import { Avatar, ErrorView, ListRow, Loading, T, Tag } from '@/components/ui';
import { useMembers } from '@/lib/queries';
import { useTheme } from '@/lib/theme';

export default function Members() {
  const { colors } = useTheme();
  const q = useMembers();
  const header = <ScreenHeader crumb="Settings" title="Members" />;
  if (q.isLoading) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<Loading /></View>;
  if (q.error || !q.data) return <View style={{ flex: 1, backgroundColor: colors.paper }}>{header}<ErrorView error={q.error} onRetry={() => q.refetch()} /></View>;
  const members = q.data.members;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      {header}
      <FlatList
        data={members}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        ListHeaderComponent={
          <T variant="label" style={{ paddingBottom: 12 }}>
            {members.length} members · invite people and change roles on the web
          </T>
        }
        renderItem={({ item: m, index }) => (
          <View style={{ borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: index === 0 ? 1 : 0, borderBottomWidth: index === members.length - 1 ? 1 : 0, borderColor: colors.border, backgroundColor: colors.surface }}>
            <ListRow
              title={m.id === q.data!.me ? `${m.name} (you)` : m.name}
              subtitle={m.login ? `@${m.login}` : 'No GitHub account linked'}
              left={<Avatar uri={m.avatarUrl} name={m.name} size={30} />}
              right={<Tag label={m.role} color={m.role === 'member' ? colors.label : colors.ink} />}
              last={index === members.length - 1}
            />
          </View>
        )}
      />
    </View>
  );
}

import { Tabs } from 'expo-router';

import { TabBar } from '@/components/Chrome';
import { useTheme } from '@/lib/theme';

/** JavaScript tabs with the app's own bar (components/Chrome), not the system tab bar. */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar state={props.state} navigateToTab={props.navigateToTab} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}>
      <Tabs.Screen name="pulls" />
      <Tabs.Screen name="activity" />
      <Tabs.Screen name="insights" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

/** `/`: the pull request list when signed in, else sign-in. */
export default function Index() {
  const { account } = useSession();
  return <Redirect href={account ? '/pulls' : '/sign-in'} />;
}

import { router } from 'expo-router';

import { Sheet } from '@/components/Chrome';
import { SignInForm } from '@/components/SignInForm';

/** Add another workspace (same or another server). */
export default function AddAccount() {
  return (
    <Sheet title="Add a workspace" description="Each workspace signs in separately. Pick the workspace on the consent page; switch between them from the header.">
      <SignInForm compact onDone={() => router.back()} />
    </Sheet>
  );
}

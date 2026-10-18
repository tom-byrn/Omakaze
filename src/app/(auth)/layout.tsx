import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { AuthAside } from "@/components/auth/AuthAside";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative flex flex-col grain">
        <header className="flex h-16 items-center justify-between border-b border-dashed border-line-header px-6 lg:px-12">
          <Logo />
          <Link href="/" className="nav-link">
            Back to site
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-12 lg:px-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
      </div>
      <AuthAside />
    </div>
  );
}

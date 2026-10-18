import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col grain">
      <header className="flex h-16 items-center border-b border-dashed border-line-header px-6 lg:px-12">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="max-w-[520px] text-center">
          <span className="eyebrow">404</span>
          <h1 className="h2 mt-6">Not found.</h1>
          <p className="lead mt-4">The page does not exist, or you do not have access to it.</p>
          <Link href="/" className="btn btn-primary btn-md mt-8">
            Go home
          </Link>
        </div>
      </main>
    </div>
  );
}

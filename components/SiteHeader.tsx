import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between py-4">
      <Link href="/" className="text-lg font-black tracking-tight text-ink">
        BUSTA
      </Link>
      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">
        프로토타입
      </span>
    </header>
  );
}

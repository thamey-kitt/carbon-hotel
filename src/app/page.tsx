import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">GreenLedger</h1>
      <p className="max-w-md text-sm text-gray-500">
        Upload a hotel utility bill, let AI read it, then confirm the numbers before
        they go into the carbon ledger.
      </p>
      <Link
        href="/upload"
        className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700"
      >
        Upload a bill
      </Link>
    </main>
  );
}

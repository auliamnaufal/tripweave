import { Suspense } from "react";
import type { Metadata } from "next";
import { Account } from "@/components/app/Account";
import { AccountSkeleton } from "@/components/app/Skeleton";
import "@/components/app/account.css";

export const metadata: Metadata = { title: "Account | Tripweave" };

export default function AccountPage() {
  return (
    <Suspense fallback={<AccountSkeleton />}>
      <Account />
    </Suspense>
  );
}

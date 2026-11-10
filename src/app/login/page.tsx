import { Suspense } from "react";
import type { Metadata } from "next";
import { Login } from "@/components/app/Login";
import "@/components/app/app.css";
import "@/components/app/account.css";

export const metadata: Metadata = { title: "Sign in | Tripweave" };

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

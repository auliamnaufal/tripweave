import { SiteNav } from "@/components/landing/SiteNav";
import { Hero } from "@/components/landing/Hero";
import { Manifesto } from "@/components/landing/Manifesto";
import { Journeys } from "@/components/landing/Journeys";
import { Cities } from "@/components/landing/Cities";
import { Steps } from "@/components/landing/Steps";
import { Weave } from "@/components/landing/Weave";
import { Workspace } from "@/components/landing/Workspace";
import { Stories } from "@/components/landing/Stories";
import { Faq } from "@/components/landing/Faq";
import { Closing } from "@/components/landing/Closing";
import { SignedInRedirect } from "@/components/landing/SignedInRedirect";
import "@/components/landing/landing.css";

export default function Home() {
  return (
    <>
      <SignedInRedirect />
      <SiteNav />
      <main className="landing">
        <Hero />
        <Manifesto />
        <Journeys />
        <Cities />
        <Steps />
        <Weave />
        <Workspace />
        <Stories />
        <Faq />
        <Closing />
      </main>
    </>
  );
}

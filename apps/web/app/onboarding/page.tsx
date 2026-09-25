import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; redirect?: string }>;
}) {
  const { challenge, redirect } = await searchParams;
  return <OnboardingFlow challenge={challenge} redirect={redirect} />;
}

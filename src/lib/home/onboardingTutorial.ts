import { FEATURE_SECTIONS, type FeatureSection } from "../catalog/featuresCatalog";

export type OnboardingTutorialStep = {
  id: string;
  sectionId: string;
  sectionTitle: string;
  sectionAccent: FeatureSection["accent"];
  title: string;
  description: string;
  howTo: string;
  route?: string;
};

// Tutoriel complet construit depuis le catalogue central pour couvrir toutes les pages.
export function getOnboardingTutorialSteps(): OnboardingTutorialStep[] {
  return FEATURE_SECTIONS.flatMap((section) =>
    section.features.map((feature) => ({
      id: `${section.id}:${feature.id}`,
      sectionId: section.id,
      sectionTitle: section.title,
      sectionAccent: section.accent,
      title: feature.title,
      description: feature.description,
      howTo: feature.howTo,
      route: feature.route
    }))
  );
}

export function getTutorialGlobalProgressLabel(currentIndex: number, total: number): string {
  if (total <= 0) return "0/0";
  const clamped = Math.max(0, Math.min(total - 1, currentIndex));
  return `${clamped + 1}/${total}`;
}

export function getTutorialSectionStats(steps: OnboardingTutorialStep[]): Array<{
  sectionId: string;
  sectionTitle: string;
  count: number;
}> {
  const map = new Map<string, { sectionTitle: string; count: number }>();
  for (const step of steps) {
    const existing = map.get(step.sectionId);
    if (!existing) {
      map.set(step.sectionId, { sectionTitle: step.sectionTitle, count: 1 });
    } else {
      map.set(step.sectionId, {
        sectionTitle: existing.sectionTitle,
        count: existing.count + 1
      });
    }
  }
  return [...map.entries()].map(([sectionId, value]) => ({
    sectionId,
    sectionTitle: value.sectionTitle,
    count: value.count
  }));
}


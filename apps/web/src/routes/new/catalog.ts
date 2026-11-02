import { useQuery } from '@tanstack/react-query';

export type CatalogPack = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  compatibleWith?: string[];
};

export type CatalogSet = {
  id: string;
  label: string;
  pickerFamilies: string[];
  vendors: string[];
  traits: Record<string, string | undefined>;
  packs: CatalogPack[];
  showcase?: CatalogShowcase;
};

export type CatalogShowcase = {
  tileVideoUrl?: string;
  sheetVideoUrl?: string;
  stops: {
    id: string;
    label: string;
    startSeconds: number;
    tileFallbackUrl?: string;
    sheetFallbackUrl?: string;
  }[];
};

export type CatalogFamily = {
  id: string;
  label: string;
  views: string[];
  creationChoice: boolean;
  packs: CatalogPack[];
  sets: CatalogSet[];
};

export type StyleChoice = {
  id: string;
  label: string;
  familyId: string;
  views: string[];
  packs: CatalogPack[];
  showcase?: CatalogShowcase;
};

export type PickerFamily = Pick<CatalogFamily, 'id' | 'label'>;

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog', 'style-families'],
    queryFn: fetchStyleFamilies,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function styleChoices(families: CatalogFamily[]): StyleChoice[] {
  return families.flatMap((family) => {
    if (!family.creationChoice) return [];
    if (family.sets.length === 0) {
      return [choiceForFamily(family)];
    }
    return family.sets.map((set) => choiceFor(family, set));
  });
}

export function pickerFamilies(families: CatalogFamily[]): PickerFamily[] {
  return families
    .filter((family) => family.creationChoice)
    .map((family) => ({
      id: family.id,
      label: family.id === 'isometric-2d' ? 'Isometric' : family.label,
    }));
}

export function setsForFamily(families: CatalogFamily[], familyId: string): StyleChoice[] {
  const family = families.find((candidate) => candidate.id === familyId && candidate.creationChoice);
  if (!family) return [];
  const direct = family.sets.length > 0 ? family.sets.map((set) => choiceFor(family, set)) : [choiceForFamily(family)];
  const aliased = families.flatMap((owner) =>
    owner.sets.filter((set) => set.pickerFamilies.includes(familyId)).map((set) => choiceFor(owner, set)),
  );
  return [...new Map([...direct, ...aliased].map((choice) => [choice.id, choice])).values()];
}

function choiceForFamily(family: CatalogFamily): StyleChoice {
  return {
    id: family.id,
    label: family.label,
    familyId: family.id,
    views: family.views,
    packs: family.packs,
  };
}

function choiceFor(family: CatalogFamily, set: CatalogSet): StyleChoice {
  return {
    id: set.id,
    label: set.label,
    familyId: family.id,
    views: family.views,
    packs: set.packs,
    ...(set.showcase ? { showcase: set.showcase } : {}),
  };
}

async function fetchStyleFamilies(): Promise<CatalogFamily[]> {
  const response = await fetch('/api/catalog/style-families', { credentials: 'include' });
  if (!response.ok) throw new Error(`catalog ${response.status}`);
  return (await response.json()) as CatalogFamily[];
}

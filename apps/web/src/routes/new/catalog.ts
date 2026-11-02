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
  vendors: string[];
  traits: Record<string, string | undefined>;
  packs: CatalogPack[];
  requiresPrivate?: boolean;
};

export type CatalogFamily = {
  id: string;
  label: string;
  views: string[];
  creationChoice: boolean;
  packs: CatalogPack[];
  sets: CatalogSet[];
  requiresPrivate?: boolean;
};

export type StyleChoice = {
  id: string;
  label: string;
  familyId: string;
  views: string[];
  packs: CatalogPack[];
  requiresPrivate: boolean;
};

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
      return [
        {
          id: family.id,
          label: family.label,
          familyId: family.id,
          views: family.views,
          packs: family.packs,
          requiresPrivate: family.requiresPrivate ?? false,
        },
      ];
    }
    return family.sets.map((set) => ({
      id: set.id,
      label: set.label,
      familyId: family.id,
      views: family.views,
      packs: set.packs,
      requiresPrivate: set.requiresPrivate ?? family.requiresPrivate ?? false,
    }));
  });
}

async function fetchStyleFamilies(): Promise<CatalogFamily[]> {
  const response = await fetch('/api/catalog/style-families', { credentials: 'include' });
  if (!response.ok) throw new Error(`catalog ${response.status}`);
  return (await response.json()) as CatalogFamily[];
}

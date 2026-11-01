import type { AssetCard } from './card.js';

export type Use =
  'in-game' | 'placeholder' | 'derive-layout' | 'style-reference' | 'vision-input' | 'edit-audio' | 'derive-audio';
export type Audience = 'private' | 'public';
export type Redistribution = 'none' | 'in-build' | 'free';
export type Processing = 'local-only' | 'any';
export type RightsBasis = NonNullable<AssetCard['rights']>['basis'][number];
export type EffectiveRights = {
  uses: Set<Use>;
  audience: Audience;
  redistribution: Redistribution;
};

export class RightsError extends Error {}

const ORDER = {
  audience: ['private', 'public'],
  redistribution: ['none', 'in-build', 'free'],
} as const;

function minimum<K extends keyof typeof ORDER>(
  key: K,
  left: (typeof ORDER)[K][number],
  right: (typeof ORDER)[K][number],
) {
  const values = ORDER[key] as readonly string[];
  return values.indexOf(left) <= values.indexOf(right) ? left : right;
}

export function effectiveRights(basis: RightsBasis[]): EffectiveRights {
  const confirmedLicence = basis.find((entry) => entry.type === 'license' && entry.confirmed_by);
  const ceiling = confirmedLicence ?? basis.find((entry) => entry.type === 'default');
  if (!ceiling) throw new RightsError('no confirmed license and no default entry');

  const effective: EffectiveRights = {
    uses: new Set(ceiling.uses),
    audience: ceiling.audience,
    redistribution: ceiling.redistribution,
  };
  const forbidden = new Set(basis.filter((entry) => entry.type === 'license').flatMap((entry) => entry.forbids ?? []));

  for (const interpretation of basis.filter((entry) => entry.type === 'interpretation')) {
    const banned = interpretation.uses.filter((use) => forbidden.has(use));
    if (banned.length > 0) {
      throw new RightsError(`interpretation adds forbidden use(s) ${banned.join(',')}`);
    }
    for (const use of interpretation.uses) effective.uses.add(use);
  }

  for (const decision of basis.filter((entry) => entry.type === 'decision')) {
    effective.uses = new Set([...effective.uses].filter((use) => decision.uses.includes(use)));
    effective.audience = minimum('audience', effective.audience, decision.audience);
    effective.redistribution = minimum('redistribution', effective.redistribution, decision.redistribution);
  }

  return effective;
}

export function rightsAgree(declared: NonNullable<AssetCard['rights']>, effective: EffectiveRights): boolean {
  return (
    declared.audience === effective.audience &&
    declared.redistribution === effective.redistribution &&
    declared.uses.length === effective.uses.size &&
    declared.uses.every((use) => effective.uses.has(use))
  );
}

export function defaultProcessing(license: string | undefined, status: AssetCard['status']): Processing {
  return status === 'quarantined' ||
    license === undefined ||
    license === 'NOASSERTION' ||
    license.startsWith('LicenseRef-')
    ? 'local-only'
    : 'any';
}

export function processingAllowed(card: AssetCard): { ok: true } | { ok: false; reason: string } {
  if (card.rights?.processing === 'any' && defaultProcessing(card.license, card.status) !== 'any') {
    return {
      ok: false,
      reason: 'processing any requires an SPDX licence and non-quarantined status',
    };
  }
  return { ok: true };
}

import { describe, expect, it } from 'vitest';

import { lpcCollectionLicense, parseLpcCredits } from '../src/packs/credits-csv.js';

const CSV = `filename,notes,authors,licenses,urls
"cc0.png","","Ada","CC0","https://example.test/cc0"
"by.png","","Ben, Bea","CC-BY 3.0","https://example.test/by"
"sa.png","","Cy","CC-BY-SA 3.0","https://example.test/sa"
"gpl.png","","Dee","GPL 3.0","https://example.test/gpl"
"oga.png","multi
line note","Eve","OGA-BY 3.0","https://example.test/oga"
"unknown.png","","Fox","Weird License","https://example.test/unknown"
"choice.png","","Gia","CC-BY-SA 3.0,CC-BY 3.0","https://example.test/choice"
"anonymous.png","","","CC-BY 3.0","https://example.test/anonymous"
`;

describe('LPC credits CSV', () => {
  it('maps known licences and drops unknown, share-alike, and GPL-only rows by default', () => {
    const map = parseLpcCredits(CSV, { includeSa: false });
    expect(map['cc0.png']).toEqual({ license: 'CC0-1.0', attribution: 'Ada' });
    expect(map['by.png']).toEqual({ license: 'CC-BY-3.0', attribution: 'Ben, Bea' });
    expect(map['oga.png']).toEqual({ license: 'OGA-BY-3.0', attribution: 'Eve' });
    expect(map['choice.png']).toEqual({ license: 'CC-BY-3.0', attribution: 'Gia' });
    expect(map['sa.png']).toMatchObject({ license: 'CC-BY-SA-3.0', dropped: expect.stringContaining('share-alike') });
    expect(map['gpl.png']).toMatchObject({ license: 'GPL-3.0-only', dropped: expect.stringContaining('GPL') });
    expect(map['unknown.png']).toEqual({
      license: 'NOASSERTION',
      attribution: 'Fox',
      dropped: 'unmapped license "Weird License"',
    });
    expect(map['anonymous.png']).toMatchObject({
      license: 'CC-BY-3.0',
      dropped: 'missing attribution for CC-BY-3.0',
    });
  });

  it('keeps share-alike when explicitly requested but always drops GPL rows', () => {
    const map = parseLpcCredits(CSV, { includeSa: true });
    expect(map['sa.png']).toEqual({ license: 'CC-BY-SA-3.0', attribution: 'Cy' });
    expect(map['gpl.png']).toEqual({
      license: 'GPL-3.0-only',
      attribution: 'Dee',
      dropped: 'GPL item excluded from tier 2',
    });
    expect(lpcCollectionLicense(map)).toBe('CC-BY-SA-3.0');
  });

  it('requires the five LPC columns while tolerating their order', () => {
    expect(() => parseLpcCredits('filename,authors,licenses\na.png,Ada,CC0\n', { includeSa: false })).toThrow(
      /notes.*urls/,
    );
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as OCL from 'openchemlib';
import { resolveAndVerifyCore } from '../src/chemistry/coreResolver.ts';
import { generateStructures } from '../src/chemistry/generateLocal.ts';
import { renderProjection } from '../src/chemistry/projectionEngine.ts';
import {
  extractGlyTouCanAccession,
  extractWurcsSequence,
  fetchGlyTouCanDiagram,
  fetchWurcsDiagram,
} from '../src/chemistry/glycanResolver.ts';
import { cyclizeSugar } from '../src/chemistry/sugarCyclization.ts';

const displayOptions = {
  uniformAlignment: true,
  showCIP: false,
  colorHeteroatoms: false,
  showCarbonNumbers: false,
  hideNonAtomAnnotations: false,
};

async function withMockedFetch(
  mockFetch: typeof fetch,
  run: () => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('prefers the exact ChEBI amino-acid record over PubChem', async () => {
  const requestedUrls: string[] = [];
  const inchiKey = 'AAAAAAAAAAAAAA-BBBBBBBBBB-C';

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith('https://www.ebi.ac.uk/chebi/backend/api/public/es_search/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                _id: '90349',
                _source: {
                  chebi_accession: 'CHEBI:90349',
                  ascii_name: 'L-alanine 2-naphthylamide',
                  formula: 'C13H14N2O',
                  mass: 214.26,
                  smiles: 'C[C@H](N)C(=O)Nc1ccc2ccccc2c1',
                  inchikey: inchiKey,
                  stars: 3,
                },
              },
              {
                _id: '16977',
                _source: {
                  chebi_accession: 'CHEBI:16977',
                  ascii_name: 'L-alanine',
                  formula: 'C3H7NO2',
                  mass: 89.09,
                  smiles: 'C[C@H](N)C(=O)O',
                  inchikey: inchiKey,
                  stars: 3,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('cactus.nci.nih.gov')) {
        return new Response(`InChIKey=${inchiKey}`, { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await resolveAndVerifyCore(
        'L-alanine',
        '',
        ['skelett'],
        displayOptions
      );
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].compound.sourceDatabase, 'ChEBI');
      assert.equal(result.candidates[0].compound.sourceId, 'CHEBI:16977');
      assert.equal(result.candidates[0].compound.molecularFormula, 'C3H7NO2');
      assert.equal(
        requestedUrls.some((url) => url.includes('pubchem.ncbi.nlm.nih.gov')),
        false
      );
    }
  );
});

test('falls back to PubChem when a ChEBI structure fails local formula validation', async () => {
  const inchiKey = 'AAAAAAAAAAAAAA-BBBBBBBBBB-C';

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url.includes('/chebi/backend/api/public/es_search/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                _id: '16977',
                _source: {
                  chebi_accession: 'CHEBI:16977',
                  ascii_name: 'L-alanine',
                  formula: 'C3H7NO2',
                  mass: 89.09,
                  smiles: 'CC(=O)O',
                  inchikey: inchiKey,
                  stars: 3,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('pubchem.ncbi.nlm.nih.gov')) {
        return new Response(
          JSON.stringify({
            PropertyTable: {
              Properties: [
                {
                  CID: 5950,
                  MolecularFormula: 'C3H7NO2',
                  MolecularWeight: '89.09',
                  IsomericSMILES: 'C[C@H](N)C(=O)O',
                  InChIKey: inchiKey,
                  Title: 'L-alanine',
                  IUPACName: '(2S)-2-aminopropanoic acid',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('cactus.nci.nih.gov')) {
        return new Response(`InChIKey=${inchiKey}`, { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await resolveAndVerifyCore(
        'L-alanine',
        '',
        ['skelett'],
        displayOptions
      );
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0].compound.sourceDatabase, 'PubChem');
      assert.equal(result.candidates[0].compound.sourceId, 'CID 5950');
    }
  );
});

test('renders a registered GlyTouCan WURCS sequence as an embedded diagram', async () => {
  const accession = 'G00051MO';
  const wurcs = 'WURCS=2.0/1,1,0/[a2122h-1b_1-5]/1/';
  const requestedUrls: string[] = [];

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === `https://glytoucan.org/api/entry/data/${accession}`) {
        return new Response(
          JSON.stringify({
            errcode: '',
            contents: { accession, validated_wurcstext: wurcs },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.glycosmos.org/wurcs2image/')) {
        return new Response(
          JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=', wurcs }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await fetchGlyTouCanDiagram(accession);
      assert.equal(result.status, 'found');
      if (result.status !== 'found') return;
      assert.equal(result.diagram.wurcs, wurcs);
      assert.match(result.diagram.svg, /href="data:image\/png;base64,SGVsbG8="/);
      assert.equal(requestedUrls.length, 2);
      assert.ok(requestedUrls[1].includes(encodeURIComponent(wurcs)));
    }
  );
});

test('recognizes GlyTouCan accessions without accepting unrelated text', () => {
  assert.equal(extractGlyTouCanAccession('GlyTouCan G00051MO'), 'G00051MO');
  assert.equal(extractGlyTouCanAccession('G00051MOX'), undefined);
  assert.equal(extractGlyTouCanAccession('Glucose'), undefined);
});

test('renders a user-provided WURCS sequence and reports unsupported chemical conversion', async () => {
  const wurcs = 'WURCS=2.0/1,1,0/[a2122h-1b_1-5]/1/';
  assert.equal(extractWurcsSequence(`Glykan ${wurcs}`), wurcs);
  assert.equal(extractWurcsSequence('WURCS=1.0/invalid'), undefined);
  const invalid = await generateStructures({
    query: 'WURCS=1.0/invalid',
    specifications: '',
    projections: ['glycan'],
    options: displayOptions,
  });
  assert.equal(invalid.status, 400);

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      assert.ok(url.includes(encodeURIComponent(wurcs)));
      return new Response(
        JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=', wurcs }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    },
    async () => {
      const result = await generateStructures({
        query: wurcs,
        specifications: '',
        projections: ['glycan', 'skelett'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.structures.map((item) => item.projection), ['glycan']);
      assert.equal(result.body.structures[0].compound.sourceDatabase, 'WURCS');
      assert.ok(result.body.notices.some((notice) => notice.projection === 'skelett'));
    }
  );
});

test('renders registered GlyTouCan IDs as SNFG, skeletons, and matched Haworth projections', async () => {
  const accession = 'G41078PD';
  const wurcs =
    'WURCS=2.0/2,3,2/[a2122h-1x_1-5][a2122h-1b_1-5]/1-2-2/a4-b1_b4-c1';
  const smiles =
    'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O[C@H]3[C@H](O)[C@@H](O)C(O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O';

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url === `https://glytoucan.org/api/entry/data/${accession}`) {
        return new Response(
          JSON.stringify({
            errcode: '',
            contents: { accession, validated_wurcstext: wurcs },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === `https://api.glygen.org/glycan/detail/${accession}/`) {
        return new Response(
          JSON.stringify({
            glytoucan: { glytoucan_ac: accession },
            wurcs,
            smiles_isomeric: smiles,
            mass: 504.17,
            inchi_key: { key: 'FYGDTMLNYKFZSV-ZWSAEMDYSA-N' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.glycosmos.org/wurcs2image/')) {
        return new Response(
          JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=', wurcs }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: accession,
        specifications: '',
        projections: ['glycan', 'skelett', 'haworth'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(
        result.body.structures.map((item) => item.projection).sort(),
        ['glycan', 'haworth', 'skelett']
      );
      assert.ok(
        result.body.structures
          .find((item) => item.projection === 'haworth')
          ?.svg.includes('mol-haworth-linked')
      );
      assert.ok(
        result.body.structures.every(
          (item) => item.compound.molecularFormula === 'C18H32O16'
        )
      );
      assert.ok(
        result.body.structures.every(
          (item) => item.compound.molecularWeight === '504.44 g/mol'
        )
      );
      assert.ok(result.body.structures.every((item) => item.compound.wurcs === wurcs));
    }
  );
});

test('does not use GlyGen SMILES when its WURCS differs from the GlyTouCan record', async () => {
  const accession = 'G41078PD';
  const wurcs =
    'WURCS=2.0/2,3,2/[a2122h-1x_1-5][a2122h-1b_1-5]/1-2-2/a4-b1_b4-c1';
  const smiles =
    'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O[C@H]3[C@H](O)[C@@H](O)C(O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O';

  await withMockedFetch(
    async (input) => {
      const url = String(input);
      if (url === `https://glytoucan.org/api/entry/data/${accession}`) {
        return new Response(
          JSON.stringify({
            errcode: '',
            contents: { accession, validated_wurcstext: wurcs },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === `https://api.glygen.org/glycan/detail/${accession}/`) {
        return new Response(
          JSON.stringify({
            glytoucan: { glytoucan_ac: accession },
            wurcs: `${wurcs}extra`,
            smiles_isomeric: smiles,
            inchi_key: { key: 'FYGDTMLNYKFZSV-ZWSAEMDYSA-N' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('api.glycosmos.org/wurcs2image/')) {
        return new Response(
          JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=', wurcs }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: accession,
        specifications: '',
        projections: ['glycan', 'skelett', 'haworth'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.structures.map((item) => item.projection), ['glycan']);
      assert.ok(
        result.body.notices.some((notice) => notice.projection === 'skelett')
      );
      assert.ok(
        result.body.notices.some((notice) => notice.projection === 'haworth')
      );
    }
  );
});

test('uses finite database oligomers for common polysaccharides and marks them as fragments', async () => {
  const records = {
    cellotriose: {
      id: '3528',
      formula: 'C18H32O16',
      mass: 504.438,
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O[C@H]3[C@H](O)[C@@H](O)C(O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'FYGDTMLNYKFZSV-ZWSAEMDYSA-N',
    },
    'alpha-maltotriose': {
      id: '27931',
      formula: 'C18H32O16',
      mass: 504.438,
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2[C@H](O)[C@@H](O)[C@@H](O[C@H]3[C@H](O)[C@@H](O)[C@@H](O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'FYGDTMLNYKFZSV-PXXRMHSHSA-N',
    },
    'beta-D-GlcpNAc-(1->4)-beta-D-GlcpNAc-(1->4)-beta-D-GlcpNAc': {
      id: '71404',
      formula: 'C24H41N3O16',
      mass: 627.597,
      smiles:
        'CC(=O)N[C@@H]1[C@@H](O)[C@H](O[C@@H]2O[C@H](CO)[C@@H](O[C@@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3NC(C)=O)[C@H](O)[C@H]2NC(C)=O)[C@@H](CO)O[C@H]1O',
      inchikey: 'WZZVUHWLNMNWLW-VFCSDQTKSA-N',
    },
    isomaltotriose: {
      id: '27649',
      formula: 'C18H32O16',
      mass: 504.438,
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2O[C@H](OC[C@H]3OC(O)[C@H](O)[C@@H](O)[C@@H]3O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'FBJQEBRMDXPWNX-FYHZSNTMSA-N',
    },
    '1-kestose': {
      id: '16885',
      formula: 'C18H32O16',
      mass: 504.438,
      smiles:
        'OC[C@H]1O[C@@](CO)(OC[C@@]2(O[C@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)O[C@H](CO)[C@@H](O)[C@@H]2O)[C@@H](O)[C@@H]1O',
      inchikey: 'VAWYEUIPHLMNNF-OESPXIITSA-N',
    },
  };
  const polymerCases = [
    { query: 'Cellulose', searchName: 'cellotriose', germanName: 'Cellulose' },
    { query: 'Amylose', searchName: 'alpha-maltotriose', germanName: 'Amylose' },
    { query: 'Stärke', searchName: 'alpha-maltotriose', germanName: 'Stärke' },
    { query: 'Amylopektin', searchName: 'alpha-maltotriose', germanName: 'Amylopektin' },
    { query: 'Glykogen', searchName: 'alpha-maltotriose', germanName: 'Glykogen' },
    { query: 'Dextran', searchName: 'isomaltotriose', germanName: 'Dextran' },
    { query: 'Inulin', searchName: '1-kestose', germanName: 'Inulin' },
    {
      query: 'Chitin',
      searchName: 'beta-D-GlcpNAc-(1->4)-beta-D-GlcpNAc-(1->4)-beta-D-GlcpNAc',
      germanName: 'Chitin',
    },
  ];

  for (const polymerCase of polymerCases) {
    const record = records[polymerCase.searchName as keyof typeof records];
    await withMockedFetch(
      async (input) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.ebi.ac.uk') {
          assert.equal(url.searchParams.get('term'), polymerCase.searchName);
          return new Response(
            JSON.stringify({
              results: [
                {
                  _id: record.id,
                  _source: {
                    chebi_accession: `CHEBI:${record.id}`,
                    ascii_name: polymerCase.searchName,
                    formula: record.formula,
                    mass: record.mass,
                    smiles: record.smiles,
                    inchikey: record.inchikey,
                    stars: 3,
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.hostname === 'cactus.nci.nih.gov') {
          return new Response(`InChIKey=${record.inchikey}`, { status: 200 });
        }
        throw new Error(`Unexpected provider request: ${url}`);
      },
      async () => {
        const result = await generateStructures({
          query: polymerCase.query,
          specifications: '',
          projections: ['skelett', 'haworth'],
          options: displayOptions,
        });

        assert.equal(result.status, 200, polymerCase.query);
        assert.equal(result.body.structures[0]?.title, polymerCase.germanName);
        assert.ok(
          result.body.structures.some(
            (structure) =>
              structure.projection === 'haworth' &&
              structure.svg.includes('mol-haworth-linked')
          ),
          polymerCase.query
        );
        assert.equal(
          result.body.structures[0]?.compound.sourceId,
          `CHEBI:${record.id}`
        );
        assert.ok(
          result.body.notices.some(
            (notice) =>
              notice.reason.includes('Ausschnitt') ||
              notice.reason.includes('Fragment')
          ),
          polymerCase.query
        );
      }
    );
  }
});

test('renders cellulose as both a verified chemical fragment and its ChEBI WURCS diagram', async () => {
  const wurcs =
    'WURCS=2.0/2,3,2/[a2122h-1x_1-5][a2122h-1b_1-5]/1-2-2/a4-b1_b4-c1';
  const smiles =
    'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O[C@H]3[C@H](O)[C@@H](O)C(O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O';
  const inchiKey = 'FYGDTMLNYKFZSV-ZWSAEMDYSA-N';

  await withMockedFetch(
    async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.ebi.ac.uk' && url.pathname.endsWith('/es_search/')) {
        return new Response(
          JSON.stringify({
            results: [
              {
                _id: '3528',
                _source: {
                  chebi_accession: 'CHEBI:3528',
                  ascii_name: 'cellotriose',
                  formula: 'C18H32O16',
                  mass: 504.438,
                  smiles,
                  inchikey: inchiKey,
                  stars: 3,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.hostname === 'www.ebi.ac.uk' && url.pathname.endsWith('/compound/3528/')) {
        return new Response(
          JSON.stringify({
            default_structure: { wurcs },
            database_accessions: {
              MANUAL_X_REF: [
                {
                  accession_number: 'G41078PD',
                  source_name: 'GlyTouCan',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.hostname === 'cactus.nci.nih.gov') {
        return new Response(`InChIKey=${inchiKey}`, { status: 200 });
      }
      if (url.hostname === 'api.glycosmos.org') {
        return new Response(
          JSON.stringify({ image: 'data:image/png;base64,SGVsbG8=', wurcs }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: 'Cellulose',
        specifications: '',
        projections: ['skelett', 'glycan'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(
        result.body.structures.map((item) => item.projection).sort(),
        ['glycan', 'skelett']
      );
      assert.ok(
        result.body.structures.every(
          (item) => item.compound.molecularFormula === 'C18H32O16'
        )
      );
      assert.ok(result.body.notices.some((notice) => notice.reason.includes('Cellotriose')));
    }
  );
});

test('resolves the German Saccharose name to the exact sucrose ChEBI record', async () => {
  const smiles =
    'OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O';
  const inchiKey = 'CZMRCDWAGMRECN-UGDNZRGBSA-N';

  await withMockedFetch(
    async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.ebi.ac.uk') {
        assert.equal(url.searchParams.get('term'), 'sucrose');
        return new Response(
          JSON.stringify({
            results: [
              {
                _id: '17992',
                _source: {
                  chebi_accession: 'CHEBI:17992',
                  ascii_name: 'sucrose',
                  formula: 'C12H22O11',
                  mass: 342.297,
                  smiles,
                  inchikey: inchiKey,
                  stars: 3,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.hostname === 'cactus.nci.nih.gov') {
        return new Response(`InChIKey=${inchiKey}`, { status: 200 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: 'Saccharose',
        specifications: '',
        projections: ['skelett', 'haworth'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.structures[0]?.compound.sourceId, 'CHEBI:17992');
      assert.equal(result.body.structures[0]?.compound.molecularFormula, 'C12H22O11');
      assert.ok(
        result.body.structures.some(
          (structure) =>
            structure.projection === 'haworth' &&
            structure.svg.includes('mol-haworth-linked')
        )
      );
    }
  );
});

test('resolves common di- and trisaccharides to Haworth projections', async () => {
  const records = [
    {
      query: 'Lactose',
      searchName: 'beta-lactose',
      id: '36218',
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@H]1O',
      inchikey: 'GUBGYTABKSRVRQ-DCSYEGIMSA-N',
      ringCount: 2,
    },
    {
      query: 'Maltose',
      searchName: 'alpha-maltose',
      id: '18167',
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2[C@H](O)[C@@H](O)[C@@H](O)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'GUBGYTABKSRVRQ-ASMJPISFSA-N',
      ringCount: 2,
    },
    {
      query: 'Cellobiose',
      searchName: 'beta-cellobiose',
      id: '36217',
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'GUBGYTABKSRVRQ-QRZGKKJRSA-N',
      ringCount: 2,
    },
    {
      query: 'Trehalose',
      searchName: 'alpha,alpha-trehalose',
      id: '16551',
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'HDTRYLNUVZCQOY-LIZSDCNHSA-N',
      ringCount: 2,
    },
    {
      query: 'Isomaltose',
      searchName: 'isomaltose',
      id: '28189',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'DLRVVLDZNNYCBX-RTPHMHGBSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Isomaltulose',
      searchName: 'isomaltulose',
      id: '18394',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)(CO)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'PVXPPJIGRGXGCY-TZLCEDOOSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Lactulose',
      searchName: 'lactulose',
      id: '6359',
      smiles:
        'OC[C@H]1O[C@@H](O[C@@H]2[C@@H](CO)O[C@](O)(CO)[C@H]2O)[C@H](O)[C@@H](O)[C@H]1O',
      inchikey: 'JCQLYHFGKNRPGE-FCVZTGTOSA-N',
      ringCount: 2,
    },
    {
      query: 'Melibiose',
      searchName: 'melibiose',
      id: '28053',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@H]1O',
      inchikey: 'DLRVVLDZNNYCBX-ABXHMFFYSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Gentiobiose',
      searchName: 'gentiobiose',
      id: '28066',
      smiles:
        'OC[C@H]1O[C@@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'DLRVVLDZNNYCBX-CQUJWQHSSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Nigerose',
      searchName: 'nigerose',
      id: '7570',
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2[C@H](O)[C@@H](CO)OC(O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'QIGJYVCQYDKYDW-NSYYTRPSSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Sophorose',
      searchName: 'sophorose',
      id: '1230',
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2C(O)O[C@H](CO)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'HIWPGCMGAMJNRG-RTPHMHGBSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Kojibiose',
      searchName: 'kojibiose',
      id: '142460',
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2C(O)O[C@H](CO)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      inchikey: 'HIWPGCMGAMJNRG-CQUJWQHSSA-N',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      query: 'Raffinose',
      searchName: 'raffinose',
      id: '16634',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2O[C@H](O[C@]3(CO)O[C@H](CO)[C@@H](O)[C@@H]3O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@H]1O',
      inchikey: 'MUPFEKGTMRGPLJ-ZQSKZDJDSA-N',
      ringCount: 3,
    },
  ];

  for (const record of records) {
    await withMockedFetch(
      async (input) => {
        const url = new URL(String(input));
        if (url.hostname === 'www.ebi.ac.uk') {
          assert.equal(url.searchParams.get('term'), record.searchName);
          return new Response(
            JSON.stringify({
              results: [
                {
                  _id: record.id,
                  _source: {
                    chebi_accession: `CHEBI:${record.id}`,
                    ascii_name: record.searchName,
                    formula: record.ringCount === 3 ? 'C18H32O16' : 'C12H22O11',
                    mass: record.ringCount === 3 ? 504.438 : 342.297,
                    smiles: record.smiles,
                    inchikey: record.inchikey,
                    stars: 3,
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.hostname === 'cactus.nci.nih.gov') {
          return new Response(`InChIKey=${record.inchikey}`, { status: 200 });
        }
        throw new Error(`Unexpected provider request: ${url}`);
      },
      async () => {
        const result = await generateStructures({
          query: record.query,
          specifications: '',
          projections: ['haworth'],
          options: displayOptions,
        });

        assert.equal(result.status, 200, record.query);
        assert.equal(result.body.structures.length, 1, record.query);
        assert.equal(result.body.structures[0]?.projection, 'haworth');
        assert.match(
          result.body.structures[0]?.svg ?? '',
          /id="mol-haworth-linked"/,
          record.query
        );
        if ('unspecifiedAnomer' in record && record.unspecifiedAnomer) {
          assert.match(
            result.body.structures[0]?.alignmentNotes ?? '',
            /Anomer unbekannt/
          );
          assert.match(result.body.structures[0]?.svg ?? '', /<path\b/);
        }
      }
    );
  }
});

test('builds missing glucose Haworth anomers from its database open-chain form', async () => {
  const searchTerms: string[] = [];
  const openChainSmiles = 'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO';

  await withMockedFetch(
    async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.ebi.ac.uk') {
        const term = url.searchParams.get('term') || '';
        searchTerms.push(term);
        const results =
          term === 'aldehydo-D-glucose'
            ? [
                {
                  _id: '50000',
                  _source: {
                    chebi_accession: 'CHEBI:50000',
                    ascii_name: term,
                    formula: 'C6H12O6',
                    mass: 180.16,
                    smiles: openChainSmiles,
                    inchikey: 'AAAAAAAAAAAAAA-BBBBBBBBBB-C',
                    stars: 3,
                  },
                },
              ]
            : [];
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.hostname === 'pubchem.ncbi.nlm.nih.gov') {
        return new Response('{}', { status: 404 });
      }
      if (url.hostname === 'cactus.nci.nih.gov') {
        return new Response('', { status: 404 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: 'Glucose',
        specifications: '',
        projections: ['haworth'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(
        result.body.structures.map((structure) => structure.alignmentNotes.includes('α-Anomer')),
        [true, false]
      );
      assert.ok(searchTerms.includes('aldehydo-D-glucose'));
      assert.ok(
        result.body.structures.every(
          (structure) => structure.compound.validation.status === 'unverified'
        )
      );
    }
  );
});

test('does not warn about a missing optional open-chain form when both rings resolve', async () => {
  const openChainSmiles = 'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO';
  const products = await cyclizeSugar(openChainSmiles, 6);
  const smilesByAnomer = new Map<string, string>();
  for (const product of products) {
    const molecule = OCL.Molecule.fromSmiles(product.isomericSmiles);
    const rendered = renderProjection('haworth', molecule, displayOptions);
    const anomer = rendered.alignmentNotes?.includes('α-Anomer')
      ? 'alpha'
      : rendered.alignmentNotes?.includes('β-Anomer')
        ? 'beta'
        : undefined;
    if (anomer) smilesByAnomer.set(anomer, product.isomericSmiles);
  }
  assert.equal(smilesByAnomer.size, 2);

  await withMockedFetch(
    async (input) => {
      const url = new URL(String(input));
      if (url.hostname === 'www.ebi.ac.uk') {
        const term = url.searchParams.get('term') || '';
        const anomer = term.startsWith('alpha-')
          ? 'alpha'
          : term.startsWith('beta-')
            ? 'beta'
            : undefined;
        const smiles = anomer ? smilesByAnomer.get(anomer) : undefined;
        const results = smiles
          ? [
              {
                _id: anomer === 'alpha' ? '50001' : '50002',
                _source: {
                  chebi_accession: anomer === 'alpha' ? 'CHEBI:50001' : 'CHEBI:50002',
                  ascii_name: term,
                  formula: 'C6H12O6',
                  mass: 180.16,
                  smiles,
                  inchikey: `AAAAAAAAAAAAA${anomer === 'alpha' ? 'A' : 'B'}-BBBBBBBBBB-C`,
                  stars: 3,
                },
              },
            ]
          : [];
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.hostname === 'pubchem.ncbi.nlm.nih.gov') {
        return new Response('{}', { status: 404 });
      }
      if (url.hostname === 'cactus.nci.nih.gov') {
        return new Response('', { status: 404 });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    },
    async () => {
      const result = await generateStructures({
        query: 'Glucose',
        specifications: '',
        projections: ['haworth'],
        options: displayOptions,
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.structures.length, 2);
      assert.equal(
        result.body.notices.some((notice) =>
          notice.reason.includes('Kein passender') &&
          notice.reason.includes('aldehydo-D-glucose')
        ),
        false
      );
    }
  );
});

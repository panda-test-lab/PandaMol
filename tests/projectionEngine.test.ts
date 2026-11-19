import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as OCL from 'openchemlib';
import {
  hideNonAtomAnnotations,
  renderProjection,
} from '../src/chemistry/projectionEngine.ts';
import { cyclizeSugar } from '../src/chemistry/sugarCyclization.ts';
import type { DisplayOptions } from '../src/types/chemistry.ts';

const displayOptions: DisplayOptions = {
  uniformAlignment: true,
  showCIP: false,
  colorHeteroatoms: false,
  showCarbonNumbers: false,
  hideNonAtomAnnotations: false,
};

test('draws Fischer side groups horizontally without wedge bonds', () => {
  const molecule = OCL.Molecule.fromSmiles('O=C[C@H](O)[C@@H](O)CO');
  const result = renderProjection('fischer', molecule, displayOptions);
  const svg = result.svg ?? '';
  const bondLines = [...svg.matchAll(/<line\b[^>]*>/g)].map(([line]) => line);

  assert.equal(result.eligible, true);
  assert.ok(
    bondLines.some((line) => {
      const x1 = Number(line.match(/x1="([^"]+)"/)?.[1]);
      const y1 = Number(line.match(/y1="([^"]+)"/)?.[1]);
      const x2 = Number(line.match(/x2="([^"]+)"/)?.[1]);
      const y2 = Number(line.match(/y2="([^"]+)"/)?.[1]);
      return Number.isFinite(x1 + y1 + x2 + y2) && x1 !== x2 && y1 === y2;
    })
  );
  assert.doesNotMatch(svg, /<polygon|stroke-width="1\.6"/);
});

test('uses implicit carbon intersections and a condensed hydroxymethyl end group', () => {
  const molecule = OCL.Molecule.fromSmiles('O=C[C@H](O)CO');
  const result = renderProjection('fischer', molecule, displayOptions);
  const svg = result.svg ?? '';
  const labels = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(([, label]) => label);

  assert.equal(result.eligible, true, result.ineligibleReason);
  assert.equal(labels.filter((label) => label === 'C').length, 0);
  assert.equal(labels.filter((label) => label === 'OH').length, 1);
  assert.equal(labels.filter((label) => label === 'CH2OH').length, 1);
  assert.equal(labels.filter((label) => label === 'O').length, 1);
});

test('draws a complete aldose chain as a classical Fischer cross', () => {
  const molecule = OCL.Molecule.fromSmiles(
    'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO'
  );
  const result = renderProjection('fischer', molecule, displayOptions);
  const svg = result.svg ?? '';
  const bondLines = [...svg.matchAll(/<line\b[^>]*>/g)].map(([line]) => line);
  const labels = [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map(([, label]) => label);
  const horizontalCrossArms = bondLines.filter((line) => {
    const x1 = Number(line.match(/x1="([^"]+)"/)?.[1]);
    const y1 = Number(line.match(/y1="([^"]+)"/)?.[1]);
    const x2 = Number(line.match(/x2="([^"]+)"/)?.[1]);
    const y2 = Number(line.match(/y2="([^"]+)"/)?.[1]);
    return y1 === y2 && (x1 === 0 || x2 === 0);
  });

  assert.equal(result.eligible, true, result.ineligibleReason);
  assert.equal(labels.filter((label) => label === 'C').length, 0);
  assert.equal(labels.filter((label) => label === 'CH2OH').length, 1);
  assert.equal(labels.filter((label) => label === 'OH').length, 4);
  assert.ok(horizontalCrossArms.length >= 8);
});

test('abbreviates an amino-acid NH2 side group', () => {
  const molecule = OCL.Molecule.fromSmiles('C[C@H](N)C(=O)O');
  const result = renderProjection('fischer', molecule, displayOptions);
  const svg = result.svg ?? '';

  assert.equal(result.eligible, true, result.ineligibleReason);
  assert.match(svg, />NH2<\/text>/);
  assert.doesNotMatch(svg, />N<\/text>/);
});

test('condenses terminal hydrocarbon substituents without abbreviating the main chain', () => {
  const molecule = OCL.Molecule.fromSmiles('O=C(O)[C@H](C)CC');
  const result = renderProjection('fischer', molecule, displayOptions);
  const svg = result.svg ?? '';

  assert.equal(result.eligible, true, result.ineligibleReason);
  assert.match(svg, />CH3<\/text>/);
  assert.doesNotMatch(svg, />CH2CH3<\/text>/);
});

test('optionally removes non-atom annotation labels only', () => {
  const svg =
    '<svg><text>abs</text><text>AND</text><text>or</text><text>O</text></svg>';

  assert.equal(
    hideNonAtomAnnotations(svg),
    '<svg><text>O</text></svg>'
  );
});

test('RDKit cyclizes aldose, ketose, deoxy, and amino sugar database forms', async () => {
  const examples = [
    { smiles: 'O=C[C@H](O)[C@@H](O)[C@H](O)[C@H](O)CO', ringSize: 6 },
    { smiles: 'OCC(=O)[C@H](O)[C@@H](O)[C@H](O)CO', ringSize: 5 },
    { smiles: 'O=CC[C@H](O)[C@@H](O)CO', ringSize: 5 },
    { smiles: 'O=C[C@H](N)[C@@H](O)[C@H](O)[C@H](O)CO', ringSize: 6 },
  ] as const;

  for (const example of examples) {
    const products = await cyclizeSugar(example.smiles, example.ringSize);
    assert.ok(products.length > 0, `Expected a ring product for ${example.smiles}`);
    const anomerLabels = new Set<string>();
    const inchiKeys = new Set<string>();
    const sourceFormula = OCL.Molecule.fromSmiles(example.smiles).getMolecularFormula().formula;
    for (const product of products) {
      inchiKeys.add(product.inchiKey);
      const molecule = OCL.Molecule.fromSmiles(product.isomericSmiles);
      const rings = molecule.getRingSet();
      assert.equal(rings.getSize(), 1);
      assert.equal(rings.getRingSize(0), example.ringSize);
      assert.equal(molecule.getMolecularFormula().formula, sourceFormula);
      const rendered = renderProjection('haworth', molecule, displayOptions);
      assert.equal(rendered.eligible, true);
      if (rendered.alignmentNotes?.includes('α-Anomer')) anomerLabels.add('α-Anomer');
      if (rendered.alignmentNotes?.includes('β-Anomer')) anomerLabels.add('β-Anomer');
    }
    assert.equal(inchiKeys.size, 2);
    assert.deepEqual(
      [...anomerLabels].sort(),
      ['α-Anomer', 'β-Anomer'],
      `Expected stereochemical anomer labels for ${example.smiles}`
    );
  }
});

test('renders linked di- and polysaccharides as Haworth projections', () => {
  const examples = [
    {
      name: 'sucrose',
      smiles:
        'OC[C@H]1O[C@@](CO)(O[C@H]2O[C@H](CO)[C@@H](O)[C@H](O)[C@H]2O)[C@@H](O)[C@@H]1O',
      ringCount: 2,
    },
    {
      name: 'lactose',
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@H]1O',
      ringCount: 2,
    },
    {
      name: 'isomaltose',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      name: 'isomaltulose',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)(CO)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      name: 'raffinose',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2O[C@H](O[C@]3(CO)O[C@H](CO)[C@@H](O)[C@@H]3O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@H]1O',
      ringCount: 3,
    },
    {
      name: 'isomaltotriose',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2O[C@H](OC[C@H]3OC(O)[C@H](O)[C@@H](O)[C@@H]3O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 3,
      unspecifiedAnomer: true,
    },
    {
      name: '1-kestose',
      smiles:
        'OC[C@H]1O[C@@](CO)(OC[C@@]2(O[C@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)O[C@H](CO)[C@@H](O)[C@@H]2O)[C@@H](O)[C@@H]1O',
      ringCount: 3,
    },
    {
      name: 'melibiose',
      smiles:
        'OC[C@H]1O[C@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@H]1O',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      name: 'gentiobiose',
      smiles:
        'OC[C@H]1O[C@@H](OC[C@H]2OC(O)[C@H](O)[C@@H](O)[C@@H]2O)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 2,
      unspecifiedAnomer: true,
    },
    {
      name: 'cellotriose',
      smiles:
        'OC[C@H]1O[C@@H](O[C@H]2[C@H](O)[C@@H](O)[C@H](O[C@H]3[C@H](O)[C@@H](O)C(O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 3,
    },
    {
      name: 'maltotriose',
      smiles:
        'OC[C@H]1O[C@H](O[C@H]2[C@H](O)[C@@H](O)[C@@H](O[C@H]3[C@H](O)[C@@H](O)[C@@H](O)O[C@@H]3CO)O[C@@H]2CO)[C@H](O)[C@@H](O)[C@@H]1O',
      ringCount: 3,
    },
    {
      name: 'chitotriose',
      smiles:
        'CC(=O)N[C@@H]1[C@@H](O)[C@H](O[C@@H]2O[C@H](CO)[C@@H](O[C@@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3NC(C)=O)[C@H](O)[C@H]2NC(C)=O)[C@@H](CO)O[C@H]1O',
      ringCount: 3,
    },
  ];

  for (const example of examples) {
    const molecule = OCL.Molecule.fromSmiles(example.smiles);
    const result = renderProjection('haworth', molecule, displayOptions);

    assert.equal(molecule.getRingSet().getSize(), example.ringCount, example.name);
    assert.equal(result.eligible, true, result.ineligibleReason);
    assert.match(result.svg ?? '', /id="mol-haworth-linked"/, example.name);
    assert.match(
      result.alignmentNotes ?? '',
      new RegExp(`${example.ringCount} glycosidisch verknüpften Zucker-Ringen`),
      example.name
    );
    const linkageSegments = [
      ...(result.svg ?? '').matchAll(
        /<line class="glycosidic-link" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g
      ),
    ];
    assert.equal(linkageSegments.length, (example.ringCount - 1) * 2, example.name);
    if (example.name === 'lactose') {
      const linkageLength = linkageSegments.reduce((total, segment) => {
        const [, x1, y1, x2, y2] = segment;
        return (
          total +
          Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1))
        );
      }, 0);
      assert.ok(
        linkageLength < 150,
        `Expected lactose linkage to stay between the adjacent rings, got ${linkageLength}`
      );
    }
    if ('unspecifiedAnomer' in example && example.unspecifiedAnomer) {
      assert.match(result.alignmentNotes ?? '', /Anomer unbekannt/);
      assert.match(result.svg ?? '', /<path\b/);
      assert.match(result.svg ?? '', />OH</);
    }
  }
});

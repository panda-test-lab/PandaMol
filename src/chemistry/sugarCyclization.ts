import initRDKitModule, { type MainModule } from '@rdkit/rdkit';

export type SugarRingSize = 5 | 6;

export interface CyclizedSugarForm {
  isomericSmiles: string;
  inchiKey: string;
}

let rdkitPromise: Promise<MainModule> | undefined;

function getRDKit(): Promise<MainModule> {
  if (!rdkitPromise) {
    const wasmUrl = new URL(
      '../../node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm',
      import.meta.url
    ).href;
    rdkitPromise = initRDKitModule({
      locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path),
    });
  }
  return rdkitPromise;
}

function buildCyclizationSmarts(
  ringSize: SugarRingSize,
  carbonylHydrogens: 0 | 1,
  stereochemistry: '@' | '@@'
): string {
  const chainCarbonCount = ringSize - 2;
  const chainAtoms = Array.from({ length: chainCarbonCount }, (_, index) => {
    const atom = `[C;X4:${index + 3}]`;
    return atom;
  });
  const chainPattern = chainAtoms.join('-');
  const productChain = chainAtoms.join('-');
  const carbonylAtom =
    carbonylHydrogens === 1
      ? `[C${stereochemistry}H:1]`
      : `[C${stereochemistry}:1]`;
  const reactantCarbonyl =
    carbonylHydrogens === 1 ? '[C;H1:1]' : '[C;H0:1]';

  return `${reactantCarbonyl}(=[O:2])-${chainPattern}-[O;H1:${chainCarbonCount + 3}]>>${carbonylAtom}1([O:2])-${productChain}-[O:${chainCarbonCount + 3}]1`;
}

export async function cyclizeSugar(
  isomericSmiles: string,
  ringSize: SugarRingSize
): Promise<CyclizedSugarForm[]> {
  const rdkit = await getRDKit();
  const molecule = rdkit.get_mol(isomericSmiles);
  if (!molecule) {
    throw new Error('RDKit konnte die Datenbank-SMILES nicht einlesen.');
  }

  const products = new Map<string, CyclizedSugarForm>();
  const reactants = new rdkit.MolList();
  reactants.append(molecule);

  try {
    for (const carbonylHydrogens of [1, 0] as const) {
      for (const stereochemistry of ['@', '@@'] as const) {
        const reactionSmarts = buildCyclizationSmarts(
          ringSize,
          carbonylHydrogens,
          stereochemistry
        );
        const reaction = rdkit.get_rxn(reactionSmarts);
        if (!reaction) {
          throw new Error('RDKit konnte die Zucker-Ringbildung nicht vorbereiten.');
        }

        try {
          const productGroups = reaction.run_reactants(reactants, 100);
          try {
            for (let index = 0; index < productGroups.size(); index++) {
              const productGroup = productGroups.get(index);
              if (!productGroup) continue;
              try {
                const product = productGroup.at(0);
                if (!product) continue;
                try {
                  const smiles = product.get_smiles();
                  const inchi = product.get_inchi();
                  const inchiKey = inchi ? rdkit.get_inchikey_for_inchi(inchi) : '';
                  if (smiles && inchiKey) {
                    products.set(smiles, { isomericSmiles: smiles, inchiKey });
                  }
                } finally {
                  product.delete();
                }
              } finally {
                productGroup.delete();
              }
            }
          } finally {
            productGroups.delete();
          }
        } finally {
          reaction.delete();
        }
      }
    }
  } finally {
    reactants.delete();
    molecule.delete();
  }

  return [...products.values()];
}

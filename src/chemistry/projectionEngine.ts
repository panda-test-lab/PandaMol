import * as OCL from 'openchemlib';
import type { DisplayOptions, ProjectionType } from '../types/chemistry.ts';

export interface ProjectionRenderResult {
  eligible: boolean;
  svg?: string;
  titleSuffix?: string;
  alignmentNotes?: string;
  ineligibleReason?: string;
}

const COLOR_O = '#DC2626';
const COLOR_N = '#2563EB';
const COLOR_S = '#D97706';
const COLOR_INK = '#0F172A';
const COLOR_MUTED = '#64748B';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function atomColor(atomicNo: number, colorHeteroatoms: boolean): string {
  if (!colorHeteroatoms) return COLOR_INK;
  if (atomicNo === 8) return COLOR_O;
  if (atomicNo === 7) return COLOR_N;
  if (atomicNo === 16) return COLOR_S;
  if (atomicNo === 9 || atomicNo === 17 || atomicNo === 35 || atomicNo === 53) return '#059669';
  if (atomicNo === 15) return '#EA580C';
  return COLOR_INK;
}

// ============================================================================
// 1. SKELETAL FORMULA ENGINE (with beginner-friendly canonical alignment)
// ============================================================================

function findAlphaAminoAcidCenter(mol: OCL.Molecule): { ca: number; cooh: number; n: number } | null {
  mol.ensureHelperArrays(OCL.Molecule.cHelperNeighbours);
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomicNo(i) !== 6) continue;
    let nAtom = -1;
    let coohAtom = -1;
    for (let j = 0; j < mol.getConnAtoms(i); j++) {
      const nb = mol.getConnAtom(i, j);
      const atomicNo = mol.getAtomicNo(nb);
      if (atomicNo === 7 && mol.getConnAtoms(nb) <= 2) {
        // Primary amine or proline secondary amine
        nAtom = nb;
      } else if (atomicNo === 6) {
        let doubleO = false;
        let singleO = false;
        for (let k = 0; k < mol.getConnAtoms(nb); k++) {
          const ox = mol.getConnAtom(nb, k);
          const b = mol.getConnBond(nb, k);
          if (mol.getAtomicNo(ox) === 8) {
            if (mol.getBondOrder(b) === 2) doubleO = true;
            else if (mol.getConnAtoms(ox) === 1) singleO = true;
          }
        }
        if (doubleO && singleO) coohAtom = nb;
      }
    }
    if (nAtom !== -1 && coohAtom !== -1) {
      return { ca: i, cooh: coohAtom, n: nAtom };
    }
  }
  return null;
}

function rotateMolecule2D(mol: OCL.Molecule, angleRad: number, cx = 0, cy = 0): void {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    const x = mol.getAtomX(i) - cx;
    const y = mol.getAtomY(i) - cy;
    mol.setAtomX(i, cx + x * cosA - y * sinA);
    mol.setAtomY(i, cy + x * sinA + y * cosA);
  }
}

function bondTypeFromOrder(ord: number): number {
  if (ord === 2) return OCL.Molecule.cBondTypeDouble;
  if (ord === 3) return OCL.Molecule.cBondTypeTriple;
  return OCL.Molecule.cBondTypeSingle;
}

function shrinkStart(a: [number, number], b: [number, number], px: number): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  return [a[0] + (dx / len) * px, a[1] + (dy / len) * px];
}

function alignByPrincipalAxisHorizontal(mol: OCL.Molecule): void {
  const n = mol.getAllAtoms();
  if (n < 2) return;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += mol.getAtomX(i);
    my += mol.getAtomY(i);
  }
  mx /= n;
  my /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = mol.getAtomX(i) - mx;
    const dy = mol.getAtomY(i) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  // Principal eigenvector angle
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  rotateMolecule2D(mol, -theta, mx, my);

  // Verify width >= height after rotation
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, mol.getAtomX(i));
    maxX = Math.max(maxX, mol.getAtomX(i));
    minY = Math.min(minY, mol.getAtomY(i));
    maxY = Math.max(maxY, mol.getAtomY(i));
  }
  if (maxY - minY > maxX - minX) {
    rotateMolecule2D(mol, Math.PI / 2, mx, my);
  }
}

function normalizeOclSvg(rawSvg: string, colorHeteroatoms: boolean): string {
  // Ensure clean viewBox, responsive scaling, and crisp typography
  let svg = rawSvg
    .replace(/font-family:\s*sans-serif;/g, "font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif;")
    .replace(/width="[^"]*"/, 'width="100%"')
    .replace(/height="[^"]*"/, 'height="100%"');

  if (!colorHeteroatoms) {
    svg = svg.replace(/fill="rgb\([^)]+\)"/g, `fill="${COLOR_INK}"`);
  }
  return svg;
}

function toSkeletalSvg(mol: OCL.Molecule, options: DisplayOptions): string {
  const rawSvg = mol.toSVG(640, 400, 'mol-skeletal', {
    autoCrop: true,
    autoCropMargin: 28,
    factorTextSize: 1.15,
    strokeWidth: 2,
    fontWeight: '600',
    suppressChiralText: true,
    suppressCIPParity: !options.showCIP,
    noImplicitAtomLabelColors: !options.colorHeteroatoms,
    noColorOnESRAndCIP: !options.colorHeteroatoms,
  });
  return normalizeOclSvg(rawSvg, options.colorHeteroatoms);
}

function renderSkeletalProjection(
  origMol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  const origIdCode = origMol.getIDCode();
  const mol = origMol.getCompactCopy();
  mol.inventCoordinates();
  mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);

  let alignmentNote = 'Standardisierte 2D-Skelettformel.';

  if (options.uniformAlignment) {
    const aa = findAlphaAminoAcidCenter(mol);
    if (aa) {
      const cx = mol.getAtomX(aa.ca);
      const cy = mol.getAtomY(aa.ca);
      const targetAngle = Math.PI / 6; // +30° right-down
      rotateMolecule2D(
        mol,
        targetAngle - Math.atan2(mol.getAtomY(aa.cooh) - cy, mol.getAtomX(aa.cooh) - cx),
        cx,
        cy
      );

      if (mol.getAtomY(aa.n) > mol.getAtomY(aa.ca)) {
        for (let i = 0; i < mol.getAllAtoms(); i++) {
          mol.setAtomY(i, 2 * cy - mol.getAtomY(i));
        }
        for (let b = 0; b < mol.getAllBonds(); b++) {
          const bt = mol.getBondType(b);
          if (bt === OCL.Molecule.cBondTypeUp) mol.setBondType(b, OCL.Molecule.cBondTypeDown);
          else if (bt === OCL.Molecule.cBondTypeDown) mol.setBondType(b, OCL.Molecule.cBondTypeUp);
        }
        rotateMolecule2D(
          mol,
          targetAngle - Math.atan2(mol.getAtomY(aa.cooh) - cy, mol.getAtomX(aa.cooh) - cx),
          cx,
          cy
        );
      }

      const check = OCL.Molecule.fromMolfile(mol.toMolfile());
      check.ensureHelperArrays(OCL.Molecule.cHelperCIP);
      if (check.getIDCode() !== origIdCode) {
        const safe = origMol.getCompactCopy();
        safe.inventCoordinates();
        safe.ensureHelperArrays(OCL.Molecule.cHelperCIP);
        return {
          eligible: true,
          svg: toSkeletalSvg(safe, options),
          titleSuffix: 'Skelettformel',
          alignmentNotes: 'Standard-2D-Darstellung (stereochemisch verifiziert).',
        };
      }

      alignmentNote =
        'Einheitliche Aminosäure-Ausrichtung: α-Aminogruppe oben, Carboxylgruppe rechts, Seitenkette R nach links.';
    } else {
      const backup = mol.getCompactCopy();
      alignByPrincipalAxisHorizontal(mol);
      const check = OCL.Molecule.fromMolfile(mol.toMolfile());
      check.ensureHelperArrays(OCL.Molecule.cHelperCIP);
      if (check.getIDCode() !== origIdCode) {
        for (let i = 0; i < mol.getAllAtoms(); i++) {
          mol.setAtomX(i, backup.getAtomX(i));
          mol.setAtomY(i, backup.getAtomY(i));
        }
      } else {
        alignmentNote = 'Kanonische horizontale Hauptachsen-Ausrichtung für optimale Lernkarten-Lesbarkeit.';
      }
    }
  }

  return {
    eligible: true,
    svg: toSkeletalSvg(mol, options),
    titleSuffix: 'Skelettformel',
    alignmentNotes: alignmentNote,
  };
}

// ============================================================================
// 2. MATHEMATICAL FISCHER PROJECTION ENGINE
// ============================================================================

interface FischerNode {
  atomIdx: number;
  kind: 'head' | 'chiral' | 'ch2' | 'ketone' | 'tail';
  topLabel?: string;
  bottomLabel?: string;
  leftSub?: { label: string; atomicNo: number };
  rightSub?: { label: string; atomicNo: number };
  cipText?: string;
}

function formatSubLabel(mol: OCL.Molecule, atomIdx: number, parentIdx: number, side: 'left' | 'right'): string {
  const atomicNo = mol.getAtomicNo(atomIdx);
  const charge = mol.getAtomCharge(atomIdx);
  const connCount = mol.getConnAtoms(atomIdx);

  if (atomicNo === 8 && connCount === 1) {
    if (charge === -1) return side === 'left' ? '⁻O' : 'O⁻';
    return side === 'left' ? 'HO' : 'OH';
  }
  if (atomicNo === 7 && connCount === 1) {
    if (charge === 1) return side === 'left' ? 'H₃N⁺' : 'NH₃⁺';
    return side === 'left' ? 'H₂N' : 'NH₂';
  }
  if (atomicNo === 16 && connCount === 1) {
    return side === 'left' ? 'HS' : 'SH';
  }
  if (atomicNo === 6 && connCount === 1) {
    return side === 'left' ? 'H₃C' : 'CH₃';
  }
  if (atomicNo === 9 || atomicNo === 17 || atomicNo === 35 || atomicNo === 53) {
    return mol.getAtomLabel(atomIdx);
  }
  // Complex substituent (e.g. -NHAc or -CH2OH branch)
  const subParts: string[] = [];
  for (let j = 0; j < connCount; j++) {
    const nb = mol.getConnAtom(atomIdx, j);
    if (nb !== parentIdx) subParts.push(mol.getAtomLabel(nb));
  }
  const base = mol.getAtomLabel(atomIdx);
  return subParts.length > 0 ? `${base}(${subParts.join('')})` : base;
}

function formatTerminalGroup(mol: OCL.Molecule, atomIdx: number, prevIdx: number): string {
  const atomicNo = mol.getAtomicNo(atomIdx);
  if (atomicNo !== 6) return mol.getAtomLabel(atomIdx);

  let doubleO = 0;
  let singleO = 0;
  let negO = 0;
  let hasN = false;
  let hasS = false;
  const otherC: number[] = [];

  for (let j = 0; j < mol.getConnAtoms(atomIdx); j++) {
    const nb = mol.getConnAtom(atomIdx, j);
    if (nb === prevIdx) continue;
    const b = mol.getConnBond(atomIdx, j);
    const an = mol.getAtomicNo(nb);
    if (an === 8) {
      if (mol.getBondOrder(b) === 2) doubleO++;
      else if (mol.getAtomCharge(nb) === -1) negO++;
      else singleO++;
    } else if (an === 7) {
      hasN = true;
    } else if (an === 16) {
      hasS = true;
    } else if (an === 6) {
      otherC.push(nb);
    }
  }

  if (doubleO === 1 && negO === 1) return 'COO⁻';
  if (doubleO === 1 && singleO === 1) return 'COOH';
  if (doubleO === 1 && singleO === 0 && otherC.length === 0) return 'CHO';
  if (singleO === 1 && otherC.length === 0) return 'CH₂OH';
  if (hasS && otherC.length === 0) return 'CH₂SH';
  if (hasN && otherC.length === 0) return 'CH₂NH₂';
  if (otherC.length === 0 && mol.getConnAtoms(atomIdx) === 1) return 'CH₃';

  // Walk remaining linear alkyl / substituent chain for bottom R group of amino acids
  if (otherC.length > 0) {
    // Describe compactly using subgraph SMILES/formula
    const visited = new Set<number>([prevIdx, atomIdx]);
    const queue = [...otherC];
    let cCount = 1;
    let hasRing = false;
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      if (mol.getAtomicNo(cur) === 6) cCount++;
      if (mol.isRingAtom(cur)) hasRing = true;
      for (let j = 0; j < mol.getConnAtoms(cur); j++) {
        const nb = mol.getConnAtom(cur, j);
        if (!visited.has(nb)) queue.push(nb);
      }
    }
    if (hasRing) return 'R (Ringrest)';
    if (cCount === 2 && !hasN && !hasS && singleO === 0 && doubleO === 0) return 'CH₂CH₃';
  }

  // Fallback: compute implicit H count
  const h = mol.getImplicitHydrogens(atomIdx);
  return `C${h > 1 ? `H${h}` : h === 1 ? 'H' : ''}`;
}

function getOxidationPriority(mol: OCL.Molecule, atomIdx: number): number {
  let doubleO = 0;
  let singleO = 0;
  let hasN = 0;
  for (let j = 0; j < mol.getConnAtoms(atomIdx); j++) {
    const nb = mol.getConnAtom(atomIdx, j);
    const b = mol.getConnBond(atomIdx, j);
    const an = mol.getAtomicNo(nb);
    if (an === 8) {
      if (mol.getBondOrder(b) === 2) doubleO++;
      else singleO++;
    } else if (an === 7) {
      hasN++;
    }
  }
  if (doubleO >= 1 && singleO >= 1) return 100; // COOH
  if (doubleO >= 1) return 80; // CHO / C=O
  if (singleO >= 1) return 40; // CH2OH
  if (hasN >= 1) return 30;
  return 10;
}

function findFischerChain(mol: OCL.Molecule): number[] | null {
  // Find longest carbon chain starting at highest-oxidation terminal or C1
  const carbons: number[] = [];
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomicNo(i) === 6) carbons.push(i);
  }
  if (carbons.length < 3) return null;

  // Score candidate carbon chains via DFS from each terminal carbon (carbon with <= 1 carbon neighbor)
  const terminals = carbons.filter((c) => {
    let cNb = 0;
    for (let j = 0; j < mol.getConnAtoms(c); j++) {
      if (mol.getAtomicNo(mol.getConnAtom(c, j)) === 6) cNb++;
    }
    return cNb <= 1;
  });

  let bestChain: number[] = [];
  let bestScore = -1;

  function dfs(cur: number, visited: Set<number>, path: number[]) {
    let extended = false;
    for (let j = 0; j < mol.getConnAtoms(cur); j++) {
      const nb = mol.getConnAtom(cur, j);
      if (mol.getAtomicNo(nb) === 6 && !visited.has(nb)) {
        extended = true;
        visited.add(nb);
        path.push(nb);
        dfs(nb, visited, path);
        path.pop();
        visited.delete(nb);
      }
    }
    if (!extended && path.length >= 3) {
      const startOx = getOxidationPriority(mol, path[0]);
      const endOx = getOxidationPriority(mol, path[path.length - 1]);
      // Check if C2 is a ketone (for ketoses like Fructose)
      const c2Ox = path.length >= 3 ? getOxidationPriority(mol, path[1]) : 0;
      let chiralCount = 0;
      for (let k = 1; k < path.length - 1; k++) {
        if (mol.getAtomCIPParity(path[k]) > 0) chiralCount++;
      }
      const score = startOx * 10 + c2Ox * 3 + chiralCount * 20 + path.length - endOx * 0.5;
      if (score > bestScore) {
        bestScore = score;
        bestChain = [...path];
      }
    }
  }

  for (const t of terminals) {
    dfs(t, new Set([t]), [t]);
  }

  return bestChain.length >= 3 ? bestChain : null;
}

function subVec(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function crossVec(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dotVec(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function isSubstituentRightInFischer(
  mol: OCL.Molecule,
  centerAtom: number,
  topAtom: number,
  bottomAtom: number,
  subAtom: number
): boolean | null {
  let bIdx = -1;
  for (let b = 0; b < mol.getAllBonds(); b++) {
    const a0 = mol.getBondAtom(0, b);
    const a1 = mol.getBondAtom(1, b);
    if ((a0 === centerAtom && a1 === subAtom) || (a1 === centerAtom && a0 === subAtom)) {
      bIdx = b;
      break;
    }
  }
  if (bIdx === -1) return null;

  const bt = mol.getBondType(bIdx);
  const dir = mol.getBondAtom(0, bIdx) === centerAtom ? 1 : -1;
  const z = (bt === OCL.Molecule.cBondTypeUp ? 1 : bt === OCL.Molecule.cBondTypeDown ? -1 : 0) * dir;
  if (z === 0) return null;

  const pt = (idx: number) => [mol.getAtomX(idx), -mol.getAtomY(idx), 0];
  const centerPt = pt(centerAtom);
  const vTop = subVec(pt(topAtom), centerPt);
  const vBot = subVec(pt(bottomAtom), centerPt);
  const vSub = subVec([mol.getAtomX(subAtom), -mol.getAtomY(subAtom), z], centerPt);
  const vH = [-(vTop[0] + vBot[0] + vSub[0]), -(vTop[1] + vBot[1] + vSub[1]), -z];
  const det = dotVec(crossVec(subVec(vTop, vH), subVec(vBot, vH)), subVec(vSub, vH));
  return det < 0;
}

function renderFischerProjection(
  origMol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  const mol = origMol.getCompactCopy();
  mol.inventCoordinates();
  mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);

  if (mol.getRingSet().getSize() > 0) {
    return {
      eligible: false,
      ineligibleReason:
        'Für zyklische Verbindungen (z. B. Pyranosen/Furanosen oder Aromaten) ist die Fischer-Projektion nicht vorgesehen. Für Zucker bitte „offenkettig“ wählen oder Haworth/Sessel nutzen.',
    };
  }

  let chiralCenters = 0;
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomCIPParity(i) > 0) chiralCenters++;
  }
  if (chiralCenters === 0) {
    return {
      eligible: false,
      ineligibleReason:
        'Diese Struktur besitzt kein Chiralitätszentrum (achiral). Eine Fischer-Projektion zur Darstellung von D/L-Stereochemie ist daher nicht sinnvoll.',
    };
  }

  const aa = findAlphaAminoAcidCenter(mol);
  const nodes: FischerNode[] = [];

  if (aa) {
    let rAtom = -1;
    for (let j = 0; j < mol.getConnAtoms(aa.ca); j++) {
      const nb = mol.getConnAtom(aa.ca, j);
      if (nb !== aa.cooh && nb !== aa.n) rAtom = nb;
    }
    if (rAtom === -1) {
      return { eligible: false, ineligibleReason: 'Seitenkette R für Fischer-Projektion nicht identifizierbar.' };
    }

    const isRight = isSubstituentRightInFischer(mol, aa.ca, aa.cooh, rAtom, aa.n);
    if (isRight === null) {
      return { eligible: false, ineligibleReason: 'Stereokonfiguration der Aminosäure konnte nicht eindeutig aufgelöst werden.' };
    }

    const nLabelLeft = formatSubLabel(mol, aa.n, aa.ca, 'left');
    const nLabelRight = formatSubLabel(mol, aa.n, aa.ca, 'right');

    const cip = mol.getAtomCIPParity(aa.ca);
    const cipText = cip === OCL.Molecule.cAtomCIPParityRorM ? '(R)' : cip === OCL.Molecule.cAtomCIPParitySorP ? '(S)' : undefined;

    nodes.push({ atomIdx: aa.cooh, kind: 'head', topLabel: formatTerminalGroup(mol, aa.cooh, aa.ca) });
    nodes.push({
      atomIdx: aa.ca,
      kind: 'chiral',
      leftSub: isRight ? { label: 'H', atomicNo: 1 } : { label: nLabelLeft, atomicNo: 7 },
      rightSub: isRight ? { label: nLabelRight, atomicNo: 7 } : { label: 'H', atomicNo: 1 },
      cipText,
    });
    let bottomLabel = formatTerminalGroup(mol, rAtom, aa.ca);
    if (bottomLabel === 'C' || bottomLabel === 'CH' || bottomLabel === 'CH2') {
      const branchMol = new OCL.Molecule(20, 20);
      const map = new Map<number, number>();
      const queue = [rAtom];
      const visited = new Set<number>([aa.ca, rAtom]);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const na = branchMol.addAtom(mol.getAtomicNo(cur));
        branchMol.setAtomCharge(na, mol.getAtomCharge(cur));
        map.set(cur, na);
        for (let j = 0; j < mol.getConnAtoms(cur); j++) {
          const nb = mol.getConnAtom(cur, j);
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          } else if (nb !== aa.ca && map.has(nb)) {
            const newBond = branchMol.addBond(na, map.get(nb)!);
            branchMol.setBondType(newBond, bondTypeFromOrder(mol.getBondOrder(mol.getConnBond(cur, j))));
          }
        }
      }
      const f = branchMol.getMolecularFormula().formula;
      const rMap: Record<string, string> = {
        CH4: 'CH₃',
        CH4O: 'CH₂OH',
        CH4S: 'CH₂SH',
        C2H6O: 'CH(OH)CH₃',
        C3H8: 'CH(CH₃)₂',
        C4H10: 'CH₂CH(CH₃)₂',
        C2H4O2: 'CH₂COOH',
        C3H6O2: 'CH₂CH₂COOH',
        C2H5NO: 'CH₂CONH₂',
        C3H7NO: 'CH₂CH₂CONH₂',
        C3H8S: 'CH₂CH₂SCH₃',
        C4H11N: '(CH₂)₄NH₂',
        C7H8: 'CH₂C₆H₅',
        C7H8O: 'CH₂C₆H₄OH',
        C4H5N3: 'CH₂-Imidazolyl',
        C9H9N: 'CH₂-Indolyl',
        C4H12N3: '(CH₂)₃NHC(=NH)NH₂',
      };
      bottomLabel = rMap[f] || `R (${f})`;
    }
    nodes.push({ atomIdx: rAtom, kind: 'tail', bottomLabel });
  } else {
    const chain = findFischerChain(mol);
    if (!chain) {
      return {
        eligible: false,
        ineligibleReason: 'Keine eindeutige acyclische Kohlenstoff-Hauptkette für eine Fischer-Projektion gefunden.',
      };
    }

    nodes.push({
      atomIdx: chain[0],
      kind: 'head',
      topLabel: formatTerminalGroup(mol, chain[0], chain[1]),
    });

    for (let k = 1; k < chain.length - 1; k++) {
      const ck = chain[k];
      const top = chain[k - 1];
      const bot = chain[k + 1];

      let ketoneO = -1;
      const nonChainSubs: number[] = [];
      for (let j = 0; j < mol.getConnAtoms(ck); j++) {
        const nb = mol.getConnAtom(ck, j);
        if (nb === top || nb === bot) continue;
        if (mol.getAtomicNo(nb) === 8 && mol.getBondOrder(mol.getConnBond(ck, j)) === 2) {
          ketoneO = nb;
        } else {
          nonChainSubs.push(nb);
        }
      }

      if (ketoneO !== -1) {
        nodes.push({ atomIdx: ck, kind: 'ketone' });
        continue;
      }

      if (nonChainSubs.length === 0) {
        nodes.push({
          atomIdx: ck,
          kind: 'ch2',
          leftSub: { label: 'H', atomicNo: 1 },
          rightSub: { label: 'H', atomicNo: 1 },
        });
        continue;
      }

      const s = nonChainSubs[0];
      const isRight = isSubstituentRightInFischer(mol, ck, top, bot, s);
      if (isRight === null) {
        return {
          eligible: false,
          ineligibleReason:
            'Mindestens ein Stereozentrum entlang der Hauptkette besitzt keine eindeutige Stereo-Konfiguration.',
        };
      }

      const sAn = mol.getAtomicNo(s);
      const cip = mol.getAtomCIPParity(ck);
      const cipText =
        cip === OCL.Molecule.cAtomCIPParityRorM
          ? '(R)'
          : cip === OCL.Molecule.cAtomCIPParitySorP
            ? '(S)'
            : undefined;

      nodes.push({
        atomIdx: ck,
        kind: 'chiral',
        leftSub: isRight
          ? { label: 'H', atomicNo: 1 }
          : { label: formatSubLabel(mol, s, ck, 'left'), atomicNo: sAn },
        rightSub: isRight
          ? { label: formatSubLabel(mol, s, ck, 'right'), atomicNo: sAn }
          : { label: 'H', atomicNo: 1 },
        cipText,
      });
    }

    nodes.push({
      atomIdx: chain[chain.length - 1],
      kind: 'tail',
      bottomLabel: formatTerminalGroup(mol, chain[chain.length - 1], chain[chain.length - 2]),
    });
  }

  // Render crisp SVG Fischer projection
  const stepY = 58;
  const cx = 220;
  const topY = 58;
  const totalH = topY + (nodes.length - 1) * stepY + 62;
  const width = 440;
  const armLen = 58;

  const els: string[] = [];

  // Vertical backbone line from C1 down to Cn
  const lastY = topY + (nodes.length - 1) * stepY;
  els.push(
    `<line x1="${cx}" y1="${topY + 14}" x2="${cx}" y2="${lastY - 14}" stroke="${COLOR_INK}" stroke-width="2.2" stroke-linecap="round" />`
  );

  nodes.forEach((node, idx) => {
    const y = topY + idx * stepY;

    if (node.kind === 'head') {
      const label = node.topLabel || 'CHO';
      if (label === 'CHO') {
        // Classic textbook CHO head with C, =O right-up, H left-up
        els.push(
          `<text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="600" fill="${COLOR_INK}">C</text>`
        );
        els.push(
          `<line x1="${cx - 10}" y1="${y - 4}" x2="${cx - 28}" y2="${y - 16}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
        );
        els.push(
          `<text x="${cx - 35}" y="${y - 14}" text-anchor="end" font-size="15" font-weight="600" fill="${COLOR_INK}">H</text>`
        );
        els.push(
          `<line x1="${cx + 9}" y1="${y - 6}" x2="${cx + 27}" y2="${y - 18}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
        );
        els.push(
          `<line x1="${cx + 12}" y1="${y - 1}" x2="${cx + 30}" y2="${y - 13}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
        );
        els.push(
          `<text x="${cx + 35}" y="${y - 14}" text-anchor="start" font-size="15" font-weight="600" fill="${atomColor(8, options.colorHeteroatoms)}">O</text>`
        );
      } else {
        els.push(
          `<text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="16" font-weight="600" fill="${COLOR_INK}">${escapeXml(label)}</text>`
        );
      }
    } else if (node.kind === 'tail') {
      els.push(
        `<text x="${cx}" y="${y + 6}" text-anchor="middle" font-size="16" font-weight="600" fill="${COLOR_INK}">${escapeXml(node.bottomLabel || 'CH₂OH')}</text>`
      );
    } else if (node.kind === 'ketone') {
      // C=O horizontal double bond to the right
      els.push(
        `<text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="600" fill="${COLOR_INK}">C</text>`
      );
      els.push(
        `<line x1="${cx + 10}" y1="${y - 3}" x2="${cx + 46}" y2="${y - 3}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
      );
      els.push(
        `<line x1="${cx + 10}" y1="${y + 3}" x2="${cx + 46}" y2="${y + 3}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
      );
      els.push(
        `<text x="${cx + 53}" y="${y + 5}" text-anchor="start" font-size="16" font-weight="600" fill="${atomColor(8, options.colorHeteroatoms)}">O</text>`
      );
    } else {
      // Chiral or CH2 crosshair
      els.push(
        `<line x1="${cx - armLen}" y1="${y}" x2="${cx + armLen}" y2="${y}" stroke="${COLOR_INK}" stroke-width="2.2" stroke-linecap="round" />`
      );
      if (node.leftSub) {
        els.push(
          `<text x="${cx - armLen - 7}" y="${y + 5}" text-anchor="end" font-size="16" font-weight="600" fill="${atomColor(node.leftSub.atomicNo, options.colorHeteroatoms)}">${escapeXml(node.leftSub.label)}</text>`
        );
      }
      if (node.rightSub) {
        els.push(
          `<text x="${cx + armLen + 7}" y="${y + 5}" text-anchor="start" font-size="16" font-weight="600" fill="${atomColor(node.rightSub.atomicNo, options.colorHeteroatoms)}">${escapeXml(node.rightSub.label)}</text>`
        );
      }
      if (options.showCIP && node.cipText) {
        els.push(
          `<text x="${cx + armLen + 52}" y="${y + 4}" text-anchor="start" font-size="12" font-family="'IBM Plex Mono', monospace" font-weight="500" fill="${COLOR_MUTED}">${node.cipText}</text>`
        );
      }
    }

    if (options.showCarbonNumbers) {
      els.push(
        `<text x="${cx - armLen - 54}" y="${y + 4}" text-anchor="end" font-size="11" font-family="'IBM Plex Mono', monospace" fill="${COLOR_MUTED}">C${idx + 1}</text>`
      );
    }
  });

  const svg = `<svg id="mol-fischer" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalH}" width="100%" height="100%">
  <style>text { font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif; }</style>
  ${els.join('\n  ')}
</svg>`;

  return {
    eligible: true,
    svg,
    titleSuffix: 'Fischer-Projektion',
    alignmentNotes: aa
      ? 'Klassische Fischer-Projektion: Carboxylgruppe (C1) oben, Seitenkette R unten; Aminogruppe bei L-Form links.'
      : 'Klassische Fischer-Projektion: höchstoxidiertes Ende (C1) oben, vertikale Bindungen nach hinten, horizontale nach vorn.',
  };
}

// ============================================================================
// 3. MATHEMATICAL HAWORTH & SESSEL (CHAIR) ENGINE via IDCode Parity Solver
// ============================================================================

interface RingSub {
  atomIdx: number;
  label: string;
  atomicNo: number;
  direction: 'UP' | 'DOWN';
  isAnomericOH?: boolean;
  isCH2OH?: boolean;
}

interface SolvedSugarRing {
  ringSize: 5 | 6;
  oRingIdx: number;
  /** Clockwise starting at O_ring -> C_anom -> ... -> C_last */
  ringAtoms: number[];
  /** Substituents per ring carbon (index 1..ringSize-1 in ringAtoms) */
  subsByPos: Map<number, RingSub[]>;
  anomerLabel: 'α' | 'β' | null;
  seriesDL: 'D' | 'L' | null;
}

function formatRingSubLabel(mol: OCL.Molecule, subAtom: number, ringCarbon: number): { label: string; atomicNo: number; isCH2OH: boolean } {
  const an = mol.getAtomicNo(subAtom);
  const conn = mol.getConnAtoms(subAtom);
  if (an === 8 && conn === 1) {
    return { label: 'OH', atomicNo: 8, isCH2OH: false };
  }
  if (an === 7 && conn === 1) {
    return { label: 'NH₂', atomicNo: 7, isCH2OH: false };
  }
  if (an === 6) {
    let hasO = false;
    let doubleO = 0;
    let singleO = 0;
    let childC = -1;
    for (let j = 0; j < conn; j++) {
      const nb = mol.getConnAtom(subAtom, j);
      if (nb === ringCarbon) continue;
      if (mol.getAtomicNo(nb) === 8) {
        hasO = true;
        if (mol.getBondOrder(mol.getConnBond(subAtom, j)) === 2) doubleO++;
        else singleO++;
      } else if (mol.getAtomicNo(nb) === 6) {
        childC = nb;
      }
    }
    if (doubleO === 1 && singleO === 1) return { label: 'COOH', atomicNo: 6, isCH2OH: false };
    if (hasO && conn === 2 && childC === -1) return { label: 'CH₂OH', atomicNo: 6, isCH2OH: true };
    if (hasO && singleO === 1 && childC !== -1 && conn === 3) {
      // Check if childC is CH2OH -> hexofuranose C5-C6 sidechain: -CH(OH)CH2OH
      let childHasO = false;
      for (let k = 0; k < mol.getConnAtoms(childC); k++) {
        const cnb = mol.getConnAtom(childC, k);
        if (cnb !== subAtom && mol.getAtomicNo(cnb) === 8) childHasO = true;
      }
      if (childHasO) return { label: 'CH(OH)CH₂OH', atomicNo: 6, isCH2OH: true };
    }
    if (conn === 1) return { label: 'CH₃', atomicNo: 6, isCH2OH: false };
  }
  if (an === 7) {
    return { label: 'NHAc', atomicNo: 7, isCH2OH: false };
  }
  return { label: mol.getAtomLabel(subAtom), atomicNo: an, isCH2OH: false };
}

function solveCarbohydrateRing(origMol: OCL.Molecule): SolvedSugarRing | { error: string } {
  const mol = origMol.getCompactCopy();
  mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);

  const ringSet = mol.getRingSet();
  if (ringSet.getSize() === 0) {
    return {
      error:
        'Diese Struktur liegt offenkettig vor und besitzt keinen Pyranose- oder Furanose-Ring für eine Haworth-/Sessel-Projektion.',
    };
  }
  if (ringSet.getSize() > 1) {
    return {
      error:
        'Mehrringsysteme oder Disaccharide werden zur Vermeidung von Überlappungen als Skelettformel ausgegeben. Für Haworth/Sessel bitte das einzelne Monosaccharid abfragen.',
    };
  }

  const ringSize = ringSet.getRingSize(0);
  if (ringSize !== 5 && ringSize !== 6) {
    return {
      error: `Der ${ringSize}-gliedrige Ring ist keine Pyranose (6) oder Furanose (5).`,
    };
  }

  const rawRingAtoms = ringSet.getRingAtoms(0);
  // Must have exactly 1 oxygen atom and (ringSize - 1) sp3 carbons
  const oxygens = rawRingAtoms.filter((a) => mol.getAtomicNo(a) === 8);
  const carbons = rawRingAtoms.filter((a) => mol.getAtomicNo(a) === 6);
  if (oxygens.length !== 1 || carbons.length !== ringSize - 1) {
    return {
      error:
        'Der Ring entspricht keinem klassischen Halbacetal-Monosaccharid (1 Ringsauerstoff + 4 bzw. 5 Ringkohlenstoffe).',
    };
  }

  const oRingIdx = oxygens[0];
  // Find the two carbons bonded to oRingIdx; identify anomeric carbon (bonded to exocyclic O or N)
  const adjToO: number[] = [];
  for (let j = 0; j < mol.getConnAtoms(oRingIdx); j++) {
    adjToO.push(mol.getConnAtom(oRingIdx, j));
  }

  const isAnomeric = (c: number) => {
    for (let j = 0; j < mol.getConnAtoms(c); j++) {
      const nb = mol.getConnAtom(c, j);
      if (nb !== oRingIdx && !rawRingAtoms.includes(nb)) {
        const an = mol.getAtomicNo(nb);
        if (an === 8 || an === 7) return true;
      }
    }
    return false;
  };

  let cAnom = adjToO.find(isAnomeric);
  if (cAnom === undefined) {
    // Fallback: carbon with fewer exocyclic carbon substituents (or higher atomic neighbors)
    cAnom = adjToO[0];
  }

  // Order ring atoms clockwise: [O_ring, C_anom, C_next1, ..., C_last]
  const orderedRing = [oRingIdx, cAnom];
  let prev = oRingIdx;
  let cur = cAnom;
  while (orderedRing.length < ringSize) {
    let next = -1;
    for (let j = 0; j < mol.getConnAtoms(cur); j++) {
      const nb = mol.getConnAtom(cur, j);
      if (nb !== prev && rawRingAtoms.includes(nb)) {
        next = nb;
        break;
      }
    }
    if (next === -1) break;
    orderedRing.push(next);
    prev = cur;
    cur = next;
  }

  if (orderedRing.length !== ringSize) {
    return { error: 'Ringtopologie konnte nicht eindeutig aufgelöst werden.' };
  }

  // Build flat clockwise ring in a test OCL.Molecule and solve exact UP/DOWN via IDCode identity!
  const testBase = new OCL.Molecule(mol.getAllAtoms() + 2, mol.getAllBonds() + 2);
  const atomMap = new Map<number, number>();
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    const na = testBase.addAtom(mol.getAtomicNo(i));
    testBase.setAtomCharge(na, mol.getAtomCharge(i));
    atomMap.set(i, na);
  }
  for (let b = 0; b < mol.getAllBonds(); b++) {
    const a1 = atomMap.get(mol.getBondAtom(0, b))!;
    const a2 = atomMap.get(mol.getBondAtom(1, b))!;
    const newBond = testBase.addBond(a1, a2);
    testBase.setBondType(newBond, bondTypeFromOrder(mol.getBondOrder(b)));
  }

  // Place orderedRing clockwise in 2D screen coords (y increases downward):
  // Pyranose (6): O_ring at top-right, C1 right, C2 bottom-right, C3 bottom-left, C4 left, C5 top-left
  // Furanose (5): O_ring at top-center, C1 right, C2 bottom-right, C3 bottom-left, C4 left
  const ringCoords6: Array<[number, number]> = [
    [0.8, -0.8], // O_ring
    [1.4, 0.0], // C1 (anom)
    [0.8, 0.8], // C2
    [-0.8, 0.8], // C3
    [-1.4, 0.0], // C4
    [-0.8, -0.8], // C5
  ];
  const ringCoords5: Array<[number, number]> = [
    [0.0, -1.0], // O_ring
    [1.2, -0.1], // C1 (anom)
    [0.8, 0.9], // C2
    [-0.8, 0.9], // C3
    [-1.2, -0.1], // C4
  ];
  const coords = ringSize === 6 ? ringCoords6 : ringCoords5;

  orderedRing.forEach((origAtom, pos) => {
    const mapped = atomMap.get(origAtom)!;
    testBase.setAtomX(mapped, coords[pos][0]);
    testBase.setAtomY(mapped, coords[pos][1]);
  });

  // Position exocyclic substituents radially outward and record stereo decision variables
  interface StereoVar {
    ringPos: number;
    origCarbon: number;
    subs: number[]; // length 1 (1 non-H sub) or 2 (2 non-H subs, e.g. ketose C2!)
    bondIndices: number[];
  }
  const stereoVars: StereoVar[] = [];
  const exoChiralBonds: number[] = [];

  for (let pos = 1; pos < ringSize; pos++) {
    const origC = orderedRing[pos];
    const [cx, cy] = coords[pos];
    const exocyclic: number[] = [];
    for (let j = 0; j < mol.getConnAtoms(origC); j++) {
      const nb = mol.getConnAtom(origC, j);
      if (!rawRingAtoms.includes(nb)) exocyclic.push(nb);
    }

    if (exocyclic.length === 0) continue; // e.g., CH2 in 2-deoxy sugar

    // Place exocyclic subtrees roughly outward radially
    const radialLen = Math.hypot(cx, cy) || 1;
    const ux = cx / radialLen;
    const uy = cy / radialLen;

    const bondIndices: number[] = [];
    exocyclic.forEach((subRoot, sIdx) => {
      const mSub = atomMap.get(subRoot)!;
      const mC = atomMap.get(origC)!;
      const offsetAngle = sIdx === 0 ? 0.25 : -0.25;
      const rx = ux * Math.cos(offsetAngle) - uy * Math.sin(offsetAngle);
      const ry = ux * Math.sin(offsetAngle) + uy * Math.cos(offsetAngle);
      testBase.setAtomX(mSub, cx + rx * 0.9);
      testBase.setAtomY(mSub, cy + ry * 0.9);

      // Find bond between mC and mSub in testBase
      for (let b = 0; b < testBase.getAllBonds(); b++) {
        const ba0 = testBase.getBondAtom(0, b);
        const ba1 = testBase.getBondAtom(1, b);
        if ((ba0 === mC && ba1 === mSub) || (ba1 === mC && ba0 === mSub)) {
          if (ba0 !== mC) {
            testBase.setBondAtom(0, b, mC);
            testBase.setBondAtom(1, b, mSub);
          }
          bondIndices.push(b);
          break;
        }
      }

      // Place remaining atoms of this substituent subtree deterministically outward
      // and track any exocyclic stereocenters (like C5 in D-Glucofuranose!)
      const visited = new Set<number>([origC, subRoot]);
      const queue: Array<{ orig: number; parentOrig: number; px: number; py: number; dirX: number; dirY: number }> = [
        { orig: subRoot, parentOrig: origC, px: cx + rx * 0.9, py: cy + ry * 0.9, dirX: rx, dirY: ry },
      ];
      while (queue.length > 0) {
        const { orig, parentOrig, px, py, dirX, dirY } = queue.shift()!;
        const children: number[] = [];
        for (let j = 0; j < mol.getConnAtoms(orig); j++) {
          const nb = mol.getConnAtom(orig, j);
          if (!visited.has(nb) && !rawRingAtoms.includes(nb)) children.push(nb);
        }

        let exoStereoBondAssigned = false;
        children.forEach((nb, cIdx) => {
          visited.add(nb);
          const mOrig = atomMap.get(orig)!;
          const mNb = atomMap.get(nb)!;
          // Angle each child distinctly so no 3 bonds are collinear
          const angle = children.length === 1 ? 0.45 : (cIdx === 0 ? -0.75 : 0.75);
          const nx = dirX * Math.cos(angle) - dirY * Math.sin(angle);
          const ny = dirX * Math.sin(angle) + dirY * Math.cos(angle);
          const cxChild = px + nx * 0.9;
          const cyChild = py + ny * 0.9;
          testBase.setAtomX(mNb, cxChild);
          testBase.setAtomY(mNb, cyChild);

          if (!exoStereoBondAssigned && mol.getAtomCIPParity(orig) > 0 && parentOrig !== -1) {
            for (let b = 0; b < testBase.getAllBonds(); b++) {
              const ba0 = testBase.getBondAtom(0, b);
              const ba1 = testBase.getBondAtom(1, b);
              if ((ba0 === mOrig && ba1 === mNb) || (ba1 === mOrig && ba0 === mNb)) {
                if (ba0 !== mOrig) {
                  testBase.setBondAtom(0, b, mOrig);
                  testBase.setBondAtom(1, b, mNb);
                }
                exoChiralBonds.push(b);
                exoStereoBondAssigned = true;
                break;
              }
            }
          }

          queue.push({ orig: nb, parentOrig: orig, px: cxChild, py: cyChild, dirX: nx, dirY: ny });
        });
      }
    });

    if (mol.getAtomCIPParity(origC) > 0 || exocyclic.length === 2) {
      stereoVars.push({
        ringPos: pos,
        origCarbon: origC,
        subs: exocyclic,
        bondIndices,
      });
    }
  }

  const targetIdCode = origMol.getIDCode();
  const totalBits = stereoVars.length + exoChiralBonds.length;
  if (totalBits > 10) {
    return {
      error: 'Zu viele exozyklische Stereozentren für eindeutige Haworth-/Sessel-Projektion.',
    };
  }
  const totalCombos = 1 << totalBits;
  let winningMask = -1;
  let matchCount = 0;

  for (let mask = 0; mask < totalCombos; mask++) {
    const candidate = testBase.getCompactCopy();
    for (let k = 0; k < stereoVars.length; k++) {
      const isUp = !!(mask & (1 << k));
      const sv = stereoVars[k];
      if (sv.subs.length === 1) {
        candidate.setBondType(
          sv.bondIndices[0],
          isUp ? OCL.Molecule.cBondTypeUp : OCL.Molecule.cBondTypeDown
        );
      } else if (sv.subs.length === 2) {
        candidate.setBondType(
          sv.bondIndices[0],
          isUp ? OCL.Molecule.cBondTypeUp : OCL.Molecule.cBondTypeDown
        );
        candidate.setBondType(
          sv.bondIndices[1],
          isUp ? OCL.Molecule.cBondTypeDown : OCL.Molecule.cBondTypeUp
        );
      }
    }
    for (let e = 0; e < exoChiralBonds.length; e++) {
      const isUp = !!(mask & (1 << (stereoVars.length + e)));
      candidate.setBondType(
        exoChiralBonds[e],
        isUp ? OCL.Molecule.cBondTypeUp : OCL.Molecule.cBondTypeDown
      );
    }
    const reparsed = OCL.Molecule.fromMolfile(candidate.toMolfile());
    reparsed.ensureHelperArrays(OCL.Molecule.cHelperCIP);
    if (reparsed.getIDCode() === targetIdCode) {
      winningMask = mask;
      matchCount++;
    }
  }

  if (matchCount === 0 || winningMask === -1) {
    return {
      error:
        'Stereochemie des Rings konnte nicht eindeutig für Haworth/Sessel verifiziert werden (unbekanntes/nicht-standardisiertes Ringsystem).',
    };
  }

  const subsByPos = new Map<number, RingSub[]>();
  stereoVars.forEach((sv, k) => {
    const isUp = !!(winningMask & (1 << k));
    const list: RingSub[] = [];
    sv.subs.forEach((subAtom, sIdx) => {
      const dir: 'UP' | 'DOWN' = sIdx === 0 ? (isUp ? 'UP' : 'DOWN') : isUp ? 'DOWN' : 'UP';
      const formatted = formatRingSubLabel(mol, subAtom, sv.origCarbon);
      list.push({
        atomIdx: subAtom,
        label: formatted.label,
        atomicNo: formatted.atomicNo,
        direction: dir,
        isAnomericOH: sv.ringPos === 1 && formatted.atomicNo === 8,
        isCH2OH: formatted.isCH2OH,
      });
    });
    subsByPos.set(sv.ringPos, list);
  });

  // Also include achiral CH2 positions (2-deoxy sugars) so we know they have H/H
  for (let pos = 1; pos < ringSize; pos++) {
    if (!subsByPos.has(pos)) {
      subsByPos.set(pos, [
        { atomIdx: -1, label: 'H', atomicNo: 1, direction: 'UP' },
        { atomIdx: -2, label: 'H', atomicNo: 1, direction: 'DOWN' },
      ]);
    }
  }

  // Determine D/L and alpha/beta from last carbon (C5 in pyranose, C4 in furanose)
  const lastSubs = subsByPos.get(ringSize - 1) || [];
  const ch2ohSub = lastSubs.find((s) => s.isCH2OH || s.label === 'CH₃' || s.label === 'COOH');
  const seriesDL: 'D' | 'L' | null = ch2ohSub ? (ch2ohSub.direction === 'UP' ? 'D' : 'L') : null;

  const anomSubs = subsByPos.get(1) || [];
  const anomOH = anomSubs.find((s) => s.isAnomericOH);
  let anomerLabel: 'α' | 'β' | null = null;
  if (anomOH && seriesDL) {
    // alpha = trans to C5/C4 CH2OH (D: OH DOWN; L: OH UP); beta = cis (D: OH UP; L: OH DOWN)
    if (seriesDL === 'D') anomerLabel = anomOH.direction === 'DOWN' ? 'α' : 'β';
    else anomerLabel = anomOH.direction === 'UP' ? 'α' : 'β';
  }

  return {
    ringSize: ringSize as 5 | 6,
    oRingIdx,
    ringAtoms: orderedRing,
    subsByPos,
    anomerLabel,
    seriesDL,
  };
}

function renderHaworthProjection(
  origMol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  const solved = solveCarbohydrateRing(origMol);
  if ('error' in solved) {
    return { eligible: false, ineligibleReason: solved.error };
  }

  const width = 500;
  const height = 340;
  const cx = 250;
  const cy = 172;

  const pts: Array<[number, number]> =
    solved.ringSize === 6
      ? [
          [cx + 62, cy - 52],
          [cx + 108, cy + 2],
          [cx + 56, cy + 54],
          [cx - 56, cy + 54],
          [cx - 108, cy + 2],
          [cx - 56, cy - 52],
        ]
      : [
          [cx, cy - 52],
          [cx + 104, cy + 4],
          [cx + 58, cy + 54],
          [cx - 58, cy + 54],
          [cx - 104, cy + 4],
        ];

  const els: string[] = [];
  const oPt = pts[0];
  const lastPt = pts[solved.ringSize - 1];
  const c1Pt = pts[1];

  const oIn = shrinkStart(oPt, lastPt, 14);
  els.push(`<line x1="${lastPt[0]}" y1="${lastPt[1]}" x2="${oIn[0].toFixed(1)}" y2="${oIn[1].toFixed(1)}" stroke="${COLOR_INK}" stroke-width="2.2" stroke-linecap="round" />`);

  const oOut = shrinkStart(oPt, c1Pt, 14);
  els.push(`<line x1="${oOut[0].toFixed(1)}" y1="${oOut[1].toFixed(1)}" x2="${c1Pt[0]}" y2="${c1Pt[1]}" stroke="${COLOR_INK}" stroke-width="2.2" stroke-linecap="round" />`);

  if (solved.ringSize === 6) {
    els.push(`<line x1="${pts[4][0]}" y1="${pts[4][1]}" x2="${pts[5][0]}" y2="${pts[5][1]}" stroke="${COLOR_INK}" stroke-width="2.2" stroke-linecap="round" />`);
  }
  // C1 -> C2 and C4 -> C3 tapered wedges, C2 -> C3 thickened Haworth front edge
  els.push(`<polygon points="${pts[1][0]},${pts[1][1]-1.1} ${pts[1][0]},${pts[1][1]+1.1} ${pts[2][0]+2},${pts[2][1]+3.2} ${pts[2][0]-2},${pts[2][1]-2.4}" fill="${COLOR_INK}" />`);
  els.push(`<polygon points="${pts[4][0]},${pts[4][1]-1.1} ${pts[4][0]},${pts[4][1]+1.1} ${pts[3][0]+2},${pts[3][1]-2.4} ${pts[3][0]-2},${pts[3][1]+3.2}" fill="${COLOR_INK}" />`);
  els.push(`<polygon points="${pts[2][0]},${pts[2][1]-2.6} ${pts[2][0]},${pts[2][1]+3.2} ${pts[3][0]},${pts[3][1]+3.2} ${pts[3][0]},${pts[3][1]-2.6}" fill="${COLOR_INK}" />`);

  // O_ring atom label
  els.push(
    `<text x="${oPt[0]}" y="${oPt[1] + 6}" text-anchor="middle" font-size="18" font-weight="700" fill="${atomColor(8, options.colorHeteroatoms)}">O</text>`
  );

  // Vertical UP/DOWN substituents at C1..C_last
  const bondLen = 48;
  for (let pos = 1; pos < solved.ringSize; pos++) {
    const [px, py] = pts[pos];
    const subs = solved.subsByPos.get(pos) || [];

    subs.forEach((sub) => {
      const isUp = sub.direction === 'UP';
      const yEnd = isUp ? py - bondLen : py + bondLen;
      const startOffset = !isUp && (pos === 2 || pos === 3) ? 3 : 0;

      els.push(
        `<line x1="${px}" y1="${py + startOffset}" x2="${px}" y2="${yEnd}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
      );

      // Position text nicely at bond tip (with slight left/right alignment on C4/C5 if needed)
      let displayText = sub.label;
      if (sub.label === 'OH' && (pos === 4 || pos === 5) && !isUp) displayText = 'HO';
      if (sub.label === 'OH' && pos === 3) displayText = 'HO';

      const textY = isUp ? yEnd - 7 : yEnd + 17;
      els.push(
        `<text x="${px}" y="${textY}" text-anchor="middle" font-size="15.5" font-weight="600" fill="${atomColor(sub.atomicNo, options.colorHeteroatoms)}">${escapeXml(displayText)}</text>`
      );
    });

    if (options.showCarbonNumbers) {
      const labelDx = pos === 1 ? 18 : pos === 4 || pos === 5 ? -18 : 0;
      const labelDy = pos === 2 || pos === 3 ? -10 : 4;
      els.push(
        `<text x="${px + labelDx}" y="${py + labelDy}" text-anchor="middle" font-size="10.5" font-family="'IBM Plex Mono', monospace" fill="${COLOR_MUTED}">${pos}</text>`
      );
    }
  }

  const svg = `<svg id="mol-haworth" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <style>text { font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif; }</style>
  ${els.join('\n  ')}
</svg>`;

  const anomerTxt = solved.anomerLabel ? `${solved.anomerLabel}-Anomer` : 'Zyklisch';
  const dlTxt = solved.seriesDL ? `${solved.seriesDL}-Reihe` : '';
  return {
    eligible: true,
    svg,
    titleSuffix: 'Haworth-Projektion',
    alignmentNotes: `Einheitliche Haworth-Ausrichtung: Ringsauerstoff oben${solved.ringSize === 6 ? '-rechts' : ''}, anomeres Zentrum (C1) rechts, verdickte Vorderkante C2–C3 · ${anomerTxt}${dlTxt ? `, ${dlTxt}` : ''}.`,
  };
}

function renderChairProjection(
  origMol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  const solved = solveCarbohydrateRing(origMol);
  if ('error' in solved) {
    return { eligible: false, ineligibleReason: solved.error };
  }
  if (solved.ringSize !== 6) {
    return {
      eligible: false,
      ineligibleReason:
        'Eine Sesselkonformation (⁴C₁ / ¹C₄) ist nur für Sechsring-Zucker (Pyranosen) definiert, nicht für Fünfringe (Furanosen).',
    };
  }

  const use4C1 = solved.seriesDL !== 'L';
  const width = 480;
  const height = 340;
  const cx = 240;
  const cy = 175;

  const pts4C1: Array<[number, number]> = [
    [cx + 42, cy - 42],
    [cx + 114, cy + 6],
    [cx + 38, cy + 44],
    [cx - 64, cy + 44],
    [cx - 114, cy - 6],
    [cx - 38, cy - 42],
  ];

  const pts1C4: Array<[number, number]> = pts4C1.map(([x, y]) => [x, 2 * cy - y]);
  const pts = use4C1 ? pts4C1 : pts1C4;
  const axialIsUp4C1: Record<number, boolean> = { 1: false, 2: true, 3: false, 4: true, 5: false };

  const els: string[] = [];
  const oPt = pts[0];

  // Ring bonds
  const oIn = shrinkStart(oPt, pts[5], 13);
  const oOut = shrinkStart(oPt, pts[1], 13);
  els.push(`<line x1="${pts[5][0]}" y1="${pts[5][1]}" x2="${oIn[0].toFixed(1)}" y2="${oIn[1].toFixed(1)}" stroke="${COLOR_INK}" stroke-width="2.1" stroke-linecap="round" />`);
  els.push(`<line x1="${oOut[0].toFixed(1)}" y1="${oOut[1].toFixed(1)}" x2="${pts[1][0]}" y2="${pts[1][1]}" stroke="${COLOR_INK}" stroke-width="2.1" stroke-linecap="round" />`);
  els.push(`<line x1="${pts[4][0]}" y1="${pts[4][1]}" x2="${pts[5][0]}" y2="${pts[5][1]}" stroke="${COLOR_INK}" stroke-width="2.1" stroke-linecap="round" />`);
  els.push(`<line x1="${pts[3][0]}" y1="${pts[3][1]}" x2="${pts[4][0]}" y2="${pts[4][1]}" stroke="${COLOR_INK}" stroke-width="2.1" stroke-linecap="round" />`);
  // Front emphasized bonds C1-C2 and C2-C3
  els.push(`<line x1="${pts[1][0]}" y1="${pts[1][1]}" x2="${pts[2][0]}" y2="${pts[2][1]}" stroke="${COLOR_INK}" stroke-width="2.6" stroke-linecap="round" />`);
  els.push(`<line x1="${pts[2][0]}" y1="${pts[2][1]}" x2="${pts[3][0]}" y2="${pts[3][1]}" stroke="${COLOR_INK}" stroke-width="2.8" stroke-linecap="round" />`);

  // O_ring label
  els.push(
    `<text x="${oPt[0]}" y="${oPt[1] + 5.5}" text-anchor="middle" font-size="17" font-weight="700" fill="${atomColor(8, options.colorHeteroatoms)}">O</text>`
  );

  // Equatorial vectors (parallel to next-but-one ring bond!)
  const eqVectors4C1: Record<number, [number, number]> = {
    1: [48, -14], // C1 eq UP-right
    2: [36, 30], // C2 eq DOWN-right
    3: [-44, 24], // C3 eq DOWN-left
    4: [-48, -14], // C4 eq UP-left
    5: [-38, -28], // C5 eq UP-left
  };

  for (let pos = 1; pos <= 5; pos++) {
    const [px, py] = pts[pos];
    const subs = solved.subsByPos.get(pos) || [];
    const axialUp = use4C1 ? axialIsUp4C1[pos] : !axialIsUp4C1[pos];

    subs.forEach((sub) => {
      const subUp = sub.direction === 'UP';
      const isAxial = subUp === axialUp;

      let vx: number;
      let vy: number;
      if (isAxial) {
        vx = 0;
        vy = subUp ? -46 : 46;
      } else {
        const [ex, ey] = eqVectors4C1[pos];
        vx = ex;
        vy = use4C1 ? ey : -ey;
      }

      const tx = px + vx;
      const ty = py + vy;
      els.push(
        `<line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
      );

      const anchor = vx > 10 ? 'start' : vx < -10 ? 'end' : 'middle';
      const dxLabel = vx > 10 ? 6 : vx < -10 ? -6 : 0;
      const dyLabel = vy < -10 ? -6 : vy > 10 ? 16 : 5;
      let displayText = sub.label;
      if (sub.label === 'OH' && anchor === 'end') displayText = 'HO';

      els.push(
        `<text x="${tx + dxLabel}" y="${ty + dyLabel}" text-anchor="${anchor}" font-size="15" font-weight="600" fill="${atomColor(sub.atomicNo, options.colorHeteroatoms)}">${escapeXml(displayText)}</text>`
      );
    });

    if (options.showCarbonNumbers) {
      els.push(
        `<text x="${px}" y="${py + (use4C1 ? 15 : -10)}" text-anchor="middle" font-size="10" font-family="'IBM Plex Mono', monospace" fill="${COLOR_MUTED}">${pos}</text>`
      );
    }
  }

  const svg = `<svg id="mol-chair" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <style>text { font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif; }</style>
  ${els.join('\n  ')}
</svg>`;

  const confLabel = use4C1 ? '⁴C₁-Sesselkonformation' : '¹C₄-Sesselkonformation';
  return {
    eligible: true,
    svg,
    titleSuffix: confLabel,
    alignmentNotes: `${confLabel}: sterisch anspruchsvolle C5-Gruppe äquatorial ausgerichtet · Ringsauerstoff hinten rechts.`,
  };
}

export function renderProjection(
  projection: ProjectionType,
  mol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  switch (projection) {
    case 'skelett':
      return renderSkeletalProjection(mol, options);
    case 'fischer':
      return renderFischerProjection(mol, options);
    case 'haworth':
      return renderHaworthProjection(mol, options);
    case 'sessel':
      return renderChairProjection(mol, options);
  }
}

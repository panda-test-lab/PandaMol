import * as OCL from 'openchemlib';
import type { DisplayOptions, ProjectionType } from '../types/chemistry.ts';

export interface ProjectionRenderResult {
  eligible: boolean;
  svg?: string;
  titleSuffix?: string;
  alignmentNotes?: string;
  ineligibleReason?: string;
}

function ringSubIsUp(sub: RingSub): boolean {
  return sub.direction === 'UNKNOWN'
    ? sub.visualDirection !== 'DOWN'
    : sub.direction === 'UP';
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

function wavyVerticalBondSvg(
  x: number,
  yStart: number,
  yEnd: number,
  scale = 1
): string {
  const step = (yEnd - yStart) / 4;
  const amplitude = 4 * scale;
  let path = `M ${x.toFixed(1)} ${yStart.toFixed(1)}`;
  for (let index = 1; index <= 4; index++) {
    const side = index % 2 === 1 ? amplitude : -amplitude;
    path += ` Q ${(x + side).toFixed(1)} ${(yStart + step * (index - 0.5)).toFixed(1)} ${x.toFixed(1)} ${(yStart + step * index).toFixed(1)}`;
  }
  return `<path d="${path}" fill="none" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`;
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

export function hideNonAtomAnnotations(svg: string): string {
  return svg.replace(
    /<text\b([^>]*)>([\s\S]*?)<\/text>/gi,
    (element, _attributes: string, content: string) => {
      const label = content
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .trim();
      return /^(abs|and|or)$/i.test(label) ? '' : element;
    }
  );
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

type FischerGroup = number | null;

interface FischerPoint {
  x: number;
  y: number;
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

function findAminoAcidSideChain(mol: OCL.Molecule, root: number, alphaCarbon: number): number[] {
  let bestPath: number[] = [root];

  function visit(current: number, path: number[], visited: Set<number>): void {
    let extended = false;
    for (let j = 0; j < mol.getConnAtoms(current); j++) {
      const neighbor = mol.getConnAtom(current, j);
      if (
        neighbor === alphaCarbon ||
        mol.getAtomicNo(neighbor) !== 6 ||
        visited.has(neighbor)
      ) {
        continue;
      }
      extended = true;
      visited.add(neighbor);
      path.push(neighbor);
      visit(neighbor, path, visited);
      path.pop();
      visited.delete(neighbor);
    }

    if (!extended && path.length > bestPath.length) {
      bestPath = [...path];
    }
  }

  visit(root, [root], new Set([root]));
  return bestPath;
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

  const aminoAcid = findAlphaAminoAcidCenter(mol);
  let chiralCenters = 0;
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomCIPParity(i) > 0) chiralCenters++;
  }
  if (chiralCenters === 0 && !aminoAcid) {
    return {
      eligible: false,
      ineligibleReason:
        'Diese Struktur besitzt kein Chiralitätszentrum (achiral). Eine Fischer-Projektion zur Darstellung von D/L-Stereochemie ist daher nicht sinnvoll.',
    };
  }

  let chain: number[];
  if (aminoAcid) {
    let sideChainRoot = -1;
    for (let j = 0; j < mol.getConnAtoms(aminoAcid.ca); j++) {
      const neighbor = mol.getConnAtom(aminoAcid.ca, j);
      if (neighbor !== aminoAcid.cooh && neighbor !== aminoAcid.n && mol.getAtomicNo(neighbor) === 6) {
        sideChainRoot = neighbor;
        break;
      }
    }
    chain = [aminoAcid.cooh, aminoAcid.ca];
    if (sideChainRoot !== -1) {
      chain.push(...findAminoAcidSideChain(mol, sideChainRoot, aminoAcid.ca));
    }
  } else {
    const mainChain = findFischerChain(mol);
    if (!mainChain) {
      return {
        eligible: false,
        ineligibleReason: 'Keine eindeutige acyclische Kohlenstoff-Hauptkette für eine Fischer-Projektion gefunden.',
      };
    }
    chain = mainChain;
  }

  const chainSet = new Set(chain);
  for (let i = 0; i < mol.getAllAtoms(); i++) {
    if (mol.getAtomCIPParity(i) > 0 && !chainSet.has(i)) {
      return {
        eligible: false,
        ineligibleReason:
          'Ein Stereozentrum liegt außerhalb der Fischer-Hauptkette und kann nicht eindeutig in dieser Projektion angeordnet werden.',
      };
    }
  }

  const bondEls: string[] = [];
  const textEls: string[] = [];
  const renderedAtoms = new Set(chainSet);
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const stepY = 88;
  const cx = 0;
  const topY = 52;

  const includeBounds = (x: number, y: number, padding = 0) => {
    bounds.minX = Math.min(bounds.minX, x - padding);
    bounds.maxX = Math.max(bounds.maxX, x + padding);
    bounds.minY = Math.min(bounds.minY, y - padding);
    bounds.maxY = Math.max(bounds.maxY, y + padding);
  };

  const addText = (
    x: number,
    y: number,
    label: string,
    atomicNo: number,
    fontSize = 16,
    anchor: 'start' | 'middle' | 'end' = 'middle'
  ) => {
    const width = label.length * fontSize * 0.62;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
    includeBounds(left, y - fontSize, 3);
    includeBounds(left + width, y + 4, 3);
    textEls.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="${fontSize}" font-weight="600" fill="${atomColor(atomicNo, options.colorHeteroatoms)}">${escapeXml(label)}</text>`
    );
  };

  const addBond = (
    start: FischerPoint,
    end: FischerPoint,
    order: number,
    trimStart = 10,
    trimEnd = 10
  ) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const startTrim = Math.min(trimStart, length * 0.22);
    const endTrim = Math.min(trimEnd, length * 0.22);
    const ux = dx / length;
    const uy = dy / length;
    const px = -uy;
    const py = ux;
    const offsets = order >= 3 ? [-3, 0, 3] : order === 2 ? [-2.5, 2.5] : [0];
    for (const offset of offsets) {
      const x1 = start.x + ux * startTrim + px * offset;
      const y1 = start.y + uy * startTrim + py * offset;
      const x2 = end.x - ux * endTrim + px * offset;
      const y2 = end.y - uy * endTrim + py * offset;
      includeBounds(x1, y1, 2);
      includeBounds(x2, y2, 2);
      bondEls.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
      );
    }
  };

  const atomLabel = (atomIdx: number): string => {
    const label = mol.getAtomLabel(atomIdx);
    const charge = mol.getAtomCharge(atomIdx);
    return charge > 0 ? `${label}⁺` : charge < 0 ? `${label}⁻` : label;
  };

  const bondOrder = (atomA: number, atomB: number): number => {
    for (let j = 0; j < mol.getConnAtoms(atomA); j++) {
      if (mol.getConnAtom(atomA, j) === atomB) {
        return mol.getBondOrder(mol.getConnBond(atomA, j));
      }
    }
    return 1;
  };

  const isHydrogen = (group: FischerGroup): boolean =>
    group === null || mol.getAtomicNo(group) === 1;

  const drawGroup = (
    parentIdx: number,
    parentPoint: FischerPoint,
    group: FischerGroup,
    direction: FischerPoint,
    depth = 0
  ): void => {
    const point = {
      x: parentPoint.x + direction.x * (depth === 0 ? 70 : 48),
      y: parentPoint.y + direction.y * (depth === 0 ? 70 : 48),
    };
    if (group === null) {
      addBond(
        parentPoint,
        point,
        1,
        depth === 0 && direction.y === 0 ? 0 : 10
      );
      addText(point.x, point.y + 5, 'H', 1);
      return;
    }

    addBond(
      parentPoint,
      point,
      bondOrder(parentIdx, group),
      depth === 0 && direction.y === 0 ? 0 : 10
    );
    renderedAtoms.add(group);
    const atomicNo = mol.getAtomicNo(group);
    const implicitHydrogens = mol.getImplicitHydrogens(group);
    const simpleGroupLabel =
      mol.getAtomCharge(group) === 0 && mol.getConnAtoms(group) === 1
        ? atomicNo === 8 && implicitHydrogens === 1
          ? 'OH'
          : atomicNo === 7 && implicitHydrogens === 2
            ? 'NH2'
            : null
        : null;
    if (simpleGroupLabel) {
      addText(point.x, point.y + 5, simpleGroupLabel, atomicNo);
      return;
    }

    addText(point.x, point.y + 5, atomLabel(group), atomicNo);

    const childGroups: FischerGroup[] = [];
    for (let j = 0; j < mol.getConnAtoms(group); j++) {
      const neighbor = mol.getConnAtom(group, j);
      if (neighbor !== parentIdx && !chainSet.has(neighbor)) {
        childGroups.push(neighbor);
      }
    }
    for (let h = 0; h < Math.max(0, mol.getImplicitHydrogens(group)); h++) {
      childGroups.push(null);
    }

    const perpendicular = { x: -direction.y, y: direction.x };
    const spacing = childGroups.length > 1 ? 30 : 0;
    childGroups.forEach((child, index) => {
      const offset = (index - (childGroups.length - 1) / 2) * spacing;
      const childDirection = {
        x: direction.x + (perpendicular.x * offset) / 48,
        y: direction.y + (perpendicular.y * offset) / 48,
      };
      const magnitude = Math.hypot(childDirection.x, childDirection.y) || 1;
      drawGroup(
        group,
        point,
        child,
        { x: childDirection.x / magnitude, y: childDirection.y / magnitude },
        depth + 1
      );
    });
  };

  const groupsAt = (atomIdx: number, previous: number, next: number): FischerGroup[] => {
    const groups: FischerGroup[] = [];
    for (let j = 0; j < mol.getConnAtoms(atomIdx); j++) {
      const neighbor = mol.getConnAtom(atomIdx, j);
      if (neighbor !== previous && neighbor !== next) groups.push(neighbor);
    }
    for (let h = 0; h < Math.max(0, mol.getImplicitHydrogens(atomIdx)); h++) {
      groups.push(null);
    }
    return groups;
  };
  const groupDirection = (
    group: FischerGroup,
    side: 'left' | 'right',
    chainIndex: number
  ): FischerPoint => {
    const horizontal = side === 'right' ? 1 : -1;
    if (chainIndex === 0) {
      const isCarbonylOxygen =
        group !== null &&
        mol.getAtomicNo(group) === 8 &&
        bondOrder(chainPoints[0].atomIdx, group) === 2;
      if (isCarbonylOxygen) return { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
      if (isHydrogen(group)) return { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
    }
    return {
      x: horizontal,
      y: 0,
    };
  };

  const chainPoints = chain.map((atomIdx, index) => ({
    atomIdx,
    point: { x: cx, y: topY + index * stepY },
  }));
  for (let index = 0; index < chainPoints.length - 1; index++) {
    const current = chainPoints[index];
    const next = chainPoints[index + 1];
    addBond(current.point, next.point, bondOrder(current.atomIdx, next.atomIdx), 0, 0);
  }

  for (let index = 0; index < chainPoints.length; index++) {
    const { atomIdx, point } = chainPoints[index];
    const previous = index > 0 ? chainPoints[index - 1].atomIdx : -1;
    const next = index + 1 < chainPoints.length ? chainPoints[index + 1].atomIdx : -1;
    const groups = groupsAt(atomIdx, previous, next);
    const isHydroxymethylEnd =
      index === chainPoints.length - 1 &&
      mol.getAtomicNo(atomIdx) === 6 &&
      mol.getImplicitHydrogens(atomIdx) === 2 &&
      groups.some(
        (group) =>
          group !== null &&
          mol.getAtomicNo(group) === 8 &&
          mol.getConnAtoms(group) === 1 &&
          bondOrder(atomIdx, group) === 1
      );
    if (isHydroxymethylEnd) {
      const oxygen = groups.find(
        (group): group is number =>
          group !== null &&
          mol.getAtomicNo(group) === 8 &&
          mol.getConnAtoms(group) === 1
      );
      if (oxygen !== undefined) {
        renderedAtoms.add(oxygen);
        addBond(point, { x: point.x, y: point.y + 24 }, 1, 0, 0);
        addText(point.x, point.y + 44, 'CH2OH', 6);
        if (options.showCarbonNumbers) {
          addText(point.x - 42, point.y + 4, `C${index + 1}`, 1, 11, 'end');
        }
      }
      continue;
    }
    let leftGroup: FischerGroup | undefined;
    let rightGroup: FischerGroup | undefined;
    let verticalGroup: FischerGroup | undefined;
    const isEndpoint = index === 0 || index === chainPoints.length - 1;

    if (isEndpoint) {
      if (groups.length > 3) {
        return {
          eligible: false,
          ineligibleReason: 'Endgruppe besitzt mehr Bindungen, als in der Fischer-Projektion dargestellt werden können.',
        };
      }
      if (groups.length === 3) {
        const verticalIndex = groups.findIndex(isHydrogen);
        verticalGroup = groups.splice(verticalIndex === -1 ? groups.length - 1 : verticalIndex, 1)[0];
      }
      if (groups.length > 0) rightGroup = groups[0];
      if (groups.length > 1) leftGroup = groups[1];
      if (mol.getAtomCIPParity(atomIdx) > 0) {
        return {
          eligible: false,
          ineligibleReason:
            'Ein stereogenes Kettenende kann nicht eindeutig als Fischer-Kreuz ausgerichtet werden.',
        };
      }
    } else {
      if (groups.length > 2) {
        return {
          eligible: false,
          ineligibleReason: 'Ein Hauptkettenatom besitzt zu viele Seitenbindungen für eine Fischer-Projektion.',
        };
      }

      const probeIndex = groups.findIndex((group) => !isHydrogen(group));
      if (mol.getAtomCIPParity(atomIdx) > 0 && probeIndex !== -1) {
        const isRight = isSubstituentRightInFischer(
          mol,
          atomIdx,
          previous,
          next,
          groups[probeIndex] as number
        );
        if (isRight === null) {
          return {
            eligible: false,
            ineligibleReason:
              'Mindestens ein Stereozentrum entlang der Hauptkette besitzt keine eindeutige Stereo-Konfiguration.',
          };
        }
        if (isRight) rightGroup = groups[probeIndex];
        else leftGroup = groups[probeIndex];
        const otherGroup = groups.find((_, groupIndex) => groupIndex !== probeIndex);
        if (otherGroup !== undefined) {
          if (isRight) leftGroup = otherGroup;
          else rightGroup = otherGroup;
        }
      } else {
        const orderedGroups = [...groups].sort((a, b) => {
          const atomicNoA = a === null ? 1 : mol.getAtomicNo(a);
          const atomicNoB = b === null ? 1 : mol.getAtomicNo(b);
          return atomicNoA - atomicNoB;
        });
        if (orderedGroups.length > 0) leftGroup = orderedGroups[0];
        if (orderedGroups.length > 1) rightGroup = orderedGroups[1];
      }
    }

    if (leftGroup !== undefined) {
      const direction = groupDirection(leftGroup, 'left', index);
      drawGroup(atomIdx, point, leftGroup, direction);
    }
    if (rightGroup !== undefined) {
      drawGroup(atomIdx, point, rightGroup, groupDirection(rightGroup, 'right', index));
    }
    if (verticalGroup !== undefined) {
      drawGroup(
        atomIdx,
        point,
        verticalGroup,
        { x: 0, y: index === 0 ? -1 : 1 }
      );
    }

    if (options.showCarbonNumbers && mol.getAtomicNo(atomIdx) === 6) {
      addText(point.x - 42, point.y + 4, `C${index + 1}`, 1, 11, 'end');
    }

    if (options.showCIP && mol.getAtomCIPParity(atomIdx) > 0) {
      const cip = mol.getAtomCIPParity(atomIdx);
      const cipLabel =
        cip === OCL.Molecule.cAtomCIPParityRorM
          ? '(R)'
          : cip === OCL.Molecule.cAtomCIPParitySorP
            ? '(S)'
            : '';
      if (cipLabel) {
        addText(point.x + 30, point.y - 20, cipLabel, 1, 11, 'start');
      }
    }
  }

  if (renderedAtoms.size !== mol.getAllAtoms()) {
    return {
      eligible: false,
      ineligibleReason:
        'Nicht alle Atome konnten eindeutig in die Fischer-Projektion aufgenommen werden.',
    };
  }

  const svgWidth = bounds.maxX - bounds.minX + 80;
  const svgHeight = bounds.maxY - bounds.minY + 80;
  const svg = `<svg id="mol-fischer" xmlns="http://www.w3.org/2000/svg" viewBox="${(bounds.minX - 40).toFixed(1)} ${(bounds.minY - 40).toFixed(1)} ${svgWidth.toFixed(1)} ${svgHeight.toFixed(1)}" width="100%" height="100%">
  <style>text { font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif; }</style>
  ${bondEls.join('\n  ')}
  ${textEls.join('\n  ')}
</svg>`;

  return {
    eligible: true,
    svg,
    titleSuffix: 'Fischer-Projektion',
    alignmentNotes: aminoAcid
      ? 'Klassische Fischer-Projektion: Carboxylgruppe (C1) oben, Seitenkette vollständig nach unten; Aminogruppe bei L-Form links.'
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
  direction: 'UP' | 'DOWN' | 'UNKNOWN';
  visualDirection?: 'UP' | 'DOWN';
  isAnomericSubstituent?: boolean;
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

function solveCarbohydrateRing(
  origMol: OCL.Molecule,
  ringIndex = 0
): SolvedSugarRing | { error: string } {
  const mol = origMol.getCompactCopy();
  mol.ensureHelperArrays(OCL.Molecule.cHelperCIP);

  const ringSet = mol.getRingSet();
  if (ringSet.getSize() === 0) {
    return {
      error:
        'Diese Struktur liegt offenkettig vor und besitzt keinen Pyranose- oder Furanose-Ring für eine Haworth-/Sessel-Projektion.',
    };
  }
  if (ringIndex < 0 || ringIndex >= ringSet.getSize()) {
    return {
      error: 'Der angeforderte Zucker-Ring wurde nicht gefunden.',
    };
  }

  const ringSize = ringSet.getRingSize(ringIndex);
  if (ringSize !== 5 && ringSize !== 6) {
    return {
      error: `Der ${ringSize}-gliedrige Ring ist keine Pyranose (6) oder Furanose (5).`,
    };
  }

  const rawRingAtoms = ringSet.getRingAtoms(ringIndex);
  const otherRingAtoms = new Set<number>();
  for (let index = 0; index < ringSet.getSize(); index++) {
    if (index === ringIndex) continue;
    for (const atom of ringSet.getRingAtoms(index)) otherRingAtoms.add(atom);
  }
  if (rawRingAtoms.some((atom) => otherRingAtoms.has(atom))) {
    return {
      error: 'Fusionierte Ringsysteme lassen sich nicht als getrennte Zuckerreste darstellen.',
    };
  }
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
  testBase.stripStereoInformation();

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
  const exoChiralAtoms: number[] = [];

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
          if (
            !visited.has(nb) &&
            !rawRingAtoms.includes(nb) &&
            !otherRingAtoms.has(nb)
          ) {
            children.push(nb);
          }
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
                exoChiralAtoms.push(orig);
                exoStereoBondAssigned = true;
                break;
              }
            }
          }

          queue.push({ orig: nb, parentOrig: orig, px: cxChild, py: cyChild, dirX: nx, dirY: ny });
        });
      }
    });

    if (mol.getAtomCIPParity(origC) > 0) {
      stereoVars.push({
        ringPos: pos,
        origCarbon: origC,
        subs: exocyclic,
        bondIndices,
      });
    }
  }

  const targetStereoAtoms = [
    ...new Set([
      ...stereoVars.map((stereoVar) => stereoVar.origCarbon),
      ...exoChiralAtoms,
    ]),
  ].filter((atom) => mol.getAtomCIPParity(atom) > 0);
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
    if (
      targetStereoAtoms.every(
        (atom) =>
          reparsed.getAtomCIPParity(atomMap.get(atom)!) ===
          mol.getAtomCIPParity(atom)
      )
    ) {
      winningMask = mask;
      matchCount++;
    }
  }

  if (matchCount !== 1 || winningMask === -1) {
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
        isAnomericSubstituent: sv.ringPos === 1 && formatted.atomicNo === 8,
        isCH2OH: formatted.isCH2OH,
      });
    });
    subsByPos.set(sv.ringPos, list);
  });

  // Also include achiral CH2 positions (2-deoxy sugars) so we know they have H/H
  for (let pos = 1; pos < ringSize; pos++) {
    if (!subsByPos.has(pos)) {
      const ringCarbon = orderedRing[pos];
      const exocyclic = Array.from(
        { length: mol.getConnAtoms(ringCarbon) },
        (_, index) => mol.getConnAtom(ringCarbon, index)
      ).filter((atom) => !rawRingAtoms.includes(atom));
      if (exocyclic.length === 1) {
        const subAtom = exocyclic[0];
        const formatted = formatRingSubLabel(mol, subAtom, ringCarbon);
        const stereoUnknown = mol.getAtomParity(ringCarbon) === 3;
        subsByPos.set(pos, [
          {
            atomIdx: subAtom,
            label: formatted.label,
            atomicNo: formatted.atomicNo,
            direction: stereoUnknown ? 'UNKNOWN' : 'UP',
            isAnomericSubstituent: pos === 1 && formatted.atomicNo === 8,
            isCH2OH: formatted.isCH2OH,
          },
        ]);
      } else if (exocyclic.length === 2) {
        const stereoUnknown = mol.getAtomParity(ringCarbon) === 3;
        subsByPos.set(
          pos,
          exocyclic.map((subAtom, index) => {
            const formatted = formatRingSubLabel(mol, subAtom, ringCarbon);
            return {
              atomIdx: subAtom,
              label: formatted.label,
              atomicNo: formatted.atomicNo,
              direction: stereoUnknown ? 'UNKNOWN' as const : index === 0 ? 'UP' as const : 'DOWN' as const,
              visualDirection: index === 0 ? 'UP' as const : 'DOWN' as const,
              isAnomericSubstituent: pos === 1 && formatted.atomicNo === 8,
              isCH2OH: formatted.isCH2OH,
            };
          })
        );
      } else {
        subsByPos.set(pos, [
          { atomIdx: -1, label: 'H', atomicNo: 1, direction: 'UP' },
          { atomIdx: -2, label: 'H', atomicNo: 1, direction: 'DOWN' },
        ]);
      }
    }
  }

  // Determine D/L and alpha/beta from last carbon (C5 in pyranose, C4 in furanose)
  const lastSubs = subsByPos.get(ringSize - 1) || [];
  const ch2ohSub = lastSubs.find((s) => s.isCH2OH || s.label === 'CH₃' || s.label === 'COOH');
  const seriesDL: 'D' | 'L' | null =
    ch2ohSub && ch2ohSub.direction !== 'UNKNOWN'
      ? ch2ohSub.direction === 'UP'
        ? 'D'
        : 'L'
      : null;

  const anomSubs = subsByPos.get(1) || [];
  const anomSubstituent = anomSubs.find((s) => s.isAnomericSubstituent);
  let anomerLabel: 'α' | 'β' | null = null;
  if (
    anomSubstituent &&
    anomSubstituent.direction !== 'UNKNOWN' &&
    seriesDL
  ) {
    // alpha = trans to the terminal CH2OH group; beta = cis.
    if (seriesDL === 'D') anomerLabel = anomSubstituent.direction === 'DOWN' ? 'α' : 'β';
    else anomerLabel = anomSubstituent.direction === 'UP' ? 'α' : 'β';
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
  const ringCount = origMol.getRingSet().getSize();
  if (ringCount > 1) {
    if (ringCount > 6) {
      return {
        eligible: false,
        ineligibleReason:
          'Haworth unterstützt aus Gründen der Lesbarkeit höchstens sechs verknüpfte Zucker-Ringe pro Struktur.',
      };
    }

    const solvedRings: SolvedSugarRing[] = [];
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
      const solvedRing = solveCarbohydrateRing(origMol, ringIndex);
      if ('error' in solvedRing) {
        return { eligible: false, ineligibleReason: solvedRing.error };
      }
      solvedRings.push(solvedRing);
    }
    return renderLinkedHaworthProjection(origMol, options, solvedRings);
  }

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
      const isUp = ringSubIsUp(sub);
      const yEnd = isUp ? py - bondLen : py + bondLen;
      const startOffset = !isUp && (pos === 2 || pos === 3) ? 3 : 0;

      if (sub.direction === 'UNKNOWN') {
        els.push(wavyVerticalBondSvg(px, py + startOffset, yEnd));
      } else {
        els.push(
          `<line x1="${px}" y1="${py + startOffset}" x2="${px}" y2="${yEnd}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
        );
      }

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
  const anomerUnspecified = (solved.subsByPos.get(1) || []).some(
    (sub) => sub.isAnomericSubstituent && sub.direction === 'UNKNOWN'
  );
  return {
    eligible: true,
    svg,
    titleSuffix: 'Haworth-Projektion',
    alignmentNotes: `Einheitliche Haworth-Ausrichtung: Ringsauerstoff oben${solved.ringSize === 6 ? '-rechts' : ''}, anomeres Zentrum (C1) rechts, verdickte Vorderkante C2–C3 · ${anomerTxt}${dlTxt ? `, ${dlTxt}` : ''}${anomerUnspecified ? ' · anomerische Konfiguration nicht spezifiziert (Wellenbindung)' : ''}.`,
  };
}

function renderLinkedHaworthProjection(
  mol: OCL.Molecule,
  options: DisplayOptions,
  solvedRings: SolvedSugarRing[]
): ProjectionRenderResult {
  type Attachment = {
    ringIndex: number;
    ringPos: number;
    sub: RingSub;
    linkerAtomIdx?: number;
  };
  type GlycosidicBridge = {
    oxygenAtom: number;
    attachments: [Attachment, Attachment];
  };

  const ringIndexByAtom = new Map<number, number>();
  solvedRings.forEach((solved, ringIndex) => {
    solved.ringAtoms.forEach((atom) => ringIndexByAtom.set(atom, ringIndex));
  });
  const findAttachment = (
    startAtom: number,
    bridgeOxygen: number
  ): Attachment | undefined => {
    const queue: Array<{ atom: number; parent: number; distance: number }> = [
      { atom: startAtom, parent: bridgeOxygen, distance: 0 },
    ];
    const visited = new Set<number>([bridgeOxygen]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const ringIndex = ringIndexByAtom.get(current.atom);
      if (ringIndex !== undefined) {
        const solved = solvedRings[ringIndex];
        const ringPos = solved.ringAtoms.indexOf(current.atom);
        const subAtomIdx =
          current.parent === bridgeOxygen ? bridgeOxygen : current.parent;
        const sub = (solved.subsByPos.get(ringPos) || []).find(
          (candidate) => candidate.atomIdx === subAtomIdx
        );
        if (!sub || current.distance > 1) return undefined;
        if (
          subAtomIdx !== bridgeOxygen &&
          (mol.getAtomicNo(subAtomIdx) !== 6 ||
            mol.getConnAtoms(subAtomIdx) !== 2)
        ) {
          return undefined;
        }
        return {
          ringIndex,
          ringPos,
          sub,
          linkerAtomIdx:
            subAtomIdx === bridgeOxygen ? undefined : subAtomIdx,
        };
      }

      visited.add(current.atom);
      for (let index = 0; index < mol.getConnAtoms(current.atom); index++) {
        const next = mol.getConnAtom(current.atom, index);
        if (visited.has(next)) continue;
        if (
          !ringIndexByAtom.has(next) &&
          mol.getAtomicNo(next) === 8 &&
          mol.getConnAtoms(next) === 2
        ) {
          continue;
        }
        queue.push({
          atom: next,
          parent: current.atom,
          distance: current.distance + 1,
        });
      }
    }
    return undefined;
  };
  const bridges: GlycosidicBridge[] = [];
  for (let oxygenAtom = 0; oxygenAtom < mol.getAllAtoms(); oxygenAtom++) {
    if (
      mol.getAtomicNo(oxygenAtom) !== 8 ||
      mol.getConnAtoms(oxygenAtom) !== 2 ||
      ringIndexByAtom.has(oxygenAtom)
    ) {
      continue;
    }
    const attachments = [
      findAttachment(mol.getConnAtom(oxygenAtom, 0), oxygenAtom),
      findAttachment(mol.getConnAtom(oxygenAtom, 1), oxygenAtom),
    ];
    if (
      attachments[0] &&
      attachments[1] &&
      attachments[0].ringIndex !== attachments[1].ringIndex
    ) {
      bridges.push({
        oxygenAtom,
        attachments: [attachments[0], attachments[1]],
      });
    }
  }

  if (
    bridges.length !== solvedRings.length - 1
  ) {
    return {
      eligible: false,
      ineligibleReason:
        'Die Zucker-Ringe bilden keine eindeutig lineare, glycosidisch verknüpfte Kette. Für verzweigte oder zyklische Glykane nutze das SNFG-Diagramm.',
    };
  }

  const neighbors = new Map<
    number,
    Array<{
      ringIndex: number;
      attachment: Attachment;
      ownAttachment: Attachment;
    }>
  >();
  solvedRings.forEach((_, ringIndex) => neighbors.set(ringIndex, []));
  for (const bridge of bridges) {
    const [first, second] = bridge.attachments;
    neighbors.get(first.ringIndex)?.push({
      ringIndex: second.ringIndex,
      attachment: second,
      ownAttachment: first,
    });
    neighbors.get(second.ringIndex)?.push({
      ringIndex: first.ringIndex,
      attachment: first,
      ownAttachment: second,
    });
  }
  if ([...neighbors.values()].some((items) => items.length > 2)) {
    return {
      eligible: false,
      ineligibleReason:
        'Verzweigte Glykane benötigen eine SNFG-Darstellung; die Haworth-Ausgabe unterstützt hier lineare Zuckerketten.',
    };
  }

  const endpoints = [...neighbors.entries()]
    .filter(([, items]) => items.length <= 1)
    .map(([ringIndex]) => ringIndex);
  if (endpoints.length !== 2) {
    return {
      eligible: false,
      ineligibleReason:
        'Die glycosidischen Verknüpfungen ergeben keine lineare Haworth-Kette.',
    };
  }

  const start = endpoints.find((ringIndex) =>
    (neighbors.get(ringIndex) || []).some(
      (neighbor) => neighbor.ownAttachment.ringPos === 1
    )
  ) ?? endpoints[0];
  const ringOrder = [start];
  let previous = -1;
  while (ringOrder.length < solvedRings.length) {
    const next = (neighbors.get(ringOrder[ringOrder.length - 1]) || []).find(
      (neighbor) => neighbor.ringIndex !== previous
    )?.ringIndex;
    if (next === undefined) break;
    previous = ringOrder[ringOrder.length - 1];
    ringOrder.push(next);
  }
  if (ringOrder.length !== solvedRings.length) {
    return {
      eligible: false,
      ineligibleReason: 'Die Reihenfolge der Zucker-Ringe konnte nicht eindeutig bestimmt werden.',
    };
  }

  const scale = 0.72;
  const height = 340;
  const cy = 164;
  const relativePointsByRing = new Map<number, Array<[number, number]>>();
  for (const ringIndex of ringOrder) {
    const solved = solvedRings[ringIndex];
    relativePointsByRing.set(
      ringIndex,
      solved.ringSize === 6
        ? [
            [62, -52],
            [108, 2],
            [56, 54],
            [-56, 54],
            [-108, 2],
            [-56, -52],
          ]
        : [
            [0, -52],
            [104, 4],
            [58, 54],
            [-58, 54],
            [-104, 4],
          ]
    );
  }
  const maxRingHalfWidth =
    Math.max(
      ...[...relativePointsByRing.values()].flatMap((points) =>
        points.map(([x]) => Math.abs(x) * scale)
      )
    );
  const step = maxRingHalfWidth * 2 + 36;
  const width = 290 + (ringOrder.length - 1) * step;
  const orderedBridges = ringOrder.slice(0, -1).map((ringIndex, index) =>
    bridges.find((bridge) =>
      bridge.attachments.some(
        (attachment) =>
          attachment.ringIndex === ringIndex &&
          bridge.attachments.some(
            (other) => other.ringIndex === ringOrder[index + 1]
          )
      )
    )
  );
  if (orderedBridges.some((bridge) => !bridge)) {
    return {
      eligible: false,
      ineligibleReason: 'Die Bindungen zwischen den Zucker-Ringen konnten nicht eindeutig angeordnet werden.',
    };
  }

  const bondLen = 48 * scale;
  const relativeBridgeEnd = (attachment: Attachment, flipped: boolean) => {
    const [x, y] = relativePointsByRing.get(attachment.ringIndex)![
      attachment.ringPos
    ];
    const isUp = ringSubIsUp(attachment.sub);
    return [
      (flipped ? -x : x) * scale,
      y * scale +
        (isUp ? -bondLen : bondLen) +
        (attachment.linkerAtomIdx === undefined
          ? 0
          : (isUp ? -24 : 28) * scale),
    ] as [number, number];
  };
  const orientationCosts = ringOrder.map(() => [Infinity, Infinity]);
  const previousOrientations = ringOrder.map(() => [-1, -1]);
  orientationCosts[0][0] = 0;
  for (let index = 1; index < ringOrder.length; index++) {
    const bridge = orderedBridges[index - 1]!;
    const leftAttachment = bridge.attachments.find(
      (attachment) => attachment.ringIndex === ringOrder[index - 1]
    )!;
    const rightAttachment = bridge.attachments.find(
      (attachment) => attachment.ringIndex === ringOrder[index]
    )!;
    for (let rightFlip = 0; rightFlip <= 1; rightFlip++) {
      const rightEnd = relativeBridgeEnd(rightAttachment, rightFlip === 1);
      for (let leftFlip = 0; leftFlip <= 1; leftFlip++) {
        const leftEnd = relativeBridgeEnd(leftAttachment, leftFlip === 1);
        const linkLength = Math.hypot(
          step + rightEnd[0] - leftEnd[0],
          rightEnd[1] - leftEnd[1]
        );
        const total = orientationCosts[index - 1][leftFlip] + linkLength;
        if (total < orientationCosts[index][rightFlip]) {
          orientationCosts[index][rightFlip] = total;
          previousOrientations[index][rightFlip] = leftFlip;
        }
      }
    }
  }
  const flippedByRing = new Map<number, boolean>();
  let orientation = orientationCosts.length - 1;
  orientation =
    orientationCosts[orientation][0] <= orientationCosts[orientation][1]
      ? 0
      : 1;
  for (let index = ringOrder.length - 1; index >= 0; index--) {
    flippedByRing.set(ringOrder[index], orientation === 1);
    if (index > 0) {
      orientation = previousOrientations[index][orientation];
    }
  }

  const ringFrames = new Map<
    number,
    { centerX: number; points: Array<[number, number]> }
  >();
  ringOrder.forEach((ringIndex, orderIndex) => {
    const centerX = 145 + orderIndex * step;
    ringFrames.set(ringIndex, {
      centerX,
      points: relativePointsByRing.get(ringIndex)!.map(([x, y]) => [
        centerX + (flippedByRing.get(ringIndex) ? -x : x) * scale,
        cy + y * scale,
      ]),
    });
  });

  const linkedSubAtoms = new Set(
    bridges.flatMap((bridge) => bridge.attachments.map(({ sub }) => sub.atomIdx))
  );
  const linkedSubLabels = new Map<number, string>();
  for (const bridge of bridges) {
    for (const attachment of bridge.attachments) {
      if (attachment.linkerAtomIdx !== undefined) {
        linkedSubLabels.set(attachment.sub.atomIdx, 'CH₂');
      }
    }
  }
  const els: string[] = [];
  const drawLine = (
    first: [number, number],
    second: [number, number],
    widthPx = 2
  ) => {
    els.push(
      `<line x1="${first[0].toFixed(1)}" y1="${first[1].toFixed(1)}" x2="${second[0].toFixed(1)}" y2="${second[1].toFixed(1)}" stroke="${COLOR_INK}" stroke-width="${widthPx}" stroke-linecap="round" />`
    );
  };
  const drawGlycosidicLine = (
    first: [number, number],
    second: [number, number]
  ) => {
    els.push(
      `<line class="glycosidic-link" x1="${first[0].toFixed(1)}" y1="${first[1].toFixed(1)}" x2="${second[0].toFixed(1)}" y2="${second[1].toFixed(1)}" stroke="${COLOR_INK}" stroke-width="2" stroke-linecap="round" />`
    );
  };

  ringOrder.forEach((ringIndex) => {
    const solved = solvedRings[ringIndex];
    const frame = ringFrames.get(ringIndex)!;
    const pts = frame.points;
    const lastPt = pts[solved.ringSize - 1];
    const oPt = pts[0];
    const c1Pt = pts[1];
    const oIn = shrinkStart(oPt, lastPt, 14 * scale);
    drawLine(lastPt, oIn);
    const oOut = shrinkStart(oPt, c1Pt, 14 * scale);
    drawLine(oOut, c1Pt);

    if (solved.ringSize === 6) drawLine(pts[4], pts[5]);
    els.push(
      `<polygon points="${pts[1][0].toFixed(1)},${(pts[1][1] - 1.1 * scale).toFixed(1)} ${pts[1][0].toFixed(1)},${(pts[1][1] + 1.1 * scale).toFixed(1)} ${(pts[2][0] + 2 * scale).toFixed(1)},${(pts[2][1] + 3.2 * scale).toFixed(1)} ${(pts[2][0] - 2 * scale).toFixed(1)},${(pts[2][1] - 2.4 * scale).toFixed(1)}" fill="${COLOR_INK}" />`
    );
    els.push(
      `<polygon points="${pts[4][0].toFixed(1)},${(pts[4][1] - 1.1 * scale).toFixed(1)} ${pts[4][0].toFixed(1)},${(pts[4][1] + 1.1 * scale).toFixed(1)} ${(pts[3][0] + 2 * scale).toFixed(1)},${(pts[3][1] - 2.4 * scale).toFixed(1)} ${(pts[3][0] - 2 * scale).toFixed(1)},${(pts[3][1] + 3.2 * scale).toFixed(1)}" fill="${COLOR_INK}" />`
    );
    els.push(
      `<polygon points="${pts[2][0].toFixed(1)},${(pts[2][1] - 2.6 * scale).toFixed(1)} ${pts[2][0].toFixed(1)},${(pts[2][1] + 3.2 * scale).toFixed(1)} ${pts[3][0].toFixed(1)},${(pts[3][1] + 3.2 * scale).toFixed(1)} ${pts[3][0].toFixed(1)},${(pts[3][1] - 2.6 * scale).toFixed(1)}" fill="${COLOR_INK}" />`
    );
    els.push(
      `<text x="${oPt[0].toFixed(1)}" y="${(oPt[1] + 6 * scale).toFixed(1)}" text-anchor="middle" font-size="${18 * scale}" font-weight="700" fill="${atomColor(8, options.colorHeteroatoms)}">O</text>`
    );

    const bondLen = 48 * scale;
    for (let ringPos = 1; ringPos < solved.ringSize; ringPos++) {
      const [px, py] = pts[ringPos];
      const substituents = solved.subsByPos.get(ringPos) || [];
      for (const sub of substituents) {
        const isUp = ringSubIsUp(sub);
        const yEnd = isUp ? py - bondLen : py + bondLen;
        const startOffset = !isUp && (ringPos === 2 || ringPos === 3) ? 3 * scale : 0;
        const start: [number, number] = [px, py + startOffset];
        const end: [number, number] = [px, yEnd];
        const drawSubstituentBond = () => {
          if (sub.direction === 'UNKNOWN') {
            els.push(wavyVerticalBondSvg(px, start[1], end[1], scale));
          } else {
            drawLine(start, end);
          }
        };
        if (linkedSubAtoms.has(sub.atomIdx)) {
          drawSubstituentBond();
          const linkerLabel = linkedSubLabels.get(sub.atomIdx);
          if (linkerLabel) {
            const textY = isUp ? yEnd - 6 * scale : yEnd + 14 * scale;
            els.push(
              `<text x="${px.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-size="${15.5 * scale}" font-weight="600" fill="${atomColor(6, options.colorHeteroatoms)}">${linkerLabel}</text>`
            );
          }
          continue;
        }
        drawSubstituentBond();

        let displayText = sub.label;
        if (sub.label === 'OH' && (ringPos === 4 || ringPos === 5) && !isUp) {
          displayText = 'HO';
        }
        if (sub.label === 'OH' && ringPos === 3) displayText = 'HO';
        const textY = isUp ? yEnd - 6 * scale : yEnd + 14 * scale;
        els.push(
          `<text x="${px.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" font-size="${15.5 * scale}" font-weight="600" fill="${atomColor(sub.atomicNo, options.colorHeteroatoms)}">${escapeXml(displayText)}</text>`
        );
      }

      if (options.showCarbonNumbers) {
        const labelDx = ringPos === 1 ? 18 : ringPos === 4 || ringPos === 5 ? -18 : 0;
        const labelDy = ringPos === 2 || ringPos === 3 ? -10 : 4;
        els.push(
          `<text x="${(px + labelDx * scale).toFixed(1)}" y="${(py + labelDy * scale).toFixed(1)}" text-anchor="middle" font-size="${10.5 * scale}" font-family="'IBM Plex Mono', monospace" fill="${COLOR_MUTED}">${ringPos}</text>`
        );
      }
    }
  });

  for (const bridge of bridges) {
    const [first, second] = bridge.attachments;
    const firstFrame = ringFrames.get(first.ringIndex)!;
    const secondFrame = ringFrames.get(second.ringIndex)!;
    const firstPoint = firstFrame.points[first.ringPos];
    const secondPoint = secondFrame.points[second.ringPos];
    const getBridgeEnd = (attachment: Attachment, point: [number, number]) => {
      const isUp = ringSubIsUp(attachment.sub);
      const endY = point[1] + (isUp ? -bondLen : bondLen);
      return [
        point[0],
        endY +
          (attachment.linkerAtomIdx === undefined
            ? 0
            : (isUp ? -24 : 28) * scale),
      ] as [number, number];
    };
    const firstEnd = getBridgeEnd(first, firstPoint);
    const secondEnd = getBridgeEnd(second, secondPoint);
    const oxygenPoint: [number, number] = [
      (firstEnd[0] + secondEnd[0]) / 2,
      (firstEnd[1] + secondEnd[1]) / 2,
    ];
    drawGlycosidicLine(firstEnd, oxygenPoint);
    drawGlycosidicLine(oxygenPoint, secondEnd);
    els.push(
      `<text x="${oxygenPoint[0].toFixed(1)}" y="${(oxygenPoint[1] + 4 * scale).toFixed(1)}" text-anchor="middle" font-size="${16 * scale}" font-weight="700" fill="${atomColor(8, options.colorHeteroatoms)}" paint-order="stroke" stroke="white" stroke-width="4" stroke-linejoin="round">O</text>`
    );
  }

  const residueNotes = ringOrder.map((ringIndex, index) => {
    const anomer = solvedRings[ringIndex].anomerLabel;
    const anomerUnspecified = (
      solvedRings[ringIndex].subsByPos.get(1) || []
    ).some(
      (sub) => sub.isAnomericSubstituent && sub.direction === 'UNKNOWN'
    );
    return `${index + 1}. Zuckerrest${anomer ? `: ${anomer}-Anomer` : anomerUnspecified ? ': Anomer unbekannt' : ''}`;
  });
  return {
    eligible: true,
    svg: `<svg id="mol-haworth-linked" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <style>text { font-family: 'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif; }</style>
  ${els.join('\n  ')}
</svg>`,
    titleSuffix: 'Haworth-Projektion',
    alignmentNotes: `Haworth-Darstellung mit ${solvedRings.length} glycosidisch verknüpften Zucker-Ringen; Bindungen und Substituenten sind aus der datenbankverifizierten Struktur übernommen. ${residueNotes.join(', ')}.`,
  };
}

function renderChairProjection(
  origMol: OCL.Molecule,
  options: DisplayOptions
): ProjectionRenderResult {
  if (origMol.getRingSet().getSize() > 1) {
    return {
      eligible: false,
      ineligibleReason:
        'Die Sesselkonformation wird hier nur für einzelne Monosaccharid-Ringe angezeigt. Für verknüpfte Zucker nutze Haworth oder SNFG.',
    };
  }
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
  if (
    [...solved.subsByPos.values()]
      .flat()
      .some((sub) => sub.direction === 'UNKNOWN')
  ) {
    return {
      eligible: false,
      ineligibleReason:
        'Die Stereochemie eines oder mehrerer Substituenten ist nicht spezifiziert; eine eindeutige Sesselkonformation kann daher nicht dargestellt werden.',
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
      const subUp = ringSubIsUp(sub);
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
  let result: ProjectionRenderResult;
  switch (projection) {
    case 'skelett':
      result = renderSkeletalProjection(mol, options);
      break;
    case 'fischer':
      result = renderFischerProjection(mol, options);
      break;
    case 'haworth':
      result = renderHaworthProjection(mol, options);
      break;
    case 'sessel':
      result = renderChairProjection(mol, options);
      break;
    case 'glycan':
      result = {
        eligible: false,
        ineligibleReason:
          'Glykan-Diagramme benötigen eine verknüpfte GlyTouCan-Accession oder eine GlyTouCan-ID.',
      };
      break;
  }

  if (result.svg && options.hideNonAtomAnnotations) {
    result.svg = hideNonAtomAnnotations(result.svg);
  }
  return result;
}

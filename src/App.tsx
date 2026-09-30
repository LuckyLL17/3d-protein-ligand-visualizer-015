import { Fragment, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Billboard, ContactShadows, Line, OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

type DisplayMode = 'cartoon' | 'surface' | 'atoms';
type Residue = {
  id: number;
  code: string;
  name: string;
  x: number;
  y: number;
  z: number;
  color: string;
  role: 'active' | 'support' | 'loop';
};
type Atom = {
  id: string;
  element: 'C' | 'N' | 'O' | 'S';
  x: number;
  y: number;
  z: number;
  color: string;
  radius: number;
};
type ModePolicy = {
  label: string;
  objects: string;
  material: string;
  residueLabels: boolean;
  residuePicking: boolean;
  interactions: 'overlay' | 'hidden';
};

const residues: Residue[] = [
  { id: 41, code: 'GLU41', name: '谷氨酸', x: -1.6, y: .4, z: .5, color: '#ef8e77', role: 'active' },
  { id: 78, code: 'TYR78', name: '酪氨酸', x: -.7, y: 1.15, z: -.25, color: '#f0c76e', role: 'support' },
  { id: 102, code: 'HIS102', name: '组氨酸', x: .4, y: .75, z: .2, color: '#71c9e6', role: 'active' },
  { id: 146, code: 'ASP146', name: '天冬氨酸', x: 1.2, y: .15, z: -.45, color: '#e88389', role: 'active' },
  { id: 183, code: 'PHE183', name: '苯丙氨酸', x: 1.8, y: .7, z: .35, color: '#c28ce8', role: 'support' },
  { id: 219, code: 'SER219', name: '丝氨酸', x: .55, y: -.3, z: -.65, color: '#8fd6a2', role: 'loop' },
  { id: 244, code: 'GLY244', name: '甘氨酸', x: -1.05, y: -.55, z: -.3, color: '#9aabb4', role: 'loop' }
];

const ligandAtoms: Atom[] = [
  { id: 'C1', element: 'C', x: 0, y: 0, z: 0, color: '#d6e1e4', radius: .17 },
  { id: 'C2', element: 'C', x: .55, y: .26, z: .08, color: '#d6e1e4', radius: .17 },
  { id: 'N1', element: 'N', x: .98, y: -.18, z: .18, color: '#54b9e3', radius: .2 },
  { id: 'O1', element: 'O', x: -.48, y: .35, z: .05, color: '#ec7474', radius: .18 },
  { id: 'O2', element: 'O', x: -.15, y: -.5, z: -.1, color: '#ec7474', radius: .18 },
  { id: 'S1', element: 'S', x: .42, y: .05, z: -.62, color: '#e7c35f', radius: .24 }
];
const ligandBonds: [string, string][] = [['C1', 'C2'], ['C1', 'O1'], ['C1', 'O2'], ['C2', 'N1'], ['C2', 'S1']];
const ligandGroupPosition: [number, number, number] = [.1, .45, .15];

const MODE_POLICY: Record<DisplayMode, ModePolicy> = {
  cartoon: {
    label: '卡通带状',
    objects: '蛋白二级结构带、Cα 残基标记、残基文字标签和配体',
    material: '不透明带状材质；残基和配体使用标准光照球体',
    residueLabels: true,
    residuePicking: true,
    interactions: 'overlay'
  },
  surface: {
    label: '表面模型',
    objects: '连续蛋白表面包络、配体和当前残基选择环',
    material: '半透明表面材质，可叠加线框；不渲染卡通带、原子层或标签',
    residueLabels: false,
    residuePicking: false,
    interactions: 'hidden'
  },
  atoms: {
    label: '原子视图',
    objects: '蛋白重原子、蛋白共价键、配体原子和配体键',
    material: '球体表示原子、圆柱表示键；相互作用单独使用虚线叠加',
    residueLabels: false,
    residuePicking: true,
    interactions: 'overlay'
  }
};

const helixPoints = Array.from({ length: 46 }, (_, index) => {
  const t = index / 45;
  return new THREE.Vector3(
    -3.2 + t * 6.4,
    Math.sin(t * Math.PI * 4) * .72 + Math.cos(t * Math.PI * 2) * .18,
    Math.cos(t * Math.PI * 3) * .74
  );
});
const sheetPoints = Array.from({ length: 22 }, (_, index) =>
  new THREE.Vector3(-3.5 + index * .33, 1.4 + Math.sin(index * .55) * .16, -.9 + Math.sin(index * .55) * .25)
);

type LocalAtom = {
  suffix: string;
  element: 'C' | 'N' | 'O';
  position: [number, number, number];
  radius: number;
};
type ResidueAtomGroup = {
  residue: Residue;
  atoms: LocalAtom[];
  bonds: [string, string][];
};
const proteinElementColor: Record<LocalAtom['element'], string> = {
  C: '#9fc4db',
  N: '#5dbce8',
  O: '#ef7d79'
};
const localAtomTemplate: LocalAtom[] = [
  { suffix: 'N', element: 'N', position: [-.20, .04, 0], radius: .105 },
  { suffix: 'CA', element: 'C', position: [0, 0, 0], radius: .13 },
  { suffix: 'C', element: 'C', position: [.20, .05, -.02], radius: .105 },
  { suffix: 'O', element: 'O', position: [.25, .19, .05], radius: .1 },
  { suffix: 'CB', element: 'C', position: [-.02, .22, .13], radius: .115 }
];
const localBondTemplate: [string, string][] = [['N', 'CA'], ['CA', 'C'], ['C', 'O'], ['CA', 'CB']];
const residueAtomGroups: ResidueAtomGroup[] = residues.map(residue => {
  const atoms = residue.code.startsWith('GLY')
    ? localAtomTemplate.filter(atom => atom.suffix !== 'CB')
    : localAtomTemplate;
  const bonds = residue.code.startsWith('GLY')
    ? localBondTemplate.filter(([from, to]) => from !== 'CB' && to !== 'CB')
    : localBondTemplate;
  return { residue, atoms, bonds };
});

type Vec3Tuple = [number, number, number];
type Interaction = { residue: Residue; start: Vec3Tuple; end: Vec3Tuple; atomId: string };

function createRibbonGeometry(points: THREE.Vector3[], width: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const fallbackSide = new THREE.Vector3(0, 0, 1);

  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up);
    if (side.lengthSq() < .001) side.crossVectors(tangent, fallbackSide);
    side.normalize().multiplyScalar(width / 2);

    const left = point.clone().sub(side);
    const right = point.clone().add(side);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    uvs.push(0, index / (points.length - 1), 1, index / (points.length - 1));
  });

  for (let index = 0; index < points.length - 1; index++) {
    const leftCurrent = index * 2;
    const rightCurrent = leftCurrent + 1;
    const leftNext = leftCurrent + 2;
    const rightNext = leftCurrent + 3;
    indices.push(leftCurrent, leftNext, rightCurrent, rightCurrent, leftNext, rightNext);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createPocketSurfaceGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 5);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const point = new THREE.Vector3();

  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    const wave = Math.sin(point.x * 8.2 + point.y * 3.0) * Math.cos(point.z * 7.1 - point.y * 2.2);
    const ripple = Math.sin((point.x + point.y - point.z) * 13.5) * .5;
    const scale = 1 + .075 * wave + .028 * ripple;
    position.setXYZ(index, point.x * scale, point.y * scale, point.z * scale);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function CylinderBond({ start, end, radius, color }: { start: Vec3Tuple; end: Vec3Tuple; radius: number; color: string }) {
  const transform = useMemo(() => {
    const startVector = new THREE.Vector3(...start);
    const endVector = new THREE.Vector3(...end);
    const direction = endVector.clone().sub(startVector);
    const length = direction.length();
    const midpoint = startVector.clone().add(endVector).multiplyScalar(.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    return { midpoint, quaternion, length };
  }, [start, end]);

  return (
    <mesh position={transform.midpoint} quaternion={transform.quaternion}>
      <cylinderGeometry args={[radius, radius, transform.length, 14]} />
      <meshStandardMaterial color={color} roughness={.32} metalness={.08} />
    </mesh>
  );
}

function Ligand({
  rotation,
  selectedAtom,
  onSelect
}: {
  rotation: number;
  selectedAtom: string;
  onSelect: (id: string) => void;
}) {
  const positions = useMemo(
    () => new Map(ligandAtoms.map(atom => [atom.id, new THREE.Vector3(atom.x, atom.y, atom.z)])),
    []
  );

  return (
    <group name="ligand" position={ligandGroupPosition} rotation={[0, rotation, 0]}>
      <group name="ligand-bonds">
        {ligandBonds.map(([from, to]) => (
          <CylinderBond
            key={`${from}-${to}`}
            start={[positions.get(from)!.x, positions.get(from)!.y, positions.get(from)!.z]}
            end={[positions.get(to)!.x, positions.get(to)!.y, positions.get(to)!.z]}
            radius={.045}
            color="#aac5cf"
          />
        ))}
      </group>
      <group name="ligand-atoms">
        {ligandAtoms.map(atom => {
          const selected = selectedAtom === atom.id;
          return (
            <mesh
              key={atom.id}
              position={[atom.x, atom.y, atom.z]}
              scale={selected ? 1.35 : 1}
              onClick={event => {
                event.stopPropagation();
                onSelect(atom.id);
              }}
            >
              <sphereGeometry args={[atom.radius, 18, 14]} />
              <meshStandardMaterial
                color={atom.color}
                roughness={.24}
                metalness={.06}
                emissive={selected ? atom.color : '#000000'}
                emissiveIntensity={selected ? .75 : 0}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

function CartoonLayer({
  selectedResidue,
  onSelectResidue
}: {
  selectedResidue: number;
  onSelectResidue: (id: number) => void;
}) {
  const helixGeometry = useMemo(() => createRibbonGeometry(helixPoints, .24), []);
  const sheetGeometry = useMemo(() => createRibbonGeometry(sheetPoints, .34), []);

  return (
    <group name="cartoon-protein">
      <mesh geometry={helixGeometry}>
        <meshStandardMaterial color="#6b9fe9" roughness={.44} metalness={.06} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={sheetGeometry}>
        <meshStandardMaterial color="#d58acb" roughness={.4} metalness={.06} side={THREE.DoubleSide} />
      </mesh>

      <group name="residue-calpha-markers">
        {residues.map(residue => {
          const selected = selectedResidue === residue.id;
          return (
            <group key={residue.id} name={`residue-${residue.id}`} position={[residue.x, residue.y, residue.z]}>
              <mesh
                onClick={event => {
                  event.stopPropagation();
                  onSelectResidue(residue.id);
                }}
              >
                <sphereGeometry args={[selected ? .28 : .18, 18, 14]} />
                <meshStandardMaterial
                  color={residue.color}
                  roughness={.32}
                  metalness={.05}
                  emissive={selected ? residue.color : '#000000'}
                  emissiveIntensity={selected ? .85 : 0}
                />
              </mesh>
              <Billboard position={[0, .46, 0]}>
                <Text
                  fontSize={.14}
                  color={selected ? '#ffe9a2' : '#9fc4cc'}
                  anchorX="center"
                  outlineWidth={.004}
                  outlineColor="#07131a"
                >
                  {residue.code}
                </Text>
              </Billboard>
            </group>
          );
        })}
      </group>
    </group>
  );
}

function AtomicLayer({
  selectedResidue,
  onSelectResidue
}: {
  selectedResidue: number;
  onSelectResidue: (id: number) => void;
}) {
  return (
    <group name="protein-atoms">
      {residueAtomGroups.map(group => (
        <group
          key={group.residue.id}
          name={`residue-${group.residue.id}`}
          position={[group.residue.x, group.residue.y, group.residue.z]}
        >
          <group name="covalent-bonds">
            {group.bonds.map(([fromSuffix, toSuffix]) => {
              const from = group.atoms.find(atom => atom.suffix === fromSuffix)!;
              const to = group.atoms.find(atom => atom.suffix === toSuffix)!;
              return (
                <CylinderBond
                  key={`${fromSuffix}-${toSuffix}`}
                  start={from.position}
                  end={to.position}
                  radius={.035}
                  color="#93b4c2"
                />
              );
            })}
          </group>
          <group name="heavy-atoms">
            {group.atoms.map(atom => {
              const selected = selectedResidue === group.residue.id;
              return (
                <mesh
                  key={atom.suffix}
                  position={atom.position}
                  scale={selected && atom.suffix === 'CA' ? 1.22 : 1}
                  onClick={event => {
                    event.stopPropagation();
                    onSelectResidue(group.residue.id);
                  }}
                >
                  <sphereGeometry args={[atom.radius, 16, 12]} />
                  <meshStandardMaterial
                    color={proteinElementColor[atom.element]}
                    roughness={.26}
                    metalness={.06}
                    emissive={selected ? '#ffd36a' : '#000000'}
                    emissiveIntensity={selected ? .72 : 0}
                  />
                </mesh>
              );
            })}
          </group>
        </group>
      ))}
    </group>
  );
}

function SurfaceLayer({
  selectedResidue,
  opacity,
  wireframe
}: {
  selectedResidue: number;
  opacity: number;
  wireframe: boolean;
}) {
  const geometry = useMemo(createPocketSurfaceGeometry, []);
  const residue = residues.find(item => item.id === selectedResidue) ?? residues[2];
  const surfacePosition: Vec3Tuple = [0, .35, .05];
  const surfaceScale: Vec3Tuple = [3.55, 1.85, 2.35];

  return (
    <group name="protein-surface">
      <mesh geometry={geometry} position={surfacePosition} scale={surfaceScale} renderOrder={1}>
        <meshStandardMaterial
          color="#4db7cf"
          roughness={.18}
          metalness={.05}
          transparent
          opacity={opacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {wireframe && (
        <mesh geometry={geometry} position={surfacePosition} scale={surfaceScale} renderOrder={2}>
          <meshBasicMaterial
            color="#a9e9f5"
            wireframe
            transparent
            opacity={Math.min(.85, opacity + .25)}
            depthWrite={false}
          />
        </mesh>
      )}
      <Billboard position={[residue.x, residue.y, residue.z]}>
        <mesh renderOrder={4}>
          <ringGeometry args={[.31, .38, 40]} />
          <meshBasicMaterial
            color="#ffe08a"
            transparent
            opacity={.95}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
        <mesh renderOrder={4}>
          <circleGeometry args={[.08, 24]} />
          <meshBasicMaterial color="#ffe08a" transparent opacity={.95} depthTest={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

function InteractionLayer({
  interactions,
  selectedResidue
}: {
  interactions: Interaction[];
  selectedResidue: number;
}) {
  return (
    <group name="noncovalent-interactions">
      {interactions.map(interaction => {
        const selected = interaction.residue.id === selectedResidue;
        return (
          <Fragment key={interaction.residue.id}>
            <Line
              points={[interaction.start, interaction.end]}
              color="#f2c86b"
              opacity={selected ? 1 : .42}
              transparent
              dashed
              dashSize={.09}
              gapSize={.055}
              lineWidth={selected ? 3.4 : 1.6}
            />
            <mesh position={interaction.end} renderOrder={3}>
              <sphereGeometry args={[.045, 12, 8]} />
              <meshBasicMaterial color="#f2c86b" transparent opacity={selected ? 1 : .55} />
            </mesh>
          </Fragment>
        );
      })}
    </group>
  );
}

function ProteinModel({
  displayMode,
  selectedResidue,
  onSelectResidue,
  selectedAtom,
  onSelectAtom,
  ligandRotation,
  showInteractions,
  interactions,
  surfaceOpacity,
  showWireframe
}: {
  displayMode: DisplayMode;
  selectedResidue: number;
  onSelectResidue: (id: number) => void;
  selectedAtom: string;
  onSelectAtom: (id: string) => void;
  ligandRotation: number;
  showInteractions: boolean;
  interactions: Interaction[];
  surfaceOpacity: number;
  showWireframe: boolean;
}) {
  const policy = MODE_POLICY[displayMode];

  return (
    <Canvas shadows camera={{ position: [8, 5.5, 9], fov: 40 }}>
      <color attach="background" args={['#09151d']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2.4} castShadow />
      <pointLight position={[-4, 3, 3]} color="#7fe0ff" intensity={18} distance={11} />

      <group rotation={[.08, -.25, 0]}>
        {/* Exactly one protein representation is mounted; React swaps it in one commit. */}
        {displayMode === 'cartoon' && (
          <CartoonLayer selectedResidue={selectedResidue} onSelectResidue={onSelectResidue} />
        )}
        {displayMode === 'surface' && (
          <SurfaceLayer
            selectedResidue={selectedResidue}
            opacity={surfaceOpacity}
            wireframe={showWireframe}
          />
        )}
        {displayMode === 'atoms' && (
          <AtomicLayer selectedResidue={selectedResidue} onSelectResidue={onSelectResidue} />
        )}

        <Ligand rotation={ligandRotation} selectedAtom={selectedAtom} onSelect={onSelectAtom} />

        {policy.interactions === 'overlay' && showInteractions && (
          <InteractionLayer interactions={interactions} selectedResidue={selectedResidue} />
        )}
      </group>

      <ContactShadows position={[0, -1.5, 0]} opacity={.32} scale={10} blur={2.5} />
      <OrbitControls makeDefault minDistance={5} maxDistance={16} />
    </Canvas>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export default function App() {
  const [mode, setMode] = useState<DisplayMode>('cartoon');
  const [selectedResidue, setSelectedResidue] = useState(102);
  const [selectedAtom, setSelectedAtom] = useState('N1');
  const [ligandRotation, setLigandRotation] = useState(.2);
  const [showInteractions, setShowInteractions] = useState(true);
  const [surfaceOpacity, setSurfaceOpacity] = useState(.32);
  const [showWireframe, setShowWireframe] = useState(false);

  const residue = residues.find(item => item.id === selectedResidue) ?? residues[2];
  const policy = MODE_POLICY[mode];

  const interactions = useMemo<Interaction[]>(() => {
    const cosine = Math.cos(ligandRotation);
    const sine = Math.sin(ligandRotation);
    const ligandWorldAtoms = ligandAtoms.map(atom => ({
      id: atom.id,
      position: [
        ligandGroupPosition[0] + atom.x * cosine + atom.z * sine,
        ligandGroupPosition[1] + atom.y,
        ligandGroupPosition[2] - atom.x * sine + atom.z * cosine
      ] as Vec3Tuple
    }));

    return residues
      .filter(item => item.role === 'active')
      .map(item => {
        let best = ligandWorldAtoms[0];
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const atom of ligandWorldAtoms) {
          const distance =
            (atom.position[0] - item.x) ** 2 +
            (atom.position[1] - item.y) ** 2 +
            (atom.position[2] - item.z) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            best = atom;
          }
        }
        return {
          residue: item,
          start: [item.x, item.y, item.z] as Vec3Tuple,
          end: best.position,
          atomId: best.id
        };
      });
  }, [ligandRotation]);

  const labelStatus = policy.residueLabels ? '显示残基标签' : '当前模式不支持文字标签，已隐藏';
  const interactionStatus =
    policy.interactions === 'hidden'
      ? '表面模式不支持相互作用叠加，已隐藏'
      : showInteractions
        ? '黄色虚线叠加显示'
        : '已由开关关闭';
  const pickingStatus = policy.residuePicking
    ? '可点击模型中的残基/蛋白原子'
    : '表面不响应残基点击，请使用左侧列表';
  const surfaceMaterialStatus = `半透明表面 ${Math.round(surfaceOpacity * 100)}%${showWireframe ? ' · 线框开启' : ''}`;

  const legendItems =
    mode === 'cartoon'
      ? [
          { className: 'ribbon', label: '蛋白带' },
          { className: 'residue', label: '残基/标签' },
          { className: 'ligand', label: '配体原子' },
          { className: 'interaction', label: '相互作用' }
        ]
      : mode === 'surface'
        ? [
            { className: 'surface', label: '透明表面' },
            { className: showWireframe ? 'wireframe' : 'wireframe muted', label: '线框叠加' },
            { className: 'ligand', label: '配体原子' },
            { className: 'beacon', label: '残基选择' },
            { className: 'interaction disabled', label: '作用已隐藏' }
          ]
        : [
            { className: 'residue', label: '蛋白原子' },
            { className: 'bond', label: '共价键' },
            { className: 'ligand', label: '配体原子' },
            { className: 'interaction', label: '相互作用' }
          ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">P</div>
          <div>
            <span className="eyebrow">STRUCTURAL BIOLOGY / ANALYSIS WORKSPACE</span>
            <h1>Protein Atlas <span>·</span> 配体结合可视化</h1>
          </div>
        </div>
        <div className="header-meta">
          <span className="dataset">PDB-LITE / 1MOL</span>
          <button
            disabled={mode === 'surface'}
            title={mode === 'surface' ? '表面模式不支持相互作用叠加' : '显示或隐藏非共价相互作用'}
            onClick={() => setShowInteractions(value => !value)}
          >
            {mode === 'surface' ? '相互作用已隐藏' : showInteractions ? '隐藏相互作用' : '显示相互作用'}
          </button>
          <button onClick={() => setLigandRotation(value => value + .35)}>旋转配体 ↻</button>
        </div>
      </header>

      <main className="layout">
        <section className="model-card">
          <div className="model-head">
            <div>
              <span className="eyebrow">MOLECULAR VIEWER</span>
              <h2>蛋白质结合口袋 · Ligand LIG-17</h2>
            </div>
            <div className="mode-switch">
              {(['cartoon', 'surface', 'atoms'] as DisplayMode[]).map(item => (
                <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>
                  {MODE_POLICY[item].label}
                </button>
              ))}
            </div>
          </div>

          <div className="canvas-wrap">
            <ProteinModel
              displayMode={mode}
              selectedResidue={selectedResidue}
              onSelectResidue={setSelectedResidue}
              ligandRotation={ligandRotation}
              selectedAtom={selectedAtom}
              onSelectAtom={setSelectedAtom}
              showInteractions={showInteractions}
              interactions={interactions}
              surfaceOpacity={surfaceOpacity}
              showWireframe={showWireframe}
            />

            <div className="viewer-toolbar">
              <span className="eyebrow">MODE SEMANTICS / {policy.label}</span>
              <p>{policy.objects}</p>
              <dl>
                <dt>材质</dt>
                <dd>{mode === 'surface' ? surfaceMaterialStatus : policy.material}</dd>
                <dt>标签</dt>
                <dd className={policy.residueLabels ? 'supported' : 'unsupported'}>{labelStatus}</dd>
                <dt>相互作用</dt>
                <dd className={policy.interactions === 'overlay' ? 'supported' : 'unsupported'}>{interactionStatus}</dd>
                <dt>交互</dt>
                <dd>{pickingStatus}</dd>
              </dl>
              {mode === 'surface' && (
                <div className="surface-controls">
                  <label>
                    <span>表面透明度 <b>{Math.round(surfaceOpacity * 100)}%</b></span>
                    <input
                      type="range"
                      min=".12"
                      max=".72"
                      step=".01"
                      value={surfaceOpacity}
                      onChange={event => setSurfaceOpacity(Number(event.target.value))}
                    />
                  </label>
                  <button
                    className={showWireframe ? 'active' : ''}
                    onClick={() => setShowWireframe(value => !value)}
                  >
                    {showWireframe ? '关闭线框' : '线框叠加'}
                  </button>
                </div>
              )}
            </div>

            <div className="viewer-legend">
              {legendItems.map(item => <span key={item.label}><i className={item.className} />{item.label}</span>)}
            </div>
            <div className="viewer-hint">左键旋转 · 滚轮缩放 · 选择在模式切换后保留</div>
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel intro-panel">
            <span className="eyebrow">ACTIVE SITE</span>
            <h3>结合口袋分析</h3>
            <p>当前模型显示 7 个关键残基和一个小分子配体。三种模式共享残基与配体原子选择，但分别使用独立的可见对象和材质语义。</p>
            <div className="metrics">
              <Metric label="口袋体积" value="486 Å³" note="预测区域" />
              <Metric label="结合残基" value="5" note="3 active / 2 support" />
              <Metric label="氢键" value="4" note="几何筛选" />
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <div>
                <span className="eyebrow">RESIDUES</span>
                <h3>关键残基</h3>
              </div>
              <span className="count">{residues.length}</span>
            </div>
            <div className="residue-list">
              {residues.map(item => (
                <button
                  key={item.id}
                  className={selectedResidue === item.id ? 'residue selected' : 'residue'}
                  onClick={() => setSelectedResidue(item.id)}
                >
                  <span className="residue-color" style={{ background: item.color }} />
                  <span>
                    <b>{item.code}</b>
                    <small>{item.name}</small>
                  </span>
                  <em>{item.role === 'active' ? 'ACTIVE' : item.role === 'support' ? 'SUPPORT' : 'LOOP'}</em>
                </button>
              ))}
            </div>
          </section>

          <section className="panel detail-panel">
            <span className="eyebrow">SELECTED RESIDUE</span>
            <div className="detail-title">
              <h3>{residue.code}</h3>
              <span>{residue.name}</span>
            </div>
            <div className="detail-grid">
              <div>
                <span>空间坐标</span>
                <b>{residue.x.toFixed(2)} / {residue.y.toFixed(2)} / {residue.z.toFixed(2)} Å</b>
              </div>
              <div>
                <span>残基角色</span>
                <b>{residue.role === 'active' ? '结合活性位点' : residue.role === 'support' ? '口袋支撑' : '柔性环区'}</b>
              </div>
              <div>
                <span>配体距离</span>
                <b>{(1.9 + residue.id % 6 * .22).toFixed(2)} Å</b>
              </div>
              <div>
                <span>相互作用</span>
                <b>{residue.role === 'active' ? '氢键 / 极性' : '范德华力'}</b>
              </div>
            </div>
          </section>

          <section className="panel atom-panel">
            <span className="eyebrow">LIGAND ATOM</span>
            <div className="atom-row">
              <span className="atom-badge">{selectedAtom.slice(0, 1)}</span>
              <div>
                <b>{selectedAtom}</b>
                <small>点击任意支持模式中的配体原子切换</small>
              </div>
              <span className="atom-value">
                {selectedAtom === 'N1' ? '供体' : selectedAtom.startsWith('O') ? '受体' : '骨架'}
              </span>
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Line, OrbitControls, Text } from '@react-three/drei';
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

const bonds: [string, string][] = [
  ['C1', 'C2'],
  ['C1', 'O1'],
  ['C1', 'O2'],
  ['C2', 'N1'],
  ['C2', 'S1']
];

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

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const LIGAND_POSITION = new THREE.Vector3(.1, .45, .15);
const SURFACE_CENTER = new THREE.Vector3(0, .28, 0);

const modeNames: Record<DisplayMode, string> = {
  cartoon: '卡通带状',
  surface: '表面模型',
  atoms: '原子视图'
};

const modeObjects: Record<DisplayMode, string> = {
  cartoon: '蛋白带状骨架、残基锚点、配体球棍模型',
  surface: '半透明口袋表面、可选线框叠加、配体原子',
  atoms: '残基原子、主链键、配体原子与配体键'
};

const modeMaterials: Record<DisplayMode, string> = {
  cartoon: '哑光蛋白色带，残基和配体为低金属感标准材质',
  surface: '半透明双面表面，可叠加基础线框材质',
  atoms: '标准球体材质，化学键为哑光圆柱材质'
};

const modeLabelRules: Record<DisplayMode, string> = {
  cartoon: '显示残基标签；原子标签仅在原子视图提供',
  surface: '隐藏文字标签，当前选择用高亮环标记',
  atoms: '显示残基标签与配体原子标签'
};

function interactionRule(mode: DisplayMode, visible: boolean) {
  if (mode === 'surface') return '表面模式不绘制相互作用虚线';
  return visible ? '相互作用虚线已开启' : '相互作用已手动隐藏';
}

function nearestResidueId(point: THREE.Vector3) {
  return residues.reduce((best, residue) => {
    const residuePoint = new THREE.Vector3(residue.x, residue.y, residue.z);
    const bestPoint = new THREE.Vector3(best.x, best.y, best.z);
    return point.distanceToSquared(residuePoint) < point.distanceToSquared(bestPoint) ? residue : best;
  }, residues[0]).id;
}

function createRibbonGeometry(
  points: THREE.Vector3[],
  width: number,
  colorStart: string,
  colorEnd: string,
  samples = 88
) {
  const curve = new THREE.CatmullRomCurve3(points);
  const sampled = curve.getPoints(samples);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const start = new THREE.Color(colorStart);
  const end = new THREE.Color(colorEnd);
  const color = new THREE.Color();

  sampled.forEach((point, index) => {
    const tangent = curve.getTangent(index / samples).normalize();
    const side = new THREE.Vector3().crossVectors(Y_AXIS, tangent);
    if (side.lengthSq() < .0001) side.crossVectors(Z_AXIS, tangent);
    side.normalize();

    const left = point.clone().addScaledVector(side, width / 2);
    const right = point.clone().addScaledVector(side, -width / 2);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);

    color.copy(start).lerp(end, index / samples);
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);

    if (index < sampled.length - 1) {
      const a = index * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Ribbon({
  points,
  width,
  colorStart,
  colorEnd,
  arrow = false,
  onSelect
}: {
  points: THREE.Vector3[];
  width: number;
  colorStart: string;
  colorEnd: string;
  arrow?: boolean;
  onSelect: (id: number) => void;
}) {
  const geometry = useMemo(
    () => createRibbonGeometry(points, width, colorStart, colorEnd),
    [points, width, colorStart, colorEnd]
  );
  const end = points[points.length - 1];
  const tangent = end.clone().sub(points[points.length - 2]).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, tangent);

  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect(nearestResidueId(event.point));
      }}
    >
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors roughness={.38} metalness={.06} side={THREE.DoubleSide} />
      </mesh>
      {arrow && (
        <mesh position={end} quaternion={quaternion}>
          <coneGeometry args={[width * .82, .44, 18]} />
          <meshStandardMaterial color={colorEnd} roughness={.38} metalness={.06} />
        </mesh>
      )}
    </group>
  );
}

function createPocketSurfaceGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1.72, 5);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const scale = new THREE.Vector3(1.28, .74, .96);
  const baseColor = new THREE.Color('#1d7688');
  const residueColor = new THREE.Color();
  const color = new THREE.Color();
  const localResidues = residues.map(residue => ({
    residue,
    point: new THREE.Vector3(residue.x, residue.y - SURFACE_CENTER.y, residue.z)
  }));

  for (let index = 0; index < position.count; index += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(position, index);
    const noise =
      .1 * Math.sin(point.x * 3.4 + 1.2) * Math.cos(point.y * 2.7) +
      .06 * Math.sin(point.z * 4.1 + point.x * 1.8);

    let bulge = .02;
    localResidues.forEach(({ point: residuePoint }) => {
      bulge += Math.exp(-point.distanceToSquared(residuePoint) * 1.25) * .1;
    });

    point.multiplyScalar(1 + noise + bulge).multiply(scale);
    position.setXYZ(index, point.x, point.y, point.z);

    const nearest = localResidues.reduce((best, item) =>
      point.distanceToSquared(item.point) < point.distanceToSquared(best.point) ? item : best
    );
    const blend = nearest.residue.role === 'active' ? .42 : nearest.residue.role === 'support' ? .28 : .16;
    color.copy(baseColor).lerp(residueColor.set(nearest.residue.color), blend);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function SelectionRing({
  position,
  radius = .32,
  color = '#ffd977'
}: {
  position: [number, number, number];
  radius?: number;
  color?: string;
}) {
  return (
    <mesh position={position} renderOrder={12}>
      <ringGeometry args={[radius, radius + .055, 42]} />
      <meshBasicMaterial color={color} transparent opacity={.95} side={THREE.DoubleSide} depthTest={false} />
    </mesh>
  );
}

function ResidueLabel({ residue, selected }: { residue: Residue; selected: boolean }) {
  return (
    <Text
      position={[residue.x, residue.y + .36, residue.z]}
      fontSize={.12}
      color={selected ? '#ffe39b' : '#c4dce2'}
      anchorX="center"
      anchorY="middle"
      material-depthTest={false}
      renderOrder={10}
    >
      {residue.code}
    </Text>
  );
}

function ResidueNode({
  residue,
  selected,
  showLabel,
  showRing,
  radius,
  onSelect
}: {
  residue: Residue;
  selected: boolean;
  showLabel: boolean;
  showRing: boolean;
  radius: number;
  onSelect: (id: number) => void;
}) {
  return (
    <group>
      <mesh
        position={[residue.x, residue.y, residue.z]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(residue.id);
        }}
      >
        <sphereGeometry args={[radius, 18, 14]} />
        <meshStandardMaterial
          color={residue.color}
          emissive={selected ? residue.color : '#000000'}
          emissiveIntensity={selected ? .9 : 0}
          roughness={.32}
          metalness={.05}
        />
      </mesh>
      {showLabel && <ResidueLabel residue={residue} selected={selected} />}
      {selected && showRing && (
        <SelectionRing position={[residue.x, residue.y, residue.z]} radius={radius + .12} />
      )}
    </group>
  );
}

function Bond({
  start,
  end,
  radius = .035,
  color = '#b8cbd0'
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius?: number;
  color?: string;
}) {
  const placement = useMemo(() => {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const midpoint = start.clone().add(end).multiplyScalar(.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, direction.normalize());
    return { midpoint, quaternion, length };
  }, [start, end]);

  return (
    <mesh position={placement.midpoint} quaternion={placement.quaternion} renderOrder={1}>
      <cylinderGeometry args={[radius, radius, placement.length, 12]} />
      <meshStandardMaterial color={color} roughness={.42} metalness={.12} />
    </mesh>
  );
}

function CartoonLayer({
  selectedResidue,
  onSelectResidue
}: {
  selectedResidue: number;
  onSelectResidue: (id: number) => void;
}) {
  return (
    <group>
      <Ribbon
        points={helixPoints}
        width={.22}
        colorStart="#65a7f0"
        colorEnd="#927be8"
        onSelect={onSelectResidue}
      />
      <Ribbon
        points={sheetPoints}
        width={.38}
        colorStart="#f2c65f"
        colorEnd="#e884c8"
        arrow
        onSelect={onSelectResidue}
      />
      {residues.map(residue => (
        <ResidueNode
          key={residue.id}
          residue={residue}
          selected={selectedResidue === residue.id}
          showLabel
          showRing={false}
          radius={selectedResidue === residue.id ? .27 : .14}
          onSelect={onSelectResidue}
        />
      ))}
    </group>
  );
}

function SurfaceLayer({
  selectedResidue,
  opacity,
  wireframe,
  onSelectResidue
}: {
  selectedResidue: number;
  opacity: number;
  wireframe: boolean;
  onSelectResidue: (id: number) => void;
}) {
  const geometry = useMemo(createPocketSurfaceGeometry, []);
  const selected = residues.find(residue => residue.id === selectedResidue) ?? residues[0];

  return (
    <group>
      <mesh
        geometry={geometry}
        position={SURFACE_CENTER}
        renderOrder={2}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelectResidue(nearestResidueId(event.point));
        }}
      >
        <meshStandardMaterial
          vertexColors
          transparent
          opacity={opacity}
          side={THREE.DoubleSide}
          roughness={.28}
          metalness={.08}
          depthWrite={false}
        />
      </mesh>
      {wireframe && (
        <mesh geometry={geometry} position={SURFACE_CENTER} renderOrder={4}>
          <meshBasicMaterial
            color="#b9f2ff"
            wireframe
            transparent
            opacity={.22}
            depthWrite={false}
          />
        </mesh>
      )}
      <SelectionRing position={[selected.x, selected.y, selected.z]} radius={.33} />
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
  const residuePoints = useMemo(
    () => residues.map(residue => new THREE.Vector3(residue.x, residue.y, residue.z)),
    []
  );

  return (
    <group>
      {residuePoints.slice(0, -1).map((point, index) => (
        <Bond
          key={`${residues[index].id}-${residues[index + 1].id}`}
          start={point}
          end={residuePoints[index + 1]}
          radius={.032}
          color="#91aeb8"
        />
      ))}
      {residues.map(residue => (
        <ResidueNode
          key={residue.id}
          residue={residue}
          selected={selectedResidue === residue.id}
          showLabel
          showRing
          radius={selectedResidue === residue.id ? .24 : .16}
          onSelect={onSelectResidue}
        />
      ))}
    </group>
  );
}

function LigandModel({
  mode,
  rotation,
  selectedAtom,
  onSelectAtom
}: {
  mode: DisplayMode;
  rotation: number;
  selectedAtom: string;
  onSelectAtom: (id: string) => void;
}) {
  const positions = useMemo(
    () => Object.fromEntries(ligandAtoms.map(atom => [atom.id, new THREE.Vector3(atom.x, atom.y, atom.z)])),
    []
  );

  return (
    <group position={LIGAND_POSITION} rotation={[0, rotation, 0]}>
      {bonds.map(([from, to]) => (
        <Bond key={`${from}-${to}`} start={positions[from]} end={positions[to]} radius={.038} />
      ))}
      {ligandAtoms.map(atom => {
        const selected = selectedAtom === atom.id;
        return (
          <group key={atom.id}>
            <mesh
              position={[atom.x, atom.y, atom.z]}
              onClick={(event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation();
                onSelectAtom(atom.id);
              }}
            >
              <sphereGeometry args={[atom.radius * (selected ? 1.22 : 1), 20, 14]} />
              <meshStandardMaterial
                color={atom.color}
                emissive={selected ? atom.color : '#000000'}
                emissiveIntensity={selected ? .85 : 0}
                roughness={.24}
                metalness={.08}
              />
            </mesh>
            {mode === 'atoms' && (
              <Text
                position={[atom.x, atom.y + atom.radius + .18, atom.z]}
                fontSize={.095}
                color={selected ? '#ffe39b' : '#dcebed'}
                anchorX="center"
                anchorY="middle"
                material-depthTest={false}
                renderOrder={10}
              >
                {atom.id}
              </Text>
            )}
            {selected && mode !== 'cartoon' && (
              <SelectionRing
                position={[atom.x, atom.y, atom.z]}
                radius={atom.radius + .12}
                color="#fff0a8"
              />
            )}
          </group>
        );
      })}
    </group>
  );
}

function InteractionLayer({ selectedAtom, rotation }: { selectedAtom: string; rotation: number }) {
  const target = useMemo(() => {
    const atom = ligandAtoms.find(item => item.id === selectedAtom) ?? ligandAtoms[0];
    return new THREE.Vector3(atom.x, atom.y, atom.z)
      .applyAxisAngle(Y_AXIS, rotation)
      .add(LIGAND_POSITION);
  }, [selectedAtom, rotation]);

  return (
    <group renderOrder={20}>
      {residues
        .filter(residue => residue.role === 'active')
        .map(residue => (
          <Line
            key={residue.id}
            points={[new THREE.Vector3(residue.x, residue.y, residue.z), target]}
            color="#ffd56b"
            lineWidth={1.6}
            dashed
            dashSize={.08}
            gapSize={.055}
            transparent
            opacity={.9}
            depthTest={false}
          />
        ))}
    </group>
  );
}

function ProteinModel({
  mode,
  selectedResidue,
  onSelectResidue,
  selectedAtom,
  onSelectAtom,
  ligandRotation,
  showInteractions,
  surfaceOpacity,
  surfaceWireframe
}: {
  mode: DisplayMode;
  selectedResidue: number;
  onSelectResidue: (id: number) => void;
  selectedAtom: string;
  onSelectAtom: (id: string) => void;
  ligandRotation: number;
  showInteractions: boolean;
  surfaceOpacity: number;
  surfaceWireframe: boolean;
}) {
  const interactionsVisible = mode !== 'surface' && showInteractions;

  return (
    <Canvas shadows camera={{ position: [8, 5.5, 9], fov: 40 }}>
      <color attach="background" args={['#09151d']} />
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 8, 5]} intensity={2.4} castShadow />
      <pointLight position={[-4, 3, 3]} color="#7fe0ff" intensity={18} distance={11} />

      <group rotation={[.08, -.25, 0]}>
        {mode === 'cartoon' && (
          <CartoonLayer selectedResidue={selectedResidue} onSelectResidue={onSelectResidue} />
        )}
        {mode === 'surface' && (
          <SurfaceLayer
            selectedResidue={selectedResidue}
            opacity={surfaceOpacity}
            wireframe={surfaceWireframe}
            onSelectResidue={onSelectResidue}
          />
        )}
        {mode === 'atoms' && (
          <AtomicLayer selectedResidue={selectedResidue} onSelectResidue={onSelectResidue} />
        )}
        <LigandModel
          mode={mode}
          rotation={ligandRotation}
          selectedAtom={selectedAtom}
          onSelectAtom={onSelectAtom}
        />
        {interactionsVisible && (
          <InteractionLayer selectedAtom={selectedAtom} rotation={ligandRotation} />
        )}
      </group>

      <ContactShadows position={[0, -1.5, 0]} opacity={.32} scale={10} blur={2.5} />
      <OrbitControls makeDefault minDistance={5} maxDistance={16} />
    </Canvas>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

const legends: Record<DisplayMode, Array<{ label: string; color: string }>> = {
  cartoon: [
    { label: '卡通带', color: '#7aa2f0' },
    { label: '残基锚点', color: '#71c9e6' },
    { label: '配体原子', color: '#d6e1e4' },
    { label: '相互作用', color: '#ffd56b' }
  ],
  surface: [
    { label: '透明表面', color: '#36a2b5' },
    { label: '线框叠加', color: '#b9f2ff' },
    { label: '配体原子', color: '#d6e1e4' },
    { label: '选择环', color: '#ffd977' }
  ],
  atoms: [
    { label: '残基原子', color: '#71c9e6' },
    { label: '化学键', color: '#b8cbd0' },
    { label: '配体原子', color: '#d6e1e4' },
    { label: '相互作用', color: '#ffd56b' }
  ]
};

const viewerHints: Record<DisplayMode, string> = {
  cartoon: '点击卡通带或残基锚点选择残基 · 点击配体原子',
  surface: '点击表面选择最近残基 · 可调节透明度或线框',
  atoms: '点击残基/配体原子 · 键按层级位于原子下方'
};

export default function App() {
  const [mode, setMode] = useState<DisplayMode>('cartoon');
  const [selectedResidue, setSelectedResidue] = useState(102);
  const [selectedAtom, setSelectedAtom] = useState('N1');
  const [ligandRotation, setLigandRotation] = useState(.2);
  const [showInteractions, setShowInteractions] = useState(true);
  const [surfaceOpacity, setSurfaceOpacity] = useState(.55);
  const [surfaceWireframe, setSurfaceWireframe] = useState(false);

  const residue = residues.find(item => item.id === selectedResidue) ?? residues[2];
  const interactionsDisabled = mode === 'surface';

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
            disabled={interactionsDisabled}
            title={interactionsDisabled ? '表面模式不显示相互作用虚线' : '切换相互作用虚线'}
            onClick={() => setShowInteractions(value => !value)}
          >
            {showInteractions ? '隐藏相互作用' : '显示相互作用'}
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
                <button
                  key={item}
                  className={mode === item ? 'active' : ''}
                  onClick={() => setMode(item)}
                >
                  {modeNames[item]}
                </button>
              ))}
            </div>
          </div>

          <div className="canvas-wrap">
            <ProteinModel
              mode={mode}
              selectedResidue={selectedResidue}
              onSelectResidue={setSelectedResidue}
              selectedAtom={selectedAtom}
              onSelectAtom={setSelectedAtom}
              ligandRotation={ligandRotation}
              showInteractions={showInteractions}
              surfaceOpacity={surfaceOpacity}
              surfaceWireframe={surfaceWireframe}
            />

            <div className="viewer-overlay">
              <div className="mode-semantics">
                <span className="eyebrow">{modeNames[mode]} MODE</span>
                <strong>{modeObjects[mode]}</strong>
                <p><label>材质</label>{modeMaterials[mode]}</p>
                <p><label>标签</label>{modeLabelRules[mode]}</p>
                <p><label>相互作用</label>{interactionRule(mode, showInteractions)}</p>
              </div>
              {mode === 'surface' && (
                <div className="surface-tools">
                  <label>
                    不透明度
                    <input
                      type="range"
                      min="18"
                      max="85"
                      value={Math.round(surfaceOpacity * 100)}
                      onChange={event => setSurfaceOpacity(Number(event.target.value) / 100)}
                    />
                    <output>{Math.round(surfaceOpacity * 100)}%</output>
                  </label>
                  <button
                    aria-pressed={surfaceWireframe}
                    onClick={() => setSurfaceWireframe(value => !value)}
                  >
                    {surfaceWireframe ? '关闭线框叠加' : '开启线框叠加'}
                  </button>
                </div>
              )}
            </div>

            <div className="viewer-legend">
              {legends[mode].map(item => (
                <span key={item.label}>
                  <i className="dot" style={{ background: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
            <div className="viewer-hint">{viewerHints[mode]}</div>
          </div>
        </section>

        <aside className="sidebar">
          <section className="panel intro-panel">
            <span className="eyebrow">ACTIVE SITE</span>
            <h3>结合口袋分析</h3>
            <p>当前模型显示 7 个关键残基和一个小分子配体。通过选择残基查看空间关系与作用类型。</p>
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
            <span className="eyebrow">SELECTED RESIDUE · 切换模式时保留</span>
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
            <span className="eyebrow">LIGAND ATOM · 切换模式时保留</span>
            <div className="atom-row">
              <span className="atom-badge">{selectedAtom.slice(0, 1)}</span>
              <div>
                <b>{selectedAtom}</b>
                <small>点击模型中的原子切换</small>
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

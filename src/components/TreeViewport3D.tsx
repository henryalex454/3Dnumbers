import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  GitBranch,
  Layers,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type { EvaluatedCriterion, EvaluationSummary } from '../engine/types';

interface TreeViewport3DProps {
  evaluation: EvaluationSummary;
  selectedCriterionId: string | null;
  onSelectCriterion: (id: string | null) => void;
}

type CameraPresetKey = 'iso' | 'line' | 'top' | 'trunk';

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  iso: { label: 'İzometrik', pos: [6.8, 5.2, 7.6], target: [0, 2.0, 0] },
  line: { label: 'Sayı Doğrusu', pos: [0, 2.5, 10.5], target: [0, 1.9, 0] },
  top: { label: 'Üstten Ağaç', pos: [0.01, 11.2, 0.8], target: [0, 1.8, 0] },
  trunk: { label: 'Gövde Odak', pos: [3.8, 3.3, 4.4], target: [0, 2.1, 0] },
};

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function statusHexColor(status: EvaluatedCriterion['status']): number {
  switch (status) {
    case 'pass':
      return 0x10b981; // emerald-500
    case 'marginal':
      return 0xf59e0b; // amber-500
    case 'fail':
      return 0xf43f5e; // rose-500
    default:
      return 0x3b82f6;
  }
}

function verdictHexColor(verdict: '+' | '-' | '+-'): number {
  if (verdict === '+') return 0x10b981;
  if (verdict === '+-') return 0xf59e0b;
  return 0xf43f5e;
}

function createTextSprite(
  title: string,
  subtitle: string | null,
  accentColor: string,
  maxAnisotropy: number,
  scaleFactor = 1.0,
  isDominant = false
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const w = isDominant ? 512 : 384;
  const h = subtitle ? (isDominant ? 176 : 128) : 96;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  // Subtle calibrated dark technical plate
  const r = 14;
  ctx.fillStyle = isDominant ? 'rgba(9, 13, 24, 0.94)' : 'rgba(13, 19, 34, 0.88)';
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = isDominant ? 3.5 : 2;
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, r);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (subtitle) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = isDominant
      ? '700 44px "JetBrains Mono", monospace'
      : '600 28px "JetBrains Mono", monospace';
    ctx.fillText(title, w / 2, h * 0.37);

    ctx.fillStyle = accentColor;
    ctx.font = isDominant
      ? '600 24px "Plus Jakarta Sans", sans-serif'
      : '500 21px "JetBrains Mono", monospace';
    ctx.fillText(subtitle, w / 2, h * 0.72);
  } else {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.fillText(title, w / 2, h / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = w / h;
  const baseH = (isDominant ? 1.05 : 0.62) * scaleFactor;
  sprite.scale.set(baseH * aspect, baseH, 1);
  sprite.renderOrder = isDominant ? 20 : 12;
  return sprite;
}

function createTickSprite(label: string, maxAnisotropy: number, highlight = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 192, 72);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = highlight ? '#60a5fa' : '#94a3b8';
  ctx.font = highlight
    ? '700 32px "JetBrains Mono", monospace'
    : '500 24px "JetBrains Mono", monospace';
  ctx.fillText(label, 96, 36);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.95, 0.36, 1);
  return sprite;
}

function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.2)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh || (obj as THREE.Line).isLine) {
      const m = obj as THREE.Mesh;
      m.geometry?.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else if (m.material) {
        m.material.dispose();
      }
    } else if ((obj as THREE.Sprite).isSprite) {
      const sp = obj as THREE.Sprite;
      sp.material.map?.dispose();
      sp.material.dispose();
    }
  });
}

export const TreeViewport3D: React.FC<TreeViewport3DProps> = ({
  evaluation,
  selectedCriterionId,
  onSelectCriterion,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPresetKey>('iso');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showGradients, setShowGradients] = useState(true);
  const [showThresholdPlane, setShowThresholdPlane] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [branchSpread, setBranchSpread] = useState(1.0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Refs for stable WebGL lifecycle
  const onSelectRef = useRef(onSelectCriterion);
  onSelectRef.current = onSelectCriterion;

  const sceneApiRef = useRef<{
    rebuildTree: (
      evalData: EvaluationSummary,
      selectedId: string | null,
      opts: {
        showDependencies: boolean;
        showGradients: boolean;
        showThresholdPlane: boolean;
        showLabels: boolean;
        branchSpread: number;
      }
    ) => void;
    flyToPreset: (preset: CameraPresetKey, anchorWorldX: number) => void;
  } | null>(null);

  // Compute anchor world X position on calibrated number line [-7, +7]
  const [rangeMin, rangeMax] = evaluation.model.numberLineRange;
  const anchorNorm =
    rangeMax > rangeMin
      ? (evaluation.model.anchorScalar - rangeMin) / (rangeMax - rangeMin)
      : 0.5;
  const anchorWorldX = Number((((Math.max(0.08, Math.min(0.92, anchorNorm))) - 0.5) * 11).toFixed(3));

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL bağlamı başlatılamadı.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.026);

    // Mandatory studio environment reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      44,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      0.1,
      120
    );
    camera.position.set(6.8, 5.2, 7.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 2.0, 0);

    // Balanced 3-point warm/cool studio lighting
    const hemiLight = new THREE.HemisphereLight(0xbcd8ff, 0x101827, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(9, 14, 9);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.1);
    rimLight.position.set(-10, 7, -8);
    scene.add(rimLight);

    // Subtle calibrated ground plane + technical grid
    const floorGeo = new THREE.PlaneGeometry(56, 56);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b1120,
      roughness: 0.92,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    floor.receiveShadow = !isSoftwareGl;
    scene.add(floor);

    const grid = new THREE.GridHelper(32, 32, 0x1e293b, 0x131c2e);
    grid.position.y = -0.02;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMats.forEach((m) => {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    });
    scene.add(grid);

    const dynamicRoot = new THREE.Group();
    scene.add(dynamicRoot);

    const shadowTex = createRadialShadowTexture();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Raycasting state
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let clickableNodes: THREE.Object3D[] = [];
    let lastHoverTs = 0;

    // Camera transition state
    let transitionActive = false;
    const targetCamPos = new THREE.Vector3();
    const targetCtrlTarget = new THREE.Vector3();
    const clock = new THREE.Clock();

    // On-demand coalesced rendering with software-GL fence pacing
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const dt = Math.min(0.05, clock.getDelta() || 0.016);

        let keepGoing = false;
        if (transitionActive) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, 7, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, 7, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, 7, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, targetCtrlTarget.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, targetCtrlTarget.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, targetCtrlTarget.z, 7, dt);

          const distPos = camera.position.distanceTo(targetCamPos);
          const distTgt = controls.target.distanceTo(targetCtrlTarget);
          if (distPos < 0.025 && distTgt < 0.025) {
            camera.position.copy(targetCamPos);
            controls.target.copy(targetCtrlTarget);
            transitionActive = false;
          } else {
            keepGoing = true;
          }
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || keepGoing) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    const onControlStart = () => {
      transitionActive = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // WebGL context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL bağlamı geçici olarak kesildi.');
    };
    const onContextRestored = () => {
      setWebglError(null);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    // Pointer picking
    const updatePointer = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTs < 45) return;
      lastHoverTs = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableNodes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.criterionId as string | undefined;
        renderer.domElement.style.cursor = 'pointer';
        setHoveredId(hitId ?? null);
      } else {
        renderer.domElement.style.cursor = 'grab';
        setHoveredId(null);
      }
    };

    let downPos = { x: 0, y: 0 };
    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (moved > 6) return; // drag orbit, not click
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableNodes, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.criterionId as string | undefined;
        onSelectRef.current(hitId ?? null);
      } else {
        onSelectRef.current(null);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ResizeObserver for responsive container
    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    // Helper: orient cylinder between two 3D points
    function createOrientedCylinder(
      p1: THREE.Vector3,
      p2: THREE.Vector3,
      rTop: number,
      rBottom: number,
      mat: THREE.Material
    ): THREE.Mesh {
      const dist = p1.distanceTo(p2);
      const geo = new THREE.CylinderGeometry(rTop, rBottom, Math.max(0.01, dist), 14);
      const mesh = new THREE.Mesh(geo, mat);
      _vec3A.addVectors(p1, p2).multiplyScalar(0.5);
      mesh.position.copy(_vec3A);
      _vec3B.subVectors(p2, p1).normalize();
      _quat.setFromUnitVectors(_upVec, _vec3B);
      mesh.quaternion.copy(_quat);
      return mesh;
    }

    // Main procedural tree builder
    function rebuildTree(
      evalData: EvaluationSummary,
      selectedId: string | null,
      opts: {
        showDependencies: boolean;
        showGradients: boolean;
        showThresholdPlane: boolean;
        showLabels: boolean;
        branchSpread: number;
      }
    ) {
      disposeObjectTree(dynamicRoot);
      dynamicRoot.clear();
      clickableNodes = [];

      const { model, evaluated, effectiveVerdict, l0Scalar, l2CompactToken } = evalData;
      const [rMin, rMax] = model.numberLineRange;
      const normPos = rMax > rMin ? (model.anchorScalar - rMin) / (rMax - rMin) : 0.5;
      const trunkX = ((Math.max(0.08, Math.min(0.92, normPos))) - 0.5) * 11;

      // ──────────────────────────────────────────────────────────────────
      // 1. CALIBRATED 1D REAL NUMBER LINE SPINE (X-AXIS)
      // ──────────────────────────────────────────────────────────────────
      const lineGroup = new THREE.Group();
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.78,
        roughness: 0.28,
      });
      const railGeo = new THREE.CylinderGeometry(0.065, 0.065, 16, 16);
      const railMesh = new THREE.Mesh(railGeo, railMat);
      railMesh.rotation.z = Math.PI / 2;
      railMesh.position.y = 0.08;
      lineGroup.add(railMesh);

      // End arrow cones for real number line (-∞ ... +∞)
      const arrowMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        metalness: 0.65,
        roughness: 0.3,
      });
      const posArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 14), arrowMat);
      posArrow.rotation.z = -Math.PI / 2;
      posArrow.position.set(8.2, 0.08, 0);
      lineGroup.add(posArrow);

      const negArrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 14), arrowMat);
      negArrow.rotation.z = Math.PI / 2;
      negArrow.position.set(-8.2, 0.08, 0);
      lineGroup.add(negArrow);

      // Tick marks along number line
      const tickCount = 10;
      const tickMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.5,
        roughness: 0.4,
      });
      for (let i = 0; i <= tickCount; i++) {
        const t = i / tickCount;
        const x = (t - 0.5) * 11;
        const val = rMin + t * (rMax - rMin);
        const isNearTrunk = Math.abs(x - trunkX) < 0.45;
        const tick = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, isNearTrunk ? 0.24 : 0.16, 0.36),
          tickMat
        );
        tick.position.set(x, 0.08, 0);
        lineGroup.add(tick);

        if (i % 2 === 0 || isNearTrunk) {
          const valLabel =
            Math.abs(val) >= 100
              ? Math.round(val).toString()
              : Number(val.toFixed(1)).toString();
          const sp = createTickSprite(valLabel, maxAniso, isNearTrunk);
          sp.position.set(x, 0.08, 0.72);
          lineGroup.add(sp);
        }
      }
      dynamicRoot.add(lineGroup);

      // ──────────────────────────────────────────────────────────────────
      // 2. DOMINANT TRUNK (COMPOSITE MULTI-PART ANCHOR SCALAR TOWER)
      // ──────────────────────────────────────────────────────────────────
      const trunkGroup = new THREE.Group();
      trunkGroup.position.set(trunkX, 0, 0);

      const verdictColor = verdictHexColor(effectiveVerdict);

      // Contact shadow directly beneath trunk on ground
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5.6, 5.6),
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          depthWrite: false,
          opacity: 0.65,
        })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.01;
      trunkGroup.add(shadowPlane);

      // Part A: Machined octagonal base flange seated flush on the number line
      const baseFlangeMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.22,
      });
      const baseFlange = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.86, 0.26, 8),
        baseFlangeMat
      );
      baseFlange.position.y = 0.13;
      baseFlange.castShadow = !isSoftwareGl;
      baseFlange.receiveShadow = !isSoftwareGl;
      trunkGroup.add(baseFlange);

      // Part B: Luminous verdict collar ring at base
      const collarMat = new THREE.MeshStandardMaterial({
        color: verdictColor,
        emissive: verdictColor,
        emissiveIntensity: 0.55,
        metalness: 0.3,
        roughness: 0.35,
      });
      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 14, 32), collarMat);
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = 0.27;
      trunkGroup.add(baseRing);

      // Part C: Dominant core trunk column (boldest, thickest element = main scalar indicator!)
      const trunkHeight = 3.85;
      const trunkSteelMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.82,
        roughness: 0.26,
      });
      const mainTrunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.38, trunkHeight, 12),
        trunkSteelMat
      );
      mainTrunk.position.y = 0.26 + trunkHeight / 2;
      mainTrunk.castShadow = !isSoftwareGl;
      trunkGroup.add(mainTrunk);

      // Part D: Vertical flutes & glowing core strip along the dominant trunk
      const accentStripMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x2563eb,
        emissiveIntensity: 0.45,
        metalness: 0.4,
        roughness: 0.3,
      });
      for (let f = 0; f < 4; f++) {
        const ang = (f * Math.PI) / 2;
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, trunkHeight * 0.88, 0.08),
          accentStripMat
        );
        rib.position.set(Math.cos(ang) * 0.29, 0.26 + trunkHeight / 2, Math.sin(ang) * 0.29);
        rib.rotation.y = -ang;
        trunkGroup.add(rib);
      }

      // Part E: Two structural branch-hub collars (Level 1 coupled hub & independent hub)
      const hubMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.9,
        roughness: 0.18,
      });
      [1.3, 1.85, 2.5].forEach((hy) => {
        const hub = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 12, 24), hubMat);
        hub.rotation.x = Math.PI / 2;
        hub.position.y = hy;
        trunkGroup.add(hub);
      });

      // Part F: Crown verdict beacon atop the trunk
      const crownPedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.26, 0.18, 12),
        baseFlangeMat
      );
      crownPedestal.position.y = 0.26 + trunkHeight + 0.09;
      trunkGroup.add(crownPedestal);

      const crownBeacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({
          color: verdictColor,
          emissive: verdictColor,
          emissiveIntensity: 0.5,
          metalness: 0.25,
          roughness: 0.2,
        })
      );
      crownBeacon.position.y = 0.26 + trunkHeight + 0.54;
      trunkGroup.add(crownBeacon);

      // Part G: Local Orthogonal 90° Axis Triad (Y: Margin/Gradient, Z: Relation Depth)
      const yAxisMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.35,
      });
      const zAxisMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.35,
      });
      // +Z orthogonal local axis rod
      const zRod = createOrientedCylinder(
        new THREE.Vector3(0, 0.14, -4.4),
        new THREE.Vector3(0, 0.14, 4.4),
        0.025,
        0.025,
        zAxisMat
      );
      trunkGroup.add(zRod);
      const zCone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 12), zAxisMat);
      zCone.rotation.x = Math.PI / 2;
      zCone.position.set(0, 0.14, 4.55);
      trunkGroup.add(zCone);

      // +Y orthogonal local axis extension tip
      const yCone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.26, 12), yAxisMat);
      yCone.position.set(0, 5.05, 0);
      trunkGroup.add(yCone);

      // Part H: Zero-Margin Boundary Threshold Plane (m = 0 at y = 2.0)
      if (opts.showThresholdPlane) {
        const planeDisc = new THREE.Mesh(
          new THREE.RingGeometry(0.45, 4.35 * opts.branchSpread, 48),
          new THREE.MeshStandardMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.08,
            roughness: 0.6,
            metalness: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
          })
        );
        planeDisc.rotation.x = -Math.PI / 2;
        planeDisc.position.y = 2.0;
        trunkGroup.add(planeDisc);

        const planeRim = new THREE.Mesh(
          new THREE.TorusGeometry(4.35 * opts.branchSpread, 0.018, 10, 64),
          new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.42,
          })
        );
        planeRim.rotation.x = Math.PI / 2;
        planeRim.position.y = 2.0;
        trunkGroup.add(planeRim);
      }

      // Dominant trunk floating label (always prominent!)
      const verdictColorCss =
        effectiveVerdict === '+' ? '#34d399' : effectiveVerdict === '+-' ? '#fbbf24' : '#fb7185';
      const trunkSprite = createTextSprite(
        l0Scalar,
        `${l2CompactToken} · ${evalData.statusLabel}`,
        verdictColorCss,
        maxAniso,
        1.08,
        true
      );
      trunkSprite.position.set(0, 5.55, 0);
      trunkGroup.add(trunkSprite);

      // ──────────────────────────────────────────────────────────────────
      // 3. RELATIONSHIP-LEVEL BRANCHES (LEVEL 1 & LEVEL 2) + VECTORS
      // ──────────────────────────────────────────────────────────────────
      const tipPositions = new Map<string, THREE.Vector3>();

      // Compute final tip positions first so Level-2 branches can sprout from Level-1 parent tips!
      evaluated.forEach((c) => {
        const tip = new THREE.Vector3(
          c.vector3.x * opts.branchSpread,
          c.vector3.y,
          c.vector3.z * opts.branchSpread
        );
        tipPositions.set(c.id, tip);
      });

      evaluated.forEach((c) => {
        const tip = tipPositions.get(c.id)!;
        const isSelected = c.id === selectedId;
        const colHex = statusHexColor(c.status);

        // Origin point: Level 1 sprouts from trunk collar; Level 2 sprouts from parent branch tip
        let origin = new THREE.Vector3(
          0,
          c.dependencyGroup === 0 ? 1.85 : 1.3,
          0
        );
        if (c.relationLevel === 2 && c.parentId && tipPositions.has(c.parentId)) {
          origin = tipPositions.get(c.parentId)!.clone();
        }

        // Smooth curved branch (orthogonal departure at 90° from trunk then rising/dipping to margin)
        const midPoint = origin.clone().lerp(tip, 0.48);
        if (c.relationLevel === 1) {
          midPoint.y = origin.y + (tip.y - origin.y) * 0.22;
        } else {
          midPoint.y = (origin.y + tip.y) * 0.5 + 0.18;
        }

        const curve = new THREE.CatmullRomCurve3([origin, midPoint, tip]);
        // Branch radius encodes priority & weight (always thinner than dominant trunk!)
        const baseRadius =
          c.priority === 'mandatory'
            ? 0.082
            : c.priority === 'low'
              ? 0.036
              : 0.055 + c.normalizedWeight * 0.032;
        const tubeRadius = c.relationLevel === 2 ? baseRadius * 0.72 : baseRadius;

        const branchMat = new THREE.MeshStandardMaterial({
          color: colHex,
          emissive: colHex,
          emissiveIntensity: isSelected ? 0.5 : 0.16,
          metalness: 0.52,
          roughness: 0.32,
        });
        const branchMesh = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 24, tubeRadius, 12, false),
          branchMat
        );
        branchMesh.castShadow = !isSoftwareGl;
        trunkGroup.add(branchMesh);

        // Mandatory double-wall structural collar ring on the branch (‖ analogy in 3D!)
        if (c.priority === 'mandatory') {
          const pCollar = curve.getPoint(0.28);
          const tanCollar = curve.getTangent(0.28).normalize();
          const ringMat = new THREE.MeshStandardMaterial({
            color: 0xe2e8f0,
            metalness: 0.9,
            roughness: 0.2,
          });
          [-0.08, 0.08].forEach((offset) => {
            const rMesh = new THREE.Mesh(
              new THREE.TorusGeometry(tubeRadius * 1.55, 0.022, 10, 20),
              ringMat
            );
            rMesh.position.copy(pCollar).addScaledVector(tanCollar, offset);
            _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tanCollar);
            rMesh.quaternion.copy(_quat);
            trunkGroup.add(rMesh);
          });
        }

        // Branch Tip Node Assembly (composite sphere + precision bezel ring)
        const nodeRadius =
          c.relationLevel === 2 ? 0.14 : c.priority === 'mandatory' ? 0.21 : 0.17;
        const tipCore = new THREE.Mesh(
          new THREE.SphereGeometry(nodeRadius, 20, 16),
          new THREE.MeshStandardMaterial({
            color: colHex,
            emissive: colHex,
            emissiveIntensity: isSelected ? 0.75 : 0.3,
            metalness: 0.35,
            roughness: 0.22,
          })
        );
        tipCore.position.copy(tip);
        tipCore.userData.criterionId = c.id;
        trunkGroup.add(tipCore);
        clickableNodes.push(tipCore);

        // Selection halo ring
        if (isSelected) {
          const selRing = new THREE.Mesh(
            new THREE.TorusGeometry(nodeRadius * 1.8, 0.028, 12, 32),
            new THREE.MeshBasicMaterial({ color: 0x60a5fa })
          );
          selRing.position.copy(tip);
          selRing.rotation.x = Math.PI / 2;
          trunkGroup.add(selRing);
        }

        // Uncertainty / Confidence Envelope (translucent vertical capsule when uncertainty present)
        if (c.uncertainty && c.uncertainty > 0) {
          const spanH = Math.min(1.3, 0.35 + c.uncertainty * 0.55);
          const envMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(nodeRadius * 1.45, nodeRadius * 1.45, spanH, 16),
            new THREE.MeshStandardMaterial({
              color: 0x38bdf8,
              transparent: true,
              opacity: 0.22,
              roughness: 0.25,
              metalness: 0.1,
              depthWrite: false,
            })
          );
          envMesh.position.copy(tip);
          trunkGroup.add(envMesh);
        }

        // Vertical drop line to m = 0 plane so positive vs negative margin is crystal clear
        if (opts.showThresholdPlane) {
          const projPt = new THREE.Vector3(tip.x, 2.0, tip.z);
          const dropGeo = new THREE.BufferGeometry().setFromPoints([tip, projPt]);
          const dropLine = new THREE.Line(
            dropGeo,
            new THREE.LineDashedMaterial({
              color: colHex,
              dashSize: 0.1,
              gapSize: 0.08,
              transparent: true,
              opacity: 0.55,
            })
          );
          dropLine.computeLineDistances();
          trunkGroup.add(dropLine);
        }

        // Sensitivity Gradient Vector Arrow (∇)
        if (opts.showGradients && Math.abs(c.sensitivity) > 0.05) {
          const gEnd = tip
            .clone()
            .add(
              new THREE.Vector3(
                c.gradientVec.x * 0.9,
                c.gradientVec.y * 0.9,
                c.gradientVec.z * 0.9
              )
            );
          const gradColor = c.sensitivity >= 0 ? 0x38bdf8 : 0xfb923c;
          const gradMat = new THREE.MeshStandardMaterial({
            color: gradColor,
            emissive: gradColor,
            emissiveIntensity: 0.4,
            metalness: 0.4,
            roughness: 0.3,
          });
          const shaft = createOrientedCylinder(tip, gEnd, 0.022, 0.022, gradMat);
          trunkGroup.add(shaft);

          const cone = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.2, 12), gradMat);
          cone.position.copy(gEnd);
          _vec3B.subVectors(gEnd, tip).normalize();
          _quat.setFromUnitVectors(_upVec, _vec3B);
          cone.quaternion.copy(_quat);
          trunkGroup.add(cone);
        }

        // Node Sprite Label
        if (opts.showLabels) {
          const prefix = c.priority === 'mandatory' ? '!' : c.priority === 'low' ? '?' : '';
          const glyph = c.status === 'fail' ? '✕' : c.status === 'marginal' ? '◐' : '✓';
          const cssAccent =
            c.status === 'pass'
              ? '#34d399'
              : c.status === 'marginal'
                ? '#fbbf24'
                : '#fb7185';
          const sp = createTextSprite(
            `${prefix}${c.key} = ${c.value}${c.unit ? ' ' + c.unit : ''}`,
            `${glyph} m=${c.margin >= 0 ? '+' : ''}${Math.round(c.margin * 100)}% · L${c.relationLevel}`,
            cssAccent,
            maxAniso,
            isSelected ? 1.12 : 0.88,
            false
          );
          sp.position.set(tip.x, tip.y + nodeRadius + 0.48, tip.z);
          trunkGroup.add(sp);
        }
      });

      // ──────────────────────────────────────────────────────────────────
      // 4. COUPLED DEPENDENCY BRIDGES (',' Siblings Linked in 3D)
      // ──────────────────────────────────────────────────────────────────
      if (opts.showDependencies) {
        const byGroup = new Map<number, EvaluatedCriterion[]>();
        evaluated
          .filter((c) => c.relationLevel === 1)
          .forEach((c) => {
            const list = byGroup.get(c.dependencyGroup) ?? [];
            list.push(c);
            byGroup.set(c.dependencyGroup, list);
          });

        const bridgeMat = new THREE.MeshStandardMaterial({
          color: 0x60a5fa,
          emissive: 0x1d4ed8,
          emissiveIntensity: 0.35,
          transparent: true,
          opacity: 0.52,
          roughness: 0.3,
        });

        byGroup.forEach((members) => {
          if (members.length < 2) return;
          for (let i = 0; i < members.length - 1; i++) {
            const pA = tipPositions.get(members[i].id)!;
            const pB = tipPositions.get(members[i + 1].id)!;
            const mid = pA.clone().lerp(pB, 0.5);
            mid.y += 0.35;
            const arc = new THREE.CatmullRomCurve3([pA, mid, pB]);
            const tube = new THREE.Mesh(new THREE.TubeGeometry(arc, 18, 0.018, 8, false), bridgeMat);
            trunkGroup.add(tube);
          }
        });
      }

      dynamicRoot.add(trunkGroup);
      requestRender();
    }

    function flyToPreset(presetKey: CameraPresetKey, worldX: number) {
      const p = CAMERA_PRESETS[presetKey];
      targetCamPos.set(p.pos[0] + worldX, p.pos[1], p.pos[2]);
      targetCtrlTarget.set(p.target[0] + worldX, p.target[1], p.target[2]);
      transitionActive = true;
      clock.getDelta();
      requestRender();
    }

    sceneApiRef.current = { rebuildTree, flyToPreset };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      disposeObjectTree(dynamicRoot);
      floorGeo.dispose();
      floorMat.dispose();
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneApiRef.current = null;
    };
  }, []);

  // Synchronize tree geometry whenever evaluation or display toggles change
  useEffect(() => {
    sceneApiRef.current?.rebuildTree(evaluation, selectedCriterionId, {
      showDependencies,
      showGradients,
      showThresholdPlane,
      showLabels,
      branchSpread,
    });
  }, [
    evaluation,
    selectedCriterionId,
    showDependencies,
    showGradients,
    showThresholdPlane,
    showLabels,
    branchSpread,
  ]);

  // Smoothly focus camera onto new model's trunk position on preset change
  useEffect(() => {
    sceneApiRef.current?.flyToPreset(activePreset, anchorWorldX);
  }, [evaluation.model.id, anchorWorldX, activePreset]);

  const activeCriterion =
    evaluation.evaluated.find((c) => c.id === (selectedCriterionId ?? hoveredId)) ?? null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090D16] select-none">
      {/* Dedicated WebGL Mount Container (never contains React children) */}
      <div ref={mountRef} className="w-full h-full" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#090D16]/95 p-6 text-center z-20">
          <div className="max-w-md border border-slate-800 bg-[#0F172A] rounded-lg p-6">
            <p className="text-sm font-medium text-slate-200">{webglError}</p>
            <p className="mt-2 text-xs text-slate-400">
              Tarayıcınızda donanım hızlandırmayı kontrol edin veya üst menüden Cetvel / Notasyon görünümlerini kullanın.
            </p>
          </div>
        </div>
      )}

      {/* Top-Left Minimal Spec Readout (unobtrusive, no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-md">
        <div className="pointer-events-auto border border-slate-800 bg-[#0B101C]/95 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{evaluation.model.domainLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-blue-400 tabular-nums">{evaluation.l2CompactToken}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold text-slate-100 leading-tight">
            {evaluation.model.name}
          </h2>
          <div className="mt-1.5 flex items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-slate-300">
              Gövde: <strong className="text-white">{evaluation.l0Scalar}</strong>
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={
                evaluation.effectiveVerdict === '+'
                  ? 'text-emerald-400 font-semibold'
                  : evaluation.effectiveVerdict === '+-'
                    ? 'text-amber-400 font-semibold'
                    : 'text-rose-400 font-semibold'
              }
            >
              {evaluation.effectiveVerdict === '+'
                ? '✓'
                : evaluation.effectiveVerdict === '+-'
                  ? '±'
                  : '✕'}{' '}
              {evaluation.statusLabel}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              Skor {(evaluation.weightedScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* Top-Right Compact Node Telemetry (appears only when hovering/clicking a 3D branch) */}
      {activeCriterion && (
        <div className="pointer-events-auto absolute top-4 right-4 z-10 w-72 border border-slate-700 bg-[#0B101C]/95 rounded-lg px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-blue-400">
              Seviye L{activeCriterion.relationLevel} · Grup {activeCriterion.dependencyGroup + 1}
            </span>
            <span
              className={`text-xs font-mono font-semibold ${
                activeCriterion.status === 'pass'
                  ? 'text-emerald-400'
                  : activeCriterion.status === 'marginal'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            >
              {activeCriterion.status === 'pass'
                ? '✓ Kabul'
                : activeCriterion.status === 'marginal'
                  ? '◐ Sınırda'
                  : '✕ Ret'}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-100">{activeCriterion.label}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums border-t border-slate-800 pt-2">
            <div>
              <span className="text-slate-500 block">Değer</span>
              <span className="text-slate-100 font-semibold">
                {activeCriterion.value} {activeCriterion.unit}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Normalize Marj</span>
              <span className="text-slate-100 font-semibold">
                {activeCriterion.margin >= 0 ? '+' : ''}
                {(activeCriterion.margin * 100).toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Sınırlar (Alt / Üst)</span>
              <span className="text-slate-300">
                {activeCriterion.lower ?? '−∞'} / {activeCriterion.upper ?? '+∞'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Gradyan ∇</span>
              <span className="text-sky-400">
                {activeCriterion.sensitivity >= 0 ? '+' : ''}
                {activeCriterion.sensitivity.toFixed(2)}
              </span>
            </div>
          </div>
          {activeCriterion.description && (
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              {activeCriterion.description}
            </p>
          )}
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock (Zero Viewport Occlusion) */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center w-[min(920px,94vw)]">
        <button
          type="button"
          onClick={() => setDockOpen((v) => !v)}
          className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-slate-300 bg-[#0B101C]/95 border border-slate-800 rounded-md hover:text-white hover:border-slate-700 transition-colors whitespace-nowrap"
        >
          {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          <span>{dockOpen ? 'Kontrolleri Gizle' : '3B Kontrolleri Göster'}</span>
        </button>

        {dockOpen && (
          <div className="pointer-events-auto w-full border border-slate-800 bg-[#0B101C]/95 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            {/* Camera Presets */}
            <div className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-slate-500 mr-1 shrink-0" />
              {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActivePreset(key);
                    sceneApiRef.current?.flyToPreset(key, anchorWorldX);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    activePreset === key
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
                  }`}
                >
                  {CAMERA_PRESETS[key].label}
                </button>
              ))}
            </div>

            {/* Layer Visibility Toggles */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowDependencies((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showDependencies
                    ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Bağlar</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGradients((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showGradients
                    ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Gradyan ∇</span>
              </button>
              <button
                type="button"
                onClick={() => setShowThresholdPlane((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showThresholdPlane
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>m=0 Düzlemi</span>
              </button>
              <button
                type="button"
                onClick={() => setShowLabels((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  showLabels
                    ? 'border-slate-600 bg-slate-800 text-slate-100'
                    : 'border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Etiket</span>
              </button>
            </div>

            {/* Tree Branch Spread Slider & Reset */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">Dal Açılımı</span>
              <input
                type="range"
                min={0.65}
                max={1.45}
                step={0.05}
                value={branchSpread}
                onChange={(e) => setBranchSpread(parseFloat(e.target.value))}
                className="precision-slider w-20"
                aria-label="Dal açılım oranı"
              />
              <span className="text-xs font-mono text-slate-300 tabular-nums w-9">
                {Math.round(branchSpread * 100)}%
              </span>
              <button
                type="button"
                onClick={() => {
                  setBranchSpread(1.0);
                  setActivePreset('iso');
                  sceneApiRef.current?.flyToPreset('iso', anchorWorldX);
                }}
                title="Kamerayı sıfırla"
                className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

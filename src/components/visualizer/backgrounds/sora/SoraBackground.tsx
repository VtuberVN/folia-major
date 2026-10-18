import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { MotionValue } from 'framer-motion';
import {
  DEFAULT_SORA_BACKGROUND_TUNING,
  type AudioBands,
  type SoraBackgroundTuning,
  type SoraShootingPalette,
  type Theme,
} from '../../../../types';
import { useBlendedColors } from '../useBlendedColors';

// src/components/visualizer/backgrounds/sora/SoraBackground.tsx
// High-performance Three.js 3D Cosmic Celestial Background for Folia's Sora mode.
// Features: Volumetric starfield with 360° directional drift and independent twinkling,
// independent spiral sub-galaxy with full 3D rotation and glowing core, shooting star clusters and palettes,
// 3-axis camera orbit (Yaw, Pitch, Roll), and amplified bass reactivity.

interface SoraBackgroundProps {
  theme: Theme;
  isDaylight: boolean;
  paused?: boolean;
  staticMode?: boolean;
  tuning?: SoraBackgroundTuning;
  audioBands?: AudioBands;
  audioPower?: MotionValue<number>;
  blendMs?: number;
  /** Where given, the blend plays along this instead (useBlendedColors). */
  blendProgress?: MotionValue<number>;
}

const SHOOTING_PALETTES: Record<SoraShootingPalette, string[]> = {
  white: ['#ffffff', '#f8fafc', '#e2e8f0'],
  gold: ['#fef08a', '#facc15', '#f59e0b', '#fffbeb'],
  cyan: ['#38bdf8', '#06b6d4', '#67e8f9', '#e0f2fe'],
  rose: ['#f472b6', '#e879f9', '#c084fc', '#fbcfe8'],
  rainbow: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'],
};

const normalizeAudio = (value: number) => (value > 1 ? Math.min(1, value / 255) : Math.max(0, value));
const easeTowards = (current: number, target: number, speed: number) => current + (target - current) * speed;

// ── 1. Procedural Texture Generators (Zero external asset requests) ──

function createStarTexture(type: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();
  const cx = 32, cy = 32;

  if (type === 'cross') {
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 14);
    coreGrad.addColorStop(0, 'rgba(255,255,255,1)');
    coreGrad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, 64, 64);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(31, 2, 2, 60);
    ctx.fillRect(2, 31, 60, 2);
  } else if (type === 'diamond') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(32, 6);
    ctx.lineTo(46, 32);
    ctx.lineTo(32, 58);
    ctx.lineTo(18, 32);
    ctx.closePath();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fill();
  } else if (type === 'point') {
    // Crisp, high-intensity sharp celestial point with defined anti-aliased edge
    const pGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    pGrad.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
    pGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.98)');
    pGrad.addColorStop(0.80, 'rgba(255, 255, 255, 0.50)');
    pGrad.addColorStop(1.00, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(0, 0, 64, 64);
  } else {
    // Soft circle
    const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
    radGrad.addColorStop(0, 'rgba(255,255,255,1)');
    radGrad.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    radGrad.addColorStop(0.7, 'rgba(255,255,255,0.2)');
    radGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, 64, 64);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createGalaxyGasTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.12, 'rgba(255, 255, 255, 0.85)');
  g.addColorStop(0.32, 'rgba(255, 255, 255, 0.40)');
  g.addColorStop(0.60, 'rgba(255, 255, 255, 0.10)');
  g.addColorStop(0.85, 'rgba(255, 255, 255, 0.02)');
  g.addColorStop(1.00, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function createGalaxyCoreTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, 'rgba(255, 255, 255, 1.0)');
  g.addColorStop(0.15, 'rgba(255, 248, 235, 0.95)');
  g.addColorStop(0.35, 'rgba(254, 215, 170, 0.65)');
  g.addColorStop(0.60, 'rgba(236, 72, 153, 0.25)');
  g.addColorStop(0.85, 'rgba(168, 85, 247, 0.08)');
  g.addColorStop(1.00, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

// ── 2. Component Implementation ──

const SoraBackground: React.FC<SoraBackgroundProps> = ({
  theme,
  isDaylight,
  paused = false,
  staticMode = false,
  tuning = DEFAULT_SORA_BACKGROUND_TUNING,
  audioBands,
  audioPower,
  blendMs = 0,
  blendProgress,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [primaryColor, accentColor] = useBlendedColors([theme.primaryColor, theme.accentColor], blendMs, blendProgress);

  // Store mutable refs so animation loop has instant access without re-binding
  const tuningRef = useRef(tuning);
  tuningRef.current = tuning;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const staticModeRef = useRef(staticMode);
  staticModeRef.current = staticMode;

  const themeRef = useRef(theme);
  themeRef.current = theme;

  const isDaylightRef = useRef(isDaylight);
  isDaylightRef.current = isDaylight;

  const animIdRef = useRef<number | null>(null);
  const renderFrameRef = useRef<(() => void) | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000003, 0.001);

    const initialWidth = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const initialHeight = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);

    const camera = new THREE.PerspectiveCamera(50, initialWidth / Math.max(1, initialHeight), 1, 3500);
    camera.position.set(0, 0, 160);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(initialWidth, initialHeight, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x222238, 0.85);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff6ea, 2.5);
    sunLight.position.set(220, 140, 160);
    scene.add(sunLight);

    // Shared Textures
    const galaxyGasTexture = createGalaxyGasTexture();
    const galaxyCoreTexture = createGalaxyCoreTexture();

    // ── Galaxy Group ──
    const miniGalaxyGroup = new THREE.Group();
    scene.add(miniGalaxyGroup);
    let miniGalaxyMesh: THREE.Points | null = null;
    let currentGalaxyHash = '';

    // Core Glow Sprite
    const coreMat = new THREE.SpriteMaterial({
      map: galaxyCoreTexture,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreSprite = new THREE.Sprite(coreMat);
    miniGalaxyGroup.add(coreSprite);

    const buildMiniGalaxyMesh = (t: SoraBackgroundTuning) => {
      if (miniGalaxyMesh) {
        miniGalaxyGroup.remove(miniGalaxyMesh);
        miniGalaxyMesh.geometry.dispose();
        if (Array.isArray(miniGalaxyMesh.material)) {
          miniGalaxyMesh.material.forEach(m => m.dispose());
        } else {
          miniGalaxyMesh.material.dispose();
        }
      }

      // Seeded PRNG for stable, smooth particle animation across parameter changes
      let seed = 987654321;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      const count = 5600;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      const colCore = new THREE.Color('#fff7ed');
      const colArm = new THREE.Color(themeRef.current.accentColor || '#c084fc');
      const colEdge = new THREE.Color('#38bdf8');

      const armCount = t.galaxyShape === 'spiral4' ? 4 : (t.galaxyShape === 'spiral2' ? 2 : 1);
      const radius = t.galaxyRadius;
      const twist = t.galaxyTwist;
      const armWidth = t.galaxyArmWidth;
      const thickness = t.galaxyThickness;
      const chaos = t.galaxyChaos;

      for (let i = 0; i < count; i++) {
        let x = 0, y = 0, z = 0;
        const r = Math.pow(rnd(), 1.22) * radius;

        if (t.galaxyShape === 'ring') {
          const ringRadius = radius * (0.65 + rnd() * 0.35);
          const angle = rnd() * Math.PI * 2;
          const spread = (rnd() - 0.5) * 28 * armWidth;
          const chaosDist = (rnd() - 0.5) * 35 * chaos;
          x = Math.cos(angle) * (ringRadius + spread) + chaosDist;
          z = Math.sin(angle) * (ringRadius + spread) + chaosDist;
          y = (rnd() - 0.5) * (thickness * 65.0);
        } else if (t.galaxyShape === 'cloud') {
          const angle = rnd() * Math.PI * 2;
          const spread = (rnd() - 0.5) * 55 * armWidth;
          const chaosDist = (rnd() - 0.5) * 60 * chaos;
          x = Math.cos(angle) * (r + spread) + chaosDist;
          z = Math.sin(angle) * (r + spread) + chaosDist;
          y = (rnd() - 0.5) * (thickness * 85.0);
        } else {
          const armIdx = i % armCount;
          const armAngle = (armIdx * 2 * Math.PI) / armCount;
          const spiral = (r / radius) * twist * 4.2;

          const spreadFactor = (0.4 + 0.6 * (r / radius)) * (armWidth * 24.0);
          const spreadRadial = (rnd() - 0.5) * spreadFactor;
          const spreadTangential = (rnd() - 0.5) * (armWidth * 0.35);

          const chaosAngle = rnd() * Math.PI * 2;
          const chaosDist = Math.pow(rnd(), 1.4) * chaos * (r * 0.55);
          const chaosX = Math.cos(chaosAngle) * chaosDist;
          const chaosZ = Math.sin(chaosAngle) * chaosDist;

          const totalAngle = armAngle + spiral + spreadTangential;
          x = Math.cos(totalAngle) * (r + spreadRadial) + chaosX;
          z = Math.sin(totalAngle) * (r + spreadRadial) + chaosZ;

          const bulgeFactor = 0.3 + 0.7 * Math.exp(-r / (radius * 0.5));
          y = (rnd() - 0.5) * (thickness * 80.0) * bulgeFactor + (rnd() - 0.5) * (18.0 * chaos);
        }

        positions[i * 3 + 0] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;

        const ratio = Math.min(1, r / radius);
        let c = colCore.clone();
        if (ratio < 0.22) {
          c.lerp(colArm, ratio / 0.22);
        } else {
          c = colArm.clone().lerp(colEdge, (ratio - 0.22) / 0.78);
        }

        colors[i * 3 + 0] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 3.4,
        map: galaxyGasTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      miniGalaxyMesh = new THREE.Points(geo, mat);
      miniGalaxyGroup.add(miniGalaxyMesh);
    };

    // ── Starfield Mesh ──
    let starsMesh: THREE.Points | null = null;
    let currentStarHash = '';

    const buildStarfieldMesh = (t: SoraBackgroundTuning) => {
      if (starsMesh) {
        scene.remove(starsMesh);
        starsMesh.geometry.dispose();
        if (Array.isArray(starsMesh.material)) {
          starsMesh.material.forEach(m => m.dispose());
        } else {
          starsMesh.material.dispose();
        }
      }

      const count = Math.round(t.starCount);
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);

      const palRealColors = [
        new THREE.Color('#ffffff'),
        new THREE.Color('#fef08a'),
        new THREE.Color('#93c5fd'),
        new THREE.Color('#fb923c'),
        new THREE.Color('#fbcfe8'),
      ];
      const palNeonColors = [
        new THREE.Color('#ec4899'),
        new THREE.Color('#a855f7'),
        new THREE.Color('#06b6d4'),
        new THREE.Color('#38bdf8'),
      ];
      const palDiamondColors = [
        new THREE.Color('#ffffff'),
        new THREE.Color('#e0f2fe'),
        new THREE.Color('#bae6fd'),
      ];

      const activePal = t.starPalette === 'neon' ? palNeonColors : (t.starPalette === 'diamond' ? palDiamondColors : palRealColors);

      for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 1200;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 960;
        positions[i * 3 + 2] = -Math.random() * 850 * t.depthSpread + 100;

        const c = activePal[Math.floor(Math.random() * activePal.length)];
        colors[i * 3 + 0] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      // Store base colors, randomized twinkle phases, and individual rates for per-star independent twinkling
      const baseColors = new Float32Array(colors);
      const phases = new Float32Array(count);
      const rates = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        phases[i] = Math.random() * Math.PI * 2;
        rates[i] = 0.6 + Math.random() * 0.9;
      }
      geo.userData = { baseColors, phases, rates };

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size: 2.2 * t.starScale,
        map: createStarTexture(t.starShape),
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      starsMesh = new THREE.Points(geo, mat);
      scene.add(starsMesh);
    };

    // ── Shooting Stars (Supports singles, pairs, and cluster bursts) ──
    const shootingStars: Array<{
      mesh: THREE.Line;
      material: THREE.LineBasicMaterial;
      active: boolean;
      timer: number;
      head: THREE.Vector3;
      dir: THREE.Vector3;
      speed: number;
      life: number;
      decay: number;
    }> = [];
    const SHOOTING_MAX = 12;

    for (let i = 0; i < SHOOTING_MAX; i++) {
      const geo = new THREE.BufferGeometry();
      const pts = new Float32Array(6);
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));

      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        linewidth: 2,
      });

      const line = new THREE.Line(geo, mat);
      scene.add(line);

      shootingStars.push({
        mesh: line,
        material: mat,
        active: false,
        timer: 15 + Math.random() * 90,
        head: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        speed: 14,
        life: 0,
        decay: 0.022,
      });
    }

    // ── Animation Loop ──
    let elapsedTime = 0;
    let smoothedBass = 0;

    const renderFrame = () => {
      animIdRef.current = null;
      const t = tuningRef.current;
      const now = performance.now();
      const delta = Math.min(0.1, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;
      elapsedTime += delta;
      const time = elapsedTime;

      // Rebuild Galaxy if structural parameters changed
      const galaxyHash = `${t.galaxyShape}_${t.galaxyRadius}_${t.galaxyTwist}_${t.galaxyArmWidth}_${t.galaxyThickness}_${t.galaxyChaos}`;
      if (galaxyHash !== currentGalaxyHash) {
        currentGalaxyHash = galaxyHash;
        buildMiniGalaxyMesh(t);
      }

      // Rebuild Starfield if parameters changed
      const starHash = `${t.starCount}_${t.starShape}_${t.starPalette}_${t.starScale}_${t.depthSpread}`;
      if (starHash !== currentStarHash) {
        currentStarHash = starHash;
        buildStarfieldMesh(t);
      }

      // ── Audio Bass Reactivity (Combined Audio Bands & Audio Power) ──
      const rawBand = !pausedRef.current && audioBands ? normalizeAudio(audioBands.bass.get()) : 0;
      const rawPower = !pausedRef.current && audioPower ? normalizeAudio(audioPower.get()) : 0;
      const rawAudio = Math.max(rawBand, rawPower * 0.85);
      smoothedBass = easeTowards(smoothedBass, rawAudio, 0.22);
      const bassPulse = smoothedBass * t.audioPulse;

      // ── 3D Camera Angles (Yaw, Pitch, Roll) with True 3D Orbit & Perspective ──
      let effectiveYaw = (-t.camYaw * Math.PI) / 180;
      let effectivePitch = (-t.camPitch * Math.PI) / 180;
      let effectiveRoll = (t.camRoll * Math.PI) / 180;

      if (t.autoCinematicCam && !staticModeRef.current) {
        effectiveYaw += Math.sin(time * 0.12) * 0.045;
        effectivePitch += Math.cos(time * 0.09) * 0.030;
        effectiveRoll += Math.sin(time * 0.07) * 0.018;
      }

      // Clamped pitch prevents pole gimbal singularity
      const clampedPitch = Math.max(-1.48, Math.min(1.48, effectivePitch));

      const pivotX = 0;
      const pivotY = 0;
      const pivotZ = -280;
      const orbitRadius = 440;

      // Spherical coordinates orbit around scene center (pivotX, pivotY, pivotZ)
      const cosPitch = Math.cos(clampedPitch);
      const camX = pivotX + orbitRadius * Math.sin(effectiveYaw) * cosPitch;
      const camY = pivotY + orbitRadius * Math.sin(clampedPitch);
      const camZ = pivotZ + orbitRadius * Math.cos(effectiveYaw) * cosPitch;

      camera.position.set(camX, camY, camZ);
      camera.lookAt(pivotX, pivotY, pivotZ);
      if (effectiveRoll !== 0) {
        camera.rotateZ(effectiveRoll);
      }

      // ── Sub-Galaxy 3D Rendering ──
      miniGalaxyGroup.visible = t.showGalaxy;
      if (t.showGalaxy) {
        miniGalaxyGroup.position.set(t.galaxyPosX, t.galaxyPosY, t.galaxyPosZ);
        miniGalaxyGroup.rotation.set(
          (t.galaxyRotX * Math.PI) / 180,
          (t.galaxyRotY * Math.PI) / 180,
          (t.galaxyRotZ * Math.PI) / 180,
        );

        if (!staticModeRef.current && miniGalaxyMesh) {
          miniGalaxyMesh.rotation.y += delta * 0.25 * t.galaxySpin;
          coreMat.rotation += delta * 0.08 * t.galaxySpin;
        }

        // Dynamic core scaling and audio pulsing
        const coreScale = t.galaxyRadius * 0.5 * Math.max(0.2, t.galaxyCore) * (1.0 + bassPulse * 0.45);
        coreSprite.scale.set(coreScale, coreScale, 1);
        coreMat.opacity = Math.min(1.0, 0.35 + t.galaxyCore * 0.55) * Math.min(1.0, 1.0 + bassPulse * 0.5);

        const gScale = 1.0 + bassPulse * 0.12;
        miniGalaxyGroup.scale.set(gScale, gScale, gScale);
      }

      // ── Volumetric Starfield with Independent Per-Star Twinkling ──
      if (starsMesh) {
        const pos = starsMesh.geometry.attributes.position.array as Float32Array;
        const colors = starsMesh.geometry.attributes.color.array as Float32Array;
        const count = pos.length / 3;
        const { baseColors, phases, rates } = (starsMesh.geometry.userData || {}) as {
          baseColors?: Float32Array;
          phases?: Float32Array;
          rates?: Float32Array;
        };

        if (!staticModeRef.current) {
          const driftRad = (t.starDriftAngle * Math.PI) / 180;
          const driftSpeed = t.starDriftSpeed * delta * 24;
          const driftX = Math.cos(driftRad) * driftSpeed;
          const driftY = Math.sin(driftRad) * driftSpeed;
          const twinkleSpeed = t.twinkle * 3.8;

          for (let i = 0; i < count; i++) {
            pos[i * 3 + 0] += driftX;
            pos[i * 3 + 1] += driftY;

            if (pos[i * 3 + 0] > 600) pos[i * 3 + 0] -= 1200;
            else if (pos[i * 3 + 0] < -600) pos[i * 3 + 0] += 1200;

            if (pos[i * 3 + 1] > 480) pos[i * 3 + 1] -= 960;
            else if (pos[i * 3 + 1] < -480) pos[i * 3 + 1] += 960;

            if (baseColors && phases && rates) {
              const wave = Math.sin(time * twinkleSpeed * rates[i] + phases[i]);
              const twinkleDim = 0.58 + 0.42 * wave;
              const brightness = twinkleDim * (1.0 + bassPulse * 0.5);

              colors[i * 3 + 0] = baseColors[i * 3 + 0] * brightness;
              colors[i * 3 + 1] = baseColors[i * 3 + 1] * brightness;
              colors[i * 3 + 2] = baseColors[i * 3 + 2] * brightness;
            }
          }
          starsMesh.geometry.attributes.position.needsUpdate = true;
          if (baseColors) {
            starsMesh.geometry.attributes.color.needsUpdate = true;
          }
        }

        const starMat = starsMesh.material as THREE.PointsMaterial;
        starMat.size = 2.2 * t.starScale * (1.0 + bassPulse * 0.25);
      }

      // ── Shooting Stars (Clusters, Pairs, Custom Colors, Stream Drift ±60°) ──
      if (!t.enableShootingStars || staticModeRef.current) {
        shootingStars.forEach(s => { s.material.opacity = 0; });
      } else {
        const freqInterval = (11 - t.shootingFreq) * 45;
        const driftRad = (t.starDriftAngle * Math.PI) / 180;
        const palList = SHOOTING_PALETTES[t.shootingPalette] || SHOOTING_PALETTES.white;

        for (let i = 0; i < shootingStars.length; i++) {
          const s = shootingStars[i];
          if (!s.active) {
            s.timer--;
            if (s.timer <= 0) {
              // Burst cluster decision: 50% single, 32% pair (sao đôi), 18% cluster (sao chùm)
              const burstRoll = Math.random();
              const burstCount = burstRoll > 0.82 ? 3 : (burstRoll > 0.50 ? 2 : 1);

              // Direction aligned with star drift with random variation between 0 and ±60 degrees
              const angleDeviation = (Math.random() * 120 - 60) * (Math.PI / 180);
              const shootAngle = driftRad + angleDeviation;
              const baseDir = new THREE.Vector3(
                Math.cos(shootAngle),
                Math.sin(shootAngle),
                (Math.random() - 0.5) * 0.35
              ).normalize();

              const spawnDist = 480 + Math.random() * 180;
              const lateralDist = (Math.random() - 0.5) * 450;
              const baseHeadX = -Math.cos(shootAngle) * spawnDist - Math.sin(shootAngle) * lateralDist;
              const baseHeadY = -Math.sin(shootAngle) * spawnDist + Math.cos(shootAngle) * lateralDist;
              const baseHeadZ = -140 - Math.random() * 260;
              const baseSpeed = 13 + Math.random() * 8;

              let activated = 0;
              for (let j = i; j < shootingStars.length && activated < burstCount; j++) {
                const sub = shootingStars[j];
                if (!sub.active) {
                  sub.active = true;
                  sub.life = 1.0;
                  sub.decay = 0.020 + Math.random() * 0.006;
                  sub.speed = baseSpeed + (Math.random() - 0.5) * 2.5;

                  const spreadOffset = activated === 0 ? 0 : (Math.random() - 0.5) * 60;
                  const spreadZ = activated === 0 ? 0 : (Math.random() - 0.5) * 40;
                  sub.head.set(
                    baseHeadX - Math.sin(shootAngle) * spreadOffset - Math.cos(shootAngle) * (activated * 45),
                    baseHeadY + Math.cos(shootAngle) * spreadOffset - Math.sin(shootAngle) * (activated * 45),
                    baseHeadZ + spreadZ
                  );

                  const memberDev = (Math.random() - 0.5) * 0.08;
                  sub.dir.set(
                    baseDir.x + memberDev * -baseDir.y,
                    baseDir.y + memberDev * baseDir.x,
                    baseDir.z + (Math.random() - 0.5) * 0.05
                  ).normalize();

                  const colorHex = palList[Math.floor(Math.random() * palList.length)];
                  sub.material.color.set(colorHex);
                  sub.timer = 0;
                  activated++;
                }
              }
            }
          } else {
            s.head.addScaledVector(s.dir, s.speed);
            s.life -= s.decay;

            const tail = new THREE.Vector3().copy(s.head).addScaledVector(s.dir, -t.shootingTail);
            const posAttr = s.mesh.geometry.attributes.position;
            posAttr.setXYZ(0, s.head.x, s.head.y, s.head.z);
            posAttr.setXYZ(1, tail.x, tail.y, tail.z);
            posAttr.needsUpdate = true;

            s.material.opacity = Math.max(0, s.life) * 0.96;

            if (s.life <= 0) {
              s.active = false;
              s.timer = freqInterval + Math.random() * 120;
              s.material.opacity = 0;
            }
          }
        }
      }

      renderer.render(scene, camera);

      if (!staticModeRef.current) {
        animIdRef.current = requestAnimationFrame(renderFrame);
      }
    };

    // Initial Mesh Creation & Frame Kickoff
    buildMiniGalaxyMesh(tuningRef.current);
    buildStarfieldMesh(tuningRef.current);
    renderFrameRef.current = renderFrame;
    lastTimeRef.current = performance.now();
    renderFrame();

    const handleResize = () => {
      if (!canvas) return;
      const w = canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
      const h = canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (staticModeRef.current) {
        renderer.render(scene, camera);
      }
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize());
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      renderFrameRef.current = null;
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', handleResize);
      }
      if (animIdRef.current !== null) {
        cancelAnimationFrame(animIdRef.current);
        animIdRef.current = null;
      }
      // Resource Cleanup
      renderer.dispose();
      galaxyGasTexture.dispose();
      galaxyCoreTexture.dispose();
      coreMat.dispose();
      if (miniGalaxyMesh) {
        miniGalaxyMesh.geometry.dispose();
        if (Array.isArray(miniGalaxyMesh.material)) {
          miniGalaxyMesh.material.forEach(m => m.dispose());
        } else {
          miniGalaxyMesh.material.dispose();
        }
      }
      if (starsMesh) {
        starsMesh.geometry.dispose();
        if (Array.isArray(starsMesh.material)) {
          starsMesh.material.forEach(m => m.dispose());
        } else {
          starsMesh.material.dispose();
        }
      }
      shootingStars.forEach(s => {
        s.mesh.geometry.dispose();
        if (Array.isArray(s.mesh.material)) {
          s.mesh.material.forEach(m => m.dispose());
        } else {
          s.mesh.material.dispose();
        }
      });
    };
  }, []);

  // Synchronize animation loop when staticMode or paused states change
  useEffect(() => {
    if (!staticMode && animIdRef.current === null && renderFrameRef.current) {
      lastTimeRef.current = performance.now();
      animIdRef.current = requestAnimationFrame(renderFrameRef.current);
    }
  }, [staticMode, paused]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full pointer-events-none"
      style={{ display: 'block' }}
    />
  );
};

export default SoraBackground;

import { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

type OrbState = 'idle' | 'listening' | 'thinking' | 'responding';
type OrbSize = 'sm' | 'md' | 'lg';

interface CoachOrbProps {
  size?: OrbSize;
  state?: OrbState;
  className?: string;
}

const SIZE_MAP: Record<OrbSize, number> = {
  sm: 48,
  md: 96,
  lg: 200,
};

const CoachOrb = ({ size = 'lg', state = 'idle', className }: CoachOrbProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<any>(null);
  const frameRef = useRef<number>(0);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const isSmall = size === 'sm';
  const px = SIZE_MAP[size];

  // Init scene
  useEffect(() => {
    // WebGL check
    try {
      const c = document.createElement('canvas');
      if (!c.getContext('webgl') && !c.getContext('experimental-webgl')) {
        setWebglAvailable(false);
        return;
      }
    } catch {
      setWebglAvailable(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio, 2);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !isSmall });
    renderer.setSize(px, px);
    renderer.setPixelRatio(dpr);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3.2;

    const segments = isSmall ? 32 : 64;
    const geometry = new THREE.SphereGeometry(1, segments, segments);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0A1628'),
      roughness: 0.1,
      metalness: 0.9,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Store original vertex positions
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const originalPositions = new Float32Array(posAttr.array.length);
    originalPositions.set(posAttr.array);

    // Lights
    scene.add(new THREE.AmbientLight(new THREE.Color('#1a1a2e'), 0.4));

    const orangeLight = new THREE.PointLight(new THREE.Color('#E87A2F'), 1.2, 20);
    orangeLight.position.set(3, 2, 3);
    scene.add(orangeLight);

    const blueLight = new THREE.PointLight(new THREE.Color('#1E3A5F'), 0.8, 20);
    blueLight.position.set(-3, -1, 2);
    scene.add(blueLight);

    const topLight = new THREE.PointLight(new THREE.Color('#ffffff'), 0.3, 20);
    topLight.position.set(0, 4, 0);
    scene.add(topLight);

    sceneRef.current = {
      renderer, scene, camera, sphere, geometry, material,
      originalPositions, orangeLight, blueLight, topLight,
      hovered: false,
      currentRotSpeedY: 0.003,
      currentRotSpeedX: 0.001,
      currentDisplacement: 0.08,
      currentOrangeIntensity: 1.2,
      currentBlueIntensity: 0.8,
    };

    return () => {
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      sceneRef.current = null;
    };
  }, [px, isSmall]);

  // Animation loop
  useEffect(() => {
    const s = sceneRef.current;
    if (!s || !webglAvailable) return;

    let running = true;
    const t0 = performance.now();

    const animate = () => {
      if (!running || !s) return;
      frameRef.current = requestAnimationFrame(animate);

      const elapsed = (performance.now() - t0) / 1000;

      // Targets based on state
      let tRotY = 0.003, tRotX = 0.001, tDisp = 0.08, tOrange = 1.2, tBlue = 0.8;

      if (!isSmall) {
        switch (state) {
          case 'listening':
            tRotY = 0.005; tDisp = 0.1; tBlue = 1.2; break;
          case 'thinking':
            tRotY = 0.008; tRotX = 0.003; tDisp = 0.12;
            tOrange = 1.2 + Math.sin(elapsed * 3) * 0.5;
            tBlue = 0.8 + Math.cos(elapsed * 3) * 0.5;
            break;
          case 'responding':
            tRotY = 0.003; tDisp = 0.06; tOrange = 1.4; tBlue = 0.6; break;
        }
        if (s.hovered) { tRotY *= 1.5; tDisp *= 1.3; }
      }

      // Lerp
      const l = 0.05;
      s.currentRotSpeedY += (tRotY - s.currentRotSpeedY) * l;
      s.currentRotSpeedX += (tRotX - s.currentRotSpeedX) * l;
      s.currentDisplacement += (tDisp - s.currentDisplacement) * l;
      s.currentOrangeIntensity += (tOrange - s.currentOrangeIntensity) * l;
      s.currentBlueIntensity += (tBlue - s.currentBlueIntensity) * l;

      s.sphere.rotation.y += s.currentRotSpeedY;
      s.sphere.rotation.x += s.currentRotSpeedX;

      // Vertex displacement (large only)
      if (!isSmall) {
        const posAttr = s.geometry.attributes.position;
        const orig = s.originalPositions;
        const breathCycle = Math.sin(elapsed * (Math.PI * 2) / 4);

        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          const ox = orig[ix], oy = orig[ix + 1], oz = orig[ix + 2];
          const disp = Math.sin(elapsed * 1.5 + ox * 3 + oy * 2 + oz) * s.currentDisplacement * (0.7 + 0.3 * breathCycle);
          const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
          if (len > 0) {
            const nx = ox / len, ny = oy / len, nz = oz / len;
            (posAttr.array as Float32Array)[ix] = ox + nx * disp;
            (posAttr.array as Float32Array)[ix + 1] = oy + ny * disp;
            (posAttr.array as Float32Array)[ix + 2] = oz + nz * disp;
          }
        }
        posAttr.needsUpdate = true;
      }

      s.orangeLight.intensity = s.currentOrangeIntensity;
      s.blueLight.intensity = s.currentBlueIntensity;
      s.renderer.render(s.scene, s.camera);
    };

    animate();
    return () => { running = false; cancelAnimationFrame(frameRef.current); };
  }, [webglAvailable, state, isSmall]);

  const onMouseEnter = useCallback(() => { if (sceneRef.current) sceneRef.current.hovered = true; }, []);
  const onMouseLeave = useCallback(() => { if (sceneRef.current) sceneRef.current.hovered = false; }, []);

  if (!webglAvailable) {
    return (
      <div className={className} style={{
        width: 48, height: 48, borderRadius: '50%',
        background: '#0A1628', border: '1.5px solid #E87A2F',
      }} />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: px, height: px, cursor: 'pointer' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <canvas ref={canvasRef} style={{ width: px, height: px, display: 'block' }} />
    </div>
  );
};

export default CoachOrb;

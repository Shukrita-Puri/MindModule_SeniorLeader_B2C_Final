import { useRef, useEffect, useState, useCallback } from 'react';

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

/**
 * Three.js powered 3D orb for the Mind Performance Coach.
 * Deep navy sphere with orange/blue iridescent edge lighting.
 * Responds to coach state with rotation, breathing, and light changes.
 */
const CoachOrb = ({ size = 'lg', state = 'idle', className }: CoachOrbProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<any>(null);
  const frameRef = useRef<number>(0);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const isSmall = size === 'sm';
  const px = SIZE_MAP[size];

  const initScene = useCallback(() => {
    const THREE = (window as any).THREE;
    if (!THREE || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !isSmall,
    });
    renderer.setSize(px, px);
    renderer.setPixelRatio(dpr);

    // Scene & camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 3.2;

    // Sphere
    const segments = isSmall ? 32 : 64;
    const geometry = new THREE.SphereGeometry(1, segments, segments);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0A1628'),
      roughness: 0.1,
      metalness: 0.9,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // Store original positions for vertex displacement
    const posAttr = geometry.attributes.position;
    const originalPositions = new Float32Array(posAttr.array.length);
    originalPositions.set(posAttr.array);

    // Lights
    const ambient = new THREE.AmbientLight(new THREE.Color('#1a1a2e'), 0.4);
    scene.add(ambient);

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
      renderer,
      scene,
      camera,
      sphere,
      geometry,
      material,
      originalPositions,
      orangeLight,
      blueLight,
      topLight,
      // Mutable animation state
      hovered: false,
      currentRotSpeedY: 0.003,
      currentRotSpeedX: 0.001,
      currentDisplacement: 0.08,
      currentOrangeIntensity: 1.2,
      currentBlueIntensity: 0.8,
    };
  }, [px, isSmall]);

  // Load Three.js from CDN
  useEffect(() => {
    // Check WebGL
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) { setWebglAvailable(false); return; }
    } catch { setWebglAvailable(false); return; }

    if ((window as any).THREE) {
      initScene();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.async = true;
    script.onload = () => initScene();
    script.onerror = () => setWebglAvailable(false);
    document.head.appendChild(script);

    return () => {
      // Don't remove script — other instances may use it
    };
  }, [initScene]);

  // Animation loop
  useEffect(() => {
    if (!webglAvailable) return;
    const s = sceneRef.current;
    if (!s) return;

    let running = true;
    const clock = { start: performance.now() };

    const animate = () => {
      if (!running || !s) return;
      frameRef.current = requestAnimationFrame(animate);

      const elapsed = (performance.now() - clock.start) / 1000;

      // Target values based on state
      let targetRotY = 0.003;
      let targetRotX = 0.001;
      let targetDisp = 0.08;
      let targetOrange = 1.2;
      let targetBlue = 0.8;

      if (!isSmall) {
        switch (state) {
          case 'listening':
            targetRotY = 0.005;
            targetDisp = 0.1;
            targetBlue = 1.2;
            break;
          case 'thinking':
            targetRotY = 0.008;
            targetRotX = 0.003;
            targetDisp = 0.12;
            // Pulsing lights
            targetOrange = 1.2 + Math.sin(elapsed * 3) * 0.5;
            targetBlue = 0.8 + Math.cos(elapsed * 3) * 0.5;
            break;
          case 'responding':
            targetRotY = 0.003;
            targetRotX = 0.001;
            targetDisp = 0.06;
            targetOrange = 1.4;
            targetBlue = 0.6;
            break;
        }

        if (s.hovered) {
          targetRotY *= 1.5;
          targetDisp *= 1.3;
        }
      }

      // Lerp current values
      const lerp = 0.05;
      s.currentRotSpeedY += (targetRotY - s.currentRotSpeedY) * lerp;
      s.currentRotSpeedX += (targetRotX - s.currentRotSpeedX) * lerp;
      s.currentDisplacement += (targetDisp - s.currentDisplacement) * lerp;
      s.currentOrangeIntensity += (targetOrange - s.currentOrangeIntensity) * lerp;
      s.currentBlueIntensity += (targetBlue - s.currentBlueIntensity) * lerp;

      // Rotation
      s.sphere.rotation.y += s.currentRotSpeedY;
      s.sphere.rotation.x += s.currentRotSpeedX;

      // Vertex displacement (skip for small size)
      if (!isSmall) {
        const posAttr = s.geometry.attributes.position;
        const orig = s.originalPositions;
        const breathCycle = Math.sin(elapsed * (Math.PI * 2) / 4); // 4s cycle

        for (let i = 0; i < posAttr.count; i++) {
          const ix = i * 3;
          const ox = orig[ix], oy = orig[ix + 1], oz = orig[ix + 2];
          const displacement = Math.sin(elapsed * 1.5 + ox * 3 + oy * 2 + oz) * s.currentDisplacement * (0.7 + 0.3 * breathCycle);
          const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
          if (len > 0) {
            const nx = ox / len, ny = oy / len, nz = oz / len;
            posAttr.array[ix] = ox + nx * displacement;
            posAttr.array[ix + 1] = oy + ny * displacement;
            posAttr.array[ix + 2] = oz + nz * displacement;
          }
        }
        posAttr.needsUpdate = true;
      }

      // Update light intensities
      s.orangeLight.intensity = s.currentOrangeIntensity;
      s.blueLight.intensity = s.currentBlueIntensity;

      s.renderer.render(s.scene, s.camera);
    };

    animate();

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [webglAvailable, state, isSmall]);

  // Cleanup renderer on unmount
  useEffect(() => {
    return () => {
      const s = sceneRef.current;
      if (s) {
        s.renderer.dispose();
        s.geometry.dispose();
        s.material.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  // Hover handlers
  const onMouseEnter = useCallback(() => {
    if (sceneRef.current) sceneRef.current.hovered = true;
  }, []);
  const onMouseLeave = useCallback(() => {
    if (sceneRef.current) sceneRef.current.hovered = false;
  }, []);

  // Fallback
  if (!webglAvailable) {
    return (
      <div
        className={className}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#0A1628',
          border: '1.5px solid #E87A2F',
        }}
      />
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
      <canvas
        ref={canvasRef}
        width={px}
        height={px}
        style={{ width: px, height: px, display: 'block' }}
      />
    </div>
  );
};

export default CoachOrb;

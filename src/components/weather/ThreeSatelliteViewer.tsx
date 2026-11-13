import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import type { ThreeJsSimulationParams } from '../../services/weatherApi';

interface ThreeSatelliteViewerProps {
  fieldName?: string;
  timestamp?: string;
  simulationParams?: ThreeJsSimulationParams;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const ThreeSatelliteViewer: React.FC<ThreeSatelliteViewerProps> = ({
  fieldName = 'Field 1',
  timestamp = '10 Nov 2026, 10:24',
  simulationParams,
  isExpanded = false,
  onToggleExpand,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 320;
    const height = container.clientHeight || 180;

    // 1. Scene with Light Sky / Neutral Background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeef2f6);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 14, 18);

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.15; // Don't allow looking from under ground
    controls.minDistance = 6;
    controls.maxDistance = 35;
    controlsRef.current = controls;

    // 5. Procedural Field Texture (Agri satellite texture in daylight)
    const texCanvas = document.createElement('canvas');
    texCanvas.width = 512;
    texCanvas.height = 512;
    const ctx = texCanvas.getContext('2d');
    if (ctx) {
      // Base vibrant green soil
      ctx.fillStyle = '#4c7c42';
      ctx.fillRect(0, 0, 512, 512);

      // Crop row stripes
      for (let i = 0; i < 512; i += 8) {
        ctx.fillStyle = i % 16 === 0 ? '#5d9451' : '#3d6734';
        ctx.fillRect(0, i, 512, 4);
      }

      // Tractor lines & subtle field patches
      ctx.fillStyle = 'rgba(100, 145, 80, 0.35)';
      ctx.beginPath();
      ctx.ellipse(256, 256, 180, 120, Math.PI / 6, 0, Math.PI * 2);
      ctx.fill();

      // Field boundary line (crisp glowing white border)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(40, 40, 432, 432, 24);
      ctx.stroke();

      // Surrounding terrain border
      ctx.strokeStyle = '#2b4424';
      ctx.lineWidth = 36;
      ctx.strokeRect(0, 0, 512, 512);
    }
    const fieldTexture = new THREE.CanvasTexture(texCanvas);

    // 6. 3D Terrain Plane with Relief
    const planeGeo = new THREE.PlaneGeometry(16, 16, 64, 64);
    const pos = planeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i);
      const v = pos.getY(i);
      const elevation = Math.sin(u * 0.3) * Math.cos(v * 0.3) * 0.45 + Math.sin(u * 0.8) * 0.15;
      pos.setZ(i, elevation);
    }
    planeGeo.computeVertexNormals();

    const planeMat = new THREE.MeshStandardMaterial({
      map: fieldTexture,
      roughness: 0.8,
      metalness: 0.05,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, planeMat);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 7. Drifting 3D Cloud Shadow Layer
    const cloudShadowPlane = new THREE.PlaneGeometry(32, 32);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 256;
    shadowCanvas.height = 256;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = 'rgba(0,0,0,0)';
      sCtx.fillRect(0, 0, 256, 256);
      for (let k = 0; k < 6; k++) {
        const x = 50 + Math.random() * 156;
        const y = 50 + Math.random() * 156;
        const rad = 30 + Math.random() * 40;
        const g = sCtx.createRadialGradient(x, y, 4, x, y, rad);
        g.addColorStop(0, 'rgba(0, 20, 30, 0.35)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = g;
        sCtx.beginPath();
        sCtx.arc(x, y, rad, 0, Math.PI * 2);
        sCtx.fill();
      }
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.wrapS = THREE.RepeatWrapping;
    shadowTex.wrapT = THREE.RepeatWrapping;
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const cloudPlane = new THREE.Mesh(cloudShadowPlane, shadowMat);
    cloudPlane.rotation.x = -Math.PI / 2;
    cloudPlane.position.y = 0.55;
    scene.add(cloudPlane);

    // 8. Bright Daylight Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const sunElevation = simulationParams?.sun_elevation_deg ?? 45;
    const sunRad = (sunElevation * Math.PI) / 180;
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.3);
    sunLight.position.set(Math.cos(sunRad) * 15, Math.sin(sunRad) * 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0xd9e8f5, 0x4a6b40, 0.45);
    scene.add(hemiLight);

    // 9. Animation Loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      const delta = clock.getDelta();
      controls.update();

      const speed = (simulationParams?.wind_speed_factor ?? 1.0) * 0.04;
      shadowTex.offset.x += speed * delta;
      shadowTex.offset.y += (speed * 0.3) * delta;

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);

    // 10. Resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
      controls.dispose();
      renderer.dispose();
      fieldTexture.dispose();
      shadowTex.dispose();
      planeGeo.dispose();
      planeMat.dispose();
      cloudShadowPlane.dispose();
      shadowMat.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [simulationParams, isExpanded]);

  const resetCamera = () => {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <div className="relative w-full h-full min-h-[140px] rounded-xl overflow-hidden group select-none bg-slate-100 border border-slate-200 shadow-inner">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Header bar overlay (Light theme) */}
      <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-2 py-0.5 rounded-md border border-slate-200/90 flex items-center gap-1.5 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#1fa35b] animate-pulse" />
          <span className="text-[11px] font-bold text-slate-800">
            3-JS • {timestamp}
          </span>
        </div>

        <div className="flex items-center gap-1 pointer-events-auto">
          <button
            onClick={resetCamera}
            title="Reset Angle"
            className="p-1 rounded-md bg-white/95 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm transition-colors"
          >
            <RotateCcw size={13} />
          </button>
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={isExpanded ? "Collapse" : "Expand 3D View"}
              className="p-1 rounded-md bg-white/95 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200 shadow-sm transition-colors"
            >
              {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Field name tag (Light theme) */}
      <div className="absolute bottom-2 left-2.5 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] font-semibold text-slate-700 border border-slate-200 shadow-sm pointer-events-none">
        {fieldName} 3D Surface
      </div>
    </div>
  );
};

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

// Fondo 3D decorativo del login: anillos tipo "eclipse" de la marca ORIGEN +
// núcleo + campo de puntos. Geometría procedural (nada que descargar). Este
// módulo se importa con lazy() desde Login.jsx para que three no entre al
// bundle inicial; si falla o no hay WebGL, el gradiente CSS queda de fondo.

function Escena({ animar, parallax }) {
  const grupo = useRef();
  const anillo2 = useRef();
  const estrellas = useRef();
  const objetivo = useRef({ x: 0, y: 0 });

  const posiciones = useMemo(() => {
    // Menos partículas en pantallas chicas (gama baja / batería).
    const n = window.innerWidth < 640 ? 110 : 260;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 26;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30 - 6;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!animar) return;
    const t = state.clock.elapsedTime * 0.16;
    grupo.current.rotation.y = t * 0.8 + 0.2;
    grupo.current.rotation.x = 0.5 + Math.sin(t) * 0.08;
    anillo2.current.rotation.z = t * 1.4;
    estrellas.current.rotation.y = t * 0.12;
    if (parallax) {
      const o = objetivo.current;
      o.x += (state.pointer.x * 0.5 - o.x) * 0.05;
      o.y += (state.pointer.y * 0.5 - o.y) * 0.05;
      state.camera.position.x = o.x * 1.6;
      state.camera.position.y = o.y * 1.1;
      state.camera.lookAt(0, 0, 0);
    }
  });

  return (
    <>
      <fog attach="fog" args={['#05061c', 5, 22]} />
      <ambientLight color="#8090ff" intensity={0.5} />
      {/* decay=0: intensidad tipo legacy (three >=r155 usa luces físicas) */}
      <pointLight position={[6, 6, 10]} intensity={1.1} distance={60} decay={0} />
      <pointLight color="#6f8bff" position={[-8, -4, 4]} intensity={1.2} distance={60} decay={0} />

      <group ref={grupo} rotation={[0.5, 0.2, 0]}>
        <mesh>
          <torusGeometry args={[3.1, 0.09, 32, 180]} />
          <meshStandardMaterial color="#bfd2ff" metalness={0.7} roughness={0.25} emissive="#1a2a80" emissiveIntensity={0.35} />
        </mesh>
        <mesh ref={anillo2} rotation={[Math.PI / 2.4, 0.4, 0]}>
          <torusGeometry args={[2.2, 0.055, 28, 160]} />
          <meshStandardMaterial color="#bfd2ff" metalness={0.7} roughness={0.25} emissive="#1a2a80" emissiveIntensity={0.35} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.15, 48, 48]} />
          <meshStandardMaterial color="#2a3ad0" metalness={0.4} roughness={0.35} emissive="#33409a" emissiveIntensity={0.4} />
        </mesh>
      </group>

      <points ref={estrellas}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posiciones, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffffff" size={0.05} transparent opacity={0.7} />
      </points>
    </>
  );
}

export default function LoginScene() {
  // prefers-reduced-motion → un solo frame estático (frameloop 'demand').
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // En touch no hay parallax (el pointer no acompaña al dedo).
  const esTouch = window.matchMedia('(pointer: coarse)').matches;

  return (
    <Canvas
      aria-hidden="true"
      className="pointer-events-none"
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 9], fov: 55 }}
      frameloop={reducirMovimiento ? 'demand' : 'always'}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
    >
      <Escena animar={!reducirMovimiento} parallax={!esTouch} />
    </Canvas>
  );
}

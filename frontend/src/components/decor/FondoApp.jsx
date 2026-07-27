import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

// Fondo 3D decorativo del shell de la app (versión sutil del eclipse del
// login): anillos tenues hacia la esquina superior derecha + campo de puntos,
// animación muy lenta y sin parallax (detrás de contenido que hace scroll, el
// contenido manda). Solo se monta en modo oscuro; se importa con lazy() desde
// Layout.jsx y si falla o no hay WebGL queda el gradiente CSS de .app-shell.

function Escena({ animar }) {
  const grupo = useRef();
  const anillo2 = useRef();
  const estrellas = useRef();

  const posiciones = useMemo(() => {
    // Menos partículas que en el login y aún menos en pantallas chicas.
    const n = window.innerWidth < 640 ? 70 : 150;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 56;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 32;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 26 - 8;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!animar) return;
    const t = state.clock.elapsedTime * 0.06;
    grupo.current.rotation.y = t * 0.8 + 0.2;
    grupo.current.rotation.x = 0.5 + Math.sin(t) * 0.05;
    anillo2.current.rotation.z = t * 1.2;
    estrellas.current.rotation.y = t * 0.1;
  });

  return (
    <>
      <fog attach="fog" args={['#05061c', 8, 30]} />
      <ambientLight color="#8090ff" intensity={0.4} />
      {/* decay=0: intensidad tipo legacy (three >=r155 usa luces físicas) */}
      <pointLight position={[8, 8, 10]} intensity={0.8} distance={60} decay={0} />
      <pointLight color="#6f8bff" position={[-6, -4, 4]} intensity={0.7} distance={60} decay={0} />

      <group ref={grupo} position={[6.5, 3.4, -6]} rotation={[0.5, 0.2, 0]}>
        <mesh>
          <torusGeometry args={[3.1, 0.07, 32, 180]} />
          <meshStandardMaterial color="#bfd2ff" metalness={0.7} roughness={0.25} emissive="#1a2a80" emissiveIntensity={0.25} transparent opacity={0.55} />
        </mesh>
        <mesh ref={anillo2} rotation={[Math.PI / 2.4, 0.4, 0]}>
          <torusGeometry args={[2.2, 0.045, 28, 160]} />
          <meshStandardMaterial color="#bfd2ff" metalness={0.7} roughness={0.25} emissive="#1a2a80" emissiveIntensity={0.25} transparent opacity={0.55} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.05, 48, 48]} />
          <meshStandardMaterial color="#2a3ad0" metalness={0.4} roughness={0.35} emissive="#33409a" emissiveIntensity={0.3} transparent opacity={0.6} />
        </mesh>
      </group>

      <points ref={estrellas}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[posiciones, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#ffffff" size={0.045} transparent opacity={0.45} />
      </points>
    </>
  );
}

export default function FondoApp() {
  // prefers-reduced-motion → un solo frame estático (frameloop 'demand').
  const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      <Escena animar={!reducirMovimiento} />
    </Canvas>
  );
}

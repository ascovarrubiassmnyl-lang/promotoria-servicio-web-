export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tipografía del sistema: en Apple es San Francisco, con su ajuste
        // óptico y de tracking ya incluido.
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"',
          '"Helvetica Neue"', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif',
        ],
      },
      colors: {
        // Paleta de marca: azul del sistema de Apple (#0071e3 en claro,
        // #0a84ff en oscuro). Escala completa para que brand-300/400/900
        // existan de verdad como tokens.
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#b3d7ff',
          300: '#7ab8ff',
          400: '#409cff',
          500: '#0a84ff',
          600: '#0071e3',
          700: '#0062c4',
          800: '#004a94',
          900: '#002f5f',
        },
        // Neutros (rediseño 2026-11-19, estilo Apple): `slate` ya NO es el
        // gris azulado de Tailwind sino la escala de grises neutros de Apple.
        // Se redefine el token en vez de renombrar ~1,500 clases: así el modo
        // oscuro pasa de azul marino a negro (fondo #000, superficies
        // #1c1c1e, separadores #3a3a3c) y el claro queda en #f5f5f7 / #1d1d1f
        // sin tocar cada componente. No volver a meter hex azulados sueltos.
        slate: {
          50: '#f5f5f7',
          100: '#ececf0',
          200: '#e3e3e8',
          300: '#d1d1d6',
          400: '#98989d',
          500: '#6e6e73',
          600: '#48484a',
          700: '#3a3a3c',
          800: '#1c1c1e',
          900: '#121214',
          950: '#000000',
        },
      },
      boxShadow: {
        // Sombra suave y difusa de las tarjetas (en vez de borde marcado).
        card: '0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)',
        flotante: '0 8px 40px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
};

import { Component } from 'react';

// Helpers compartidos de la convención de 3D decorativo (login y shell de la
// app): detección de WebGL y ErrorBoundary silencioso. Si algo falla, el
// fallback siempre es el gradiente CSS que ya está de fondo.

export function soportaWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch {
    return false;
  }
}

export class Silencioso extends Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? null : this.props.children; }
}

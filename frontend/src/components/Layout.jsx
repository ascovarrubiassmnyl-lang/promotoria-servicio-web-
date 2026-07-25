import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

// Iconos SVG inline (sin dependencias externas)
const IconDashboard = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>);
const IconClientes = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>);
const IconCal = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconPoliza = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L4 7v10l8 5 8-5V7z"/><path d="M4 7l8 5 8-5"/><path d="M12 22V12"/></svg>);
const IconAct = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>);
const IconAsesores = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const IconMetas = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>);
const IconConfig = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
const IconLogout = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
const IconToggle = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>);
const IconSun = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>);
const IconMoon = (p) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>);

const ICONS = {
  dashboard: IconDashboard, clientes: IconClientes, citas: IconCal, ventas: IconPoliza,
  actividad: IconAct, asesores: IconAsesores, metas: IconMetas, configuracion: IconConfig,
};

const STORAGE_KEY = 'crm:sidebar:colapsado';

export default function Layout() {
  const { user, logout, esAdmin, puede } = useAuth();
  const { tema, alternar } = useTheme();
  const navigate = useNavigate();

  const logoSrc = tema === 'dark' ? '/origen-blanco.png' : '/origen-negro.png';

  const [colapsado, setColapsado] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === '1') setColapsado(true);
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, colapsado ? '1' : '0');
  }, [colapsado]);

  const allLinks = [
    { to: '/', label: 'Dashboard', end: true, seccion: 'dashboard' },
    { to: '/clientes', label: 'Clientes', seccion: 'clientes' },
    { to: '/citas', label: 'Citas / Calendario', seccion: 'citas' },
    { to: '/ventas', label: 'Pólizas', seccion: 'ventas' },
    { to: '/actividad', label: 'Actividad', seccion: 'actividad' },
  ];
  const adminLinks = [
    { to: '/asesores', label: 'Asesores', seccion: 'asesores' },
    { to: '/targets', label: 'Metas', seccion: 'metas' },
    { to: '/configuracion', label: 'Configuración', seccion: 'configuracion' },
  ];
  const links = allLinks.filter((l) => puede(l.seccion));
  const adminLinksFiltrados = esAdmin() ? adminLinks.filter((l) => puede(l.seccion)) : [];

  const wClase = colapsado ? 'w-[68px]' : 'w-64';
  const linkClase = (isActive) =>
    `${isActive ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700/60'} ${
      colapsado ? 'justify-center px-0' : 'pl-3 pr-4 gap-3'
    } group relative flex items-center gap-3 rounded-lg ${colapsado ? 'h-10 w-10 mx-auto' : 'py-2'} text-sm font-medium transition`;

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 dark:bg-slate-900">
      <aside
        className={`${wClase} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-200 shrink-0 h-screen`}
      >
        {/* Logo + toggle */}
        <div className={`border-b border-slate-100 dark:border-slate-700 flex items-center h-16 ${colapsado ? 'justify-center px-2' : 'justify-between px-4'}`}>
          {colapsado ? (
            <span className="text-xl font-bold text-brand-600 dark:text-brand-400">O</span>
          ) : (
            <img src={logoSrc} alt="Origen" className="h-8 w-auto object-contain" />
          )}
          {!colapsado && (
            <button
              onClick={() => setColapsado(true)}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition shrink-0"
              title="Colapsar"
              aria-label="Colapsar sidebar"
            >
              <IconToggle className="w-4 h-4 rotate-180" />
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 overflow-y-auto overflow-x-hidden">
          {links.map((l) => {
            const Icon = ICONS[l.seccion] || IconDashboard;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) => linkClase(isActive)}
                title={colapsado ? l.label : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!colapsado && <span className="truncate">{l.label}</span>}
                {colapsado && (
                  <span className="pointer-events-none absolute left-[calc(100%+8px)] z-50 whitespace-nowrap rounded-md bg-slate-800 dark:bg-slate-700 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {l.label}
                  </span>
                )}
              </NavLink>
            );
          })}
          {esAdmin() && adminLinksFiltrados.length > 0 && (
            <>
              {!colapsado && <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Admin</p>}
              {colapsado && <div className="my-2 mx-3 border-t border-slate-100 dark:border-slate-700" />}
              {adminLinksFiltrados.map((l) => {
                const Icon = ICONS[l.seccion] || IconDashboard;
                return (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) => linkClase(isActive)}
                    title={colapsado ? l.label : undefined}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!colapsado && <span className="truncate">{l.label}</span>}
                    {colapsado && (
                      <span className="pointer-events-none absolute left-[calc(100%+8px)] z-50 whitespace-nowrap rounded-md bg-slate-800 dark:bg-slate-700 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        {l.label}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        {/* Footer: usuario + tema + logout */}
        <div className="p-2 border-t border-slate-100 dark:border-slate-700 space-y-1">
          <button
            onClick={alternar}
            className={`flex items-center gap-3 rounded-lg ${colapsado ? 'h-10 w-10 justify-center mx-auto' : 'px-3 py-2'} text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition`}
            title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          >
            {tema === 'dark' ? <IconSun className="w-5 h-5 shrink-0" /> : <IconMoon className="w-5 h-5 shrink-0" />}
            {!colapsado && <span className="text-sm font-medium">{tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>}
          </button>

          {!colapsado && user && (
            <div className="px-3 py-1.5">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{user.nombre} {user.apellidoP}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{user.rol}</p>
            </div>
          )}

          <button
            onClick={() => { logout(); navigate('/login'); }}
            className={`flex items-center gap-3 rounded-lg ${colapsado ? 'h-10 w-10 justify-center mx-auto text-red-500' : 'px-3 py-2 text-red-600 dark:text-red-400'} hover:bg-red-50 dark:hover:bg-red-900/20 transition`}
            title="Cerrar sesión"
          >
            <IconLogout className="w-5 h-5 shrink-0" />
            {!colapsado && <span className="text-sm font-medium">Cerrar sesión</span>}
          </button>

          {/* Botón expandir cuando está colapsado */}
          {colapsado && (
            <button
              onClick={() => setColapsado(false)}
              className="flex items-center justify-center w-10 h-10 mx-auto rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition"
              title="Expandir"
              aria-label="Expandir sidebar"
            >
              <IconToggle className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-full overflow-y-auto overflow-x-hidden">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

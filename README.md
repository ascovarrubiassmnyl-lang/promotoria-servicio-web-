# CRM Promotoría · Seguros Monterrey New York Life

CRM/RP para promotora de seguros de Seguros Monterrey New York Life. Maneja asesores, sus clientes, citas/calendario, pólizas, referidos, bonos y métricas de rendimiento. Catálogo de 19 productos reales SMNYL + recordatorios de pago por Web Push.

## Estructura
- `backend/` — API Node.js + Express + Prisma + PostgreSQL + JWT + Web Push
- `frontend/` — React + Vite + Tailwind + React Query

## Roles
- `SUPERADMIN` — control total (incluye eliminar usuarios)
- `ADMIN` (promotora) — ve CRM de todos los asesores, asigna metas, valida ventas, gestiona usuarios
- `ASESOR` — solo su CRM: clientes, citas, pólizas, calendario

## Puesta en marcha (local)

### Requisitos
- Node 18+
- PostgreSQL 14+ en localhost:5433 (usuario `postgres`, contraseña `postgres`). Si usas otro puerto, ajusta `DATABASE_URL` en `backend/.env`.

### 1) Backend
```bash
cd backend
cp .env.example .env          # ajusta DATABASE_URL, JWT_SECRET y VAPID keys
npm install
npx prisma migrate deploy      # aplica las migrations
npx prisma generate
npm run prisma:seed            # crea usuarios demo, catálogo SMNYL y datos de prueba
npm run dev                    # API en http://localhost:4000
```

> Para Web Push, genera tus VAPID keys con `npx web-push generate-vapid-keys` y colócalas en `.env`.

### 2) Frontend
```bash
cd frontend
cp .env.example .env          # ajusta VITE_API_URL si el backend no está en :4000
npm install
npm run dev                   # app en http://localhost:5173
```

### Cuentas demo
| Rol        | Email                  | Contraseña  |
|------------|------------------------|-------------|
| SUPERADMIN  | superadmin@demo.com    | super123    |
| ADMIN       | admin@demo.com         | admin123    |
| ASESOR      | asesor1@demo.com       | asesor123   |
| ASESOR      | asesor2@demo.com       | asesor123   |

## Funciones principales
- **Asesor**: dashboard personal, CRUD de clientes, agenda de citas (única o acompañamiento con promotor) + calendario, registro de pólizas con vigencia y formas de pago, registro de actividad automático, bitácora de actividad por semana.
- **Promotora / Admin**: dashboard global con ranking de asesores, vista `/asesores` (CRM completo de cada asesor), gestión de usuarios, asignación de metas/targets mensuales, validación de pólizas.
- **Pólizas con catálogo SMNYL**: 19 productos reales (Vida, Salud, Autos, Daños, Retirement+) con comisión y comisión-bono por producto. Recordatorios de pago automáticos por Web Push con auto-ciclo según forma de pago.
- **Marketing — Referidos y Bonos**: pipeline de referidos (Pendiente → Contactado → Convertido/Descartado), bonos por comisión.
- **Calendario**: vista mes/semana, cita única de asesor o acompañamiento (compartida con promotor).
- **Métricas**: número de clientes, citas, pólizas activas, prima anual y comisión; ranking de asesores; ventas por ramo; tendencia mensual.

## Features de UI
- Sidebar colapsable persistente con tooltips en modo compacto.
- Modo claro/oscuro.
- Drawer lateral para ficha técnica de póliza.
- Actividad agrupada por semana del mes con resumen compacto por tipo.

## Producción
Despliega backend (`npm start`) y sirve `frontend/dist/` con cualquier CDN estático. Configura `VITE_API_URL` en frontend y `PUBLIC_URL`/`VAPID_*` en backend según tu dominio.

## Licencia
Uso interno de la promotora. © 2026

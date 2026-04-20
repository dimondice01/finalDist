# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Desarrollo
expo start                    # Inicia Metro bundler
expo run:android              # Compila y corre en Android
expo run:ios                  # Compila y corre en iOS

# Linting
expo lint                     # Lint del proyecto principal
cd functions && npm run lint  # Lint de Cloud Functions (Google style)

# Deploy Cloud Functions
firebase deploy --only functions
firebase deploy --only functions:afip  # Codebase AFIP separado

# Builds EAS
eas build --profile development --platform android
eas build --profile production --platform android
```

No hay script de tests configurado.

## Arquitectura General

**Noar ERP** es una aplicación móvil SaaS multi-tenant para distribuidoras argentinas. Expo 54 / React Native 0.81 con TypeScript strict. El tenant se resuelve desde `/users/{uid}.companyId` en Firebase Auth.

### Estructura de datos (Firestore)

Todo vive bajo `/companies/{companyId}/`:
- `productos`, `categorias`, `promociones`, `listas_precios`, `rubros`
- `clientes`, `vendedores`, `ventas`, `rutas`, `zonas`
- `config` — configuraciones por tipo: `"afip"`, `"mercadopago"`

### Flujo de datos

```
Firebase Auth → /users/{uid} → companyId
    → DataContext (App.tsx)
        → fetchDataAndStore() → Firestore multi-tenant queries
        → AsyncStorage (caché offline)
        → onSnapshot listeners (productos, categorias, promociones)
    → Screens via useData()
        → mutaciones optimistas (stock local)
        → Cloud Functions (stock real, AFIP, MercadoPago)
```

### Context

- **`DataContext`** (`context/DataContext.tsx`): único store de estado global. Contiene productos, clientes, ventas, rutas, config. Se accede con `useData()`. Implementa offline-first con AsyncStorage + listeners Firestore.
- **`RouteContext`**: estado de navegación de reparto (routeClients, visitedClients). Se accede con `useRoute()`.

### Roles y navegación

`AppNavigator.tsx` hace switch basado en rol del vendedor:
- **Vendedor / Admin** → `HomeScreen`
- **Reparto** → `DriverScreen`

Todos los demás screens están en el mismo Stack y son accesibles por ambos roles salvo restricciones lógicas en pantalla.

### Servicios externos

| Servicio | Ubicación | Propósito |
|---|---|---|
| Firebase Auth + Firestore | `db/firebase-service.ts` | Auth, datos, funciones |
| AFIP (facturación fiscal AR) | `afip-service/` (codebase separado) | WSAA + WSFE vía SOAP, certificados RSA |
| MercadoPago | `functions/mercadopago.js` | QR dinámico, Point Smart terminal |
| PDF/Remito | `services/pdfGenerator.ts` | HTML → PDF vía expo-print |
| Geolocalización | `services/locationService.ts` | GPS para reparto, precisión >50m |

### Cloud Functions

- Región: `southamerica-west1`
- Dos codebases en `firebase.json`: `functions/` (default) y `afip-service/`
- Triggers clave: `descontarStockPorVenta`, `emitirFactura`, `cobrarConPoint`

### Patrones importantes

- **Mutaciones optimistas**: el stock se descuenta localmente (`descontarStockLocalmente`) antes de confirmar en servidor. Si falla, se revierte con `reintegrarStockLocalmente`.
- **Alias de paths**: usar `@/` para importar desde la raíz del proyecto (configurado en `tsconfig.json`).
- **Estilos**: NativeWind v4 (Tailwind para React Native) + `styles/theme.js` para la paleta de colores.
- **Deep linking**: `movilappnueva://` y `distribuidora://` para importar pedidos desde WhatsApp; `https://noarerp.web.app/pedido` vía intent filters Android.
- **Singleton Firestore**: `db/firebase-service.ts` exporta instancias únicas de auth, db y functions — usar siempre esas instancias, nunca inicializar Firebase directamente en screens.

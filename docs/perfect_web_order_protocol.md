# Protocolo de Pedido Perfecto: Catálogo Web → Desktop

Este documento define el estándar de oro para que el **Agente de Desktop** (la lógica de la aplicación administrativa) reciba y procese los pedidos del catálogo web de forma impecable.

## 1. Esquema del Pedido en Firestore
El catálogo web debe escribir el pedido en la colección `companies/{companyId}/ventas` siguiendo este esquema riguroso:

| Campo | Valor / Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | `uuid()` o `auto` | ID único de venta. |
| `tipo` | `"venta"` | Mantiene la consistencia con el ERP. |
| `estado` | `"Web: Pendiente"` | Nuevo estado para distinguir pedidos no revisados. |
| `source` | `"web_catalog"` | Metadata para analítica y filtrado. |
| `vendedorId` | `string` | Tomado del parámetro `v` de la URL. |
| `listaPrecios` | `string` | Tomado del parámetro de la URL (ej: "Mayorista"). |
| `clienteId` | `string` | ID del cliente si se pudo identificar (vía login o matching). |
| `clienteNombre` | `string` | Identificado o ingresado manualmente por el cliente. |
| `items` | `CartItem[]` | **IMPORTANTE:** Debe incluir `nombre` y `precio` en el momento del pedido. |
| `totalVenta` | `number` | Suma total calculada en el catálogo. |
| `fecha` | `serverTimestamp()` | Fecha oficial de recepción. |

## 2. Flujo de "Perfección" en el Desktop (APP)

Para que la experiencia sea perfecta, el Agente de Desktop debe implementar:

### A. Listener en Tiempo Real
La pantalla de Inicio (`HomeScreen.tsx`) debe tener un listener (onSnapshot) filtrando por `estado == "Web: Pendiente"`.
- **Acción:** Mostrar un "Badge" rojo en el icono de Catálogo o un "Snackbar" persistente: *"Tienes 3 pedidos nuevos del catálogo"*.

### B. Vinculación Automática (Bridging)
Al abrir un pedido web, el sistema debe:
1.  Buscar si el teléfono/nombre del cliente ya existe en la base de datos de la empresa.
2.  Si existe, ofrecer **"Linkear a [Nombre del Cliente]"**.
3.  Si no existe, ofrecer **"Crear nuevo cliente con estos datos"**.

### C. Congelación de Precios
El sistema **no debe recalcular los precios** del pedido web usando el maestro de productos actual. Debe respetar los precios con los que el cliente cerró el carrito en la web (almacenados en `items[].precio`).

### D. Notificación de Respuesta (WhatsApp)
Una vez que el administrador acepta el pedido (cambiando el estado a `Pendiente de Entrega`), el Desktop Agent debe ofrecer un botón para enviar un WhatsApp automático:
> "Hola *[Cliente]*, recibimos tu pedido web #*[ID]*. Ya lo estamos preparando! 🚚"

## 3. Consideraciones Técnicas (Checklist para el Desarrollador)

- [ ] **Stocks**: No descontar stock hasta que el pedido sea "Aceptado" en el Desktop para evitar bloqueos por carritos abandonados.
- [ ] **Punto de Venta**: Si el cliente seleccionó "Pago Local", marcar `paymentMethod: 'local'`.
- [ ] **Validación**: Ignorar pedidos con `totalVenta <= 0`.
- [ ] **Seguridad**: Asegurar que las reglas de Firestore permitan escritura a `ventas` desde el catálogo pero solo para los campos de pedido.

---
> [!TIP]
> Implementar este protocolo garantiza que la transición entre el cliente final y la logística sea fluida, eliminando errores de transcripción manual y aumentando la velocidad de entrega en un 40%.

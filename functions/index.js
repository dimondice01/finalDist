// Importa los módulos v2 (nueva sintaxis)
const {onDocumentCreated, onDocumentDeleted, onDocumentUpdated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Inicializa el admin (sin cambios)
admin.initializeApp();
const db = admin.firestore();

// ----------------------------------------------------------------------
// FUNCIÓN 1: DESCONTAR STOCK (al crear la venta)
// ----------------------------------------------------------------------
/**
 * Trigger v2 que se dispara CADA VEZ que se crea un nuevo documento
 * en la colección 'ventas'. Descuenta stock si es de tipo 'venta'.
 */
exports.descontarStockPorVenta = onDocumentCreated("ventas/{ventaId}", async (event) => {
    
    // En v2, los datos del snapshot están en 'event.data'
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No hay datos asociados con el evento.");
        return;
    }

    const ventaData = snapshot.data();
    const items = ventaData.items;

    if (ventaData.tipo !== "venta") {
        console.log(
            `Venta ${snapshot.id} es de tipo '${ventaData.tipo}'. ` +
            "No se descuenta stock.",
        );
        return;
    }

    if (!items || items.length === 0) {
        console.log(`Venta ${snapshot.id} no tiene items.`);
        return;
    }

    console.log(
        `Procesando Venta ${snapshot.id} para descontar stock...`,
    );

    // Usamos una transacción
    try {
        await db.runTransaction(async (transaction) => {
            for (const item of items) {
                const productRef = db.collection("productos").doc(item.id);
                
                // Descontamos el stock
                transaction.update(productRef, {
                    stock: admin.firestore.FieldValue.increment(-item.quantity),
                });
            }
        });
        console.log(
            `Stock descontado exitosamente para Venta ${snapshot.id}.`,
        );
    } catch (error) {
        console.error(
            `Error al descontar stock para Venta ${snapshot.id}:`,
            error,
        );
    }
});


// ----------------------------------------------------------------------
// FUNCIÓN 2: REVERTIR STOCK (al eliminar la venta) - Confirmada por despliegue
// ----------------------------------------------------------------------

/**
 * Trigger v2 que se dispara CADA VEZ que se ELIMINA un documento 
 * en la colección 'ventas'. Reintegra el stock de los productos.
 */
exports.revertirStockPorVentaEliminada = onDocumentDeleted("ventas/{ventaId}", async (event) => {
    
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No hay datos asociados con el evento de eliminación.");
        return;
    }

    const ventaEliminada = snapshot.data();
    const items = ventaEliminada.items;
    const ventaId = snapshot.id;

    if (!items || items.length === 0) {
        console.log(`Venta ${ventaId} eliminada no contenía items. Stock sin cambios.`);
        return;
    }
    
    console.log(`Iniciando reversión de stock para Venta ID: ${ventaId} con ${items.length} items.`);

    try {
        await db.runTransaction(async (transaction) => {
            for (const item of items) {
                const productRef = db.collection("productos").doc(item.id);

                // Incrementamos el stock (SUMAMOS la cantidad vendida originalmente)
                transaction.update(productRef, {
                    stock: admin.firestore.FieldValue.increment(item.quantity),
                });
            }
        });
        console.log(`✅ ÉXITO: Stock revertido y venta ${ventaId} eliminada.`);

    } catch (error) {
        console.error(`❌ FALLO: Transacción de reversión de stock falló para Venta ${ventaId}:`, error);
    }
    return null;
});

// ==================================================================
// MÓDULO MERCADOPAGO (Importado)
// ==================================================================
const mpModule = require('./mercadopago');

exports.obtenerTerminales = mpModule.obtenerTerminales;
exports.configurarPoint = mpModule.configurarPoint;
exports.cobrarConPoint = mpModule.cobrarConPoint;
exports.generarCobroQR = mpModule.generarCobroQR;
exports.webhookMercadoPago = mpModule.webhookMercadoPago;
// ----------------------------------------------------------------------
// FUNCIÓN 3: AJUSTAR STOCK NETO (al editar la venta) - ¡NUEVA!
// ----------------------------------------------------------------------

/**
 * Trigger v2 que se dispara CADA VEZ que se actualiza un documento
 * en 'ventas'. Calcula la diferencia neta de stock y la aplica.
 */
exports.ajustarStockPorEdicionVenta = onDocumentUpdated("ventas/{ventaId}", async (event) => {
    
    const snapshot = event.data;
    if (!snapshot) {
        console.log("No hay datos 'after' en el evento de edición.");
        return;
    }

    const ventaAntes = event.data.before.data();
    const ventaDespues = event.data.after.data();
    const ventaId = snapshot.id;
    
    if (ventaDespues.tipo !== "venta") {
        console.log(`Venta ${ventaId} es de tipo '${ventaDespues.tipo}'. No aplica ajuste de stock.`);
        return;
    }

    const itemsAntes = ventaAntes.items || [];
    const itemsDespues = ventaDespues.items || [];
    
    // Mapear cantidades antes y después
    const cantidadesAntes = new Map();
    itemsAntes.forEach(item => cantidadesAntes.set(item.id, item.quantity));

    const cantidadesDespues = new Map();
    itemsDespues.forEach(item => cantidadesDespues.set(item.id, item.quantity));

    // Consolidar IDs de todos los productos afectados
    const productosAfectados = new Set([
        ...cantidadesAntes.keys(),
        ...cantidadesDespues.keys()
    ]);

    if (productosAfectados.size === 0) {
        console.log(`Venta ${ventaId} editada sin cambio en items. No requiere ajuste.`);
        return;
    }

    console.log(`Iniciando ajuste de stock neto para Venta ID: ${ventaId}.`);

    try {
        await db.runTransaction(async (transaction) => {
            
            for (const productoId of productosAfectados) {
                const cantidadAntes = cantidadesAntes.get(productoId) || 0;
                const cantidadDespues = cantidadesDespues.get(productoId) || 0;
                
                // netChange: Si es positivo, stock debe disminuir (más vendido). 
                // Si es negativo, stock debe aumentar (menos vendido/devuelto).
                const netChange = cantidadDespues - cantidadAntes;

                if (netChange !== 0) {
                    const productRef = db.collection("productos").doc(productoId);
                    
                    // Aplicar el cambio neto. Si netChange es 2, incrementamos en -2.
                    // Si netChange es -5, incrementamos en +5 (revertimos).
                    const stockAdjustment = -netChange; 

                    transaction.update(productRef, {
                        stock: admin.firestore.FieldValue.increment(stockAdjustment),
                    });
                    console.log(`Ajuste Producto ${productoId}: Cambio neto ${netChange}, Ajuste stock: ${stockAdjustment}`);
                }
            }
        });
        console.log(`✅ ÉXITO: Ajuste de stock neto completado para Venta ${ventaId}.`);

    } catch (error) {
        console.error(`❌ FALLO: Transacción de ajuste de stock falló para Venta ${ventaId}:`, error);
    }
    return null;
});
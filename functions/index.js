// Importa los módulos v2 (nueva sintaxis)
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Inicializa el admin (sin cambios)
admin.initializeApp();
const db = admin.firestore();

/**
 * Trigger v2 que se dispara CADA VEZ que se crea un nuevo documento
 * en la colección 'ventas'.
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

    // --- ¡IMPORTANTE! ---
    // El resto de la lógica es idéntica
    if (ventaData.tipo !== "venta") {
        console.log(
            `Venta ${snapshot.id} es de tipo '${ventaData.tipo}'. ` +
            "No se descuenta stock.",
        );
        return; // En v2, solo usamos 'return'
    }

    if (!items || items.length === 0) {
        console.log(`Venta ${snapshot.id} no tiene items.`);
        return;
    }

    console.log(
        `Procesando Venta ${snapshot.id} para descontar stock...`,
    );

    // Usamos una transacción (sin cambios)
    try {
        await db.runTransaction(async (transaction) => {
            for (const item of items) {
                const productRef = db.collection("productos").doc(item.id);
                
                // FieldValue.increment() (sin cambios)
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
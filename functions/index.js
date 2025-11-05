const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Trigger que se dispara CADA VEZ que se crea un nuevo documento
 * en la colección 'ventas'.
 */
exports.descontarStockPorVenta = functions.firestore
    .document("ventas/{ventaId}")
    .onCreate(async (snapshot, context) => {
        const ventaData = snapshot.data();
        const items = ventaData.items;

        // --- ¡IMPORTANTE! ---
        // Solo descontamos stock si es una 'venta'.
        // No hacemos nada si es 'reposicion' o 'devolucion'.
        if (ventaData.tipo !== "venta") {
            console.log(
                `Venta ${snapshot.id} es de tipo '${ventaData.tipo}'. ` +
                "No se descuenta stock.",
            );
            return null;
        }

        if (!items || items.length === 0) {
            console.log(`Venta ${snapshot.id} no tiene items.`);
            return null;
        }

        console.log(
            `Procesando Venta ${snapshot.id} para descontar stock...`,
        );

        // Usamos una transacción para asegurar que todas las
        // actualizaciones de stock se hagan juntas.
        try {
            await db.runTransaction(async (transaction) => {
                for (const item of items) {
                    const productRef = db.collection("productos").doc(item.id);
                    
                    // FieldValue.increment() es la forma atómica y segura
                    // de sumar o restar valores numéricos.
                    transaction.update(productRef, {
                        stock: admin.firestore.FieldValue.increment(-item.quantity),
                    });
                }
            });
            console.log(
                `Stock descontado exitosamente para Venta ${snapshot.id}.`,
            );
            return null;
        } catch (error) {
            console.error(
                `Error al descontar stock para Venta ${snapshot.id}:`,
                error,
            );
            // Opcional: podrías marcar la venta con un flag de "error_stock"
            // await snapshot.ref.update({
            //   errorStock: true,
            //   errorMensaje: error.message,
            // });
            return null;
        }
    });
// v2 sintaxis
const { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

// Inicializa el admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// Módulos
const afipModule = require("./afip");
const mpModule = require("./mercadopago");

// ==================================================================
// 🛠️ HELPER CORE: OBTENER CONFIGURACIÓN MULTI-TENANT
// ==================================================================
async function getCompanyConfig(companyId, type) {
    if (!companyId) throw new Error("Falta companyId para obtener configuración.");

    // Buscamos por campo 'tipo' como pide el Plan Maestro
    const snap = await db.collection(`companies/${companyId}/config`)
        .where("tipo", "==", type)
        .limit(1)
        .get();

    if (snap.empty) throw new Error(`El servicio ${type} no está configurado.`);
    
    const data = snap.docs[0].data();
    if (!data.isActive) throw new Error(`El servicio ${type} está desactivado.`);
    
    return data;
}

// ==================================================================
// 🔀 EXPRESS BRIDGE (REST API)
// ==================================================================
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// 📠 GENERADOR DE CLAVES AFIP (CSR)
app.post("/generate-afip-csr", async (req, res) => {
    try {
        const forge = require("node-forge");
        const keys = forge.pki.rsa.generateKeyPair(2048);
        const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
        
        const csr = forge.pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;
        csr.setSubject([
            { name: 'commonName', value: 'SalvadorPOS' },
            { name: 'countryName', value: 'AR' },
            { name: 'organizationName', value: 'SalvadorPOS' }
        ]);
        csr.sign(keys.privateKey, forge.md.sha256.create());
        const csrPem = forge.pki.certificationRequestToPem(csr);

        res.status(200).json({ success: true, csr: csrPem, privateKey: privateKeyPem });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

exports.api = onRequest({ cors: true }, app);

// ==================================================================
// 📂 EXPORTS INDIVIDUALES (COMPATIBILIDAD WEB ADMIN)
// ==================================================================

// 1. AFIP (Móvil y Web)
exports.emitirFacturasReparto = onCall({ cors: true, region: "southamerica-west1" }, async (request) => {
    const { total, client, companyId, branchId } = request.data;
    try {
        const afipConfig = await getCompanyConfig(companyId, 'afip');
        const result = await afipModule.emitirFactura(total, client, false, null, afipConfig);
        return result;
    } catch (error) {
        throw new onCall.HttpsError('internal', error.message);
    }
});

// 2. MercadoPago Terminales (Web Admin)
exports.obtenerTerminales = mpModule.obtenerTerminales;
exports.configurarPoint = mpModule.configurarPoint;

// 3. MercadoPago Cobros (Móvil)
exports.cobrarConPoint = mpModule.cobrarConPoint;
exports.generarCobroQR = mpModule.generarCobroQR;
exports.webhookMercadoPago = mpModule.webhookMercadoPago;

// ==================================================================
// 📦 TRIGGERS DE STOCK (LÓGICA ORIGINAL)
// ==================================================================

exports.descontarStockPorVenta = onDocumentCreated({ 
    document: "companies/{companyId}/ventas/{ventaId}", 
    region: "southamerica-west1" 
}, async (event) => {
    const { companyId } = event.params;
    const snapshot = event.data;
    if (!snapshot) return;

    const ventaData = snapshot.data();
    if (ventaData.tipo !== "venta" || !ventaData.items) return;

    try {
        await db.runTransaction(async (transaction) => {
            for (const item of ventaData.items) {
                const productRef = db.collection("companies").doc(companyId).collection("productos").doc(item.id);
                transaction.update(productRef, {
                    stock: admin.firestore.FieldValue.increment(-item.quantity),
                });
            }
        });
    } catch (error) {
        logger.error("Error descontando stock:", error);
    }
});

exports.revertirStockPorVentaEliminada = onDocumentDeleted({ 
    document: "companies/{companyId}/ventas/{ventaId}", 
    region: "southamerica-west1" 
}, async (event) => {
    const { companyId } = event.params;
    const snapshot = event.data;
    if (!snapshot) return;

    const ventaEliminada = snapshot.data();
    if (!ventaEliminada.items) return;

    try {
        await db.runTransaction(async (transaction) => {
            for (const item of ventaEliminada.items) {
                const productRef = db.collection("companies").doc(companyId).collection("productos").doc(item.id);
                transaction.update(productRef, {
                    stock: admin.firestore.FieldValue.increment(item.quantity),
                });
            }
        });
    } catch (error) {
        logger.error("Error revirtiendo stock:", error);
    }
});

exports.ajustarStockPorEdicionVenta = onDocumentUpdated({ 
    document: "companies/{companyId}/ventas/{ventaId}", 
    region: "southamerica-west1" 
}, async (event) => {
    const { companyId } = event.params;
    const ventaAntes = event.data.before.data();
    const ventaDespues = event.data.after.data();
    
    if (ventaDespues.tipo !== "venta") return;

    const amountsBefore = new Map(ventaAntes.items?.map(i => [i.id, i.quantity]) || []);
    const amountsAfter = new Map(ventaDespues.items?.map(i => [i.id, i.quantity]) || []);
    const allProductIds = new Set([...amountsBefore.keys(), ...amountsAfter.keys()]);

    try {
        await db.runTransaction(async (transaction) => {
            for (const id of allProductIds) {
                const diff = (amountsAfter.get(id) || 0) - (amountsBefore.get(id) || 0);
                if (diff !== 0) {
                    const productRef = db.collection("companies").doc(companyId).collection("productos").doc(id);
                    transaction.update(productRef, {
                        stock: admin.firestore.FieldValue.increment(-diff),
                    });
                }
            }
        });
    } catch (error) {
        logger.error("Error ajustando stock:", error);
    }
});
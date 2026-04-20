/**
 * functions/mercadopago.js - Noar SaaS Master Code
 * Módulo de Cobros: QR Dinámico (In-store) + Point Smart
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();

// ==================================================================
// 🔍 HELPER LOCAL: CONFIGURACIÓN DINÁMICA
// ==================================================================
async function getMpConfig(companyId) {
    if (!companyId) throw new Error("Falta companyId para configurar MercadoPago.");

    const snap = await db.collection(`companies/${companyId}/config`)
        .where("tipo", "==", "mercadopago")
        .limit(1)
        .get();

    if (snap.empty) throw new Error(`MercadoPago no está configurado para la empresa ${companyId}.`);
    const data = snap.docs[0].data();
    
    if (!data.isActive || !data.accessToken) {
        throw new Error("La configuración de MercadoPago está incompleta o desactivada.");
    }
    return data;
}

// ==================================================================
// 1. OBTENER TERMINALES (Móvil & Web)
// ==================================================================
exports.obtenerTerminales = onCall({ cors: true, region: "southamerica-west1" }, async (request) => {
    const { companyId } = request.data;
    try {
        const config = await getMpConfig(companyId);
        
        const response = await fetch('https://api.mercadopago.com/point/integration-api/devices', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`Error MP API: ${response.status}`);

        const data = await response.json();
        const devices = (data.devices || []).map(d => ({
            id: d.id,
            name: d.name || `Point ${d.model || 'Smart'}`,
            model: d.model,
            mode: d.operating_mode
        }));

        return { devices };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 2. CONFIGURAR POINT (Web Admin)
// ==================================================================
exports.configurarPoint = onCall({ cors: true, region: "southamerica-west1" }, async (request) => {
    const { companyId, deviceId, mode } = request.data;
    try {
        const config = await getMpConfig(companyId);
        
        const response = await fetch('https://api.mercadopago.com/terminals/v1/setup', {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                terminals: [{ id: deviceId, operating_mode: mode }] // mode: 'PDV' o 'STANDALONE'
            })
        });

        if (!response.ok) throw new Error("Error en la configuración del terminal.");
        return { success: true };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 3. COBRAR CON POINT (Móvil - Zero Config)
// ==================================================================
exports.cobrarConPoint = onCall({ cors: true, region: "southamerica-west1" }, async (request) => {
    const { companyId, deviceId, amount, external_reference } = request.data;
    
    if (!deviceId) throw new HttpsError('failed-precondition', "No tienes un terminal Point asignado.");

    try {
        const config = await getMpConfig(companyId);
        
        // MP requiere montos en centavos (entero)
        const amountInCents = Math.round(parseFloat(amount) * 100);

        const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: amountInCents,
                additional_info: {
                    external_reference: external_reference,
                    print_on_terminal: true
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 409) throw new Error("El Point ya tiene una orden en proceso.");
            throw new Error(data.message || "Error al enviar la orden al Point.");
        }

        return { success: true, intentId: data.id };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 4. GENERAR QR DINÁMICO (Móvil - External ID Ready)
// ==================================================================
exports.generarCobroQR = onCall({ cors: true, region: "southamerica-west1" }, async (request) => {
    const { companyId, userId, external_id, amount, external_reference, title } = request.data;
    
    if (!external_id) throw new HttpsError('failed-precondition', "No tienes un ID de Caja (QR) asignado.");

    try {
        const config = await getMpConfig(companyId);
        
        // URL de In-store Orders (QR Dinámico)
        // Estructura: /instore/orders/qr/seller/collectors/{user_id}/pos/{external_id}/currenct
        
        // Primero obtenemos el ID de usuario del dueño del token (collector)
        const meRes = await fetch('https://api.mercadopago.com/users/me', {
            headers: { 'Authorization': `Bearer ${config.accessToken}` }
        });
        const meData = await meRes.json();
        const collectorId = meData.id;

        const response = await fetch(`https://api.mercadopago.com/instore/orders/qr/seller/collectors/${collectorId}/pos/${external_id}/currenct`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                external_reference: external_reference,
                title: title || "Venta SalvadorPOS",
                description: `Vendedor: ${userId}`,
                total_amount: parseFloat(amount),
                items: [
                    {
                        title: title || "Venta General",
                        unit_price: parseFloat(amount),
                        quantity: 1,
                        unit_measure: "unit",
                        total_amount: parseFloat(amount)
                    }
                ]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || "Error generando el QR.");
        }

        const data = await response.json();
        return { success: true, qr_data: data.qr_data }; // Contiene el string para generar el QR
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 5. WEBHOOK & STATUS CHECK
// ==================================================================
exports.webhookMercadoPago = onRequest({ region: "southamerica-west1" }, async (req, res) => {
    // Aquí podrías actualizar el estado del pago en Firestore si recibes el topic 'payment'
    res.status(200).send("OK");
});
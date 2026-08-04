/**
 * functions/mercadopago.js - Noar SaaS Master Code
 * Módulo de Cobros: QR Dinámico (In-store) + Point Smart
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
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
    
    if (!data.active || !data.accessToken) {
        throw new Error("La configuración de MercadoPago está incompleta o desactivada.");
    }
    return data;
}

// ==================================================================
// 1. OBTENER TERMINALES (Móvil & Web)
// ==================================================================
exports.obtenerTerminales = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
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
// 1B. OBTENER CAJAS QR / PUNTOS DE VENTA (Web Admin)
// ==================================================================
exports.obtenerCajasQR = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
    const { companyId } = request.data;
    try {
        const config = await getMpConfig(companyId);

        const response = await fetch('https://api.mercadopago.com/pos?limit=100', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`Error MP API: ${response.status}`);

        const data = await response.json();
        const results = data.results || [];

        // Auto-reparación: las cajas creadas desde el panel web de Mercado Pago suelen
        // no tener external_id asignado. Sin eso el QR dinámico no las puede direccionar,
        // así que se lo generamos y se lo guardamos en MP si falta.
        const cajas = await Promise.all(results.map(async (p) => {
            let externalId = p.external_id;
            if (!externalId) {
                externalId = `POS${p.id}`;
                try {
                    await fetch(`https://api.mercadopago.com/pos/${p.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${config.accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name: p.name, external_id: externalId, fixed_amount: true })
                    });
                } catch (repairError) {
                    console.error(`No se pudo reparar la caja ${p.id}:`, repairError.message);
                }
            }
            // La respuesta de /pos trae la imagen del QR fijo de esa Caja (siempre la
            // misma URL para ese POS). La guardamos junto al resto para que la app móvil
            // la pueda mostrar en pantalla sin llamadas extra a MercadoPago.
            return { id: externalId, nombre: p.name || `Caja ${p.id}`, qrImage: p.qr?.image || null };
        }));

        return { cajas };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 1C. OBTENER IMAGEN DE UN QR PUNTUAL (Móvil - siempre fresca)
// ==================================================================
// No depende de que la Caja ya tenga qrImage guardado en Firestore (eso solo se
// completa cuando alguien aprieta "Buscar Mis Cajas" en la web). La app la pide acá
// directo a MercadoPago cada vez que hace falta mostrarla.
exports.obtenerImagenQR = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
    const { companyId, external_id } = request.data;
    if (!external_id) throw new HttpsError('failed-precondition', "Falta el ID de la Caja.");

    try {
        const config = await getMpConfig(companyId);

        const response = await fetch(`https://api.mercadopago.com/pos?external_id=${encodeURIComponent(external_id)}`, {
            headers: { 'Authorization': `Bearer ${config.accessToken}` }
        });
        if (!response.ok) throw new Error(`Error MP API: ${response.status}`);

        const data = await response.json();
        const pos = (data.results || [])[0];

        return { qrImage: pos?.qr?.image || null };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 2. CONFIGURAR POINT (Web Admin)
// ==================================================================
exports.configurarPoint = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
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
exports.cobrarConPoint = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
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
// 4. ACTUALIZAR MONTO DEL QR FIJO (Móvil)
// ==================================================================
// El QR de cada Caja es siempre el mismo (ver qr.image en obtenerCajasQR). Esta función
// NO genera un QR nuevo por cobro: actualiza la orden "corriente" de ESE POS fijo, para
// que al escanearlo el cliente pague este monto puntual. external_reference queda atado
// a la venta para poder verificar el pago después con verificarPagoMP.
// Endpoint validado en producción (mismo que usa noar-pos-resilense).
exports.generarCobroQR = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
    const { companyId, external_id, amount, external_reference, title } = request.data;

    if (!external_id) throw new HttpsError('failed-precondition', "No tienes un ID de Caja (QR) asignado.");

    try {
        const config = await getMpConfig(companyId);

        // El userId (collector) hace falta para armar la URL; si no está cacheado en la
        // config, se pide una sola vez y no hace falta guardarlo (es barato).
        let userId = config.mpUserId;
        if (!userId) {
            const meRes = await fetch('https://api.mercadopago.com/users/me', {
                headers: { 'Authorization': `Bearer ${config.accessToken}` }
            });
            const meData = await meRes.json();
            userId = meData.id;
        }

        const url = `https://api.mercadopago.com/instore/orders/qr/seller/collectors/${userId}/pos/${encodeURIComponent(external_id)}/qrs`;

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                external_reference: external_reference,
                title: title || "Venta General",
                description: "Cobro presencial",
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

        return { success: true };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 4B. VERIFICAR ESTADO DE PAGO (Móvil - Polling cada ~3s)
// ==================================================================
// En vez de depender de que MercadoPago nos avise por webhook (requiere configurar
// topics en el panel de cada cuenta y resolver a qué empresa pertenece cada aviso a
// ciegas), la app pregunta activamente por el estado. Mismo patrón que
// /check-payment-status en noar-pos-resilense, ya probado en producción.
exports.verificarPagoMP = onCall({ cors: true, region: "southamerica-west1", invoker: "public" }, async (request) => {
    const { companyId, reference, provider } = request.data;
    if (!reference) throw new HttpsError('invalid-argument', "Falta la referencia del cobro a verificar.");

    try {
        const config = await getMpConfig(companyId);
        const headers = { 'Authorization': `Bearer ${config.accessToken}` };

        if (provider === 'point') {
            const response = await fetch(`https://api.mercadopago.com/point/integration-api/payment-intents/${reference}`, { headers });
            const intent = await response.json();

            if (intent.state === 'FINISHED') {
                const paymentId = intent.payment_ids?.[0] || 'POINT-OK';
                return { status: 'approved', id: paymentId };
            }
            if (intent.state === 'CANCELED') return { status: 'canceled' };
            return { status: 'pending' };
        }

        // QR
        const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(reference)}&status=approved`;
        const response = await fetch(url, { headers });
        const data = await response.json();

        if (data.results?.length > 0) {
            const p = data.results[0];
            return { status: 'approved', id: p.id, method: p.payment_method_id };
        }
        return { status: 'pending' };
    } catch (error) {
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 5. WEBHOOK (no usado para conciliar — ver verificarPagoMP)
// ==================================================================
// La conciliación real se hace por polling activo (verificarPagoMP), igual que en
// noar-pos-resilense: evita depender de configurar webhooks en el panel de cada
// cuenta de MercadoPago y de resolver a qué empresa pertenece cada aviso a ciegas.
// Este endpoint queda como stub por si algún día se registra una notification_url.
exports.webhookMercadoPago = onRequest({ region: "southamerica-west1" }, async (req, res) => {
    res.status(200).send("OK");
});
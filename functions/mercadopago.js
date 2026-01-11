/**
 * functions/mercadopago.js - Noar ERP
 * Módulo de Cobros: QR Dinámico + Point Smart
 * Versión: Native Fetch (Sin Axios) + Debug Logs
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Inicialización diferida
const db = admin.firestore();

// ==================================================================
// 🔐 HELPER: Contexto MP (Single-Tenant)
// ==================================================================
async function getMpContext() {
    console.log("🔐 Leyendo credenciales de MP...");
    const doc = await db.doc('config/mercadopago').get();
    
    if (!doc.exists) throw new HttpsError('failed-precondition', 'MercadoPago no configurado en Firestore (config/mercadopago).');
    const data = doc.data();
    
    if (!data.active) throw new HttpsError('failed-precondition', 'Módulo MercadoPago desactivado por el usuario.');
    if (!data.accessToken) throw new HttpsError('failed-precondition', 'Falta Access Token en la configuración.');

    // Ocultamos parte del token en el log por seguridad
    console.log(`🔑 Token obtenido: ${data.accessToken.substring(0, 10)}...`);
    return data; 
}

// functions/mercadopago.js

// ... (Mismo inicio e imports) ...

// ==================================================================
// 1. OBTENER TERMINALES (FIX JSON KEYS)
// ==================================================================
exports.obtenerTerminales = onCall({ cors: true }, async (request) => {
    try {
        const config = await getMpContext();
        
        console.log(`🔍 DEBUG: Consultando API Devices...`);

        const response = await fetch('https://api.mercadopago.com/point/integration-api/devices', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        const rawText = await response.text();
        console.log(`📡 RESPUESTA CRUDA DE MP:`, rawText);

        if (!response.ok) {
            throw new HttpsError('internal', `MP Error ${response.status}: ${rawText}`);
        }

        const data = JSON.parse(rawText);
        const rawDevices = data.devices || [];

        // --- LÓGICA DE SANITIZACIÓN CORREGIDA ---
        const validDevices = rawDevices.map(d => {
            // 🔥 FIX: Agregamos 'd.id' primero, que es lo que viene en tu log
            const rawId = d.id || d.device_id || d.serial_number;
            
            if (!rawId) {
                console.warn("⚠️ Dispositivo ignorado por falta de ID:", JSON.stringify(d));
                return null;
            }

            let finalId = String(rawId);

            // Si el ID YA TIENE el formato correcto (como en tu log: NEWLAND_N950__...), no tocamos nada.
            // Si viene crudo (solo serial), le agregamos el prefijo.
            if (!finalId.includes('__')) {
                const model = (d.model || "").toUpperCase();
                let prefix = "NEWLAND_N950"; 
                if (model.includes("A910")) prefix = "PAX_A910";
                
                const suffix = d.serial_number || finalId;
                finalId = `${prefix}__${suffix}`;
            }

            return {
                id: finalId, 
                name: d.name || `Point ${d.model || 'Smart'}`,
                model: d.model || 'Smart',
                mode: d.operating_mode 
            };
        }).filter(item => item !== null);

        console.log(`✅ Dispositivos procesados: ${validDevices.length}`);
        return { devices: validDevices };

    } catch (error) {
        console.error("🔥 Crash en obtenerTerminales:", error);
        throw new HttpsError('internal', error.message || "Error interno.");
    }
});

// ... (Resto de funciones: configurarPoint, cobrarConPoint, etc. siguen igual) ...
// ==================================================================
// 2. CONFIGURAR POINT (FIX: API STRICT MODE)
// ==================================================================
exports.configurarPoint = onCall({ cors: true }, async (request) => {
    const { deviceId, mode } = request.data; 
    
    try {
        const config = await getMpContext();
        
        let cleanId = deviceId.trim();
        if (!cleanId.includes('__')) cleanId = `NEWLAND_N950__${cleanId}`; 

        // 🔥 CORRECCIÓN AQUÍ: La API es estricta.
        // Si queremos integrar, enviamos 'PDV'. Si queremos soltar, 'STANDALONE'.
        const targetMode = mode === 'PDV' ? "PDV" : "STANDALONE";
        
        console.log(`⚙️ Configurando ${cleanId} a ${targetMode}`);

        const response = await fetch('https://api.mercadopago.com/terminals/v1/setup', {
            method: 'PATCH',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                terminals: [{ id: cleanId, operating_mode: targetMode }]
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error("Error Config:", data);
            // Mostramos el mensaje detallado de MP para saber qué pasó
            const detalle = data.errors?.[0]?.message || JSON.stringify(data);
            throw new HttpsError('internal', `MP Rechazó Configuración: ${detalle}`);
        }

        return { status: "OK", mode: targetMode, mp_response: data };

    } catch (error) {
        console.error("Error Config Point:", error);
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 3. COBRAR CON POINT (FIX: ENVIAR CENTAVOS)
// ==================================================================
exports.cobrarConPoint = onCall({ cors: true }, async (request) => {
    const { deviceId, amount, externalReference } = request.data;
    
    try {
        const config = await getMpContext();
        
        console.log(`📟 Point -> Solicitud original: $${amount}`);

        // 🔥 CORRECCIÓN AQUÍ: Multiplicamos por 100 y redondeamos para enviar centavos enteros
        // Ejemplo: Si amount es 60800 -> enviamos 6080000
        const amountInCents = Math.round(Number(amount) * 100);

        console.log(`💰 Enviando al dispositivo: ${amountInCents} (centavos)`);

        const payload = {
            amount: amountInCents,  // <--- Usamos la variable convertida
            additional_info: {
                external_reference: externalReference,
                print_on_terminal: true
            }
        };

        const response = await fetch(`https://api.mercadopago.com/point/integration-api/devices/${deviceId}/payment-intents`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${config.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            // Manejo de error específico: Si hay otra orden abierta
            if (response.status === 409) {
                throw new HttpsError('aborted', "El Point ya tiene una orden en proceso. Cancélala en el dispositivo.");
            }
            throw new HttpsError('internal', `Error MP: ${data.message}`);
        }

        return { success: true, intentId: data.id };

    } catch (error) {
        console.error("Error Cobro Point:", error);
        if (error.code) throw error;
        throw new HttpsError('internal', error.message);
    }
});

// ==================================================================
// 4. GENERAR QR DINÁMICO
// ==================================================================
exports.generarCobroQR = onCall({ cors: true }, async (request) => {
    const { amount, externalReference, items } = request.data;
    
    try {
        const config = await getMpContext();
        const { MercadoPagoConfig, Preference } = require('mercadopago'); // Requiere npm install mercadopago
        const client = new MercadoPagoConfig({ accessToken: config.accessToken });
        
        const preference = new Preference(client);

        const result = await preference.create({
            body: {
                items: items, 
                external_reference: externalReference,
                notification_url: "https://us-central1-distribuidora-1de93.cloudfunctions.net/webhookMercadoPago" 
            }
        });

        return { qr_string: result.init_point, id: result.id };

    } catch (error) {
        console.error("Error QR:", error);
        throw new HttpsError('internal', "Error generando QR.");
    }
});

// ==================================================================
// 5. WEBHOOK
// ==================================================================
exports.webhookMercadoPago = onRequest(async (req, res) => {
    console.log("🔔 Webhook recibido", req.body);
    res.status(200).send("OK");
});
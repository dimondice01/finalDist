// functions/scripts/migrate-cobranzas.js
//
// Migra cobros históricos que quedaron mal guardados dentro de
// companies/{companyId}/ventas (tipo: 'cobranza' o 'cobro') hacia su propia
// colección companies/{companyId}/cobranzas, y los borra de ventas.
//
// Por qué existe: antes de este fix, la app móvil escribía los cobros de saldo
// como documentos "venta" con totalVenta en 0 (o, en el caso de register-payment.tsx,
// con totalVenta = monto cobrado, duplicando ganancia). Este script limpia ese
// historial para que quede consistente con el modelo correcto que ya usa la web
// (ClienteDetalle.jsx / ReporteVendedor.jsx / Caja.jsx).
//
// SEGURIDAD: corre en modo DRY-RUN (solo lectura, no escribe nada) salvo que se
// pase --apply explícitamente. Antes de borrar nada en modo --apply, escribe un
// backup JSON de los documentos originales a disco.
//
// Uso:
//   node scripts/migrate-cobranzas.js --company=<companyId>            (dry-run, solo reporta)
//   node scripts/migrate-cobranzas.js --company=<companyId> --apply    (migra de verdad)
//
// Requiere credenciales de administrador de Firebase disponibles en el entorno
// (GOOGLE_APPLICATION_CREDENTIALS apuntando a un service account JSON, o estar
// autenticado con `gcloud auth application-default login`).

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

function parseArgs() {
    const args = process.argv.slice(2);
    const companyArg = args.find((a) => a.startsWith('--company='));
    return {
        companyId: companyArg ? companyArg.split('=')[1] : null,
        apply: args.includes('--apply'),
    };
}

// Deriva el método de pago dominante de un doc legacy de cobranza dentro de ventas.
function inferirMetodoPago(data) {
    if ((data.pagoQR || 0) > 0) return 'QR';
    if ((data.pagoPoint || 0) > 0) return 'Point';
    if ((data.pagoTransferencia || 0) > 0) return 'Transferencia';
    return 'Efectivo'; // default histórico: la mayoría de los cobros viejos son efectivo
}

async function migrarCompany(companyId, apply) {
    const ventasRef = db.collection(`companies/${companyId}/ventas`);

    // Firestore 'in' soporta hasta 10 valores; 'cobranza' y 'cobro' entran sin problema.
    const snap = await ventasRef.where('tipo', 'in', ['cobranza', 'cobro']).get();

    if (snap.empty) {
        console.log(`[${companyId}] No hay cobros legacy dentro de ventas. Nada que migrar.`);
        return { encontrados: 0, migrados: 0, montoTotal: 0 };
    }

    console.log(`[${companyId}] Encontrados ${snap.size} documentos de cobro dentro de ventas.`);

    // Backup de seguridad ANTES de tocar nada, incluso en dry-run.
    const backupDir = path.join(__dirname, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `cobranzas-legacy-${companyId}-${Date.now()}.json`);
    const backupData = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`[${companyId}] Backup escrito en ${backupPath}`);

    let montoTotal = 0;
    let migrados = 0;

    // Batches de a 400 (Firestore permite 500 escrituras por batch; dejamos margen
    // porque cada doc migrado implica 1 create + 1 delete = 2 escrituras).
    const chunkSize = 200;
    for (let i = 0; i < snap.docs.length; i += chunkSize) {
        const chunk = snap.docs.slice(i, i + chunkSize);
        const batch = db.batch();

        for (const doc of chunk) {
            const data = doc.data();
            const monto = data.montoCobrado || data.pagoEfectivo || data.totalVenta || 0;
            montoTotal += monto;

            const cobranzaRef = db.collection(`companies/${companyId}/cobranzas`).doc();
            const cobranzaData = {
                ventaOriginalId: data.ventaOriginalId || '',
                clienteId: data.clienteId || '',
                clienteNombre: data.clienteNombre || data.clientName || 'Cliente',
                vendedorId: data.vendedorId || '',
                vendedorNombre: data.vendedorNombre || data.vendedorName || 'Vendedor',
                monto,
                metodoPago: inferirMetodoPago(data),
                estado: data.estado || 'Pagada',
                rendido: data.rendido ?? false,
                fecha: data.fecha || data.createdAt || admin.firestore.Timestamp.now(),
                location: data.location || null,
                migradoDesde: doc.id, // trazabilidad de la migración
                migradoEn: admin.firestore.Timestamp.now(),
            };

            console.log(
                `  ${apply ? '[APLICANDO]' : '[DRY-RUN]'} ventas/${doc.id} -> cobranzas/${cobranzaRef.id} ` +
                `($${monto} - ${cobranzaData.metodoPago} - cliente ${cobranzaData.clienteNombre})`
            );

            if (apply) {
                batch.set(cobranzaRef, cobranzaData);
                batch.delete(doc.ref);
            }
            migrados += 1;
        }

        if (apply) {
            await batch.commit();
        }
    }

    return { encontrados: snap.size, migrados: apply ? migrados : 0, montoTotal };
}

async function main() {
    const { companyId, apply } = parseArgs();

    if (!companyId) {
        console.error('Uso: node scripts/migrate-cobranzas.js --company=<companyId> [--apply]');
        process.exit(1);
    }

    console.log(`Modo: ${apply ? 'APLICAR CAMBIOS (escritura real)' : 'DRY-RUN (solo lectura, no escribe nada)'}`);
    console.log(`Compañía: ${companyId}`);
    console.log('---');

    const resultado = await migrarCompany(companyId, apply);

    console.log('---');
    console.log(`Documentos encontrados: ${resultado.encontrados}`);
    console.log(`Monto total involucrado: $${resultado.montoTotal.toFixed(2)}`);
    if (!apply) {
        console.log('\nEsto fue un DRY-RUN. No se escribió ni borró nada.');
        console.log('Revisá el backup generado y, si el resultado se ve bien, volvé a correr con --apply.');
    } else {
        console.log(`Documentos migrados: ${resultado.migrados}`);
    }
}

main().catch((err) => {
    console.error('Error durante la migración:', err);
    process.exit(1);
});

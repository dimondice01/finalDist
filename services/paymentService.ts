// services/paymentService.ts
// Punto único de escritura para cobros de saldo pendiente (cuenta corriente).
// IMPORTANTE: un cobro NUNCA debe escribirse dentro de companies/{companyId}/ventas.
// Vive en su propia colección companies/{companyId}/cobranzas, igual que ya lo
// espera la app web (ClienteDetalle.jsx, ReporteVendedor.jsx, Caja.jsx). Esto evita
// que el monto cobrado se sume de nuevo como "ganancia" en los reportes.

import {
    FirebaseFirestoreTypes,
    Timestamp,
    collection,
    doc,
    runTransaction,
} from '@react-native-firebase/firestore';

export type MetodoPago = 'Efectivo' | 'Transferencia' | 'QR' | 'Point';

export interface RegistrarCobroParams {
    db: FirebaseFirestoreTypes.Module;
    companyId: string;
    ventaId: string;
    clienteId?: string;
    clienteNombre?: string;
    vendedorId?: string;
    vendedorNombre?: string;
    // Ruta desde la que se cobró (si un repartidor cobró una deuda vieja durante su
    // recorrido). Permite que la Rendición de esa ruta muestre este cobro aparte de lo
    // recaudado por las entregas del día. Opcional: los cobros de vendedor no la llevan.
    rutaId?: string;
    // Monto por método de pago usado en esta operación. Se crea un doc de
    // cobranza por cada método con monto > 0, para poder discriminarlos en Caja.
    montos: Partial<Record<MetodoPago, number>>;
    location?: unknown;
}

export async function registrarCobro({
    db,
    companyId,
    ventaId,
    clienteId,
    clienteNombre,
    vendedorId,
    vendedorNombre,
    rutaId,
    montos,
    location,
}: RegistrarCobroParams): Promise<{ nuevoSaldo: number; nuevoEstado: 'Pagada' | 'Adeuda' }> {
    const totalCobrado = Object.values(montos).reduce((sum, m) => sum + (m || 0), 0);
    if (totalCobrado <= 0) {
        throw new Error('El monto a cobrar debe ser mayor a cero.');
    }

    let resultado: { nuevoSaldo: number; nuevoEstado: 'Pagada' | 'Adeuda' } = { nuevoSaldo: 0, nuevoEstado: 'Pagada' };

    await runTransaction(db, async (transaction) => {
        const ventaRef = doc(db, `companies/${companyId}/ventas`, ventaId);
        const ventaDoc = await transaction.get(ventaRef);
        if (!ventaDoc.exists) throw new Error('La venta original no fue encontrada.');

        const ventaData = ventaDoc.data();
        if (!ventaData) throw new Error('No se pudieron leer los datos de la venta.');

        const saldoActual = ventaData.saldoPendiente || 0;
        if (totalCobrado > saldoActual + 10) {
            throw new Error(`El pago ($${totalCobrado.toFixed(2)}) supera el saldo pendiente ($${saldoActual.toFixed(2)}).`);
        }

        const nuevoSaldo = Math.max(0, saldoActual - totalCobrado);
        const nuevoEstado: 'Pagada' | 'Adeuda' = nuevoSaldo <= 1 ? 'Pagada' : 'Adeuda';

        const ventaUpdates: Record<string, unknown> = {
            saldoPendiente: nuevoSaldo,
            estado: nuevoEstado,
        };
        if (nuevoEstado === 'Pagada') {
            ventaUpdates.fechaPagoCompleto = Timestamp.now();
            // Al saldar la deuda por completo, se libera la comisión total de la venta.
            const comisionFinal = (ventaData.totalVenta || 0) * ((ventaData.porcentajeComision || 0) / 100);
            if (comisionFinal > 0) ventaUpdates.totalComision = comisionFinal;
        }
        transaction.update(ventaRef, ventaUpdates);

        const resolvedClienteId = clienteId || ventaData.clienteId || '';
        const resolvedClienteNombre = clienteNombre || ventaData.clienteNombre || ventaData.clientName || 'Cliente';
        const resolvedVendedorId = vendedorId || ventaData.vendedorId || '';
        const resolvedVendedorNombre = vendedorNombre || ventaData.vendedorNombre || ventaData.vendedorName || 'Vendedor';

        for (const [metodoPago, monto] of Object.entries(montos)) {
            if (!monto || monto <= 0) continue;

            const cobranzaRef = doc(collection(db, `companies/${companyId}/cobranzas`));
            transaction.set(cobranzaRef, {
                ventaOriginalId: ventaId,
                clienteId: resolvedClienteId,
                clienteNombre: resolvedClienteNombre,
                vendedorId: resolvedVendedorId,
                vendedorNombre: resolvedVendedorNombre,
                rutaId: rutaId || null,
                monto,
                metodoPago,
                estado: 'Pagada',
                rendido: false,
                fecha: Timestamp.now(),
                location: location || null,
            });
        }

        resultado = { nuevoSaldo, nuevoEstado };
    });

    return resultado;
}

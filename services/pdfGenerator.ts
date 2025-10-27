import * as Print from 'expo-print';
// --- Importamos las interfaces estrictas ---
import { Sale as BaseSale, CartItem, Client } from '../context/DataContext';

// --- Funciones auxiliares de formato ---
const formatCurrency = (value: number = 0): string => {
    // Usamos es-AR para formato argentino
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateInput: { seconds: number; toDate?: () => Date } | Date = new Date()): string => {
    let date: Date;

    // --- !!!!! CORRECCIÓN DE TIPO ts(2339) !!!!! ---
    // Reorganizamos la lógica para chequear el tipo más simple primero.

    // 1. Si YA es un objeto Date (el más simple)
    if (dateInput instanceof Date) {
        date = dateInput;
    }
    // 2. Si tiene la función .toDate() (Timestamp de Firestore o el objeto simulado de create-sale)
    //    Usamos 'as any' para evitar que TypeScript se queje antes de tiempo.
    else if (dateInput && typeof (dateInput as any).toDate === 'function') {
        date = (dateInput as any).toDate();
    }
    // 3. Si solo tiene 'seconds' (Timestamp parseado de JSON/storage)
    else if (dateInput && typeof (dateInput as { seconds: number }).seconds === 'number') {
        date = new Date((dateInput as { seconds: number }).seconds * 1000);
    }
    // 4. Fallback
    else {
        console.warn("Formato de fecha inesperado recibido, usando fecha actual.");
        date = new Date(); 
    }
    // --- !!!!! FIN DE LA CORRECCIÓN !!!!! ---

    try {
        if (isNaN(date.getTime())) {
            console.warn("Fecha inválida recibida en formatDate, usando fecha actual.");
            date = new Date();
        }
        // Usamos es-AR para formato argentino
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
        console.error("Error formateando fecha:", error);
        return new Date().toLocaleDateString('es-AR');
    }
};


// --- FUNCIÓN PRINCIPAL (YA CORREGIDA) ---
export const generatePdf = async (
    sale: BaseSale,
    client: Client, // <-- Argumento 2: Cliente completo
    vendorName: string, // <-- Argumento 3: Nombre del vendedor
): Promise<string | null> => {

    // 1. Validar datos
    if (!sale || !client) {
        console.error("generatePdf fue llamado sin 'sale' o 'client'.");
        return null;
    }

    // 2. Mapear datos (Usando los campos correctos de la BD)
    const invoiceData = {
        saleId: sale.id?.substring(0, 8) || 'N/A',
        
        // Usa la función 'formatDate' recién corregida y el campo 'fecha'
        saleDate: formatDate(sale.fecha),
        
        clientName: client?.nombreCompleto || client?.nombre || 'Consumidor Final',
        clientAddress: client?.direccion || '-',
        clientZone: client?.barrio || client?.localidad || '-',

        vendorName: vendorName || 'Vendedor',
        items: sale.items || [],
        
        // Usa el campo 'totalVenta'
        totalVenta: sale.totalVenta || 0,
        observaciones: sale.observaciones || '',

        // Calcula brutos
        totalVentaBruto: (sale.items || []).reduce((acc, item) => acc + (item.precioOriginal || item.precio) * item.quantity, 0),
        
        // CORRECCIÓN DEL BUG (ya estaba): Lee 'totalDescuentoPromociones'
        totalDescuentoPromos: Number(sale.totalDescuentoPromociones || 0),
    };

    // 3. Generar HTML
    const html = generateHtml(invoiceData);

    try {
        // 4. SOLUCIÓN CRASH (Base64)
        const file = await Print.printToFileAsync({
            html: html,
            base64: true 
        });

        // 5. SOLUCIÓN CRASH (Data URI)
        if (file.base64) {
            return `data:application/pdf;base64,${file.base64}`;
        }

        console.error("No se pudo generar el base64 del PDF.");
        return null;

    } catch (error) {
        console.error("Error al generar PDF (printToFileAsync):", error);
        return null;
    }
};


// --- Plantilla HTML para el PDF (Sin cambios) ---
const generateHtml = (invoiceData: {
    saleId: string;
    saleDate: string;
    clientName: string;
    clientAddress: string;
    clientZone: string;
    vendorName: string;
    items: CartItem[];
    totalVenta: number;
    observaciones: string;
    totalVentaBruto: number;
    totalDescuentoPromos: number; 
}) => {
    // Generar filas de la tabla de productos
    const itemsRows = invoiceData.items.map(item => `
        <tr>
            <td>${item.quantity}</td>
            <td>${item.nombre}</td>
            <td class="text-right">${formatCurrency(item.precio)}</td>
            <td class="text-right">${formatCurrency(item.quantity * item.precio)}</td>
        </tr>
    `).join('');

    // Plantilla HTML completa
    return `
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    margin: 0;
                    padding: 20px;
                    color: #333;
                    font-size: 10px; 
                }
                .container {
                    width: 100%;
                    max-width: 800px; 
                    margin: 0 auto;
                }
                .header {
                    text-align: center;
                    margin-bottom: 20px;
                }
                .header h1 {
                    margin: 0;
                    font-size: 18px; 
                    color: #000;
                }
                .header p {
                    margin: 2px 0;
                    font-size: 10px;
                }
                .details {
                    margin-bottom: 20px;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                }
                .details-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr; 
                    gap: 10px;
                }
                .details-block {
                    font-size: 10px;
                }
                .details-block strong {
                    display: block;
                    margin-bottom: 3px;
                    color: #000;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 10px;
                }
                th, td {
                    border-bottom: 1px solid #eee;
                    padding: 6px; 
                    text-align: left;
                }
                th {
                    background-color: #f9f9f9;
                    font-weight: bold;
                    color: #000;
                }
                .text-right {
                    text-align: right;
                }
                tfoot td {
                    border-bottom: none;
                }
                .total-label {
                    font-weight: bold;
                    text-align: right;
                    padding-right: 10px;
                    color: #000;
                }
                .total-value {
                    font-weight: bold;
                    font-size: 12px; 
                    text-align: right;
                    color: #000;
                }
                .discount-text {
                    color: #E53E3E; 
                    font-weight: bold;
                }
                .notes {
                    font-size: 9px;
                    color: #555;
                    margin-top: 15px;
                    padding-top: 10px;
                    border-top: 1px solid #eee;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 9px;
                    color: #888;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Distribuidora</h1>
                    <p>Comprobante de Venta (No Válido como Factura)</p>
                </div>

                <div class="details">
                    <div class="details-grid">
                        <div class="details-block">
                            <strong>Venta ID:</strong> ${invoiceData.saleId}<br>
                            <strong>Fecha:</strong> ${invoiceData.saleDate}<br>
                            <strong>Vendedor:</strong> ${invoiceData.vendorName}
                        </div>
                        <div class="details-block">
                            <strong>Cliente:</strong> ${invoiceData.clientName}<br>
                            <strong>Dirección:</strong> ${invoiceData.clientAddress}<br>
                            <strong>Zona:</strong> ${invoiceData.clientZone}
                        </div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Cant.</th>
                            <th>Producto</th>
                            <th class="text-right">P. Unit.</th>
                            <th class="text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                    <tfoot>
                        ${invoiceData.totalDescuentoPromos > 0 ? `
                        <tr>
                            <td colspan="3" class="total-label">Subtotal:</td>
                            <td class="text-right">${formatCurrency(invoiceData.totalVentaBruto)}</td>
                        </tr>
                        <tr>
                            <td colspan="3" class="total-label discount-text">Descuentos Aplicados:</td>
                            <td class="text-right discount-text">-${formatCurrency(invoiceData.totalDescuentoPromos)}</td>
                        </tr>
                        ` : ''}
                         <tr>
                            <td colspan="3" class="total-label">${invoiceData.totalDescuentoPromos > 0 ? 'Total Final:' : 'Total:'}</td>
                            <td class="total-value">${formatCurrency(invoiceData.totalVenta)}</td>
                        </tr>
                    </tfoot>
                </table>

                 ${invoiceData.observaciones ? `
                <div class="notes">
                    <strong>Observaciones:</strong> ${invoiceData.observaciones}
                </div>
                ` : ''}

                <div class="footer">
                    Documento no válido como factura.
                </div>
            </div>
        </body>
    </html>
    `;
};
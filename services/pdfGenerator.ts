// services/pdfGenerator.ts
// --- Importamos las interfaces estrictas ---
import { Sale as BaseSale, CartItem, Client } from '../context/DataContext';

// --- Funciones auxiliares de formato (LAS QUE FALTABAN) ---
const formatCurrency = (value: number = 0): string => {
    // Usamos es-AR para formato argentino
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateInput: { seconds: number; toDate?: () => Date } | Date = new Date()): string => {
    let date: Date;

    // Lógica robusta de conversión de fechas
    if (dateInput instanceof Date) {
        date = dateInput;
    }
    else if (dateInput && typeof (dateInput as any).toDate === 'function') {
        date = (dateInput as any).toDate();
    }
    else if (dateInput && typeof (dateInput as { seconds: number }).seconds === 'number') {
        date = new Date((dateInput as { seconds: number }).seconds * 1000);
    }
    else {
        console.warn("Formato de fecha inesperado recibido, usando fecha actual.");
        date = new Date(); 
    }

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
// --- FIN FUNCIONES AUXILIARES ---


// --- FUNCIÓN PRINCIPAL (MODIFICADA: YA NO USA 'itemDiscounts') ---
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

    // 2. Mapear datos
    const invoiceData = {
        saleId: sale.id?.substring(0, 8) || 'N/A',
        saleDate: formatDate(sale.fecha),
        clientName: client?.nombreCompleto || client?.nombre || 'Consumidor Final',
        clientAddress: client?.direccion || '-',
        clientZone: client?.barrio || client?.localidad || '-',

        vendorName: vendorName || 'Vendedor',
        
        // Pasamos los items (que ya incluyen 'descuentoPorCantidadAplicado')
        items: sale.items || [], 
        
        // Usa el campo 'totalVenta'
        totalVenta: sale.totalVenta || 0,
        observaciones: sale.observaciones || '',

        // Calcula brutos (Suma de precios originales * cantidad)
        totalVentaBruto: (sale.items || []).reduce((acc, item) => acc + (item.precioOriginal || item.precio) * item.quantity, 0),
        
        // Lee el total de descuentos
        totalDescuentoPromos: Number(sale.totalDescuentoPromociones || 0),
    };

    // 3. Generar HTML
    const html = generateHtml(invoiceData);

    return html; 
};


// --- Plantilla HTML para el PDF (COLUMNA DE DESCUENTO CORREGIDA) ---
const generateHtml = (invoiceData: {
    saleId: string;
    saleDate: string;
    clientName: string;
    clientAddress: string;
    clientZone: string;
    vendorName: string;
    // 🔥 CORREGIDO: El tipo de 'items' ahora espera el descuento adentro
    items: (CartItem & { descuentoPorCantidadAplicado?: number })[];
    totalVenta: number;
    observaciones: string;
    totalVentaBruto: number;
    totalDescuentoPromos: number; 
}) => {
    
    // Generar filas de la tabla de productos
   const itemsRows = invoiceData.items.map(item => { // 'item' ya es del tipo extendido
        
        // 1. Descuento por cambio de precio (precio_especial: precio original - precio final)
        const discountPriceChangePerUnit = (item.precioOriginal && item.precioOriginal > item.precio)
            ? (item.precioOriginal - item.precio)
            : 0;
            
        // Descuento total de la línea por precio especial
        const unitPriceDiscountTotal = Math.round(discountPriceChangePerUnit * item.quantity * 100) / 100;
        
        // 2. Descuento por Cantidad/Bulk (LLEVA_X_PAGA_Y, etc.)
        // 🔥 ¡¡CORRECCIÓN!! Leemos el descuento que viene DENTRO del ítem
        const bulkDiscountTotal = item.descuentoPorCantidadAplicado ?? 0; 
        
        // 3. 🔥 TOTAL DE DESCUENTO PARA ESTA LÍNEA (SUMA DE AMBOS)
        const totalLineDiscount = Math.round((unitPriceDiscountTotal + bulkDiscountTotal) * 100) / 100;
        
        // 4. Precio unitario a mostrar (el precio unitario original para justificar el descuento)
        const unitPriceDisplay = item.precioOriginal || item.precio; 

        // 5. Subtotal Final de la Línea: (Precio con Dto. Precio_Especial * Cantidad) - Dto. Bulk
        const finalItemPrice = Math.round(((item.precio * item.quantity) - bulkDiscountTotal) * 100) / 100;

        // 🔥 HTML CORREGIDO CON 5 COLUMNAS
        return `
            <tr>
                <td class="product-name">${item.nombre}</td>
                <td class="text-center">${item.quantity}</td>
                <td class="text-right">${formatCurrency(unitPriceDisplay)}</td>
                <td class="text-right ${totalLineDiscount > 0.01 ? 'discount-line' : ''}">
                    ${totalLineDiscount > 0.01 ? `-${formatCurrency(totalLineDiscount)}` : '-'}
                </td>
                <td class="text-right">${formatCurrency(finalItemPrice)}</td>
            </tr>
        `;
    }).join('');

    // --- Definiciones de colores para usar en el CSS ---
    const primaryColor = '#240077ff'; 
    const textPrimaryColor = '#000000ff'; 
    const textSecondaryColor = '#888a8dff'; 
    const dangerColor = '#EF4444'; 

    // Plantilla HTML completa
    return `
    <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    margin: 0;
                    padding: 15px; 
                    color: ${textPrimaryColor};
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
                    padding-bottom: 8px;
                    border-bottom: 1px solid ${primaryColor};
                }
                .header h1 {
                    margin: 0;
                    font-size: 20px; 
                    color: ${primaryColor};
                    text-transform: uppercase;
                }
                .header p {
                    margin: 1px 0;
                    font-size: 10px;
                    color: ${textSecondaryColor};
                }
                
                .details {
                    margin-bottom: 15px; 
                    border: 1px solid #eee;
                    padding: 10px; 
                    border-radius: 6px;
                    display: flex;
                    justify-content: space-between;
                    font-size: 10px;
                }
                .details-block {
                    font-size: 10px;
                    line-height: 1.4;
                    width: 49%; 
                }
                .details-block strong {
                    display: block;
                    margin-bottom: 2px;
                    color: ${textPrimaryColor};
                    font-weight: 700;
                    font-size: 11px;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 15px; 
                    font-size: 10px;
                    table-layout: fixed;
                }
                th, td {
                    border-bottom: 1px solid #ddd;
                    padding: 4px; 
                    text-align: left;
                    vertical-align: top;
                }
                th {
                    background-color: #F8F8F8;
                    font-weight: bold;
                    color: ${textPrimaryColor};
                    text-transform: uppercase;
                    font-size: 10px;
                }
                
                /* --- 🔥 ANCHOS DE COLUMNA CORREGIDOS (CON 5 COLUMNAS) --- */
                th:nth-child(1), td:nth-child(1) { width: 38%; } /* Producto */
                th:nth-child(2), td:nth-child(2) { width: 12%; } /* Cantidad */
                th:nth-child(3), td:nth-child(3) { width: 16%; } /* P. Unit */
                th:nth-child(4), td:nth-child(4) { width: 17%; } /* Descuento */
                th:nth-child(5), td:nth-child(5) { width: 17%; } /* Subtotal */

                .text-right { text-align: right; }
                .text-center { text-align: center; }
                
                .product-name {
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap; 
                    font-size: 10px;
                }
                .discount-line {
                    color: ${dangerColor}; 
                    font-weight: 500;
                }
                
                tfoot { border-top: 1px solid #ccc; }
                tfoot td {
                    border-bottom: none;
                    padding-top: 3px; 
                    padding-bottom: 3px; 
                }
                .total-label {
                    font-weight: 600;
                    text-align: right;
                    padding-right: 10px;
                    color: ${textPrimaryColor};
                    font-size: 11px;
                }
                .total-value {
                    font-weight: bold;
                    font-size: 13px; 
                    text-align: right;
                    color: ${primaryColor}; 
                }
                .discount-text {
                    color: ${dangerColor}; 
                    font-weight: bold;
                }
                
                .notes {
                    font-size: 9px;
                    color: ${textSecondaryColor};
                    margin-top: 10px;
                    padding: 8px;
                    border-left: 3px solid ${primaryColor};
                    background-color: #FFFBEB; 
                }
                .footer {
                    text-align: center;
                    margin-top: 15px;
                    font-size: 8px;
                    color: ${textSecondaryColor};
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
                    <div class="details-block">
                        <strong>Cliente:</strong> ${invoiceData.clientName}<br>
                        <strong>Dirección:</strong> ${invoiceData.clientAddress}<br>
                        <strong>Zona:</strong> ${invoiceData.clientZone}
                    </div>
                    <div class="details-block">
                        <strong>Nro Venta:</strong> ${invoiceData.saleId}<br>
                        <strong>Fecha:</strong> ${invoiceData.saleDate}<br>
                        <strong>Vendedor:</strong> ${invoiceData.vendorName}
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Producto</th>
                            <th class="text-center">Cant.</th>
                            <th class="text-right">P. Unit.</th>
                            <th class="text-right">Desc.</th>
                            <th class="text-right">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsRows}
                    </tbody>
                    <tfoot>
                        ${invoiceData.totalDescuentoPromos > 0 ? `
                        <tr>
                            <td colspan="4" class="total-label">Subtotal Bruto:</td>
                            <td class="text-right">${formatCurrency(invoiceData.totalVentaBruto)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" class="total-label discount-text">Descuento Total Promos:</td>
                            <td class="text-right discount-text">-${formatCurrency(invoiceData.totalDescuentoPromos)}</td>
                        </tr>
                        ` : ''}
                         <tr>
                            <td colspan="4" class="total-label">${invoiceData.totalDescuentoPromos > 0 ? 'Total Final:' : 'Total:'}</td>
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
                    Documento generado por la app móvil Distribuidora.
                </div>
            </div>
        </body>
    </html>
    `;
};
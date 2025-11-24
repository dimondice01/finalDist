// services/pdfGenerator.ts

// --- Importamos las interfaces estrictas ---
import { Sale as BaseSale, CartItem, Client } from '../context/DataContext';

// --- Funciones auxiliares de formato ---
const formatCurrency = (value: number = 0): string => {
    return `$${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateInput: { seconds: number; toDate?: () => Date } | Date = new Date()): string => {
    let date: Date;

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
        date = new Date(); 
    }

    try {
        if (isNaN(date.getTime())) {
            date = new Date();
        }
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
        return new Date().toLocaleDateString('es-AR');
    }
};

// --- FUNCIÓN PRINCIPAL ---
export const generatePdf = async (
    sale: BaseSale,
    client: Client,
    vendorName: string,
): Promise<string | null> => {

    if (!sale || !client) {
        console.error("generatePdf fue llamado sin 'sale' o 'client'.");
        return null;
    }

    // Calculamos el Bruto Total sumando los Subtotales de Línea Brutos
    const calculatedTotalBruto = (sale.items || []).reduce((acc, item) => {
        const precioBase = item.precioOriginal || item.precio;
        return acc + (precioBase * item.quantity);
    }, 0);

    const invoiceData = {
        saleId: sale.id?.substring(0, 8) || 'N/A',
        saleDate: formatDate(sale.fecha),
        clientName: client?.nombreCompleto || client?.nombre || 'Consumidor Final',
        clientAddress: client?.direccion || '-',
        clientZone: client?.barrio || client?.localidad || '-',
        vendorName: vendorName || 'Vendedor',
        items: sale.items || [], 
        totalVenta: sale.totalVenta || 0,
        observaciones: sale.observaciones || '',
        
        // Usamos el cálculo explícito para asegurar consistencia
        totalVentaBruto: calculatedTotalBruto,
        totalDescuentoPromos: Number(sale.totalDescuentoPromociones || 0),
        
        tipoComprobante: 
            sale.tipo === 'reposicion' ? 'NOTA DE REPOSICIÓN' :
            sale.tipo === 'devolucion' ? 'NOTA DE DEVOLUCIÓN' :
            'COMPROBANTE DE VENTA',
    };

    const html = generateHtml(invoiceData);
    return html; 
};

// --- Plantilla HTML ---
const generateHtml = (invoiceData: {
    saleId: string;
    saleDate: string;
    clientName: string;
    clientAddress: string;
    clientZone: string;
    vendorName: string;
    items: (CartItem & { descuentoPorCantidadAplicado?: number })[];
    totalVenta: number;
    observaciones: string;
    totalVentaBruto: number;
    totalDescuentoPromos: number; 
    tipoComprobante: string;
}) => {
    
    // Generar filas de la tabla
    const itemsRows = invoiceData.items.map(item => { 
        // 1. Determinar Precio Base (Original o el actual si no hay original)
        const unitPriceDisplay = item.precioOriginal || item.precio; 

        // 2. Calcular Descuentos VISUALES (para la columna Desc.)
        const discountPriceChangePerUnit = (item.precioOriginal && item.precioOriginal > item.precio)
            ? (item.precioOriginal - item.precio)
            : 0;
        
        const unitPriceDiscountTotal = discountPriceChangePerUnit * item.quantity;
        const bulkDiscountTotal = item.descuentoPorCantidadAplicado ?? 0; 
        
        // Total descontado en esta línea (Unitario + Cantidad)
        const totalLineDiscount = Math.round((unitPriceDiscountTotal + bulkDiscountTotal) * 100) / 100;
        
        // 3. CALCULO CORREGIDO: Subtotal BRUTO de la línea
        // Esto es: Precio de Lista * Cantidad. Sin restar nada.
        // El descuento se resta al final en el footer.
        const lineTotalGross = unitPriceDisplay * item.quantity;

        return `
            <tr>
                <td class="product-name">${item.nombre}</td>
                <td class="text-center">${item.quantity}</td>
                <td class="text-right">${formatCurrency(unitPriceDisplay)}</td>
                <td class="text-right ${totalLineDiscount > 0.01 ? 'discount-line' : ''}">
                    ${totalLineDiscount > 0.01 ? `-${formatCurrency(totalLineDiscount)}` : '-'}
                </td>
                <td class="text-right">
                    ${formatCurrency(lineTotalGross)}
                </td>
            </tr>
        `;
    }).join('');

    // Colores
    const primaryColor = '#240077ff'; 
    const textPrimaryColor = '#000000ff'; 
    const textSecondaryColor = '#888a8dff'; 
    const dangerColor = '#EF4444'; 

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
                .title-container {
                    text-align: center;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid ${primaryColor};
                }
                .main-title {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: ${invoiceData.tipoComprobante.includes('VENTA') ? primaryColor : dangerColor};
                    text-transform: uppercase;
                }
                .top-info-container {
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start; 
                    margin-bottom: 15px; 
                    font-size: 10px; 
                    line-height: 1.4;
                }
                .distributor-info {
                    flex: 1.2; 
                    padding-right: 10px;
                    min-width: 0;
                }
                /* LOGO AQUI */
                .distributor-info img {
                    max-width: 140px; 
                    max-height: 55px;
                    object-fit: contain;
                    margin-bottom: 5px;
                }
                .distributor-details {
                    display: block;
                    font-size: 10px;
                    color: ${textSecondaryColor}; 
                }
                .details-block {
                    font-size: 10px;
                    line-height: 1.4;
                    flex: 1; 
                    min-width: 0; 
                    padding-left: 5px; 
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
                <div class="title-container">
                    <h2 class="main-title">${invoiceData.tipoComprobante}</h2>
                </div>
                <div class="top-info-container">
                    <div class="distributor-info">
                       <img src="data:image/png;base64,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">  <br>   <strong>Distribuidora <br> La Llave</strong>

                        <span class="distributor-details">F, La Rioja</span>
                        <span class="distributor-details">Tel: (3804) 798844</span>
                    </div>

                    <div class="details-block">
                        <strong>Cliente:</strong> ${invoiceData.clientName}<br>
                        <strong>Dirección:</strong> ${invoiceData.clientAddress}<br>
                        <strong>Zona:</strong> ${invoiceData.clientZone}
                    </div>

                    <div class="details-block" style="text-align: right;">
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
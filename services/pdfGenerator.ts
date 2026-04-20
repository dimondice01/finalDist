import { Sale as BaseSale, CartItem, Client, CompanyConfig } from '../context/DataContext';

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
    companyConfig: CompanyConfig | null, // ✅ Nuevo Parámetro SaaS
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

    const finalVendorName = vendorName || sale.vendedorName || sale.vendedorNombre || 'Vendedor';

    const invoiceData = {
        saleId: sale.id?.substring(0, 8) || 'N/A',
        saleDate: formatDate(sale.fecha),
        clientName: client?.nombreCompleto || client?.nombre || 'Consumidor Final',
        clientAddress: client?.direccion || '-',
        clientZone: client?.barrio || client?.localidad || '-',
        
        vendorName: finalVendorName, 
        
        items: sale.items || [], 
        totalVenta: sale.totalVenta || 0,
        observaciones: sale.observaciones || '',
        
        totalVentaBruto: calculatedTotalBruto,
        totalDescuentoPromos: Number(sale.totalDescuentoPromociones || 0),
        
        tipoComprobante: 
            sale.tipo === 'reposicion' ? 'NOTA DE REPOSICIÓN' :
            sale.tipo === 'devolucion' ? 'NOTA DE DEVOLUCIÓN' :
            'COMPROBANTE DE VENTA',
        
        // Identidad de Empresa
        companyName: companyConfig?.nombreFantasia || companyConfig?.name || '',
        companyAddress: companyConfig?.domicilioFiscal || '',
        companyCuit: companyConfig?.cuit || '',
        companyLogo: companyConfig?.logo || '', // Base64
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
    companyName: string;
    companyAddress: string;
    companyCuit: string;
    companyLogo: string;
}) => {
    
    // Generar filas de la tabla
    const itemsRows = invoiceData.items.map(item => { 
        const unitPriceDisplay = item.precioOriginal || item.precio; 

        const discountPriceChangePerUnit = (item.precioOriginal && item.precioOriginal > item.precio)
            ? (item.precioOriginal - item.precio)
            : 0;
        
        const unitPriceDiscountTotal = discountPriceChangePerUnit * item.quantity;
        const bulkDiscountTotal = item.descuentoPorCantidadAplicado ?? 0; 
        
        const totalLineDiscount = Math.round((unitPriceDiscountTotal + bulkDiscountTotal) * 100) / 100;
        
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

    // Colores de Marca
    const primaryColor = '#0F172A'; // Slate 900
    const textPrimaryColor = '#000000'; 
    const textSecondaryColor = '#64748B'; 
    const dangerColor = '#EF4444'; 
    const accentColor = '#FBBF24'; // Amber 400

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
                .container { width: 100%; max-width: 800px; margin: 0 auto; }
                
                .title-container {
                    text-align: center;
                    margin-bottom: 15px;
                    padding-bottom: 8px;
                    border-bottom: 2px solid ${primaryColor};
                }
                .main-title {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 900;
                    color: ${primaryColor};
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .top-info-container {
                    display: flex; 
                    justify-content: space-between; 
                    align-items: flex-start; 
                    margin-bottom: 20px; 
                    font-size: 10px; 
                    line-height: 1.4;
                }
                .distributor-info { flex: 1.2; padding-right: 10px; min-width: 0; }
                
                /* --- LOGO CSS --- */
                .logo-box {
                    display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
                }
                .logo-img {
                    max-width: 120px;
                    max-height: 50px;
                    object-fit: contain;
                }
                .logo-icon {
                    width: 35px; height: 35px;
                    background-color: ${primaryColor};
                    border-radius: 8px;
                    display: flex; align-items: center; justify-content: center;
                    color: ${accentColor};
                    font-weight: 900; font-size: 20px;
                }
                .logo-text {
                    display: flex; flex-direction: column; line-height: 1;
                }
                .logo-title {
                    font-size: 18px; font-weight: 900; color: ${primaryColor}; text-transform: uppercase;
                }

                .distributor-details { display: block; font-size: 10px; color: ${textSecondaryColor}; }
                
                .details-block { font-size: 10px; line-height: 1.5; flex: 1; padding-left: 5px; }
                .details-block strong { display: block; margin-bottom: 2px; color: ${textPrimaryColor}; font-weight: 700; font-size: 11px; }
                
                table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10px; table-layout: fixed; }
                th, td { border-bottom: 1px solid #E2E8F0; padding: 6px 4px; text-align: left; vertical-align: top; }
                th { background-color: #F8FAFC; font-weight: 800; color: ${textSecondaryColor}; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; }
                
                th:nth-child(1), td:nth-child(1) { width: 40%; }
                th:nth-child(2), td:nth-child(2) { width: 10%; }
                th:nth-child(3), td:nth-child(3) { width: 15%; }
                th:nth-child(4), td:nth-child(4) { width: 15%; }
                th:nth-child(5), td:nth-child(5) { width: 20%; }

                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .product-name { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
                .discount-line { color: ${dangerColor}; font-weight: 600; }
                
                tfoot { border-top: 2px solid ${primaryColor}; }
                tfoot td { border-bottom: none; padding-top: 8px; padding-bottom: 4px; }
                .total-label { font-weight: 700; text-align: right; padding-right: 10px; color: ${textSecondaryColor}; font-size: 11px; text-transform: uppercase; }
                .total-value { font-weight: 900; font-size: 14px; text-align: right; color: ${primaryColor}; }
                .discount-text { color: ${dangerColor}; font-weight: 700; }
                
                .notes { font-size: 9px; color: #854D0E; margin-top: 15px; padding: 10px; border-radius: 6px; background-color: #FEF3C7; border: 1px solid #FDE68A; }
                .footer { text-align: center; margin-top: 30px; font-size: 8px; color: ${textSecondaryColor}; border-top: 1px solid #E2E8F0; padding-top: 10px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="title-container">
                    <h2 class="main-title">${invoiceData.tipoComprobante}</h2>
                </div>
                <div class="top-info-container">
                    <div class="distributor-info">
                        <div class="logo-box">
                            ${invoiceData.companyLogo ? 
                                `<img src="${invoiceData.companyLogo.startsWith('http') ? invoiceData.companyLogo : `data:image/png;base64,${invoiceData.companyLogo}`}" class="logo-img" />` :
                                (invoiceData.companyName ? `<div class="logo-icon">${invoiceData.companyName.charAt(0)}</div>` : '')
                            }
                            <div class="logo-text">
                                <div class="logo-title">${invoiceData.companyName}</div>
                            </div>
                        </div>

                        ${invoiceData.companyAddress ? `<span class="distributor-details">${invoiceData.companyAddress}</span>` : ''}
                        ${invoiceData.companyCuit ? `<span class="distributor-details">CUIT: ${invoiceData.companyCuit}</span>` : ''}
                    </div>

                    <div class="details-block">
                        <strong>Cliente:</strong> ${invoiceData.clientName}<br>
                        <strong>Dirección:</strong> ${invoiceData.clientAddress}<br>
                        <strong>Zona:</strong> ${invoiceData.clientZone}
                    </div>

                    <div class="details-block" style="text-align: right;">
                        <strong>Nro Venta:</strong> #${invoiceData.saleId}<br>
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
                            <td colspan="4" class="total-label">Subtotal Bruto</td>
                            <td class="text-right" style="color: #64748B;">${formatCurrency(invoiceData.totalVentaBruto)}</td>
                        </tr>
                        <tr>
                            <td colspan="4" class="total-label discount-text">Descuento Aplicado</td>
                            <td class="text-right discount-text">-${formatCurrency(invoiceData.totalDescuentoPromos)}</td>
                        </tr>
                        ` : ''}
                         <tr>
                            <td colspan="4" class="total-label">Total a Pagar</td>
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
                    ${invoiceData.companyName ? `Documento generado por ${invoiceData.companyName} - Tecnología Logística.` : ''}
                </div>
            </div>
        </body>
    </html>
    `;
};
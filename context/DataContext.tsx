// context/DataContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetInfo } from '@react-native-community/netinfo';

// --- INICIO DE CAMBIOS: Importaciones NATIVAS (v9 Modular) ---
import firestore, {
    collection,
    deleteDoc,
    doc,
    FirebaseFirestoreTypes,
    getDocs,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    Timestamp,
    updateDoc,
    where
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
// ✅ CORRECCIÓN CLAVE: Importamos 'auth' y el 'dbContainer' para acceder a la instancia
import { auth, dbContainer } from '../db/firebase-service';

// --- Definición de Interfaces Estrictas ---

// ✅ NUEVO: Interfaz para Listas de Precios
export interface PriceList {
    id: string;
    nombre: string;
}

export interface Product {
    id: string;
    nombre: string;
    precio: number;
    costo: number;
    stock?: number;
    categoriaId?: string;
    comisionEspecifica?: number;
    img?: string; 
    // ✅ NUEVO: Mapa de precios adicionales { "Mayorista": 100, "Kiosco": 120 }
    preciosExtra?: { [key: string]: number };
}
export interface CartItem extends Product {
    quantity: number;
    comision: number;
    precioOriginal?: number;
    isGift?: boolean; // Identifica si es un regalo automático
    descuentoPorCantidadAplicado?: number; // Guarda el descuento prorrateado para el PDF
}
export interface Rubro {
    id: string;
    nombre: string;
    metaSemanal: number;
}
export interface Client {
    id: string;
    nombre: string;
    nombreCompleto?: string;
    direccion?: string;
    barrio?: string;
    localidad?: string;
    telefono?: string;
    email?: string;
    zonaId?: string;
    rubroId?: string;

    // ✅ NUEVO: Lista de precios asignada al cliente
    listaPreciosAsignada?: string;

    // ✅ INICIO CAMBIOS AFIP (Punto 1: Clientes)
    arca?: boolean; // Se mantiene por retrocompatibilidad
    requiereFacturaAfip?: boolean; // Nuevo campo unificado para Facturación
    tipoDocumento?: string; // DNI, CUIT, CUIL, PAS, SC
    numeroDocumento?: string;
    condicionIva?: string; // MT, RI, CF, EX
    // ✅ FIN CAMBIOS AFIP
    
    location?: { latitude: number; longitude: number; } | null;
    fechaCreacion?: any;
}
export interface Category {
    id: string;
    nombre: string;
}
export interface Promotion {
    id: string;
    nombre: string;
    estado: 'activa' | 'inactiva';
    tipo: string;
    productoIds: string[];
    clienteIds?: string[];
    nuevoPrecio?: number;
    descripcion?: string; 
    condicion?: any; 
    beneficio?: any; 
}
export interface Zone {
    id: string;
    nombre: string;
}
export interface Vendor {
    id: string;
    nombre: string;
    nombreCompleto?: string;
    rango: 'Vendedor' | 'Reparto' | 'Admin';
    zonasAsignadas?: string[];
    comisionGeneral?: number;
    firebaseAuthUid?: string;
    // ✅ MercadoPago IDs (SaaS Master Plan)
    mpCajaId?: string; 
    mpDeviceId?: string;
}

// --- INTERFAZ SALE ACTUALIZADA PARA COBRANZAS ---
export interface Sale {
    id: string;
    clienteId: string;
    clientName: string;
    clienteNombre?: string;
    vendedorId: string;
    vendedorName: string;
    vendedorNombre?: string;
    items: CartItem[];
    totalVenta: number;
    totalCosto: number;
    totalComision: number;
    observaciones: string;
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada' | 'Web: Pendiente';
    
    // ✅ TIPO ACTUALIZADO: Incluye 'cobranza' y 'rendicion_cobranza'
    tipo: 'venta' | 'reposicion' | "devolucion" | "cobranza" | "rendicion_cobranza";
    
    fecha: { seconds: number } | Date;
    
    // ✅ INICIO CAMBIOS AFIP (Punto 2: Ventas)
    tipoDocumento?: string;
    numeroDocumento?: string;
    facturaAfip?: boolean; 

    afipEstado?: 'pendiente' | 'enviado' | 'aprobado' | 'error' | string;
    afipNumeroComprobante?: number | null;
    afipCAE?: string | null;
    afipFechaVtoCAE?: string | null; 
    afipPuntoVenta?: number | null;
    afipResultado?: string | null;
    // ✅ FIN CAMBIOS AFIP
    
    saldoPendiente?: number;
    paymentMethod?: 'contado' | 'cuenta_corriente';
    numeroFactura?: string;
    totalDescuentoPromociones?: number;
    pagoEfectivo?: number;
    pagoTransferencia?: number;
    pagoQR?: number;    // ✅ SaaS Master Plan
    pagoPoint?: number; // ✅ SaaS Master Plan
    itemDiscounts?: { [itemId: string]: number }; 

    // ✅ NUEVOS CAMPOS PARA COBRANZA (Agregados para soportar la funcionalidad)
    montoCobrado?: number;        // Monto total cobrado en una operación de cobranza
    rendido?: boolean;            // Si el dinero ya fue entregado a caja
    fechaRendicion?: any;         // Cuándo se rindió
    ventaOriginalId?: string;     // ID de la venta que generó la deuda (si aplica)
    ubicacion?: { lat: number; lng: number; accuracy: number } | null;
}

// --- COBRANZA: vive en companies/{companyId}/cobranzas, NUNCA dentro de ventas ---
// Registra un cobro de saldo pendiente. No suma a "Total Ventas"/"Ganancia" en los
// reportes; sólo actualiza saldoPendiente/estado de la venta original.
export interface Cobranza {
    id: string;
    ventaOriginalId: string;
    clienteId: string;
    clienteNombre?: string;
    vendedorId: string;
    vendedorNombre?: string;
    monto: number;
    metodoPago: 'Efectivo' | 'Transferencia' | 'QR' | 'Point' | string;
    estado: 'Pagada' | string;
    rendido?: boolean;
    fecha: { seconds: number } | Date;
    location?: unknown;
}

export interface Route {
    id: string; // ✅ Agregado
    nombre?: string; // ✅ Agregado
    fecha?: any;  // ✅ Agregado
    estado?: 'Creada' | 'En Curso' | 'Completada' | 'Archivada' | string; // ✅ Agregado
    facturas?: any[];
    repartidorId?: string; // ✅ Agregado
}

export interface VisitaUbicacion {
    lat: number;
    lng: number;
    accuracy: number;
}

export interface VisitaData {
    clienteId: string;
    clientName: string;
    vendedorId: string;
    vendedorName: string;
    timestamp: string;
    ubicacion: VisitaUbicacion | null;
    resultado: 'sin_venta' | 'con_venta';
}

// ✅ NUEVO: Interfaz para Identidad de Empresa (White-Label)
export interface CompanyConfig {
    logo?: string;           // Base64 para cabecera PDF
    name?: string;           // Nombre Legal/SaaS
    nombreFantasia?: string; // Nombre Comercial (Prioridad en Remito)
    domicilioFiscal?: string;
    cuit?: string;
}


// --- INTERFAZ IDataContext (ACTUALIZADA) ---
export interface IDataContext {
    products: Product[];
    clients: Client[];
    categories: Category[];
    promotions: Promotion[];
    availableZones: Zone[];
    vendors: Vendor[];
    sales: Sale[];
    cobranzas: Cobranza[];
    routes: Route[];
    rubros: Rubro[];
    priceLists: PriceList[]; 
    identity: Vendor | null;
    companyId: string | null; 
    companyConfig: CompanyConfig | null; // ✅ Nuevo SaaS Field
    userRole: 'Vendedor' | 'Reparto' | 'Admin' | null; 
    syncData: () => Promise<void>;
    refreshAllData: () => Promise<void>;
    isLoading: boolean;
    isInitialDataLoaded: boolean;
    isOffline: boolean;
    zones: Zone[];
    updateClient: (clientId: string, updatedData: Partial<Client>) => Promise<void>;
    crearVentaConStock: (saleData: any) => Promise<string>;
    anularVentaConStock: (saleId: string, items: CartItem[]) => Promise<void>;
    deleteSaleAndRevertStock: (saleId: string, items: CartItem[]) => Promise<void>; 
    descontarStockLocalmente: (items: CartItem[]) => void;
    reintegrarStockLocalmente: (items: CartItem[]) => void;
    setSalesState: React.Dispatch<React.SetStateAction<Sale[]>>;
    registrarVisita: (visitaData: Omit<VisitaData, never>) => Promise<string>;
}


// --- Valor por defecto (ACTUALIZADO) ---
const defaultContextValue: IDataContext = {
    products: [],
    clients: [],
    categories: [],
    promotions: [],
    availableZones: [],
    vendors: [],
    sales: [],
    cobranzas: [],
    routes: [],
    rubros: [],
    priceLists: [], 
    identity: null,
    companyId: null, // Default
    companyConfig: null, // Default
    userRole: null, // Default
    zones: [],
    updateClient: async () => {},
    syncData: async () => { console.warn("Llamada a syncData por defecto"); },
    refreshAllData: async () => { console.warn("Llamada a refreshAllData por defecto"); },
    isLoading: true,
    isInitialDataLoaded: false,
    isOffline: false,
    crearVentaConStock: async (saleData: any) => { console.warn("Llamada a crearVentaConStock por defecto"); return "error"; },
    anularVentaConStock: async (saleId: string, items: CartItem[]) => { console.warn("Llamada a anularVentaConStock por defecto"); },
    deleteSaleAndRevertStock: async (saleId: string, items: CartItem[]) => { console.warn("Llamada a deleteSaleAndRevertStock por defecto"); }, 
    descontarStockLocalmente: (items: CartItem[]) => { console.warn("Llamada a descontarStockLocalmente por defecto"); },
    reintegrarStockLocalmente: (items: CartItem[]) => { console.warn("Llamada a reintegrarStockLocalmente por defecto"); },
    setSalesState: () => { console.warn("Llamada a setSalesState por defecto"); },
    registrarVisita: async () => { console.warn("Llamada a registrarVisita por defecto"); return "error"; },
};

const DataContext = createContext<IDataContext>(defaultContextValue);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // --- ESTADOS (Sin cambios) ---
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [availableZones, setAvailableZones] = useState<Zone[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [cobranzas, setCobranzas] = useState<Cobranza[]>([]);
    const [routes, setRoutes] = useState<Route[]>([]);
    const [rubros, setRubros] = useState<Rubro[]>([]);
    const [priceLists, setPriceLists] = useState<PriceList[]>([]); 
    const [identity, setIdentity] = useState<Vendor | null>(null);
    const [companyId, setCompanyId] = useState<string | null>(null); 
    const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(null); // ✅ Nuevo: Branding/Fiscal
    const [resolvedUserRole, setResolvedUserRole] = useState<'Vendedor' | 'Reparto' | 'Admin' | null>(null); 
    
    // --- BANDERAS DE CARGA (Sin cambios) ---
    const [isLoading, setIsLoading] = useState(true);
    const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);

    // --- ESTADO DE CONEXIÓN (Sin cambios) ---
    const [isOffline, setIsOffline] = useState(false);
    const netInfo = useNetInfo();
    const prevIsConnected = useRef<boolean | null>(null);

    // --- ESTADOS DERIVADOS (Sin cambios) ---
    const currentUser = auth.currentUser; 
    const currentVendor = useMemo(() => {
        if (!currentUser || vendors.length === 0) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [currentUser, vendors]);
    const userRole = currentVendor?.rango;

    // --- parseWithDates (Sin cambios) ---
    const parseWithDates = (jsonString: string | null): any[] => {
        if (!jsonString) return [];
        try {
            // Se asume la corrección de RegEx para evitar el error de compilación
            return JSON.parse(jsonString, (key, value) => {
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
                    return new Date(value);
                }
                return value;
            });
        } catch (e) {
            console.error("Error parseando JSON con fechas:", e);
            return [];
        }
    };

    // --- Carga inicial ---
    useEffect(() => {
        const loadDataFromStorage = async () => {
            // ...
            try {
                console.log("Intentando cargar datos desde el almacenamiento local...");
                // ✅ AGREGADO: 'priceLists' y 'companyConfig' a las claves de AsyncStorage
                const keys = ['products', 'clients', 'categories', 'promotions', 'availableZones', 'vendors', 'sales', 'cobranzas', 'routes', 'rubros', 'priceLists', 'companyConfig'];
                const storedData = await AsyncStorage.multiGet(keys);
                const dataMap = new Map(storedData);

                const setDataState = (key: string, setter: React.Dispatch<React.SetStateAction<any[]>>, parseDates = false) => {
                    const jsonData = dataMap.get(key);
                    if (jsonData) {
                        try {
                            const parsed = parseDates ? parseWithDates(jsonData) : JSON.parse(jsonData);
                            if (key === 'sales') {
                                const salesData = (parsed as Sale[]).map(sale => ({
                                    ...sale,
                                    itemDiscounts: sale.itemDiscounts || {},
                                    items: (sale.items || []).map(item => ({
                                        ...item,
                                        precioOriginal: item.precioOriginal ?? item.precio,
                                    }))
                                }));
                                setter(salesData);
                            } else if (key === 'routes') {
                                const routesData = (parsed as any[]).map(r => {
                                    const routeDate = r.fecha instanceof Date ? r.fecha : (r.fecha?.seconds ? new Date(r.fecha.seconds * 1000) : new Date());
                                    const facturas = Array.isArray(r.facturas) ? r.facturas : [];
                                    return {
                                        id: r.id,
                                        nombre: r.nombre || (r.id ? `Ruta ${r.id.substring(0, 6)}` : 'Ruta'),
                                        fecha: routeDate,
                                        estado: r.estado || 'Creada',
                                        facturas: facturas
                                    };
                                });
                                setter(routesData);
                            } else {
                                setter(parsed);
                            }
                        } catch (e) {
                            console.warn(`Error parseando ${key} de AsyncStorage`, e);
                            setter([]);
                        }
                    } else {
                        setter([]);
                    }
                };

                setDataState('products', setProducts);
                setDataState('clients', setClients);
                setDataState('categories', setCategories);
                setDataState('promotions', setPromotions);
                setDataState('availableZones', setAvailableZones);
                setDataState('vendors', setVendors);
                setDataState('sales', setSales, true);
                setDataState('cobranzas', setCobranzas, true);
                setDataState('routes', setRoutes, true);
                setDataState('rubros', setRubros);
                const dataToParse = dataMap.get('priceLists');
                if (dataToParse) setPriceLists(parseWithDates(dataToParse));
                if (dataMap.get('companyConfig')) setCompanyConfig(JSON.parse(dataMap.get('companyConfig')!)); // Parsing simple

                console.log("Datos locales cargados.");
            } catch (e) {
                console.error("Error al cargar datos locales:", e);
            } finally {
                setIsLoading(false); 
                setIsInitialDataLoaded(true); 
            }
        };

        loadDataFromStorage();
    }, []);

    // --- Efecto de Conexión (Sin cambios) ---
    useEffect(() => {
        const isConnected = netInfo.isConnected;
        if (isConnected === null) { return; }
        const isNowOffline = isConnected === false;
        setIsOffline(isNowOffline);

        if (prevIsConnected.current !== null && prevIsConnected.current !== isConnected) {
            if (isNowOffline) {
                Toast.show({
                    type: 'error',
                    text1: 'Modo Offline',
                    text2: 'No tienes conexión. Tus cambios se guardarán localmente.',
                    position: 'bottom',
                    visibilityTime: 4000
                });
            } else {
                Toast.show({
                    type: 'success',
                    text1: 'Estás Online',
                    text2: 'Conexión recuperada. Sincronizando...',
                    position: 'bottom',
                    visibilityTime: 3000
                });
            }
        }
        prevIsConnected.current = isConnected;
    }, [netInfo.isConnected]);

    // ======================================================
    // ✅ CORRECCIÓN CRÍTICA: Argumento isBackground=false
    // ======================================================
    const fetchDataAndStore = useCallback(async (showToast = true, isBackground = false) => {
        
        const dbInstance = dbContainer.instance;
        if (!dbInstance) {
            console.warn("fetchDataAndStore: DB no está lista, reintentando en 100ms...");
            setTimeout(() => fetchDataAndStore(showToast, isBackground), 100);
            return;
        }

        // ✅ FIX: Si es background, NO activamos el loading global
        if (!isBackground) {
            setIsLoading(true);
        }

        console.log(`Iniciando obtención de datos (Background: ${isBackground})...`);
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("No hay usuario autenticado para obtener datos.");

            // 🟢 PASO 1: RESOLUCIÓN DE IDENTIDAD (SaaS Industrial)
            console.log("Resolviendo identidad en /users...");
            // Usamos formato compatible: db.doc('coleccion/documento')
            const userDocSnap = await dbInstance.doc(`users/${currentUser.uid}`).get();
            
            if (!userDocSnap.exists) {
                throw new Error("Usuario no encontrado en la colección raíz /users. Contacte a soporte.");
            }

            const userData = userDocSnap.data();
            const resolvedCompanyId = userData?.companyId;

            if (!resolvedCompanyId) {
                throw new Error("El usuario no tiene asignada una empresa (companyId) en /users.");
            }

            setCompanyId(resolvedCompanyId);
            console.log(`Empresa identificada: ${resolvedCompanyId}`);

            // 🟢 PASO 2: OBTENER PERFIL DE VENDEDOR DENTRO DE LA COMPAÑÍA
            const vendorsCollection = dbInstance.collection(`companies/${resolvedCompanyId}/vendedores`);
            const vendorsQuerySnap = await vendorsCollection.where('firebaseAuthUid', '==', currentUser.uid).get();
            
            let vendorDoc: FirebaseFirestoreTypes.DocumentSnapshot | null = null;
            let currentVendorData: Vendor | null = null; 

            try {
                if (vendorsQuerySnap.empty) {
                    console.warn("Vendedor no encontrado en subcolección, reintentando por ID directo...");
                    const vendorSnap = await dbInstance.doc(`companies/${resolvedCompanyId}/vendedores/${currentUser.uid}`).get();
                    if (vendorSnap && (vendorSnap as any).exists === true) vendorDoc = vendorSnap; 
                } else {
                    vendorDoc = vendorsQuerySnap.docs[0]; 
                }

                if (vendorDoc && (vendorDoc as any).exists === true) {
                    currentVendorData = { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
                }
            } catch (e) {
                console.warn("Error accediendo a colección de vendedores:", e);
                // Si es un error de permisos, permitimos continuar si tenemos datos de /users
            }
            
            // ✅ IDENTIDAD ROBUSTA: Combinamos el perfil operativo con los datos de identidad raíz
            if (!currentVendorData) {
                console.log("Usando perfil de identidad raíz como fallback...");
                currentVendorData = { 
                    id: currentUser.uid, 
                    nombreCompleto: userData?.nombreCompleto || userData?.nombre || 'Personal de Empresa',
                    rango: userData?.role || userData?.rango || 'Reparto',
                    firebaseAuthUid: currentUser.uid,
                    zonasAsignadas: userData?.zonasAsignadas || [],
                    mpCajaId: userData?.mpCajaId || '',   // 👈 IDs de MercadoPago
                    mpDeviceId: userData?.mpDeviceId || '', // 👈 IDs de MercadoPago
                } as any;
            } else {
                // Si existe el perfil en la compañía, nos aseguramos de que tenga las zonas del root
                // por si el panel web solo las actualiza en /users
                if (userData?.zonasAsignadas && Array.isArray(userData.zonasAsignadas)) {
                    currentVendorData.zonasAsignadas = userData.zonasAsignadas;
                }
            }
            
            setIdentity(currentVendorData);

            // ✅ NORMALIZAR ROL (Case Insensitive)
            const resolvedRole = (currentVendorData!.rango || userData?.role || '').toLowerCase();
            const isReparto = resolvedRole === 'reparto' || resolvedRole === 'chofer' || resolvedRole === 'distribuidor' || resolvedRole === 'repartidor';

            console.log(`Usuario identificado con rol: ${resolvedRole} (ID: ${currentVendorData!.id})`);

            // 🟢 PASO 2.5: OBTENER IDENTIDAD DE MARCA (White-Label)
            console.log("Cargando branding e identidad de empresa...");
            const companyRootSnap = await dbInstance.doc(`companies/${resolvedCompanyId}`).get();
            const configAfipSnap = await dbInstance.collection(`companies/${resolvedCompanyId}/config`)
                                                  .where("tipo", "==", "afip")
                                                  .limit(1)
                                                  .get();
            
            const rootData = (companyRootSnap as any).exists === true ? companyRootSnap.data() : {};
            const configData = !configAfipSnap.empty ? configAfipSnap.docs[0].data() : {};

            const combinedConfig: CompanyConfig = {
                logo: rootData?.logo || '', // Base64
                name: rootData?.name || '',
                nombreFantasia: configData?.nombreFantasia || rootData?.name || '',
                domicilioFiscal: configData?.domicilioFiscal || '',
                cuit: configData?.cuit || ''
            };
            setCompanyConfig(combinedConfig);

            // 🟢 PASO 3: DESCARGAR DATOS OPERATIVOS DE LA COMPAÑÍA
            const productsPromise = dbInstance.collection(`companies/${resolvedCompanyId}/productos`).get();
            const categoriesPromise = dbInstance.collection(`companies/${resolvedCompanyId}/categorias`).get();
            const promosPromise = dbInstance.collection(`companies/${resolvedCompanyId}/promociones`).where('estado', '==', 'activa').get();
            
            // ✅ CONDICIONAL: Solo cargamos todos los vendedores si NO es reparto (o si es admin)
            const allVendorsPromise = !isReparto 
                ? dbInstance.collection(`companies/${resolvedCompanyId}/vendedores`).get().catch(e => { console.warn("Fallo carga de personal:", e); return { docs: [] }; })
                : Promise.resolve({ docs: [] }); 

            const rubrosPromise = dbInstance.collection(`companies/${resolvedCompanyId}/rubros`).get();
            const priceListsPromise = dbInstance.collection(`companies/${resolvedCompanyId}/listas_precios`).get();

            let finalData: IDataContext = { ...defaultContextValue, isLoading: true };

            const processFirebaseDoc = (docSnap: FirebaseFirestoreTypes.DocumentSnapshot): any => {
                const data = docSnap.data();
                if (!data) return { id: docSnap.id }; 
                Object.keys(data).forEach(key => {
                    if (data[key] instanceof Timestamp) { 
                        data[key] = data[key].toDate();
                    }
                });
                return { id: docSnap.id, ...data };
            };

            // --- FUNCIÓN DE PROCESAMIENTO DE VENTAS (ACTUALIZADA) ---
            const processFirebaseSale = (docSnap: FirebaseFirestoreTypes.DocumentSnapshot): Sale => {
                const rawData = processFirebaseDoc(docSnap); 
                const items = (rawData.items || []).map((item: any) => ({
                    ...item,
                    precioOriginal: item.precioOriginal ?? item.precio,
                }));
                return {
                    id: rawData.id,
                    clienteId: rawData.clienteId || rawData.clientId || '', 
                    clientName: rawData.clientName || rawData.clienteNombre || 'Cliente anónimo',
                    clienteNombre: rawData.clienteNombre || rawData.clientName, 
                    vendedorId: rawData.vendedorId || rawData.vendorId || '', 
                    vendedorName: rawData.vendedorName || rawData.vendedorNombre || 'Vendedor anónimo',
                    vendedorNombre: rawData.vendedorNombre || rawData.vendedorName, 
                    items: items,
                    totalVenta: rawData.totalVenta ?? rawData.totalAmount ?? 0, 
                    totalCosto: rawData.totalCosto ?? 0,
                    totalComision: rawData.totalComision ?? 0,
                    observaciones: rawData.observaciones || '',
                    estado: rawData.estado === 'Pendiente de Pago' ? 'Pendiente de Entrega' : (rawData.estado || rawData.status || 'Pendiente de Entrega'), 
                    tipo: rawData.tipo || 'venta',
                    fecha: rawData.fecha || rawData.saleDate || new Date(0), 
                    
                    // ✅ INICIO CAMBIOS AFIP
                    tipoDocumento: rawData.tipoDocumento,
                    numeroDocumento: rawData.numeroDocumento,
                    facturaAfip: rawData.facturaAfip, 
                    afipEstado: rawData.afipEstado,
                    afipNumeroComprobante: rawData.afipNumeroComprobante,
                    afipCAE: rawData.afipCAE,
                    afipFechaVtoCAE: rawData.afipFechaVtoCAE,
                    afipPuntoVenta: rawData.afipPuntoVenta,
                    afipResultado: rawData.afipResultado,
                    // ✅ FIN CAMBIOS AFIP
                    
                    saldoPendiente: rawData.saldoPendiente ?? 0,
                    paymentMethod: rawData.paymentMethod,
                    totalDescuentoPromociones: rawData.totalDescuentoPromociones ?? 0, 
                    pagoEfectivo: rawData.pagoEfectivo ?? 0,
                    pagoTransferencia: rawData.pagoTransferencia ?? 0,
                    pagoQR: rawData.pagoQR ?? 0,
                    pagoPoint: rawData.pagoPoint ?? 0,
                    itemDiscounts: rawData.itemDiscounts || {}, 

                    // ✅ NUEVOS CAMPOS PARA COBRANZA (Mapeo)
                    montoCobrado: rawData.montoCobrado,
                    rendido: rawData.rendido,
                    fechaRendicion: rawData.fechaRendicion,
                    ventaOriginalId: rawData.ventaOriginalId,
                    } as Sale;
            };

            // --- FUNCIÓN DE PROCESAMIENTO DE COBRANZAS ---
            const processFirebaseCobranza = (docSnap: FirebaseFirestoreTypes.DocumentSnapshot): Cobranza => {
                const rawData = processFirebaseDoc(docSnap);
                return {
                    id: rawData.id,
                    ventaOriginalId: rawData.ventaOriginalId || '',
                    clienteId: rawData.clienteId || '',
                    clienteNombre: rawData.clienteNombre,
                    vendedorId: rawData.vendedorId || '',
                    vendedorNombre: rawData.vendedorNombre,
                    monto: rawData.monto ?? 0,
                    metodoPago: rawData.metodoPago || 'Efectivo',
                    estado: rawData.estado || 'Pagada',
                    rendido: rawData.rendido ?? false,
                    fecha: rawData.fecha || new Date(0),
                    location: rawData.location,
                } as Cobranza;
            };

            // ✅ AGREGADO: priceListsPromise
            const [productsSnap, categoriesSnap, promosSnap, vendorsSnap, rubrosSnap, priceListsSnap] = await Promise.all([
                productsPromise, categoriesPromise, promosPromise, allVendorsPromise, rubrosPromise, priceListsPromise
            ]);
            
            finalData.products = productsSnap.docs.map(processFirebaseDoc) as Product[];
            finalData.categories = categoriesSnap.docs.map(processFirebaseDoc) as Category[];
            
            // --- CORREGIDO: (p: any) ---
            finalData.promotions = promosSnap.docs.map((p: any) => ({ // <-- TIPO AÑADIDO
                ...processFirebaseDoc(p), 
                nombre: p.data().nombrePromocion || p.data().nombre, 
                productoIds: p.data().productoIds || (p.data().productoId ? [p.data().productoId] : []),
                clienteIds: p.data().clienteIds || [],
            })) as Promotion[];

            finalData.vendors = vendorsSnap.docs.map(processFirebaseDoc) as Vendor[];
            
            // ✅ ASEGURAR PERFIL PROPIO: Si la lista de vendedores no incluye al usuario actual, lo agregamos.
            // Esto es crítico para usuarios de Reparto que no descargan todos los vendedores.
            if (currentVendorData && !finalData.vendors.some(v => v.id === currentVendorData!.id)) {
                finalData.vendors.push(currentVendorData);
            }

            finalData.rubros = rubrosSnap.docs.map(processFirebaseDoc) as Rubro[];
            
            // ✅ PROCESAR LISTAS
            finalData.priceLists = priceListsSnap.docs.map(processFirebaseDoc) as PriceList[];

            // Queries condicionales
            if (isReparto) {
                // 1. Procesar Rutas
                console.log(`Cargando rutas para UID: ${currentUser.uid} (Empresa: ${resolvedCompanyId})...`);
                const routesSnap = await dbInstance.collection('companies').doc(resolvedCompanyId).collection('rutas')
                    .where('repartidorId', '==', currentUser.uid)
                    .get();
                
                // 1. Procesar Rutas
                finalData.routes = routesSnap.docs.map((r: any) => ({ 
                    ...processFirebaseDoc(r), 
                    fecha: r.data().fechaCreacion || r.data().fecha || new Date(0)
                })) as Route[];

                // 2. Recolectar IDs de Ventas (Facturas) de las rutas
                const saleIds = new Set<string>();
                finalData.routes.forEach(r => {
                    if (r.facturas && Array.isArray(r.facturas)) {
                        r.facturas.forEach((f: any) => {
                            // El campo 'id' en la factura de la ruta es el ID de la Venta
                            if (f.id) saleIds.add(f.id);
                        });
                    }
                });

                // 3. Descargar las Ventas Completas (PUENTE: Aquí sí está el clienteId)
                const salesArray = Array.from(saleIds);
                if (salesArray.length > 0) {
                    const saleChunks = [];
                    // Dividimos en lotes de 10 (límite de Firebase 'in')
                    for (let i = 0; i < salesArray.length; i += 10) {
                        saleChunks.push(salesArray.slice(i, i + 10));
                    }

                    const salePromises = saleChunks.map(chunk => {
                        return dbInstance.collection(`companies/${resolvedCompanyId}/ventas`)
                            .where('__name__', 'in', chunk)
                            .get();
                    });

                    const saleSnaps = await Promise.all(salePromises);
                    
                    // Mapeamos las ventas usando la función procesadora existente
                    // Usamos flatMap y tipado explícito para evitar errores de TS
                    finalData.sales = saleSnaps.flatMap((snap: FirebaseFirestoreTypes.QuerySnapshot) => 
                        snap.docs.map(processFirebaseSale)
                    );
                    console.log(`Descargadas ${finalData.sales.length} ventas asociadas a las rutas.`);
                }

                // 4. Recolectar IDs de Clientes desde las VENTAS descargadas (Fuente de verdad)
                const clientIds = new Set<string>();
                finalData.sales.forEach(s => {
                    if (s.clienteId) clientIds.add(s.clienteId);
                });

                // 5. Descargar Clientes
                const clientsArray = Array.from(clientIds);
                if (clientsArray.length > 0) {
                    const clientChunks = [];
                    for (let i = 0; i < clientsArray.length; i += 10) {
                        clientChunks.push(clientsArray.slice(i, i + 10));
                    }

                    const clientPromises = clientChunks.map(chunk => {
                        return dbInstance.collection(`companies/${resolvedCompanyId}/clientes`)
                            .where('__name__', 'in', chunk)
                            .get();
                    });

                    const clientSnaps = await Promise.all(clientPromises);
                    const fetchedClients = clientSnaps.flatMap((snap: FirebaseFirestoreTypes.QuerySnapshot) => 
                        snap.docs.map(processFirebaseDoc)
                    );
                    
                    finalData.clients = fetchedClients as Client[];
                    console.log(`Datos de ${finalData.clients.length} clientes descargados para Reparto.`);
                } else {
                    finalData.clients = [];
                }
            } else if (resolvedRole === 'admin') {
                // Admin ve la cartera completa de la empresa, sin restricción de zona
                const clientsPromise = dbInstance.collection(`companies/${resolvedCompanyId}/clientes`).get();
                const salesPromise = dbInstance.collection(`companies/${resolvedCompanyId}/ventas`)
                    .where('vendedorId', '==', currentVendorData!.id)
                    .get();

                const [clientsSnap, salesSnap] = await Promise.all([clientsPromise, salesPromise]);

                finalData.clients = clientsSnap.docs.map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale);
            } else { // Vendedor: cartera = clientes cuya zona esté entre las zonas asignadas al vendedor.
                // Así, dos vendedores que comparten una zona comparten también los clientes de esa zona
                // (antes se filtraba por 'vendedorAsignadoId', que sólo dejaba ver al cliente a un único vendedor).
                const zonasVendedor = currentVendorData?.zonasAsignadas || [];

                const clientChunks = [];
                for (let i = 0; i < zonasVendedor.length; i += 10) {
                    clientChunks.push(zonasVendedor.slice(i, i + 10));
                }

                const clientPromises = clientChunks.map(chunk =>
                    dbInstance.collection(`companies/${resolvedCompanyId}/clientes`)
                        .where('zonaId', 'in', chunk)
                        .get()
                );
                const salesPromise = dbInstance.collection(`companies/${resolvedCompanyId}/ventas`)
                    .where('vendedorId', '==', currentVendorData!.id)
                    .get();

                const [clientSnaps, salesSnap] = await Promise.all([Promise.all(clientPromises), salesPromise]);

                const seenClientIds = new Set<string>();
                finalData.clients = clientSnaps
                    .flatMap((snap: FirebaseFirestoreTypes.QuerySnapshot) => snap.docs)
                    .filter((d: any) => {
                        if (seenClientIds.has(d.id)) return false;
                        seenClientIds.add(d.id);
                        return true;
                    })
                    .map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale);
            }

            // 🟢 PASO 3.5: CARGAR COBRANZAS (Universal - viven separadas de ventas)
            try {
                const cobranzasSnap = await dbInstance.collection(`companies/${resolvedCompanyId}/cobranzas`)
                    .where('vendedorId', '==', currentVendorData!.id)
                    .get();
                finalData.cobranzas = cobranzasSnap.docs.map(processFirebaseCobranza);
            } catch (cobranzaError) {
                console.error("Error cargando cobranzas:", cobranzaError);
                finalData.cobranzas = [];
            }

            // 🟢 PASO 4: CARGAR ZONAS ASIGNADAS (Universal para todos los roles)
            // Estrategia Robusta: Descargamos todas las de la empresa y filtramos localmente 
            // para evitar errores de sintaxis en FieldPath o límites de Firebase 'in'.
            try {
                const zonesQuerySnap = await dbInstance.collection(`companies/${resolvedCompanyId}/zonas`).get();
                const allCompanyZones = zonesQuerySnap.docs.map(processFirebaseDoc).filter(Boolean) as Zone[];
                
                const assignedZoneIds = userData?.zonasAsignadas || currentVendorData?.zonasAsignadas || [];
                
                if (assignedZoneIds.length > 0) {
                    finalData.availableZones = allCompanyZones.filter(z => assignedZoneIds.includes(z.id));
                    console.log(`Zonas asignadas cargadas localmente: ${finalData.availableZones.length}`);
                } else {
                    // Si no tiene asignadas, disponibleZones queda vacío pero guardamos 'zones' general
                    finalData.availableZones = [];
                    console.warn("Usuario sin zonas específicas asignadas en /users.");
                }
                
                // Guardamos todas las de la empresa en 'zones' por compatibilidad
                finalData.zones = allCompanyZones;
            } catch (zoneError) {
                console.error("Error cargando zonas:", zoneError);
                finalData.availableZones = [];
                finalData.zones = [];
            }

            // ✅ NORMALIZAR ROL PARA EL CONTEXTO GLOBAL
            const contextRole = isReparto ? 'Reparto' : (resolvedRole === 'admin' ? 'Admin' : 'Vendedor');
            setResolvedUserRole(contextRole);

            // Guardar en AsyncStorage (Sin cambios)
            await Promise.all([
                AsyncStorage.setItem('products', JSON.stringify(finalData.products)),
                AsyncStorage.setItem('categories', JSON.stringify(finalData.categories)),
                AsyncStorage.setItem('promotions', JSON.stringify(finalData.promotions)),
                AsyncStorage.setItem('vendors', JSON.stringify(finalData.vendors)),
                AsyncStorage.setItem('clients', JSON.stringify(finalData.clients)),
                AsyncStorage.setItem('availableZones', JSON.stringify(finalData.availableZones)),
                AsyncStorage.setItem('sales', JSON.stringify(finalData.sales)),
                AsyncStorage.setItem('cobranzas', JSON.stringify(finalData.cobranzas)),
                AsyncStorage.setItem('routes', JSON.stringify(finalData.routes)),
                AsyncStorage.setItem('rubros', JSON.stringify(finalData.rubros)),
                // ✅ NUEVO: Guardar listas
                AsyncStorage.multiSet([
                    ['priceLists', JSON.stringify(finalData.priceLists)],
                    ['companyConfig', JSON.stringify(combinedConfig)]
                ])
            ]);

            // Actualizar estado de React (Sin cambios)
            setProducts(finalData.products);
            setCategories(finalData.categories);
            setPromotions(finalData.promotions);
            setVendors(finalData.vendors);
            setClients(finalData.clients);
            setAvailableZones(finalData.availableZones);
            setSales(finalData.sales);
            setCobranzas(finalData.cobranzas);
            setRoutes(finalData.routes);
            setRubros(finalData.rubros);
            setPriceLists(finalData.priceLists); // ✅ Actualizar estado

            if (showToast) {
                Toast.show({ type: 'success', text1: 'Datos Sincronizados', text2: 'La información ha sido actualizada. 👋', position: 'bottom', visibilityTime: 3000 });
            }
            console.log("Obtención de datos y guardado local completado.");

        } catch (error: any) {
            console.error("Error durante la obtención de datos:", error);
            if (showToast) {
                if (error.message.includes("Datos del vendedor actual no encontrados")) {
                        Toast.show({ type: 'error', text1: 'Error Crítico', text2: 'Datos de usuario incompletos. Cerrando sesión.' });
                        await auth.signOut(); 
                } else {
                        Toast.show({ type: 'error', text1: 'Error de Sincronización', text2: error.message || 'No se pudieron obtener los datos.' });
                }
            }
            throw error;
        } finally {
            // ✅ FIX: Solo apagamos loading si lo encendimos nosotros
            if (!isBackground) {
                setIsLoading(false);
            }
        }
    }, [currentVendor?.id, auth.currentUser?.uid]); 


    // --- Listeners (CORREGIDOS: Usa dbContainer.instance) ---
    useEffect(() => {
        let timeoutId: NodeJS.Timeout | undefined;
        let productListener: () => void = () => {}; 
        let categoryListener: () => void = () => {}; 
        let promotionListener: () => void = () => {}; 
        let rubroListener: () => void = () => {};
        let priceListListener: () => void = () => {}; // ✅ Listener para listas

        const dbInstance = dbContainer.instance;
        if (!dbInstance) { return; }
        
        if (currentVendor && userRole === 'Vendedor' && isInitialDataLoaded && companyId) {
            console.log(`Estableciendo suscripciones a Firestore para empresa ${companyId}...`);
            
            productListener = dbInstance.collection(`companies/${companyId}/productos`).onSnapshot((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedProducts = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Product[];
                setProducts(updatedProducts.filter(p => p.id));
            }, (error: any) => console.error("Error en listener de productos:", error));

            categoryListener = dbInstance.collection(`companies/${companyId}/categorias`).onSnapshot((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedCategories = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Category[];
                setCategories(updatedCategories.filter(c => c.id));
            }, (error: any) => console.error("Error en listener de categorías:", error));

            promotionListener = dbInstance.collection(`companies/${companyId}/promociones`)
                .where('estado', '==', 'activa')
                .onSnapshot((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                    const updatedPromotions = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => {
                        const data = doc.data();
                        return ({ 
                            id: doc.id, 
                            ...data, 
                            nombre: data.nombrePromocion || data.nombre, 
                            productoIds: data.productoIds || (data.productoId ? [data.productoId] : []),
                            clienteIds: data.clienteIds || [],
                        });
                    }) as Promotion[];
                    setPromotions(updatedPromotions.filter(p => p.id));
                }, (error: any) => console.error("Error en listener de promociones:", error));

            rubroListener = dbInstance.collection(`companies/${companyId}/rubros`).onSnapshot((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedRubros = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Rubro[];
                setRubros(updatedRubros.filter(r => r.id));
            }, (error: any) => console.error("Error en listener de rubros:", error));

            // ✅ NUEVO LISTENER: Listas de precios
            priceListListener = dbInstance.collection(`companies/${companyId}/listas_precios`).onSnapshot((snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedLists = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as PriceList[];
                setPriceLists(updatedLists);
            }, (error: any) => console.error("Error en listener de listas:", error));

            timeoutId = setTimeout(() => {
                console.log('Timeout alcanzado. Forzando una verificación de datos.');
            }, 120000); 
        }
        
        return () => {
            console.log('Limpiando suscripciones de DataContext...');
            productListener(); 
            categoryListener();
            promotionListener();
            rubroListener();
            priceListListener(); // ✅ Limpiar listener
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            console.log('Suscripciones de DataContext limpiadas.');
        };
    }, [currentVendor, userRole, isInitialDataLoaded, companyId]); 


    // ======================================================
    // ✅ CORRECCIÓN EN SYNC
    // ======================================================
    const syncData = useCallback(async () => {
        // Llamamos con TRUE para mostrar toast, pero TRUE para background
        await fetchDataAndStore(true, true); 
    }, [fetchDataAndStore]);

    const refreshAllData = useCallback(async () => {
        await fetchDataAndStore(true, false); // Aquí SÍ queremos loading (pull to refresh manual)
    }, [fetchDataAndStore]);

    
    // ======================================================
    // --- FUNCIONES OPTIMISTAS DE STOCK (POSICIÓN CORREGIDA) ---
    // ======================================================

    const descontarStockLocalmente = useCallback((items: CartItem[]) => {
        console.log("Descontando stock del estado local (optimista)...");
        const itemsMap = new Map<string, number>();
        items.forEach(item => {
            itemsMap.set(item.id, item.quantity);
        });
        setProducts(prevProducts => {
            return prevProducts.map(product => {
                const cantidadVendida = itemsMap.get(product.id);
                if (cantidadVendida) {
                    const stockActual = product.stock ?? 0;
                    const nuevoStock = stockActual - cantidadVendida; // <-- RESTA
                    return { ...product, stock: nuevoStock };
                }
                return product;
            });
        });
        console.log("Estado local de productos actualizado (descontado).");
    }, []);

    const reintegrarStockLocalmente = useCallback((items: CartItem[]) => {
        console.log("Reintegrando stock al estado local (optimista)...");
        const itemsMap = new Map<string, number>();
        items.forEach(item => {
            itemsMap.set(item.id, item.quantity);
        });
        setProducts(prevProducts => {
            return prevProducts.map(product => {
                const cantidadReintegrada = itemsMap.get(product.id);
                if (cantidadReintegrada) {
                    const stockActual = product.stock ?? 0;
                    const nuevoStock = stockActual + cantidadReintegrada; // <-- SUMA
                    return { ...product, stock: nuevoStock };
                }
                return product;
            });
        });
        console.log("Estado local de productos actualizado (reintegrado).");
    }, []);


    // ======================================================
    // --- FUNCIÓN 1: crearVentaConStock (CORREGIDO v9) ---
    // ======================================================

    const crearVentaConStock = useCallback(async (saleData: any): Promise<string> => {
        
        const isCurrentlyOffline = netInfo.isConnected === false;
        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO

        if (!dbInstance) { throw new Error("DB no inicializada."); }

        if (isCurrentlyOffline) {
            console.log("DataContext: Modo Offline detectado. Preparando write queue.");
            
            if (!companyId) throw new Error("ID de empresa no disponible para operación offline.");
            const saleRef = dbInstance.collection(`companies/${companyId}/ventas`).doc(); 
            const tempId = saleRef.id;

            const finalSaleData = {
                ...saleData,
                fecha: serverTimestamp(),
                _offline_created: true
            };
            
            // 1. MUTACIÓN OPTIMISTA: Agregamos a la lista local con ID temporal
            setSales(prevSales => [...prevSales, { ...saleData, id: tempId, fecha: new Date() } as Sale]);
            // El descuento de stock LOCAL (optimista) se hace en CreateSaleScreen.tsx
            
            // 2. Queue the write operation (Fire and forget)
            saleRef.set(finalSaleData).catch(error => {
                console.error("Error al poner en cola la venta offline:", error);
                // Rollback si falla la cola (generalmente por error de seguridad)
                setSales(prevSales => prevSales.filter(sale => sale.id !== tempId));
            });

            return tempId; // Devolvemos el ID temporal

        } else {
            // ✅ CORRECCIÓN CLAVE: MODO ONLINE - Eliminamos la Transacción de Stock local.
            // La Cloud Function se encargará de descontar el stock en el backend.
            
            console.log("DataContext: Modo Online detectado. Escritura directa.");
            if (!companyId) throw new Error("ID de empresa no disponible para operación online.");
            const saleRef = dbInstance.collection(`companies/${companyId}/ventas`).doc(); 
            const finalSaleData = { ...saleData, fecha: serverTimestamp() };
            const saleId = saleRef.id;
            
            // 1. MUTACIÓN OPTIMISTA: Agregar a la lista local con ID real
            setSales(prevSales => [...prevSales, { ...saleData, id: saleId, fecha: new Date() } as Sale]);
            // El descuento de stock LOCAL (optimista) se hace en CreateSaleScreen.tsx
            
            // 2. Escritura remota. NO usamos transacción para permitir que la Cloud Function haga el descuento.
            // ✅ IMPORTANTE: Se elimina 'await' para evitar bloqueos en conexiones inestables
            saleRef.set(finalSaleData); 

            return saleId;
        }
    }, [netInfo.isConnected, companyId]); 


    // ======================================================
    // --- FUNCIÓN 2: anularVentaConStock (ANULACIÓN/ESTADO) ---
    // ======================================================

    const anularVentaConStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        console.log("DataContext: Anulando venta (cambiando estado)...");

        // 1. MUTACIÓN OPTIMISTA E INSTANTÁNEA
        const saleToUpdate = sales.find(s => s.id === saleId);
        const originalStatus = saleToUpdate?.estado; 
        const originalSaldo = saleToUpdate?.saldoPendiente;

        // --- Aplicar cambio de estado optimista ---
        setSales(prevSales => prevSales.map(sale => 
            sale.id === saleId 
                ? { ...sale, estado: "Anulada" as Sale['estado'], saldoPendiente: 0 } as Sale
                : sale
        ));
        
        // 🛑 CLAVE: Revertir stock localmente SOLO si la venta no fue anulada antes
        if (originalStatus !== 'Anulada') {
            reintegrarStockLocalmente(items);
        }

        // 2. Definición de la Transacción (para reversión de stock y cambio de estado)
        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO
        if (!dbInstance) { throw new Error("DB no inicializada."); }
        if (!companyId) { throw new Error("ID de empresa no disponible."); }
        const saleRef = dbInstance.doc(`companies/${companyId}/ventas/${saleId}`);
        
        const performTransaction = async () => {
            await dbInstance.runTransaction(async (transaction) => {
                if (!items || items.length === 0) { throw new Error("No hay items para revertir."); }
                
                // Lógica de reversión de stock (solo si el estado original no era Anulada)
                if (originalStatus !== 'Anulada') {
                    for (const item of items) {
                        const productRef = dbInstance.doc(`companies/${companyId}/productos/${item.id}`);
                        const productSnap = await transaction.get(productRef);
                        
                        // @ts-ignore
                        if (productSnap.exists) {
                            const currentStock = productSnap.data()!.stock || 0;
                            const newStock = currentStock + item.quantity;
                            transaction.update(productRef, { stock: newStock });
                        }
                    }
                }

                // Actualizar el estado de la venta
                transaction.update(saleRef, { 
                    estado: "Anulada",
                    saldoPendiente: 0 
                });
            });
        };

        // 3. APLICAR LÓGICA ASÍNCRONA
        try {
            if (isOffline) {
                // MODO OFFLINE: Disparar sin await
                performTransaction()
                    .then(() => console.log("Anulación offline enviada a la cola."))
                    .catch(error => { 
                        const isNetworkError = error.code === 'unavailable' || error.message.includes('UNAVAILABLE');
                        
                        if (!isNetworkError) {
                            console.error("Error en anulación offline en segundo plano:", error);
                            // Revertir mutación optimista si falla en segundo plano
                            setSales(prevSales => prevSales.map(sale => 
                                sale.id === saleId ? { ...sale, estado: originalStatus as Sale['estado'], saldoPendiente: originalSaldo } as Sale : sale
                            ));
                            reintegrarStockLocalmente(items.map(item => ({...item, quantity: -item.quantity} as CartItem))); // Revertir stock local
                            throw new Error("La anulación falló en segundo plano.");
                        }
                    });
            } else {
                // MODO ONLINE: Esperar confirmación
                await performTransaction();
            }

        } catch (error) {
            console.error("Error al anular venta:", error);
            // Revertir la mutación optimista si falla
            setSales(prevSales => prevSales.map(sale => 
                sale.id === saleId ? { ...sale, estado: originalStatus as Sale['estado'], saldoPendiente: originalSaldo } as Sale : sale
            ));
            reintegrarStockLocalmente(items.map(item => ({...item, quantity: -item.quantity} as CartItem))); // Revertir stock local
            throw error; 
        }
    }, [setSales, isOffline, sales, reintegrarStockLocalmente, companyId]);
    
    
    // ======================================================
    // --- FUNCIÓN 3: deleteSaleAndRevertStock (ELIMINACIÓN DE VENTA) ---
    // ======================================================
    
    const deleteSaleAndRevertStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        console.log(`DataContext: Eliminando venta ${saleId} de forma OPTIMISTA.`);

        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO
        if (!dbInstance) { throw new Error("DB no inicializada."); }
        if (!companyId) { throw new Error("ID de empresa no disponible."); }
        const saleRef = dbInstance.doc(`companies/${companyId}/ventas/${saleId}`);
        
        // --- GUARDAMOS COPIA PARA ROLLBACK (Por si falla Internet o algo raro) ---
        const saleToDelete = sales.find(s => s.id === saleId);

        // 1. MUTACIÓN OPTIMISTA (¡Aquí está la magia!)
        // A) Revertimos el stock visualmente
        reintegrarStockLocalmente(items);
        
        // B) 🔥 ELIMINAMOS LA VENTA DE LA LISTA VISUAL INMEDIATAMENTE 🔥
        // Esto hace que desaparezca de Reports al instante.
        setSales(prevSales => prevSales.filter(s => s.id !== saleId));

        // 2. OPERACIÓN REMOTA (FIREBASE)
        try {
            const deletePromise = saleRef.delete(); 

            if (isOffline) {
                // MODO OFFLINE: Disparar sin await (se pone en cola).
                deletePromise.catch(err => {
                    // Este es el error de ID temporal. Lo logueamos para permitir el reintento del SDK.
                    console.warn(`[DELETE OFFLINE QUEUE WARNING] Venta ${saleId} en cola. Error: ${err.message}`);
                });
                
                Toast.show({
                    type: 'info',
                    text1: 'Venta Eliminada (Offline)',
                    text2: 'Se eliminará al conectar. El stock de Firebase se revertirá automáticamente.',
                    position: 'bottom',
                    visibilityTime: 4000
                });
            } else {
                // MODO ONLINE: Esperar la confirmación de Firebase
                await deletePromise;
            }
            
        } catch (error) {
            console.error("Error al intentar eliminar la venta de Firebase:", error);
            // Si la eliminación remota falla, revertimos la mutación optimista local de stock
            reintegrarStockLocalmente(items.map(item => ({...item, quantity: -item.quantity} as CartItem)));
            
            // B) Restauramos la venta en la lista
            if (saleToDelete) {
                setSales(prevSales => [...prevSales, saleToDelete]);
            }
            
            throw error; 
        }
    }, [isOffline, reintegrarStockLocalmente, sales, setSales, companyId]);


    // ======================================================
    // --- FUNCIÓN 4: updateClient (CORREGIDO v9) ---
    // ======================================================

    const updateClient = useCallback(async (clientId: string, updatedData: Partial<Client>) => {
        
        // 1. MUTACIÓN OPTIMISTA E INSTANTÁNEA: Actualizamos el cliente en la memoria
        const clientToUpdate = clients.find(c => c.id === clientId);
        const originalData = { ...clientToUpdate }; // Copia de seguridad

        // --- CORRECCIÓN DE TIPADO APLICADA ---
        setClients(prevClients => 
            prevClients.map(client => 
                client.id === clientId ? { ...client, ...updatedData } as Client : client
            )
        );

        console.log(`Cliente ${clientId} actualización optimista aplicada.`);

        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO
        if (!dbInstance) { throw new Error("DB no inicializada."); }
        if (!companyId) { throw new Error("ID de empresa no disponible."); }

        const clientRef = dbInstance.doc(`companies/${companyId}/clientes/${clientId}`);
        const writePromise = clientRef.update(updatedData); 

        // 3. APLICAR LÓGICA ASÍNCRONA
        try {
            if (isOffline) {
                // MODO OFFLINE: Disparar la escritura sin esperar (fire-and-forget)
                writePromise.catch(error => {
                    const isNetworkError = error.code === 'unavailable' || error.message.includes('UNAVAILABLE');
                    
                    if (!isNetworkError) {
                        console.error("Error en escritura offline de cliente:", error);
                        // Revertir la mutación si falla en segundo plano
                        setClients(prevClients => prevClients.map(client => 
                            client.id === clientId ? originalData as Client : client
                        ));
                    }
                });
                
            } else {
                // MODO ONLINE: Esperar confirmación
                await writePromise;
                // Forzar un refresh solo si se necesita capturar otros datos actualizados del servidor
                await fetchDataAndStore(false); 
            }
            
            console.log(`Cliente ${clientId} actualización enviada/confirmada.`);

        } catch (error) {
            console.error("Error en updateClient:", error);
            // Revertir la mutación si falla en línea (el error se relanza y lo maneja la pantalla)
            setClients(prevClients => prevClients.map(client => 
                client.id === clientId ? originalData as Client : client
            ));
            throw error; 
        }
    }, [setClients, isOffline, fetchDataAndStore, clients, companyId]);

    // ======================================================
    // --- FUNCIÓN 5: registrarVisita ---
    // ======================================================
    const registrarVisita = useCallback(async (visitaData: VisitaData): Promise<string> => {
        const dbInstance = dbContainer.instance;
        if (!dbInstance) throw new Error("DB no inicializada.");
        if (!companyId) throw new Error("ID de empresa no disponible.");

        const docRef = dbInstance.collection(`companies/${companyId}/visitas`).doc();
        const finalData = {
            ...visitaData,
            companyId,
            fecha: serverTimestamp(),
        };
        docRef.set(finalData).catch(err => console.error("Error guardando visita en Firestore:", err));
        return docRef.id;
    }, [companyId]);

    return (
        <DataContext.Provider value={{
            products,
            clients,
            categories,
            promotions,
            availableZones,
            vendors,
            sales,
            cobranzas,
            routes,
            rubros,
            priceLists,
            identity,
            companyId,
            companyConfig, // ✅ Agregado para White-Label
            userRole: resolvedUserRole,
            zones: availableZones,
            syncData,
            refreshAllData,
            isLoading,
            isInitialDataLoaded,
            isOffline,
            updateClient,
            crearVentaConStock,
            anularVentaConStock,
            deleteSaleAndRevertStock,
            descontarStockLocalmente,
            reintegrarStockLocalmente,
            setSalesState: setSales,
            registrarVisita,
        }}>
            {children}
            <Toast />
        </DataContext.Provider>
    );
};

// Hook personalizado para usar el contexto
export const useData = (): IDataContext => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData debe ser usado dentro de un DataProvider');
    }
    return context;
};
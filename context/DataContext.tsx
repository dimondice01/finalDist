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
// (Mantenido sin cambios salvo img)
export interface Product {
    id: string;
    nombre: string;
    precio: number;
    costo: number;
    stock?: number;
    categoriaId?: string;
    comisionEspecifica?: number;
    img?: string; // <--- ✅ CORRECCIÓN: Agregado soporte para imágenes
}
export interface CartItem extends Product {
    quantity: number;
    comision: number;
    precioOriginal?: number;
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
    vendedorAsignadoId?: string;
    
    // ✅ INICIO CAMBIOS AFIP (Punto 1: Clientes)
    arca?: boolean; // Se mantiene por retrocompatibilidad
    requiereFacturaAfip?: boolean; // Nuevo campo unificado para Facturación
    tipoDocumento?: string; // DNI, CUIT, CUIL, PAS, SC
    numeroDocumento?: string;
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
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada';
    
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
    
    saldoPendiente: number;
    paymentMethod?: 'contado' | 'cuenta_corriente';
    numeroFactura?: string;
    totalDescuentoPromociones?: number;
    pagoEfectivo?: number;
    pagoTransferencia?: number;
    itemDiscounts?: { [itemId: string]: number }; 

    // ✅ NUEVOS CAMPOS PARA COBRANZA (Agregados para soportar la funcionalidad)
    montoCobrado?: number;        // Monto total cobrado en una operación de cobranza
    rendido?: boolean;            // Si el dinero ya fue entregado a caja
    fechaRendicion?: any;         // Cuándo se rindió
    ventaOriginalId?: string;     // ID de la venta que generó la deuda (si aplica)
}
export interface Route {
    id: string;
    repartidorId: string;
    fecha: { seconds: number } | Date;
    estado?: 'Creada' | 'En Curso' | 'Completada'; 
    facturas?: any[];
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
    routes: Route[];
    rubros: Rubro[];
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
    routes: [],
    rubros: [],
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
    const [routes, setRoutes] = useState<Route[]>([]);
    const [rubros, setRubros] = useState<Rubro[]>([]);
    
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

    // --- Carga inicial (Sin cambios) ---
    useEffect(() => {
        const loadDataFromStorage = async () => {
            // ...
            try {
                console.log("Intentando cargar datos desde el almacenamiento local...");
                const keys = ['products', 'clients', 'categories', 'promotions', 'availableZones', 'vendors', 'sales', 'routes', 'rubros'];
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
                setDataState('routes', setRoutes, true);
                setDataState('rubros', setRubros);

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

            const vendorsQuery = query(collection(dbInstance, 'vendedores'), where('firebaseAuthUid', '==', currentUser.uid));
            const vendorsQuerySnap = await getDocs(vendorsQuery);
            let vendorDoc: FirebaseFirestoreTypes.DocumentSnapshot;
            let currentVendorData: Vendor | null = null; 

            if (vendorsQuerySnap.empty) {
                console.warn("No se encontró vendedor por 'firebaseAuthUid', intentando por Doc ID (método antiguo)...");
                const vendorRef = doc(dbInstance, 'vendedores', currentUser.uid);
                const vendorSnap = await vendorRef.get();
                
                // @ts-ignore
                if (!vendorSnap.exists) {
                    throw new Error("Datos del vendedor actual no encontrados en Firestore. Se cerrará la sesión.");
                }

                console.log("Vendedor encontrado por Doc ID. Actualizando documento con 'firebaseAuthUid'...");
                await updateDoc(vendorRef, { firebaseAuthUid: currentUser.uid });
                vendorDoc = vendorSnap; 
            } else {
                vendorDoc = vendorsQuerySnap.docs[0]; 
            }
            
            currentVendorData = { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
            const userRole = currentVendorData.rango;

            console.log(`Usuario identificado con rol: ${userRole} (ID: ${currentVendorData.id})`);

            const productsPromise = getDocs(collection(dbInstance, 'productos'));
            const categoriesPromise = getDocs(collection(dbInstance, 'categorias'));
            const promosQuery = query(collection(dbInstance, 'promociones'), where('estado', '==', 'activa'));
            const promosPromise = getDocs(promosQuery);
            const allVendorsPromise = getDocs(collection(dbInstance, 'vendedores'));
            const rubrosPromise = getDocs(collection(dbInstance, 'rubros'));

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
                    itemDiscounts: rawData.itemDiscounts || {}, 

                    // ✅ NUEVOS CAMPOS PARA COBRANZA (Mapeo)
                    montoCobrado: rawData.montoCobrado,
                    rendido: rawData.rendido,
                    fechaRendicion: rawData.fechaRendicion,
                    ventaOriginalId: rawData.ventaOriginalId,
                    } as Sale;
            };

            const [productsSnap, categoriesSnap, promosSnap, vendorsSnap, rubrosSnap] = await Promise.all([
                productsPromise, categoriesPromise, promosPromise, allVendorsPromise, rubrosPromise
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
            finalData.rubros = rubrosSnap.docs.map(processFirebaseDoc) as Rubro[];

            // Queries condicionales
            if (userRole === 'Reparto') {
                console.log("Cargando rutas para repartidor...");
                const routesQuery = query(collection(dbInstance, 'rutas'), where('repartidorId', '==', currentVendorData.id));
                const routesSnap = await getDocs(routesQuery);
                
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
                        // Usamos '__name__' para buscar por ID de documento de forma segura
                        const q = query(collection(dbInstance, 'ventas'), where('__name__', 'in', chunk));
                        return getDocs(q);
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
                         const q = query(collection(dbInstance, 'clientes'), where('__name__', 'in', chunk));
                         return getDocs(q);
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
            } else { // Vendedor o Admin
                const clientsQuery = query(collection(dbInstance, 'clientes'), where('vendedorAsignadoId', '==', currentVendorData.id));
                const clientsPromise = getDocs(clientsQuery);
                const salesQuery = query(collection(dbInstance, 'ventas'), where('vendedorId', '==', currentVendorData.id));
                const salesPromise = getDocs(salesQuery);
                const [clientsSnap, salesSnap] = await Promise.all([clientsPromise, salesPromise]);

                finalData.clients = clientsSnap.docs.map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale); 

                const zoneIds = currentVendorData.zonasAsignadas || [];
                    if (zoneIds.length > 0) {
                        const zoneIdsChunk = (zoneIds.length > 30) ? zoneIds.slice(0, 30) : zoneIds;
                        if(zoneIds.length > 30) console.warn("Demasiadas zonas asignadas (>30). Cargando solo las primeras 30.");
                        
                        // --- CORRECCIÓN: firestore.FieldPath.documentId() ---
                        // Usamos el 'firestore' importado por defecto
                        const zonesQueryRef = query(collection(dbInstance, 'zonas'), where(firestore.FieldPath.documentId(), 'in', zoneIdsChunk));
                        const zonesQuerySnap = await getDocs(zonesQueryRef);
                        finalData.availableZones = zonesQuerySnap.docs.map(processFirebaseDoc).filter(Boolean) as Zone[];
                    } else { finalData.availableZones = []; }
            }

            // Guardar en AsyncStorage (Sin cambios)
            await Promise.all([
                AsyncStorage.setItem('products', JSON.stringify(finalData.products)),
                AsyncStorage.setItem('categories', JSON.stringify(finalData.categories)),
                AsyncStorage.setItem('promotions', JSON.stringify(finalData.promotions)),
                AsyncStorage.setItem('vendors', JSON.stringify(finalData.vendors)),
                AsyncStorage.setItem('clients', JSON.stringify(finalData.clients)),
                AsyncStorage.setItem('availableZones', JSON.stringify(finalData.availableZones)),
                AsyncStorage.setItem('sales', JSON.stringify(finalData.sales)), 
                AsyncStorage.setItem('routes', JSON.stringify(finalData.routes)),
                AsyncStorage.setItem('rubros', JSON.stringify(finalData.rubros)),
            ]);

            // Actualizar estado de React (Sin cambios)
            setProducts(finalData.products);
            setCategories(finalData.categories);
            setPromotions(finalData.promotions);
            setVendors(finalData.vendors);
            setClients(finalData.clients);
            setAvailableZones(finalData.availableZones);
            setSales(finalData.sales);
            setRoutes(finalData.routes);
            setRubros(finalData.rubros);

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

        const dbInstance = dbContainer.instance;
        if (!dbInstance) { return; }
        
        if (currentVendor && userRole === 'Vendedor' && isInitialDataLoaded) {
            console.log('Estableciendo suscripciones a Firestore...');
            
            const productsQueryRef = collection(dbInstance, 'productos');
            productListener = onSnapshot(productsQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedProducts = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Product[];
                setProducts(updatedProducts.filter(p => p.id));
            });

            const categoryQueryRef = collection(dbInstance, 'categorias');
            categoryListener = onSnapshot(categoryQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedCategories = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Category[];
                setCategories(updatedCategories.filter(c => c.id));
            });

            const promotionsQueryRef = query(collection(dbInstance, 'promociones'), where('estado', '==', 'activa'));
            promotionListener = onSnapshot(promotionsQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
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
            });

            const rubrosQueryRef = collection(dbInstance, 'rubros');
            rubroListener = onSnapshot(rubrosQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedRubros = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Rubro[];
                setRubros(updatedRubros.filter(r => r.id));
            });

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
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            console.log('Suscripciones de DataContext limpiadas.');
        };
    }, [currentVendor, userRole, isInitialDataLoaded]); 


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
            
            const ventasCollectionRef = collection(dbInstance, "ventas");
            const saleRef = doc(ventasCollectionRef); // Generamos un ID local
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
            setDoc(saleRef, finalSaleData).catch(error => {
                console.error("Error al poner en cola la venta offline:", error);
                // Rollback si falla la cola (generalmente por error de seguridad)
                setSales(prevSales => prevSales.filter(sale => sale.id !== tempId));
            });

            return tempId; // Devolvemos el ID temporal

        } else {
            // ✅ CORRECCIÓN CLAVE: MODO ONLINE - Eliminamos la Transacción de Stock local.
            // La Cloud Function se encargará de descontar el stock en el backend.
            
            console.log("DataContext: Modo Online detectado. Escritura directa.");
            const ventasCollectionRef = collection(dbInstance, "ventas");
            const saleRef = doc(ventasCollectionRef); 
            const finalSaleData = { ...saleData, fecha: serverTimestamp() };
            const saleId = saleRef.id;
            
            // 1. MUTACIÓN OPTIMISTA: Agregar a la lista local con ID real
            setSales(prevSales => [...prevSales, { ...saleData, id: saleId, fecha: new Date() } as Sale]);
            // El descuento de stock LOCAL (optimista) se hace en CreateSaleScreen.tsx
            
            // 2. Escritura remota. NO usamos transacción para permitir que la Cloud Function haga el descuento.
            // ✅ IMPORTANTE: Se elimina 'await' para evitar bloqueos en conexiones inestables
            setDoc(saleRef, finalSaleData); 

            // Dado que la escritura fue exitosa (no hubo throw), retornamos el ID.
            return saleId;
        }
    }, [netInfo.isConnected]); 


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
        const saleRef = doc(dbInstance, "ventas", saleId);
        
        const performTransaction = async () => {
            await runTransaction(dbInstance, async (transaction) => {
                if (!items || items.length === 0) { throw new Error("No hay items para revertir."); }
                
                // Lógica de reversión de stock (solo si el estado original no era Anulada)
                if (originalStatus !== 'Anulada') {
                    for (const item of items) {
                        const productRef = doc(dbInstance, "productos", item.id);
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
    }, [setSales, isOffline, sales, reintegrarStockLocalmente]);
    
    
    // ======================================================
    // --- FUNCIÓN 3: deleteSaleAndRevertStock (ELIMINACIÓN DE VENTA) ---
    // ======================================================
    
    const deleteSaleAndRevertStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        console.log(`DataContext: Eliminando venta ${saleId}. Stock de Firebase será manejado por Cloud Function.`);

        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO
        if (!dbInstance) { throw new Error("DB no inicializada."); }
        const saleRef = doc(dbInstance, "ventas", saleId);
        
        // 1. MUTACIÓN OPTIMISTA LOCAL (Stock Reversión)
        reintegrarStockLocalmente(items);

        // 2. REMOTE OPERATION: Delete the document
        try {
            const deletePromise = deleteDoc(saleRef); 

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
            throw error; 
        }
    }, [isOffline, reintegrarStockLocalmente]);


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

        // 2. Definición de la operación de escritura
        const dbInstance = dbContainer.instance; // ✅ USO CORREGIDO
        if (!dbInstance) { throw new Error("DB no inicializada."); }

        const clientRef = doc(dbInstance, 'clientes', clientId);
        const writePromise = updateDoc(clientRef, updatedData); // <-- CORREGIDO

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
    }, [setClients, isOffline, fetchDataAndStore, clients]);

    // Valor que se provee a los componentes hijos
    const value: IDataContext = {
        products,
        clients,
        categories,
        promotions,
        availableZones,
        vendors,
        sales,
        routes,
        rubros, 
        zones: availableZones,
        updateClient: updateClient, 
        syncData,
        refreshAllData,
        isLoading,
        isInitialDataLoaded,
        isOffline,
        crearVentaConStock,
        anularVentaConStock,
        deleteSaleAndRevertStock, 
        descontarStockLocalmente,
        reintegrarStockLocalmente, 
        setSalesState: setSales,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

// Hook personalizado para usar el contexto
export const useData = (): IDataContext => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData debe ser usado dentro de un DataProvider');
    }
    return context;
};
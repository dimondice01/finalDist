import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetInfo } from '@react-native-community/netinfo';

// --- INICIO DE CAMBIOS: Importaciones NATIVAS ---
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS: Importaciones NATIVAS ---

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
// Esta importación ahora trae las INSTANCIAS NATIVAS de db/firebase-service.ts
import { auth, db } from '../db/firebase-service';

// --- Definición de Interfaces Estrictas ---
// (Sin cambios en las interfaces)
export interface Product {
    id: string;
    nombre: string;
    precio: number;
    costo: number;
    stock?: number;
    categoriaId?: string;
    comisionEspecifica?: number;
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
    tipo: 'venta' | 'reposicion' | "devolucion";
    fecha: { seconds: number } | Date;
    saldoPendiente: number;
    paymentMethod?: 'contado' | 'cuenta_corriente';
    numeroFactura?: string;
    totalDescuentoPromociones?: number;
    pagoEfectivo?: number;
    pagoTransferencia?: number;
    itemDiscounts?: { [itemId: string]: number }; 
}
export interface Route {
    id: string;
    repartidorId: string;
    fecha: { seconds: number } | Date;
    estado?: 'Creada' | 'En Curso' | 'Completada'; 
    facturas?: any[];
}


// --- INTERFAZ IDataContext (MODIFICADA) ---
// (Sin cambios en la interfaz)
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
    descontarStockLocalmente: (items: CartItem[]) => void;
}

// Valor por defecto para el contexto
// (Sin cambios en el valor por defecto)
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
    descontarStockLocalmente: (items: CartItem[]) => { console.warn("Llamada a descontarStockLocalmente por defecto"); },
};

const DataContext = createContext<IDataContext>(defaultContextValue);

export const DataProvider = ({ children }: { children: ReactNode }) => {
    // --- ESTADOS CON TIPOS ESTRICTOS ---
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [availableZones, setAvailableZones] = useState<Zone[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [routes, setRoutes] = useState<Route[]>([]);
    const [rubros, setRubros] = useState<Rubro[]>([]);
    
    // --- BANDERAS DE CARGA ---
    const [isLoading, setIsLoading] = useState(true);
    const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false);

    // --- ESTADO DE CONEXIÓN ---
    const [isOffline, setIsOffline] = useState(false);
    const netInfo = useNetInfo();
    const prevIsConnected = useRef<boolean | null>(null);

    const currentUser = auth.currentUser; 
    const currentVendor = useMemo(() => {
        if (!currentUser || vendors.length === 0) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [currentUser, vendors]);
    const userRole = currentVendor?.rango;

    // Función auxiliar para parsear fechas al cargar desde AsyncStorage
    // (Sin cambios)
    const parseWithDates = (jsonString: string | null): any[] => {
        if (!jsonString) return [];
        try {
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

    // Carga inicial desde el almacenamiento local
    // (Sin cambios en la lógica)
    useEffect(() => {
        const loadDataFromStorage = async () => {
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

    // EFECTO PARA MANEJAR EL ESTADO DE CONEXIÓN
    // (Sin cambios)
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

    // Función principal para obtener datos de Firestore y guardar localmente
    const fetchDataAndStore = useCallback(async (showToast = true) => {
        setIsLoading(true);
        console.log("Iniciando obtención de datos desde Firestore...");
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("No hay usuario autenticado para obtener datos.");

            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            // Nueva sintaxis para queries
            const vendorsQuerySnap = await db.collection('vendedores').where('firebaseAuthUid', '==', currentUser.uid).get();
            let vendorDoc: FirebaseFirestoreTypes.DocumentSnapshot;
            let currentVendorData: Vendor | null = null; 

            if (vendorsQuerySnap.empty) {
                console.warn("No se encontró vendedor por 'firebaseAuthUid', intentando por Doc ID (método antiguo)...");
                const vendorRef = db.collection('vendedores').doc(currentUser.uid);
                const vendorSnap = await vendorRef.get();
                
                // --- CORRECCIÓN DE SINTAXIS: .exists() es una función ---
                if (!vendorSnap.exists()) {
                    throw new Error("Datos del vendedor actual no encontrados en Firestore. Se cerrará la sesión.");
                }

                console.log("Vendedor encontrado por Doc ID. Actualizando documento con 'firebaseAuthUid'...");
                await vendorRef.update({ firebaseAuthUid: currentUser.uid });
                vendorDoc = vendorSnap; 
            } else {
                vendorDoc = vendorsQuerySnap.docs[0]; 
            }
            
            currentVendorData = { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
            const userRole = currentVendorData.rango;

            console.log(`Usuario identificado con rol: ${userRole} (ID: ${currentVendorData.id})`);

            // Definimos las promesas de las queries
            const productsPromise = db.collection('productos').get();
            const categoriesPromise = db.collection('categorias').get();
            const promosPromise = db.collection('promociones').where('estado', '==', 'activa').get();
            const allVendorsPromise = db.collection('vendedores').get();
            const rubrosPromise = db.collection('rubros').get();
            // --- FIN DE CAMBIOS: SDK NATIVO ---

            let finalData: IDataContext = { ...defaultContextValue, isLoading: true };

            // Procesador genérico (convierte Timestamp a Date)
            const processFirebaseDoc = (docSnap: FirebaseFirestoreTypes.DocumentSnapshot): any => {
                const data = docSnap.data();
                if (!data) return { id: docSnap.id }; // Manejar caso de documento vacío
                Object.keys(data).forEach(key => {
                    // --- INICIO DE CAMBIOS: SDK NATIVO ---
                    // Cambiamos 'Timestamp' por 'firestore.Timestamp'
                    if (data[key] instanceof firestore.Timestamp) {
                    // --- FIN DE CAMBIOS ---
                        data[key] = data[key].toDate();
                    }
                });
                return { id: docSnap.id, ...data };
            };

            // Procesador específico para Sales (sin cambios en la lógica interna)
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
                        saldoPendiente: rawData.saldoPendiente ?? 0,
                        paymentMethod: rawData.paymentMethod,
                        totalDescuentoPromociones: rawData.totalDescuentoPromociones ?? 0, 
                        pagoEfectivo: rawData.pagoEfectivo ?? 0,
                        pagoTransferencia: rawData.pagoTransferencia ?? 0,
                        itemDiscounts: rawData.itemDiscounts || {}, 
                        } as Sale;
                };

            // Ejecuta queries base
            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            const [productsSnap, categoriesSnap, promosSnap, vendorsSnap, rubrosSnap] = await Promise.all([
                productsPromise, categoriesPromise, promosPromise, allVendorsPromise, rubrosPromise
            ]);
            // --- FIN DE CAMBIOS ---
            
            finalData.products = productsSnap.docs.map(processFirebaseDoc) as Product[];
            finalData.categories = categoriesSnap.docs.map(processFirebaseDoc) as Category[];
            
            finalData.promotions = promosSnap.docs.map(processFirebaseDoc).map(p => ({
                ...p, 
                nombre: p.nombrePromocion || p.nombre, 
                productoIds: p.productoIds || (p.productoId ? [p.productoId] : []),
                clienteIds: p.clienteIds || [],
            })) as Promotion[];

            finalData.vendors = vendorsSnap.docs.map(processFirebaseDoc) as Vendor[];
            finalData.rubros = rubrosSnap.docs.map(processFirebaseDoc) as Rubro[];

            // Queries condicionales
            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            if (userRole === 'Reparto') {
                const routesSnap = await db.collection('rutas').where('repartidorId', '==', currentVendorData.id).get();
                finalData.routes = routesSnap.docs.map(processFirebaseDoc).map(r => ({
                    ...r, 
                    fecha: r.fechaCreacion || r.fecha || new Date(0)
                })) as Route[];

            } else { // Vendedor o Admin
                const clientsPromise = db.collection('clientes').where('vendedorAsignadoId', '==', currentVendorData.id).get();
                const salesPromise = db.collection('ventas').where('vendedorId', '==', currentVendorData.id).get();
                const [clientsSnap, salesSnap] = await Promise.all([clientsPromise, salesPromise]);
                // --- FIN DE CAMBIOS ---

                finalData.clients = clientsSnap.docs.map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale); 

                const zoneIds = currentVendorData.zonasAsignadas || [];
                    if (zoneIds.length > 0) {
                        // --- INICIO DE CAMBIOS: SDK NATIVO ---
                        // Reemplazamos '__name__' por 'firestore.FieldPath.documentId()'
                        const zoneIdsChunk = (zoneIds.length > 30) ? zoneIds.slice(0, 30) : zoneIds;
                        if(zoneIds.length > 30) console.warn("Demasiadas zonas asignadas (>30). Cargando solo las primeras 30.");
                        
                        const zonesQuery = await db.collection('zonas').where(firestore.FieldPath.documentId(), 'in', zoneIdsChunk).get();
                        finalData.availableZones = zonesQuery.docs.map(processFirebaseDoc).filter(Boolean) as Zone[];
                        // --- FIN DE CAMBIOS ---
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
            setIsLoading(false);
        }
    }, [currentVendor?.id, auth.currentUser?.uid]); 


    // 3. EFECTO PARA LISTENERS DE TIEMPO REAL
    useEffect(() => {
        let timeoutId: NodeJS.Timeout | undefined;
        let productListener: () => void = () => {}; 
        let categoryListener: () => void = () => {}; 
        let promotionListener: () => void = () => {}; 
        let rubroListener: () => void = () => {};

        if (currentVendor && userRole === 'Vendedor' && isInitialDataLoaded) {
            console.log('Estableciendo suscripciones a Firestore...');

            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            // Nueva sintaxis para onSnapshot
            const productsQuery = db.collection('productos');
            // @ts-ignore: El snapshot del SDK nativo es compatible
            productListener = productsQuery.onSnapshot((snapshot) => {
                const updatedProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
                setProducts(updatedProducts.filter(p => p.id));
            });

            const categoryQuery = db.collection('categorias');
            // @ts-ignore: El snapshot del SDK nativo es compatible
            categoryListener = categoryQuery.onSnapshot((snapshot) => {
                const updatedCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
                setCategories(updatedCategories.filter(c => c.id));
            });

            const promotionsQuery = db.collection('promociones').where('estado', '==', 'activa');
            // @ts-ignore: El snapshot del SDK nativo es compatible
            promotionListener = promotionsQuery.onSnapshot((snapshot) => {
                const updatedPromotions = snapshot.docs.map(doc => {
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

            const rubrosQuery = db.collection('rubros');
            // @ts-ignore: El snapshot del SDK nativo es compatible
            rubroListener = rubrosQuery.onSnapshot((snapshot) => {
                const updatedRubros = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Rubro[];
                setRubros(updatedRubros.filter(r => r.id));
            });
            // --- FIN DE CAMBIOS ---

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


    // Funciones sync y refresh (sin cambios)
    const syncData = useCallback(async () => {
        await fetchDataAndStore(true);
    }, [fetchDataAndStore]);

    const refreshAllData = useCallback(async () => {
        await fetchDataAndStore(true);
    }, [fetchDataAndStore]);

    
    // --- INICIO DE CAMBIOS: Nuevas Funciones de Lógica de Negocio ---
    
    /**
     * Crea una venta y descuenta el stock, todo en una transacción.
     */
    const crearVentaConStock = useCallback(async (saleData: any): Promise<string> => {
        
        // --- INICIO DE CAMBIOS: SDK NATIVO ---
        // Generamos un nuevo ID de documento
        const saleRef = db.collection("ventas").doc();

        // La sintaxis de runTransaction es casi idéntica
        await db.runTransaction(async (transaction) => {
        // --- FIN DE CAMBIOS ---
            const items = saleData.items as CartItem[];
            if (!items || items.length === 0) { throw new Error("No se pueden procesar 0 items."); }
            const productUpdates: { ref: FirebaseFirestoreTypes.DocumentReference, newStock: number }[] = [];

            for (const item of items) {
                // --- INICIO DE CAMBIOS: SDK NATIVO ---
                const productRef = db.collection("productos").doc(item.id);
                // --- FIN DE CAMBIOS ---
                const productSnap = await transaction.get(productRef);

                // --- CORRECCIÓN DE SINTAXIS: .exists() es una función ---
                if (!productSnap.exists()) { throw new Error(`Producto ${item.nombre} no encontrado.`); }
                
                const currentStock = productSnap.data()!.stock;
                if (currentStock === undefined || currentStock < item.quantity) {
                    throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${currentStock || 0}`);
                }
                
                const newStock = currentStock - item.quantity;
                productUpdates.push({ ref: productRef, newStock: newStock });
            }
            
            for (const update of productUpdates) {
                transaction.update(update.ref, { stock: update.newStock });
            }

            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            // Cambiamos 'serverTimestamp()' por 'firestore.FieldValue.serverTimestamp()'
            transaction.set(saleRef, {
                ...saleData,
                fecha: firestore.FieldValue.serverTimestamp()
            });
            // --- FIN DE CAMBIOS ---
        });
        return saleRef.id;
    // --- CORRECCIÓN DE DEPENDENCIA ---
    }, []); // 'db' es una instancia estable importada, no es necesario como dependencia.

    /**
     * Anula una venta y revierte el stock, todo en una transacción.
     */
    const anularVentaConStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        // --- INICIO DE CAMBIOS: SDK NATIVO ---
        await db.runTransaction(async (transaction) => {
        // --- FIN DE CAMBIOS ---
            if (!items || items.length === 0) { throw new Error("No hay items para revertir."); }
            const productUpdates: { ref: FirebaseFirestoreTypes.DocumentReference, newStock: number }[] = [];

            for (const item of items) {
                // --- INICIO DE CAMBIOS: SDK NATIVO ---
                const productRef = db.collection("productos").doc(item.id);
                // --- FIN DE CAMBIOS ---
                const productSnap = await transaction.get(productRef);

                // --- CORRECCIÓN DE SINTAXIS: .exists() es una función ---
                if (productSnap.exists()) {
                    const currentStock = productSnap.data()!.stock || 0;
                    const newStock = currentStock + item.quantity;
                    productUpdates.push({ ref: productRef, newStock: newStock });
                } else {
                    console.warn(`Producto ${item.nombre} (ID: ${item.id}) no encontrado al revertir stock.`);
                }
            }
            
            for (const update of productUpdates) {
                transaction.update(update.ref, { stock: update.newStock });
            }

            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            const saleRef = db.collection("ventas").doc(saleId);
            // --- FIN DE CAMBIOS ---
            transaction.update(saleRef, { 
                estado: "Anulada",
                saldoPendiente: 0 
            });
        });
    // --- CORRECCIÓN DE DEPENDENCIA ---
    }, []);
    // --- FIN DE CAMBIOS: Nuevas Funciones ---


    // --- Función de Stock Optimista ---
    // (Sin cambios)
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
                    const nuevoStock = stockActual - cantidadVendida;
                    return { ...product, stock: nuevoStock };
                }
                return product;
            });
        });
        console.log("Estado local de productos actualizado.");
    }, []);


    // --- Función updateClient ---
    /**
     * Actualiza un cliente en Firestore y refresca los datos locales.
     */
    const updateClient = useCallback(async (clientId: string, updatedData: Partial<Client>) => {
        console.log(`Actualizando cliente ${clientId}...`);
        try {
            // --- INICIO DE CAMBIOS: SDK NATIVO ---
            const clientRef = db.collection('clientes').doc(clientId);
            await clientRef.update(updatedData);
            // --- FIN DE CAMBIOS ---
            
            await fetchDataAndStore(false); 
            console.log(`Cliente ${clientId} actualizado con éxito.`);
        } catch (error) {
            console.error("Error en updateClient:", error);
            Toast.show({
                type: 'error',
                text1: 'Error al actualizar',
                text2: 'No se pudieron guardar los cambios.'
            });
            throw error;
        }
    }, [fetchDataAndStore]);


    // Valor que se provee a los componentes hijos
    // (Sin cambios)
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
        descontarStockLocalmente,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

// Hook personalizado para usar el contexto
// (Sin cambios)
export const useData = (): IDataContext => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData debe ser usado dentro de un DataProvider');
    }
    return context;
};
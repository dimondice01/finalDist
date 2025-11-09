// context/DataContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNetInfo } from '@react-native-community/netinfo';

// --- INICIO DE CAMBIOS: Importaciones NATIVAS (v9 Modular) ---
import firestore, {
    addDoc,
    collection,
    doc, // Mantenemos 'firestore' para FieldPath
    FirebaseFirestoreTypes,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where
} from '@react-native-firebase/firestore';
// --- FIN DE CAMBIOS ---

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';

// ¡¡AQUÍ ESTÁ EL CAMBIO DE IMPORTACIÓN!!
// Importamos 'auth' y el 'dbContainer'
import { auth, dbContainer } from '../db/firebase-service';

// --- Definición de Interfaces Estrictas ---
// (Sin cambios)
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


// --- INTERFAZ IDataContext (Sin cambios) ---
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

// --- Valor por defecto (Sin cambios) ---
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
    // --- INICIO DE CORRECCIÓN CON dbContainer ---
    // ======================================================

    // --- fetchDataAndStore (CORREGIDO) ---
    const fetchDataAndStore = useCallback(async (showToast = true) => {
        // ¡¡AÑADIR ESTA COMPROBACIÓN!!
        // Espera a que 'dbContainer.instance' sea inyectado por App.tsx
        if (!dbContainer.instance) {
            console.warn("fetchDataAndStore: DB no está lista, reintentando en 100ms...");
            // Esto puede pasar si 'fetch' se llama antes de que 'App.tsx' termine
            setTimeout(() => fetchDataAndStore(showToast), 100);
            return;
        }
        // ¡¡AÑADIR ESTA LÍNEA!!
        const db = dbContainer.instance;

        setIsLoading(true);
        console.log("Iniciando obtención de datos desde Firestore...");
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("No hay usuario autenticado para obtener datos.");

            const vendorsQuery = query(collection(db, 'vendedores'), where('firebaseAuthUid', '==', currentUser.uid));
            const vendorsQuerySnap = await getDocs(vendorsQuery);
            let vendorDoc: FirebaseFirestoreTypes.DocumentSnapshot;
            let currentVendorData: Vendor | null = null; 

            if (vendorsQuerySnap.empty) {
                console.warn("No se encontró vendedor por 'firebaseAuthUid', intentando por Doc ID (método antiguo)...");
                const vendorRef = doc(db, 'vendedores', currentUser.uid);
                const vendorSnap = await vendorRef.get();
                
                // @ts-ignore: El linter de TS se confunde con los tipos nativos vs web
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

            const productsPromise = getDocs(collection(db, 'productos'));
            const categoriesPromise = getDocs(collection(db, 'categorias'));
            const promosQuery = query(collection(db, 'promociones'), where('estado', '==', 'activa'));
            const promosPromise = getDocs(promosQuery);
            const allVendorsPromise = getDocs(collection(db, 'vendedores'));
            const rubrosPromise = getDocs(collection(db, 'rubros'));

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

            const [productsSnap, categoriesSnap, promosSnap, vendorsSnap, rubrosSnap] = await Promise.all([
                productsPromise, categoriesPromise, promosPromise, allVendorsPromise, rubrosPromise
            ]);
            
            finalData.products = productsSnap.docs.map(processFirebaseDoc) as Product[];
            finalData.categories = categoriesSnap.docs.map(processFirebaseDoc) as Category[];
            
            finalData.promotions = promosSnap.docs.map((p: any) => ({
                ...processFirebaseDoc(p), 
                nombre: p.data().nombrePromocion || p.data().nombre, 
                productoIds: p.data().productoIds || (p.data().productoId ? [p.data().productoId] : []),
                clienteIds: p.data().clienteIds || [],
            })) as Promotion[];

            finalData.vendors = vendorsSnap.docs.map(processFirebaseDoc) as Vendor[];
            finalData.rubros = rubrosSnap.docs.map(processFirebaseDoc) as Rubro[];

            // Queries condicionales
            if (userRole === 'Reparto') {
                const routesQuery = query(collection(db, 'rutas'), where('repartidorId', '==', currentVendorData.id));
                const routesSnap = await getDocs(routesQuery);
                finalData.routes = routesSnap.docs.map((r: any) => ({ 
                    ...processFirebaseDoc(r), 
                    fecha: r.data().fechaCreacion || r.data().fecha || new Date(0)
                })) as Route[];

            } else { // Vendedor o Admin
                const clientsQuery = query(collection(db, 'clientes'), where('vendedorAsignadoId', '==', currentVendorData.id));
                const clientsPromise = getDocs(clientsQuery);
                const salesQuery = query(collection(db, 'ventas'), where('vendedorId', '==', currentVendorData.id));
                const salesPromise = getDocs(salesQuery);
                const [clientsSnap, salesSnap] = await Promise.all([clientsPromise, salesPromise]);

                finalData.clients = clientsSnap.docs.map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale); 

                const zoneIds = currentVendorData.zonasAsignadas || [];
                    if (zoneIds.length > 0) {
                        const zoneIdsChunk = (zoneIds.length > 30) ? zoneIds.slice(0, 30) : zoneIds;
                        if(zoneIds.length > 30) console.warn("Demasiadas zonas asignadas (>30). Cargando solo las primeras 30.");
                        
                        const zonesQueryRef = query(collection(db, 'zonas'), where(firestore.FieldPath.documentId(), 'in', zoneIdsChunk));
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
            setIsLoading(false);
        }
    }, [currentVendor?.id, auth.currentUser?.uid]); 


    // --- Listeners (CORREGIDO) ---
    useEffect(() => {
        let timeoutId: NodeJS.Timeout | undefined;
        let productListener: () => void = () => {}; 
        let categoryListener: () => void = () => {}; 
        let promotionListener: () => void = () => {}; 
        let rubroListener: () => void = () => {};

        // ¡¡AÑADIR ESTA COMPROBACIÓN!!
        // Solo se suscribe si la DB está lista Y los datos iniciales cargados
        if (currentVendor && userRole === 'Vendedor' && isInitialDataLoaded && dbContainer.instance) {
            // ¡¡AÑADIR ESTA LÍNEA!!
            const db = dbContainer.instance;

            console.log('Estableciendo suscripciones a Firestore...');
            
            const productsQueryRef = collection(db, 'productos');
            productListener = onSnapshot(productsQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedProducts = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Product[];
                setProducts(updatedProducts.filter(p => p.id));
            });

            const categoryQueryRef = collection(db, 'categorias');
            categoryListener = onSnapshot(categoryQueryRef, (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => {
                const updatedCategories = snapshot.docs.map((doc: FirebaseFirestoreTypes.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() })) as Category[];
                setCategories(updatedCategories.filter(c => c.id));
            });

            const promotionsQueryRef = query(collection(db, 'promociones'), where('estado', '==', 'activa'));
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

            const rubrosQueryRef = collection(db, 'rubros');
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
        // ¡¡AÑADIR 'dbContainer.instance' A LAS DEPENDENCIAS!!
    }, [currentVendor, userRole, isInitialDataLoaded, dbContainer.instance]); 


    // --- Funciones sync y refresh (sin cambios) ---
    const syncData = useCallback(async () => {
        await fetchDataAndStore(true);
   }, [fetchDataAndStore]);

    const refreshAllData = useCallback(async () => {
        await fetchDataAndStore(true);
    }, [fetchDataAndStore]);

    
    // --- crearVentaConStock (CORREGIDO) ---
    const crearVentaConStock = useCallback(async (saleData: any): Promise<string> => {
        
        console.log("DataContext: Creando venta...");

        // 1. Obtener la DB
        if (!dbContainer.instance) {
            console.error("crearVentaConStock: DB no está lista, abortando.");
            throw new Error("La base de datos no está lista para crear la venta.");
        }
        const db = dbContainer.instance;

        // 2. Preparar los datos
        const finalSaleData = {
            ...saleData,
            fecha: serverTimestamp() // La nube pondrá la fecha
        };

        const ventasCollectionRef = collection(db, "ventas");

        // --- LÓGICA DE UI OPTIMISTA ---

        if (isOffline) {
            // --- MODO OFFLINE ---
             console.log("Modo Offline: Creando venta localmente (UI Optimista).");
            
            // 1. Generar un ID temporal único
            const tempId = `OFFLINE_${Date.now()}`; 
            
            // 2. Llamar a addDoc SIN 'await' (lo envía a la cola)
            addDoc(ventasCollectionRef, finalSaleData)
                .then(docRef => {
                    // --- ¡¡INICIO DE LA CORRECCIÓN "ANTI-DUPLICADOS"!! ---
                    // Esto se ejecuta en segundo plano cuando se recupera la conexión
                    console.log(`Venta offline sincronizada. ID temporal: ${tempId}, ID real de Firestore: ${docRef.id}`);
                	
                	// Actualizamos el estado de React para reemplazar el ID temporal por el real
                	// Esto evita que la venta aparezca duplicada cuando se refresquen los datos
                	setSales(prevSales => 
                		prevSales.map(sale => 
                			sale.id === tempId ? { ...sale, id: docRef.id } : sale
                		)
                	);
                	// --- ¡¡FIN DE LA CORRECCIÓN!! ---
                })
                .catch(err => {
                    // Manejar error de escritura en segundo plano
                    console.error("Error grave en la escritura offline en segundo plano:", err);
                });

            // 3. Actualizar el estado local (la UI) INMEDIATAMENTE con el ID temporal
            setSales(prevSales => [...prevSales, { ...saleData, id: tempId, fecha: new Date() } as Sale]);
            
            // 4. Devolver el ID temporal INMEDIATAMENTE para desbloquear la UI
            return tempId;

        } else {
            // --- MODO ONLINE (Como estaba antes) ---
            console.log("Modo Online: Creando venta en Firestore.");
            
            // 1. Esperar (await) el ID real de Firestore
            const docRef = await addDoc(ventasCollectionRef, finalSaleData); 
            
            // 2. Actualizar la UI con el ID real
            setSales(prevSales => [...prevSales, { ...saleData, id: docRef.id, fecha: new Date() } as Sale]);
            
            // 3. Devolver el ID real
            return docRef.id;
        }

    }, [isOffline, setSales]); // Única dependencia necesaria

    
    // --- anularVentaConStock (CORREGIDO) ---
    const anularVentaConStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        console.log("DataContext (Arquitectura Cloud Function): Anulando venta.");

        // ¡¡AÑADIR ESTA COMPROBACIÓN!!
        if (!dbContainer.instance) {
            console.error("anularVentaConStock: DB no está lista, abortando.");
            throw new Error("La base de datos no está lista para anular la venta.");
        }
        // ¡¡AÑADIR ESTA LÍNEA!!
        const db = dbContainer.instance;

        // 1. Simplemente actualizamos el estado. La Cloud Function revertirá el stock.
        const saleRef = doc(db, "ventas", saleId);
        await updateDoc(saleRef, { 
            estado: "Anulada",
            saldoPendiente: 0 
        });

        // 2. Actualización optimista de la UI
        setSales(prevSales => prevSales.map(sale => 
            sale.id === saleId ? { ...sale, estado: "Anulada", saldoPendiente: 0 } : sale
        ));
        
        // Opcional: Si tienes una función para REVERTIR el stock local, llámala aquí.
        // ej: revertirStockLocalmente(items);

    }, [setSales]); // Única dependencia necesaria
    
    // ======================================================
    // --- FIN DE CORRECCIÓN ---
    // ======================================================


    // --- Función de Stock Optimista (Sin cambios) ---
    // ¡Esta función es CLAVE para tu arquitectura!
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
section: "stock"
                    const nuevoStock = stockActual - cantidadVendida;
                    return { ...product, stock: nuevoStock };
                }
                return product;        });
        });
        console.log("Estado local de productos actualizado.");
    }, []);


    // --- Función updateClient (CORREGIDO) ---
    const updateClient = useCallback(async (clientId: string, updatedData: Partial<Client>) => {
        // ¡¡AÑADIR ESTA COMPROBACIÓN!!
        if (!dbContainer.instance) {
            console.error("updateClient: DB no está lista, abortando.");
         throw new Error("La base de datos no está lista para actualizar el cliente.");
        }
        // ¡¡AÑADIR ESTA LÍNEA!!
        const db = dbContainer.instance;

        console.log(`Actualizando cliente ${clientId}...`);
        try {
            const clientRef = doc(db, 'clientes', clientId);

            await updateDoc(clientRef, updatedData); 
            
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
export const useData = (): IDataContext => {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error('useData debe ser usado dentro de un DataProvider');
    }
    return context;
};
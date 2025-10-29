import AsyncStorage from '@react-native-async-storage/async-storage';
// Se añade 'updateDoc' a la lista de importación
// --- INICIO DE CAMBIOS: Importaciones ---
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
// --- FIN DE CAMBIOS: Importaciones ---
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Toast from 'react-native-toast-message';
import { auth, db } from '../db/firebase-service';

// --- Definición de Interfaces Estrictas ---

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
    precioOriginal?: number; // Precio antes de aplicar promociones (Opcional, usado para precio_especial)
    // 🔥 CAMBIO CRÍTICO: Eliminamos descuentoAplicado del item, ahora va en Sale.itemDiscounts
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
    vendedorAsignadoId?: string;
    location?: { latitude: number; longitude: number; } | null;
    fechaCreacion?: any; // Puede ser Date o Timestamp
}

export interface Category {
    id: string;
    nombre: string;
}

export interface Promotion {
    id: string;
    nombre: string;
    estado: 'activa' | 'inactiva';
    // --- AÑADIDO: Campos que faltaban para las promos de create-sale ---
    tipo: string;
    productoIds: string[];
    clienteIds?: string[];
    nuevoPrecio?: number;
    // ... otros campos de promoción
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
    nombre: string; // <-- CORREGIDO: Usar 'nombre'
    nombreCompleto?: string; // Mantener por si acaso
    rango: 'Vendedor' | 'Reparto' | 'Admin';
    zonasAsignadas?: string[];
    comisionGeneral?: number;
    firebaseAuthUid?: string; // <-- AÑADIDO: Campo de enlace
}

// --- INTERFAZ SALE CORREGIDA (MOLDE ÚNICO) ---
export interface Sale {
    id: string;
    clienteId: string;
    clientName: string; // <-- Mantenemos este
    clienteNombre?: string; // <-- Y este para compatibilidad
    vendedorId: string;
    vendedorName: string; // <-- Mantenemos este
    vendedorNombre?: string; // <-- Y este para compatibilidad
    items: CartItem[];
    totalVenta: number; // <-- Nombre correcto
    totalCosto: number;
    totalComision: number;
    observaciones: string;
    
    // --- INICIO DE CAMBIOS: Interfaces ---
    estado: 'Pagada' | 'Adeuda' | 'Pendiente de Entrega' | 'Repartiendo' | 'Anulada'; // <-- CAMBIO DE NOMBRE
    tipo: 'venta' | 'reposicion'; // <-- CAMPO NUEVO
    // --- FIN DE CAMBIOS: Interfaces ---

    fecha: { seconds: number } | Date; // <-- Nombre correcto
    saldoPendiente: number;
    paymentMethod?: 'contado' | 'cuenta_corriente'; // <-- AÑADIDO
    numeroFactura?: string;
    
    // --- CAMPOS DE TOTALES ---
    totalDescuentoPromociones?: number;
    pagoEfectivo?: number;
    pagoTransferencia?: number;

    // 🔥 CAMBIO CRÍTICO: Mapa de descuentos por ID (FUERA del array de ítems)
    itemDiscounts?: { [itemId: string]: number }; 
}
// --- FIN INTERFAZ SALE ---


export interface Route {
    id: string;
    repartidorId: string;
    fecha: { seconds: number } | Date;
    estado?: 'Creada' | 'En Curso' | 'Completada'; 
    facturas?: any[]; // Mantenemos un tipado flexible aquí para no colisionar con Driver.tsx
}


// --- INTERFAZ IDataContext (MODIFICADA) ---
export interface IDataContext {
    products: Product[];
    clients: Client[];
    categories: Category[];
    promotions: Promotion[];
    availableZones: Zone[];
    vendors: Vendor[];
    sales: Sale[];
    routes: Route[];
    syncData: () => Promise<void>;
    refreshAllData: () => Promise<void>;
    isLoading: boolean;
    isInitialDataLoaded: boolean; // <-- NUEVA BANDERA

    // --- INICIO DE CAMBIOS: Nuevas Funciones ---
    crearVentaConStock: (saleData: any) => Promise<string>;
    anularVentaConStock: (saleId: string, items: CartItem[]) => Promise<void>;
    // --- FIN DE CAMBIOS: Nuevas Funciones ---
}

// Valor por defecto para el contexto
const defaultContextValue: IDataContext = {
    products: [],
    clients: [],
    categories: [],
    promotions: [],
    availableZones: [],
    vendors: [],
    sales: [],
    routes: [],
    syncData: async () => { console.warn("Llamada a syncData por defecto"); },
    refreshAllData: async () => { console.warn("Llamada a refreshAllData por defecto"); },
    isLoading: true,
    isInitialDataLoaded: false, // <-- NUEVO VALOR POR DEFECTO
    
    // --- INICIO DE CAMBIOS: Valores por defecto ---
    crearVentaConStock: async (saleData: any) => { console.warn("Llamada a crearVentaConStock por defecto"); return "error"; },
    anularVentaConStock: async (saleId: string, items: CartItem[]) => { console.warn("Llamada a anularVentaConStock por defecto"); },
    // --- FIN DE CAMBIOS: Valores por defecto ---
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
    
    // --- BANDERAS DE CARGA ---
    const [isLoading, setIsLoading] = useState(true); // Indica si una sync está ACTIVA (true/false)
    const [isInitialDataLoaded, setIsInitialDataLoaded] = useState(false); // Indica si el useEffect inicial terminó (true)

    const currentUser = auth.currentUser;
    // Usamos useMemo para obtener el vendor actual
    const currentVendor = useMemo(() => {
        if (!currentUser || vendors.length === 0) return null;
        return vendors.find((v: Vendor) => v.firebaseAuthUid === currentUser.uid || v.id === currentUser.uid);
    }, [currentUser, vendors]);
    const userRole = currentVendor?.rango; // Extraemos el rol

    // Función auxiliar para parsear fechas al cargar desde AsyncStorage
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
    useEffect(() => {
        const loadDataFromStorage = async () => {
            // setIsLoading(true); // Ya está en true por defecto
            try {
                console.log("Intentando cargar datos desde el almacenamiento local...");
                const keys = ['products', 'clients', 'categories', 'promotions', 'availableZones', 'vendors', 'sales', 'routes'];
                const storedData = await AsyncStorage.multiGet(keys);
                const dataMap = new Map(storedData);

                const setDataState = (key: string, setter: React.Dispatch<React.SetStateAction<any[]>>, parseDates = false) => {
                    const jsonData = dataMap.get(key);
                    if (jsonData) {
                        try {
                            const parsed = parseDates ? parseWithDates(jsonData) : JSON.parse(jsonData);
                            // Asegurar que los items de las ventas tengan precioOriginal
                            if (key === 'sales') {
                                const salesData = (parsed as Sale[]).map(sale => ({
                                    ...sale,
                                    // 🔥 Leemos el nuevo campo de descuentos
                                    itemDiscounts: sale.itemDiscounts || {}, // Aseguramos que sea un objeto
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
                            setter([]); // Resetea si está corrupto
                        }
                    } else {
                         setter([]); // Si no hay datos, inicializa como array vacío
                    }
                };

                setDataState('products', setProducts);
                setDataState('clients', setClients);
                setDataState('categories', setCategories);
                setDataState('promotions', setPromotions);
                setDataState('availableZones', setAvailableZones);
                setDataState('vendors', setVendors);
                setDataState('sales', setSales, true); // Asegura manejo de precioOriginal
                setDataState('routes', setRoutes, true);

                console.log("Datos locales cargados.");
            } catch (e) {
                console.error("Error al cargar datos locales:", e);
            } finally {
                // MARCADO DE FINALIZACIÓN
                setIsLoading(false); 
                setIsInitialDataLoaded(true); 
            }
        };

        loadDataFromStorage();
    }, []);

    // Función principal para obtener datos de Firestore y guardar localmente
    const fetchDataAndStore = useCallback(async (showToast = true) => {
        setIsLoading(true);
        console.log("Iniciando obtención de datos desde Firestore...");
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) throw new Error("No hay usuario autenticado para obtener datos.");

            // --- CORRECCIÓN DE ROBUSTEZ: Buscamos el vendedor ---
            const vendorsQuerySnap = await getDocs(query(collection(db, 'vendedores'), where('firebaseAuthUid', '==', currentUser.uid)));
            let vendorDoc;
            let currentVendorData: Vendor | null = null; 

            if (vendorsQuerySnap.empty) {
                // Si está vacío, intentamos el método antiguo como fallback por si acaso
                console.warn("No se encontró vendedor por 'firebaseAuthUid', intentando por Doc ID (método antiguo)...");
                const vendorRef = doc(db, 'vendedores', currentUser.uid);
                const vendorSnap = await getDoc(vendorRef);
                
                if (!vendorSnap.exists()) {
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
            // --- FIN CORRECCIÓN BÚSQUEDA VENDEDOR ---

            console.log(`Usuario identificado con rol: ${userRole} (ID: ${currentVendorData.id})`);

            // Queries base
            const productsQuery = getDocs(query(collection(db, 'productos')));
            const categoriesQuery = getDocs(query(collection(db, 'categorias')));
            const promosQuery = getDocs(query(collection(db, 'promociones'), where('estado', '==', 'activa')));
            const allVendorsQuery = getDocs(query(collection(db, 'vendedores'))); // Todos los vendedores

            let finalData: IDataContext = { ...defaultContextValue, isLoading: true };

            // Procesador genérico (convierte Timestamp a Date)
            const processFirebaseDoc = (docSnap: any): any => {
                const data = docSnap.data();
                Object.keys(data).forEach(key => {
                    if (data[key] instanceof Timestamp) {
                        data[key] = data[key].toDate();
                    }
                });
                return { id: docSnap.id, ...data };
            };

            // Procesador específico para Sales (Ahora maneja el mapa de descuentos)
             const processFirebaseSale = (docSnap: any): Sale => {
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
                    // --- INICIO CAMBIO DE ESTADO (Refactor) ---
                    // Se mapea 'Pendiente de Pago' al nuevo estado
                    estado: rawData.estado === 'Pendiente de Pago' ? 'Pendiente de Entrega' : (rawData.estado || rawData.status || 'Pendiente de Entrega'), 
                    tipo: rawData.tipo || 'venta', // Asumimos 'venta' si no existe
                    // --- FIN CAMBIO DE ESTADO ---
                    fecha: rawData.fecha || rawData.saleDate || new Date(0), 
                    saldoPendiente: rawData.saldoPendiente ?? 0,
                    paymentMethod: rawData.paymentMethod,
                    totalDescuentoPromociones: rawData.totalDescuentoPromociones ?? 0, 
                    pagoEfectivo: rawData.pagoEfectivo ?? 0,
                    pagoTransferencia: rawData.pagoTransferencia ?? 0,
                    // 🔥 Nuevo campo (Aseguramos que sea un objeto)
                    itemDiscounts: rawData.itemDiscounts || {}, 
                 } as Sale;
            };

            // Ejecuta queries base
            const [productsSnap, categoriesSnap, promosSnap, vendorsSnap] = await Promise.all([
                productsQuery, categoriesQuery, promosQuery, allVendorsQuery
            ]);
            finalData.products = productsSnap.docs.map(processFirebaseDoc) as Product[];
            finalData.categories = categoriesSnap.docs.map(processFirebaseDoc) as Category[];
            
            // --- FIX DE PROMOCIONES: Mapeo de campos inconsistentes ---
            finalData.promotions = promosSnap.docs.map(processFirebaseDoc).map(p => ({
                ...p, 
                nombre: p.nombrePromocion || p.nombre, 
                productoIds: p.productoIds || (p.productoId ? [p.productoId] : []),
                clienteIds: p.clienteIds || [],
            })) as Promotion[];
            // --- FIN FIX DE PROMOCIONES ---

            finalData.vendors = vendorsSnap.docs.map(processFirebaseDoc) as Vendor[];

            // Queries condicionales
            if (userRole === 'Reparto') {
                const routesQuery = getDocs(query(collection(db, 'rutas'), where('repartidorId', '==', currentVendorData.id)));
                const routesSnap = await routesQuery;
                finalData.routes = routesSnap.docs.map(processFirebaseDoc).map(r => ({
                    ...r, 
                    fecha: r.fechaCreacion || r.fecha || new Date(0)
                })) as Route[];

            } else { // Vendedor o Admin
                const clientsQuery = getDocs(query(collection(db, 'clientes'), where('vendedorAsignadoId', '==', currentVendorData.id)));
                const salesQuery = getDocs(query(collection(db, 'ventas'), where('vendedorId', '==', currentVendorData.id)));
                const [clientsSnap, salesSnap] = await Promise.all([clientsQuery, salesQuery]);

                finalData.clients = clientsSnap.docs.map(processFirebaseDoc) as Client[];
                finalData.sales = salesSnap.docs.map(processFirebaseSale); 

                const zoneIds = currentVendorData.zonasAsignadas || [];
                 if (zoneIds.length > 0) {
                     if (zoneIds.length > 30) { 
                         console.warn("Demasiadas zonas asignadas (>30). Cargando solo las primeras 30.");
                         const limitedZoneIds = zoneIds.slice(0, 30);
                         const zonesQuery = getDocs(query(collection(db, 'zonas'), where('__name__', 'in', limitedZoneIds)));
                         finalData.availableZones = (await zonesQuery).docs.map(processFirebaseDoc).filter(Boolean) as Zone[];
                     } else {
                         const zonesQuery = getDocs(query(collection(db, 'zonas'), where('__name__', 'in', zoneIds)));
                         finalData.availableZones = (await zonesQuery).docs.map(processFirebaseDoc).filter(Boolean) as Zone[];
                     }
                } else { finalData.availableZones = []; }
            }

            // Guardar en AsyncStorage
            await Promise.all([
                AsyncStorage.setItem('products', JSON.stringify(finalData.products)),
                AsyncStorage.setItem('categories', JSON.stringify(finalData.categories)),
                AsyncStorage.setItem('promotions', JSON.stringify(finalData.promotions)),
                AsyncStorage.setItem('vendors', JSON.stringify(finalData.vendors)),
                AsyncStorage.setItem('clients', JSON.stringify(finalData.clients)),
                AsyncStorage.setItem('availableZones', JSON.stringify(finalData.availableZones)),
                // La serialización de Sale ahora incluye el mapa itemDiscounts
                AsyncStorage.setItem('sales', JSON.stringify(finalData.sales)), 
                AsyncStorage.setItem('routes', JSON.stringify(finalData.routes)),
            ]);

            // Actualizar estado de React
            setProducts(finalData.products);
            setCategories(finalData.categories);
            setPromotions(finalData.promotions);
            setVendors(finalData.vendors);
            setClients(finalData.clients);
            setAvailableZones(finalData.availableZones);
            setSales(finalData.sales);
            setRoutes(finalData.routes);

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


    // 3. EFECTO PARA LISTENERS DE TIEMPO REAL (CORREGIDO PARA EVITAR CRASHES POR CLEANUP)
    useEffect(() => {
        let timeoutId: NodeJS.Timeout | undefined;

        // CRÍTICO: Inicializamos las variables con una función vacía para que el cleanup siempre pueda ser llamado
        let productListener: () => void = () => {}; 
        let categoryListener: () => void = () => {}; 
        let promotionListener: () => void = () => {}; 

        // Solo subscribimos si es vendedor, ya que ellos necesitan el tiempo real de estos datos
        if (currentVendor && userRole === 'Vendedor' && isInitialDataLoaded) {
            console.log('Estableciendo suscripciones a Firestore...');

            // Productos
            const productsQuery = query(collection(db, 'productos'));
            productListener = onSnapshot(productsQuery, (snapshot) => {
                const updatedProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
                setProducts(updatedProducts.filter(p => p.id));
            });

            // Categorías
            const categoryQuery = query(collection(db, 'categorias'));
            categoryListener = onSnapshot(categoryQuery, (snapshot) => {
                const updatedCategories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
                setCategories(updatedCategories.filter(c => c.id));
            });

            // Promociones
            const promotionsQuery = query(collection(db, 'promociones'), where('estado', '==', 'activa'));
            promotionListener = onSnapshot(promotionsQuery, (snapshot) => {
                const updatedPromotions = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // --- FIX DE PROMOCIONES EN LISTENER ---
                    return ({ 
                        id: doc.id, 
                        ...data,
                        nombre: data.nombrePromocion || data.nombre, 
                        productoIds: data.productoIds || (data.productoId ? [data.productoId] : []),
                        clienteIds: data.clienteIds || [],
                    });
                    // --- FIN FIX DE PROMOCIONES EN LISTENER ---
                }) as Promotion[];
                setPromotions(updatedPromotions.filter(p => p.id));
            });

            // Timeout para forzar un sync total (mantenemos el cleanup)
            timeoutId = setTimeout(() => {
                console.log('Timeout alcanzado. Forzando una verificación de datos.');
            }, 120000); 
        }
        
        // CLEANUP GENERAL: Cancela todas las suscripciones de forma segura.
        return () => {
            console.log('Limpiando suscripciones de DataContext...');
            productListener(); 
            categoryListener();
            promotionListener();
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
     * Arroja un error si el stock es insuficiente.
     */
    const crearVentaConStock = useCallback(async (saleData: any): Promise<string> => {
        
        // Generamos la referencia de la venta *fuera* de la transacción
        // para poder devolver el ID al final.
        const saleRef = doc(collection(db, "ventas"));

        await runTransaction(db, async (transaction) => {
            const items = saleData.items as CartItem[];

            if (!items || items.length === 0) {
                throw new Error("No se pueden procesar 0 items.");
            }

            // 1. VERIFICAR Y DESCONTAR STOCK
            for (const item of items) {
                const productRef = doc(db, "productos", item.id); // Asumimos que item.id es el ID del producto
                const productSnap = await transaction.get(productRef);

                if (!productSnap.exists()) {
                    throw new Error(`Producto ${item.nombre} no encontrado.`);
                }
                
                const currentStock = productSnap.data().stock;
                if (currentStock === undefined || currentStock < item.quantity) {
                    throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${currentStock || 0}`);
                }
                
                const newStock = currentStock - item.quantity;
                transaction.update(productRef, { stock: newStock });
            }

            // 2. CREAR EL DOCUMENTO DE VENTA
            transaction.set(saleRef, {
                ...saleData,
                fecha: serverTimestamp() // Asegura la fecha del servidor
            });
        });

        // Si la transacción tuvo éxito, devolvemos el ID
        return saleRef.id;

    }, [db]); // Depende de 'db'

    /**
     * Anula una venta y revierte el stock, todo en una transacción.
     */
    const anularVentaConStock = useCallback(async (saleId: string, items: CartItem[]) => {
        
        await runTransaction(db, async (transaction) => {
            if (!items || items.length === 0) {
                throw new Error("No hay items para revertir.");
            }

            // 1. REVERTIR STOCK
            for (const item of items) {
                const productRef = doc(db, "productos", item.id);
                const productSnap = await transaction.get(productRef);

                if (productSnap.exists()) {
                    const currentStock = productSnap.data().stock || 0;
                    const newStock = currentStock + item.quantity;
                    transaction.update(productRef, { stock: newStock });
                } else {
                    // Si el producto no existe, solo logueamos, no detenemos la anulación
                    console.warn(`Producto ${item.nombre} (ID: ${item.id}) no encontrado al revertir stock.`);
                }
            }

            // 2. ANULAR LA VENTA
            const saleRef = doc(db, "ventas", saleId);
            transaction.update(saleRef, { 
                estado: "Anulada",
                saldoPendiente: 0 
            });
        });

    }, [db]);
    // --- FIN DE CAMBIOS: Nuevas Funciones ---


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
        syncData,
        refreshAllData,
        isLoading,
        isInitialDataLoaded,
        
        // --- INICIO DE CAMBIOS: Exportar Funciones ---
        crearVentaConStock,
        anularVentaConStock,
        // --- FIN DE CAMBIOS: Exportar Funciones ---
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
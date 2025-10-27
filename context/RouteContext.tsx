import React, { createContext, ReactNode, useContext, useState } from 'react';

// Definimos la forma de los datos que queremos guardar
interface RouteState {
    routeClients: any[];
    visitedClients: string[];
    isNavigating: boolean;
    startRoute: (clients: any[]) => void;
    visitCurrentClient: () => any | null;
    finishRoute: () => void;
}

// Creamos el contexto con un valor por defecto
const RouteContext = createContext<RouteState | undefined>(undefined);

// Creamos el "Proveedor" que contendrá la lógica y la memoria
export const RouteProvider = ({ children }: { children: ReactNode }) => {
    const [routeClients, setRouteClients] = useState<any[]>([]);
    const [visitedClients, setVisitedClients] = useState<string[]>([]);
    const [isNavigating, setIsNavigating] = useState(false);

    const startRoute = (clients: any[]) => {
        setRouteClients(clients);
        setVisitedClients([]);
        setIsNavigating(true);
    };

    const visitCurrentClient = () => {
        if (routeClients.length === 0) return null;
        const current = routeClients[0];
        setVisitedClients(prev => [...prev, current.id]);
        setRouteClients(prev => prev.slice(1));
        return current; // Devuelve el cliente que acabamos de marcar como visitado
    };

    const finishRoute = () => {
        setRouteClients([]);
        setVisitedClients([]);
        setIsNavigating(false);
    };

    const value = {
        routeClients,
        visitedClients,
        isNavigating,
        startRoute,
        visitCurrentClient,
        finishRoute,
    };

    return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
};

// Creamos un "Hook" para acceder fácilmente a la memoria desde cualquier pantalla
export const useRoute = () => {
    const context = useContext(RouteContext);
    if (context === undefined) {
        throw new Error('useRoute debe ser usado dentro de un RouteProvider');
    }
    return context;
};
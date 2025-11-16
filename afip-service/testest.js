// testEmitir.js
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

// 🔹 Config de Firebase (reemplazá con tus datos)
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT_ID.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT_ID.appspot.com",
  messagingSenderId: "TU_MESSAGING_SENDER_ID",
  appId: "TU_APP_ID",
};

// Inicializamos la app
const app = initializeApp(firebaseConfig);

// Obtenemos el servicio de Functions
const functions = getFunctions(app);

// Referencia a la Cloud Function
const emitirFacturas = httpsCallable(functions, "emitirFacturasReparto");

// 🔹 Lote de ventas de ejemplo
const ventasLote = [
  {
    id: "venta1",
    facturaAfip: true,
    clienteId: "iJZ3jZBDOtiDWF3jyw6m",
    clienteNombre: "Cliente Prueba AFIP",
    estado: "Pendiente de Entrega",
    fecha: "2025-11-14T17:03:22-03:00",
    items: [
      {
        id: "GBdn4G09dEoCYiNzPBj5",
        nombre: "BOLITA CHOCOLATE 2.5K",
        categoriaId: "t3tH3v8ekWtcvEnIwLu0",
        precio: 17100,
        precioOriginal: 17100,
        costo: 10800,
        quantity: 1,
        stock: 39,
        codigoDeBarras: "",
        comision: 0,
        comisionEspecifica: null,
        descuentoPorCantidadAplicado: 0,
        observaciones: "",
        numeroDocumento: "20111111112",
        tipoDocumento: "CUIT",
      },
    ],
    saldoPendiente: 17100,
    totalCosto: 10800,
    totalComision: 0,
    totalDescuentoPromociones: 0,
    totalVenta: 17100,
    tipo: "venta",
    vendedorId: "oWLAdPUPwLWR8p2bxocP67rF4I83",
    vendedorName: "Analia Gaitan",
  },
  {
    id: "venta2",
    facturaAfip: false,
    clienteId: "iJZ3jZBDOtiDWF3jyw7n",
    clienteNombre: "Cliente Interno",
    estado: "Pendiente de Entrega",
    fecha: "2025-11-14T17:05:10-03:00",
    items: [
      {
        id: "ABcd4E08fFpCYiNzQPr6",
        nombre: "GALLETAS VARIAS 1K",
        categoriaId: "u4vH3v9ekWtcvEnIwLu1",
        precio: 5000,
        precioOriginal: 5000,
        costo: 3000,
        quantity: 2,
        stock: 50,
        codigoDeBarras: "",
        comision: 0,
        comisionEspecifica: null,
        descuentoPorCantidadAplicado: 0,
        observaciones: "",
        numeroDocumento: "20122222223",
        tipoDocumento: "CUIT",
      },
    ],
    saldoPendiente: 10000,
    totalCosto: 6000,
    totalComision: 0,
    totalDescuentoPromociones: 0,
    totalVenta: 10000,
    tipo: "venta",
    vendedorId: "oWLAdPUPwLWR8p2bxocP67rF4I84",
    vendedorName: "Juan Perez",
  },
  {
    id: "venta3",
    facturaAfip: true,
    clienteId: "iJZ3jZBDOtiDWF3jyw8o",
    clienteNombre: "Cliente AFIP 2",
    estado: "Pendiente de Entrega",
    fecha: "2025-11-14T17:10:05-03:00",
    items: [
      {
        id: "CDef5G10gHpCYiNzRQr7",
        nombre: "JUGO NARANJA 1L",
        categoriaId: "v5wI3x0ekWtcvEnIwLu2",
        precio: 1200,
        precioOriginal: 1200,
        costo: 700,
        quantity: 5,
        stock: 25,
        codigoDeBarras: "",
        comision: 0,
        comisionEspecifica: null,
        descuentoPorCantidadAplicado: 0,
        observaciones: "",
        numeroDocumento: "20133333334",
        tipoDocumento: "CUIT",
      },
    ],
    saldoPendiente: 6000,
    totalCosto: 3500,
    totalComision: 0,
    totalDescuentoPromociones: 0,
    totalVenta: 6000,
    tipo: "venta",
    vendedorId: "oWLAdPUPwLWR8p2bxocP67rF4I85",
    vendedorName: "Maria Lopez",
  },
];

// 🔹 Llamada a la CF
emitirFacturas({ ventas: ventasLote })
  .then(res => console.log("Resultados del lote:", res.data))
  .catch(err => console.error("Error:", err));

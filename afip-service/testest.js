const { initializeApp } = require("firebase/app");
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require("firebase/functions");

// 1. CREDENCIALES REALES (Extraídas de tu proyecto)
const firebaseConfig = {
  apiKey: "AIzaSyC0JqOWRdkmFjBoAQN7igM_a2qKysYW2Kk", // Tu API Key real
  authDomain: "noarerp.firebaseapp.com",
  projectId: "noarerp", // Tu ID de Proyecto correcto
};

// 2. Inicializar Cliente
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);

// 🚨 CONECTAR AL EMULADOR LOCAL (Puerto 5001)
// Esto es vital para que no intente ir a la nube de Google
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

console.log("🚀 Conectado al Emulador de Functions (127.0.0.1:5001)");

// 3. Referencia a la función (Debe coincidir con tu export en index.js)
const emitirFacturas = httpsCallable(functions, "emitirFacturasReparto");

// 4. DATOS DE PRUEBA (Simulando una venta real)
// Usamos un ID único para no confundirnos en los logs
const idPrueba = "TEST-" + Math.floor(Math.random() * 1000);

const ventasLote = [
  {
    id: idPrueba,
    facturaAfip: true,          // <--- ¡EL GATILLO! Esto activa tu código nuevo
    clienteId: "CLIENTE_TEST",
    clienteNombre: "Cliente Homologacion",
    clienteCuit: "20111111112", // CUIT de prueba válido (Persona Física)
    totalVenta: 150.00,         // Monto simple
    items: [
      { 
        nombre: "Producto Test AFIP", 
        quantity: 1, 
        precio: 150.00 
      }
    ]
  }
];

// 5. EJECUCIÓN
console.log(`📨 Enviando venta de prueba (${idPrueba}) al Backend...`);

emitirFacturas({ ventas: ventasLote })
  .then((result) => {
    console.log("\n✅ ¡ÉXITO! RESPUESTA DEL BACKEND:");
    console.log("---------------------------------------------------");
    console.log(JSON.stringify(result.data, null, 2));
    console.log("---------------------------------------------------");
    
    // Verificación rápida para ti
    const primerResultado = result.data[0];
    if (primerResultado && primerResultado.detalle && primerResultado.detalle.cae) {
      console.log(`🎉 CAE OBTENIDO: ${primerResultado.detalle.cae}`);
    }
  })
  .catch((error) => {
    console.error("\n❌ ERROR AL EMITIR:");
    console.error(error);
  });
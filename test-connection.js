// test-connection.js
const https = require('https');

const firebaseConfig = {
  apiKey: "AIzaSyC0JqOWRdkmFjBoAQN7igM_a2qKysYW2Kk",
  projectId: "noarerp",
};

async function testConnection() {
    console.log(`--- Probando Conexión a Firebase Project: ${firebaseConfig.projectId} ---`);
    
    // Probamos leer la colección 'vendedores' (común en este proyecto)
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/vendedores?key=${firebaseConfig.apiKey}`;
    
    console.log(`Consultando Firestore REST API...`);
    
    https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log("✅ ÉXITO: Conexión establecida correctamente.");
                console.log("El Proyecto ID y la API Key son válidos.");
                // Opcional: mostrar un resumen de lo recibido
                const json = JSON.parse(data);
                if (json.documents) {
                    console.log(`Se encontraron ${json.documents.length} documentos en 'vendedores'.`);
                } else {
                    console.log("La colección 'vendedores' está vacía o no existe aún, pero el acceso fue autorizado.");
                }
            } else {
                console.error(`❌ ERROR: Falló la conexión (Status: ${res.statusCode})`);
                console.error("Respuesta:", data);
                console.log("\nRevisa si:");
                console.log("1. El Proyecto ID 'noarerp' es correcto.");
                console.log("2. La API Key tiene permisos para Firestore.");
                console.log("3. Las reglas de seguridad de Firestore permiten lectura pública o si el recurso está restringido (el error 403 es común si hay reglas estrictas, pero el 200 confirma que el proyecto existe).");
            }
        });
    }).on('error', (err) => {
        console.error("❌ ERROR de Red:", err.message);
    });
}

testConnection();

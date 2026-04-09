const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function checkModels() {
    console.log("=== DIAGNÓSTICO DE CAPACIDADES GOOGLE AI ===");
    try {
        // Probamos listar modelos con v1 y v1beta indirectamente si el SDK lo permite
        // Nota: El SDK de Node usualmente expone un método para listar modelos
        const modelList = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Solo para inicializar
        
        console.log("> Intentando listar modelos disponibles...");
        // En versiones recientes el método puede variar, intentaremos el más común
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        
        if (data.error) {
            console.log(`  [X] Error de API: ${data.error.message}`);
            return;
        }

        console.log("\nModelos disponibles para tu llave:");
        data.models.forEach(m => {
            console.log(`- ${m.name} (Soporta: ${m.supportedGenerationMethods.join(", ")})`);
        });
        
    } catch (e) {
        console.log(`\n  [X] Fallo crítico de diagnóstico: ${e.message}`);
    }
}

checkModels();

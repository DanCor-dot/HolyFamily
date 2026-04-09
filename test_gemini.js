const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
    console.log("Probando modelos de Gemini...");
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"];
    
    for (const modelName of models) {
        try {
            console.log(`\n> Testeando: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hola, esto es una prueba técnica.");
            console.log(`  [OK] Respuesta recibida de ${modelName}`);
        } catch (e) {
            console.log(`  [ERROR] ${modelName}: ${e.message}`);
        }
    }
}

test();

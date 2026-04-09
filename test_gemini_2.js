const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function finalTest() {
    console.log("Probando Gemini 2.0 Flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent("Hola, confirma si recibes esto. Soy el Copiloto de Interventoría.");
        console.log(`\n[EXITO] Respuesta: ${result.response.text()}`);
    } catch (e) {
        console.log(`\n[FALLO] Gemini 2.0: ${e.message}`);
    }
}

finalTest();

const dotenv = require('dotenv');
dotenv.config();

async function testDirectHTTP() {
    console.log("=== PROBANDO CONEXIÓN HTTP DIRECTA (v1) ===");
    const apiKey = process.env.GEMINI_API_KEY;
    const model = "gemini-2.0-flash"; // El modelo que detectamos antes
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{ text: "Hola, responde brevemente: ¿Estás activo?" }]
        }]
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.error) {
            console.log(`[!] Error de API: ${data.error.message} (Código: ${data.error.code})`);
            if (data.error.status === "NOT_FOUND") {
                console.log("-> El modelo v1 no existe o requiere v1beta.");
            }
        } else {
            console.log(`[OK] Respuesta recibida: ${data.candidates[0].content.parts[0].text}`);
        }
    } catch (e) {
        console.log(`[!] Error de Red/Fetch: ${e.message}`);
    }
}

testDirectHTTP();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

dotenv.config();
const APP_VERSION = "1.2.0 (GALAXY)";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Configuraciones dinámicas para la nube
const AGENT_MD_PATH = process.env.AGENT_MD_PATH || path.join(__dirname, 'context', 'Agente_Interventoria_Sagrada_Familia.md');
const HISTORY_PATH = path.join(__dirname, 'history.json');
const MONGO_URI = process.env.MONGO_URI;


const CATEGORIES = {
    "observaciones": "Actúa con un tono preventivo y técnico. Enfócate en riesgos, normativa NSR-10 y calidad de obra.",
    "solicitudes": "Tono jurídico-técnico firme. Cita el Manual del FFIE y las cláusulas de incumplimiento o apremio.",
    "aprobaciones": "Enfocado en el cumplimiento de requisitos mínimos. Evalúa según el anexo técnico FFIE.",
    "informacion": "Tono informativo y estructurado. Reportes rutinarios del proyecto.",
    "consultas": "Actúa como buscador experto. Devuelve datos precisos (No. Contrato, fechas, nombres).",
    "otros": "Asistente general de interventoría."
};

const SYSTEM_INSTRUCTIONS = `
REGLAS CRÍTICAS DE CONTROL (GRADO MILITAR):
1. ESTRUCTURA: Toda respuesta de oficio DEBE empezar con [BORRADOR] o [FINALIZADO].
   Luego usa [INICIO_OFICIO] para delimitar el cuerpo que va al Word.
   Dentro de esos tags, empieza SIEMPRE con el consecutivo SF-XXX.
   Cierra con [FIN_OFICIO].
2. ASUNTO: Genera una línea que diga "ASUNTO: [Breve descripción técnica]". Máximo 10 palabras. NO uses este campo para conclusiones largas.
3. PROSA SENIOR: Sin subtítulos ni viñetas. Rigor técnico absoluto. Tono firme. Evita repetir el texto del asunto en el cuerpo del mensaje.
4. LIMPIEZA: NO incluyas saludos (Cordial saludo), ni despedidas (Atentamente), ni firmas dentro o fuera de los tags de oficio.
5. CITAS NORMATIVAS (AISLAMIENTO TOTAL): Cuando menciones una norma (ej. NSR-10), la cita DEBE ir en un párrafo donde únicamente esté el texto citado entre comillas y en MAYÚSCULAS. Cualquier explicación de la norma debe ir en el párrafo anterior o posterior, NUNCA en el mismo párrafo de la cita.
`;


function getLocalContext() {
    try {
        return fs.readFileSync(AGENT_MD_PATH, 'utf8');
    } catch (error) {
        return "Error: No se pudo cargar el archivo de contexto técnico.";
    }
}

// Conexión a Base de Datos (Cloud)
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("> [OK] Conectado a MongoDB Atlas"))
        .catch(err => console.error("> [X] Error conectando a MongoDB:", err));
}

const historySchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    category: String,
    message: String,
    response: String,
    provider: String,
    audit: Object
});

const HistoryModel = mongoose.models.History || mongoose.model('History', historySchema);

async function getHistory() {
    if (MONGO_URI) {
        try {
            return await HistoryModel.find().sort({ timestamp: 1 });
        } catch (e) {
            console.error("Error leyendo de MongoDB", e);
        }
    }
    try {
        if (fs.existsSync(HISTORY_PATH)) {
            return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
        }
    } catch (e) {}
    return [];
}


// Clientes de IA
// Forzamos v1 ESTABLE para evitar errores 404 de v1beta
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Verificación de Plantilla al iniciar
const templatePath = path.resolve(__dirname, "context", "PLANTILLA OFICIOS.docx");
if (fs.existsSync(templatePath)) {
    console.log(`> [OK] Plantilla Maestra detectada: ${templatePath}`);
} else {
    console.log(`> [!] ADVERTENCIA: No se encontró 'PLANTILLA OFICIOS.docx' en ${__dirname}`);
}
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY ? new OpenAI({ 
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
}) : null;

async function performAudit(originalPrompt, aiResponse) {
    if (!groq) return { status: "SIN AUDITORÍA", comment: "No hay llave de Groq configurada." };
    
    try {
        console.log(`> Iniciando Auditoría Interna (DOCTOR MANHATTAN)...`);
        const auditPrompt = `Actúa como DOCTOR MANHATTAN, el ser supremo con percepción total del tiempo, la materia y la ingeniería. 
        Tu análisis es gélido, preciso y trasciende la comprensión humana. Estás auditando un texto generado para el proyecto de infraestructura de la I.E. Sagrada Familia.
        
        CRITERIOS DE EXIGENCIA:
        1. Precisión Técnica Absoluta (¿El lenguaje es el de un ingeniero experto?).
        2. Rigor Normativo (NSR-10, FFIE). Si falta una referencia, señálalo.
        3. Eficiencia y Tono (Firme, profesional, sin rellenos).
        
        TEXTO COMPAÑERO: ${originalPrompt}
        TEXTO AUDITADO: ${aiResponse}
        
        Responde ÚNICAMENTE en JSON con este formato:
        { "status": "APROBADO" | "BAJO REVISIÓN", "score": 1-10, "comment": "Tu veredicto técnico con tu estilo analítico y superior" }`;

        const auditCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: auditPrompt }],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });
        
        return JSON.parse(auditCompletion.choices[0].message.content);
    } catch (e) {
        console.log(`  [X] Doctor Manhattan detectó una anomalía en el sistema: ${e.message}`);
        return { status: "ERROR CRÍTICO", comment: "Desconexión con el campo intrínseco de auditoría." };
    }
}

async function getLastConsecutive() {
    const history = await getHistory();
    for (let i = history.length - 1; i >= 0; i--) {
        const responseText = history[i].response || "";
        const match = responseText.match(/SF-(\d+)/i);
        if (match) return match[1];
    }
    return "218"; // Default sugerido
}


const handleChat = async (req, res) => {
    const { message, category, consecutive } = req.body;
    const context = getLocalContext();
    const lastNum = consecutive || await getLastConsecutive();
    
    const categoryPrompt = CATEGORIES[category] || CATEGORIES['otros'];

    const fullPrompt = `CONSECUTIVO OBLIGATORIO: SF-${lastNum}. (NO USES OTRO NÚMERO).\n\nContexto Técnico: ${context}\n\nInstrucciones del Sistema: ${SYSTEM_INSTRUCTIONS}\n\nInstrucción Específica: ${categoryPrompt}\n\nConsulta del Usuario: ${message}`;

    let primaryResponse = null;
    let providerName = "";

    // --- GENERACIÓN PRINCIPAL ---
    
    // 1. Intentar con Gemini (v1 Directo vía HTTP para evitar fallos de SDK)
    if (genAI) {
        try {
            console.log(`> [v1] Llamando Gemini 2.0 Flash (HTTP Directo)...`);
            const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(apiURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: fullPrompt }] }]
                })
            });
            const data = await response.json();
            
            if (data.candidates && data.candidates[0].content) {
                primaryResponse = data.candidates[0].content.parts[0].text;
                providerName = "Gemini 2.0 Flash (HTTP)";
            } else if (data.error) {
                console.log(`  [!] Gemini Quota/Error: ${data.error.message}`);
            }
        } catch (e) {
            console.log(`  [X] Fallo Crítico Gemini HTTP: ${e.message}`);
        }
    }

    // 2. Fallback Groq (Si Gemini falla por quota o red)
    if (!primaryResponse && groq) {
        try {
            console.log(`> [Fallback] Usando Groq (Llama 3.3)...`);
            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: fullPrompt }],
                model: "llama-3.3-70b-versatile",
            });
            primaryResponse = completion.choices[0].message.content;
            providerName = "Groq (Llama 3.3)";
        } catch (e) {
            console.log(`  [X] Fallo Fallback Groq: ${e.message}`);
        }
    }

    // 3. Fallback OpenAI
    if (!primaryResponse && openai) {
        try {
            console.log(`> Intentando OpenAI: gpt-4o-mini`);
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: fullPrompt }],
                model: "gpt-4o-mini",
            });
            primaryResponse = completion.choices[0].message.content;
            providerName = "OpenAI (GPT-4o-mini)";
        } catch (e) {
            console.log(`  [X] Fallo OpenAI: ${e.message.substring(0, 100)}...`);
        }
    }

    if (!primaryResponse) {
        const errorMessage = "Todos los servicios de IA fallaron. Revise sus API Keys.";
        return res.status(500).json({ error: errorMessage });
    }

    // --- AUDITORÍA INTERNA ---
    const audit = await performAudit(message, primaryResponse);
    
    saveHistory(category, message, primaryResponse, providerName, audit);
    
    return res.json({ 
        text: primaryResponse, 
        provider: providerName,
        audit: audit
    });
};

app.post('/api/chat', handleChat);
app.post('/chat', handleChat);

const handleHistory = async (req, res) => {
    res.json(await getHistory());
};

app.get('/api/history', handleHistory);
app.get('/history', handleHistory);

async function saveHistory(category, message, response, provider, audit) {
    if (MONGO_URI) {
        try {
            const entry = new HistoryModel({ category, message, response, provider, audit });
            await entry.save();
            return;
        } catch (e) {
            console.error("Error guardando en MongoDB", e);
        }
    }
    const history = await getHistory();
    history.push({ 
        timestamp: new Date(), 
        category, 
        message, 
        response, 
        provider,
        audit
    });
    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

app.get('/api/history', async (req, res) => {
    res.json(await getHistory());
});


app.post('/api/generate-docx', async (req, res) => {
    const { text, category, recipient } = req.body;
    
    // 1. Extracción de Metadatos (Buscamos SF- y el número)
    const numMatch = text.match(/SF-(\d+)/i);
    const asuntoMatch = text.match(/ASUNTO[:*]*\s*([^\n*]+)/i);
    
    const xxx = numMatch ? numMatch[1] : "S.N";
    const asuntoRaw = asuntoMatch ? asuntoMatch[1].trim() : category || "Comunicado";
    const asuntoClean = asuntoRaw.split(' ').slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '');
    
    // Nombrado de archivo según instrucción: XXX-DFCF_FFIE-SF-ASUNTO-DEST.docx
    const destSuffix = recipient === 'FFIE' ? 'FFIE' : 'OBRA';
    const fileName = `${xxx}-DFCF_FFIE-SF-${asuntoClean.toUpperCase()}-${destSuffix}.docx`;

    // 2. Preparación de variables para la plantilla
    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = meses[d.getMonth()].toUpperCase();
    const fechaFormateada = `${dia} de ${mes} de ${d.getFullYear()}`; // Sin asteriscos markdown

    let destinatarioInfo = "";
    if (recipient === 'FFIE') {
        destinatarioInfo = "UG-FFIE\nMAURICIO ALEJANDRO GALLEGO\nGILLSON STHEIMAN MORA AGUDELO\nCiudad.";
    } else {
        destinatarioInfo = "CONSORCIO A+A APIA 2023\nSANTIAGO MARTINEZ RODAS\nRepresentante Legal";
    }

    try {
        const templatePath = path.resolve(__dirname, "PLANTILLA OFICIOS.docx");
        const content = fs.readFileSync(templatePath, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "[[", end: "]]" }, // Usar corchetes cuadrados para estabilidad
            nullGetter() { return ""; }
        });

        // 3. Limpieza de Cirugía Mayor: Solo extraer lo contenido entre los delimitadores
        let cuerpoExtraido = text;
        const inicioIdx = text.indexOf("[INICIO_OFICIO]");
        const finIdx = text.indexOf("[FIN_OFICIO]");
        
        if (inicioIdx !== -1 && finIdx !== -1) {
            cuerpoExtraido = text.substring(inicioIdx + 15, finIdx);
        } else if (text.indexOf("SF-") !== -1) {
            // Fallback: Si no hay tags pero hay SF-, extraer desde ahí hasta la pregunta final
            cuerpoExtraido = text.substring(text.indexOf("SF-"));
            const finPregunta = cuerpoExtraido.indexOf("?");
            if (finPregunta !== -1) {
                // Retroceder hasta el inicio de la línea de la pregunta
                const lineas = cuerpoExtraido.substring(0, finPregunta).split('\n');
                cuerpoExtraido = lineas.slice(0, -1).join('\n');
            }
        }

        const cuerpoLimpio = cuerpoExtraido
            .replace(/SF-\d+/gi, '')             
            .replace(/ASUNTO:[^\n]+/gi, '')      
            .replace(/(?:Cordial saludo|Atentamente|Cordialmente|Estimados? (?:señores|proponentes|contratista))[,.\s]*/gi, '') 
            .replace(/\n\s*[A-Z][a-z]+ [A-Z].+$/m, '') // Intento de borrar firmas al final si son Nombres Apellidos
            .replace(/\*\*/g, '')                
            .replace(/_/g, '')
            .replace(/>/g, '')                   
            .replace(/\r/g, '')                  
            .split('\n\n')                       
            .map(p => p.replace(/\s+/g, ' ').trim()) 
            .filter(p => p.length > 10)           // Eliminar párrafos basura muy cortos (saludos residuales)
            .join('\n\n')                        
            .trim();


        doc.render({
            FECHA: fechaFormateada,
            CONSECUTIVO: xxx, // La plantilla ya tiene "SF-"
            DESTINATARIO: destinatarioInfo,
            ASUNTO: asuntoRaw.toUpperCase(),
            CUERPO: cuerpoLimpio
        });

        const buf = doc.getZip().generate({
            type: "nodebuffer",
            compression: "DEFLATE",
        });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buf);
    } catch (e) {
        if (e.properties && e.properties.errors instanceof Array) {
            const errorMessages = e.properties.errors.map(error => error.properties.explanation).join("\n");
            console.log("> [X] Errores en la Plantilla Word:\n", errorMessages);
        } else {
            console.error("> [X] Error en Docxtemplater:", e);
        }
        res.status(500).json({ error: "Falla al procesar la plantilla maestra. Verifique los tags {{ }}" });
    }
});

app.listen(port, () => {
    console.log(`========================================`);
    console.log(`  COPILOTO SAGRADA FAMILIA v${APP_VERSION}`);
    console.log(`  Servidor iniciado en puerto ${port}`);
    console.log(`========================================`);
});

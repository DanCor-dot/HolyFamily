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

// Configuraciones dinámicas para la nube (Vercel compatible)
// En Vercel, process.cwd() apunta a la raíz del proyecto.
// Agregamos redundancia para encontrar los archivos tanto localmente como en la nube.
const getAssetPath = (relativeFilePath) => {
    const rootPath = path.join(process.cwd(), relativeFilePath);
    const localPath = path.join(__dirname, '..', relativeFilePath);
    if (fs.existsSync(rootPath)) return rootPath;
    return localPath;
};

const AGENT_MD_PATH = process.env.AGENT_MD_PATH || getAssetPath('context/Agente_Interventoria_Sagrada_Familia.md');
const HISTORY_PATH = getAssetPath('history.json');
const MONGO_URI = process.env.MONGO_URI;


const CATEGORIES = {
    "observaciones": "Actúa con un tono preventivo y técnico. Enfócate en riesgos, normativa NSR-10 y calidad de obra.",
    "solicitudes": "Tono jurídico-técnico firme. Cita el Manual del FFIE y las cláusulas de incumplimiento o apremio.",
    "aprobaciones": "Enfocado en el cumplimiento de requisitos mínimos. Evalúa según el anexo técnico FFIE.",
    "informacion": "Tono informativo y estructurado. Reportes rutinarios del proyecto.",
    "consultas": "Asistente experto en el contrato e información técnica.",
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
        if (fs.existsSync(AGENT_MD_PATH)) {
            return fs.readFileSync(AGENT_MD_PATH, 'utf8');
        }
        return "Error: No se encontró el archivo de contexto técnico en " + AGENT_MD_PATH;
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
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY ? new OpenAI({ 
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1"
}) : null;

// Verificación de Plantilla al iniciar
const templatePath = getAssetPath("PLANTILLA OFICIOS.docx");
if (fs.existsSync(templatePath)) {
    console.log(`> [OK] Plantilla Maestra detectada: ${templatePath}`);
} else {
    console.log(`> [!] ADVERTENCIA: No se encontró 'PLANTILLA OFICIOS.docx' en locales ni root. Buscando en: ${templatePath}`);
}

async function performAudit(originalPrompt, aiResponse) {
    if (!groq) return { status: "SIN AUDITORÍA", comment: "No hay llave de Groq configurada." };
    
    try {
        const auditPrompt = `Actúa como DOCTOR MANHATTAN. Estás auditando un texto para la I.E. Sagrada Familia.
        CRITERIOS: 1. Precisión Técnica. 2. Rigor Normativo. 3. Tono Firme.
        TEXTO COMPAÑERO: ${originalPrompt}
        TEXTO AUDITADO: ${aiResponse}
        Responde ÚNICAMENTE en JSON: { "status": "APROBADO" | "BAJO REVISIÓN", "score": 1-10, "comment": "..." }`;

        const auditCompletion = await groq.chat.completions.create({
            messages: [{ role: "user", content: auditPrompt }],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });
        
        return JSON.parse(auditCompletion.choices[0].message.content);
    } catch (e) {
        return { status: "ERROR", comment: "Desconexión auditiva: " + e.message };
    }
}

async function getLastConsecutive() {
    const history = await getHistory();
    for (let i = history.length - 1; i >= 0; i--) {
        const responseText = history[i].response || "";
        const match = responseText.match(/SF-(\d+)/i);
        if (match) return match[1];
    }
    return "218";
}


const handleChat = async (req, res) => {
    const { message, category, consecutive } = req.body;
    const context = getLocalContext();
    const lastNum = consecutive || await getLastConsecutive();
    
    const categoryPrompt = CATEGORIES[category] || CATEGORIES['otros'];

    const fullPrompt = `CONSECUTIVO OBLIGATORIO: SF-${lastNum}. (NO USES OTRO NÚMERO).\n\nContexto Técnico: ${context}\n\nInstrucciones del Sistema: ${SYSTEM_INSTRUCTIONS}\n\nInstrucción Específica: ${categoryPrompt}\n\nConsulta del Usuario: ${message}`;

    let primaryResponse = null;
    let providerName = "";

    // 1. Gemini
    if (genAI) {
        try {
            const apiURL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const response = await fetch(apiURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] })
            });
            const data = await response.json();
            if (data.candidates) {
                primaryResponse = data.candidates[0].content.parts[0].text;
                providerName = "Gemini 2.0 Flash";
            }
        } catch (e) {}
    }

    // 2. Fallback Groq
    if (!primaryResponse && groq) {
        try {
            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: fullPrompt }],
                model: "llama-3.3-70b-versatile",
            });
            primaryResponse = completion.choices[0].message.content;
            providerName = "Groq (Llama 3.3)";
        } catch (e) {}
    }

    if (!primaryResponse) {
        return res.status(500).json({ error: "Todos los servicios de IA fallaron." });
    }

    const audit = await performAudit(message, primaryResponse);
    saveHistory(category, message, primaryResponse, providerName, audit);
    
    return res.json({ text: primaryResponse, provider: providerName, audit: audit });
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
        } catch (e) {}
    }
}

app.get('/api/history', async (req, res) => {
    res.json(await getHistory());
});


app.post('/api/generate-docx', async (req, res) => {
    const { text, category, recipient } = req.body;
    
    const numMatch = text.match(/SF-(\d+)/i);
    const asuntoMatch = text.match(/ASUNTO[:*]*\s*([^\n*]+)/i);
    
    const xxx = numMatch ? numMatch[1] : "S.N";
    const asuntoRaw = asuntoMatch ? asuntoMatch[1].trim() : category || "Comunicado";
    const asuntoClean = asuntoRaw.split(' ').slice(0, 3).join('_').replace(/[^a-zA-Z0-9_]/g, '');
    
    const destSuffix = recipient === 'FFIE' ? 'FFIE' : 'OBRA';
    const fileName = `${xxx}-DFCF_FFIE-SF-${asuntoClean.toUpperCase()}-${destSuffix}.docx`;

    const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const d = new Date();
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = meses[d.getMonth()].toUpperCase();
    const fechaFormateada = `${dia} de ${mes} de ${d.getFullYear()}`;

    let destinatarioInfo = (recipient === 'FFIE') 
        ? "UG-FFIE\nMAURICIO ALEJANDRO GALLEGO\nGILLSON STHEIMAN MORA AGUDELO\nCiudad."
        : "CONSORCIO A+A APIA 2023\nSANTIAGO MARTINEZ RODAS\nRepresentante Legal";

    try {
        const templatePath = getAssetPath("PLANTILLA OFICIOS.docx");
        const content = fs.readFileSync(templatePath, "binary");
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: "[[", end: "]]" },
            nullGetter() { return ""; }
        });

        let cuerpoExtraido = text;
        const inicioIdx = text.indexOf("[INICIO_OFICIO]");
        const finIdx = text.indexOf("[FIN_OFICIO]");
        
        if (inicioIdx !== -1 && finIdx !== -1) {
            cuerpoExtraido = text.substring(inicioIdx + 15, finIdx);
        }

        const cuerpoLimpio = cuerpoExtraido
            .replace(/SF-\d+/gi, '')             
            .replace(/ASUNTO:[^\n]+/gi, '')      
            .replace(/(?:Cordial saludo|Atentamente|Cordialmente|Estimados? (?:señores|proponentes|contratista))[,.\s]*/gi, '') 
            .replace(/\*\*/g, '')                
            .replace(/_/g, '')
            .replace(/>/g, '')                   
            .replace(/\r/g, '')                  
            .split('\n\n')                       
            .map(p => p.replace(/\s+/g, ' ').trim()) 
            .filter(p => p.length > 10)
            .join('\n\n')                        
            .trim();

        doc.render({
            FECHA: fechaFormateada,
            CONSECUTIVO: xxx,
            DESTINATARIO: destinatarioInfo,
            ASUNTO: asuntoRaw.toUpperCase(),
            CUERPO: cuerpoLimpio
        });

        const buf = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buf);
    } catch (e) {
        res.status(500).json({ error: "Falla al procesar la plantilla." });
    }
});

// Manejador para la raíz para evitar 404
app.get('/api', (req, res) => {
    res.json({ status: "API Online", version: APP_VERSION });
});

// Solo levantar el servidor si no estamos en Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`> Servidor local iniciado en puerto ${port}`);
    });
}

// Exportar la app para Vercel
module.exports = app;

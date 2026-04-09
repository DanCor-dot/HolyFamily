const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fs = require("fs");
const path = require("path");

const templatePath = path.resolve(__dirname, "PLANTILLA OFICIOS.docx");

try {
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    
    // Forzamos un render vacío para capturar los tags que fallan
    try {
        doc.render({});
    } catch (e) {
        if (e.properties && e.properties.errors instanceof Array) {
            console.log("\n--- DIAGNÓSTICO DE TAGS ENCONTRADOS ---");
            e.properties.errors.forEach(err => {
                console.log(`- Problema: ${err.properties.explanation}`);
                if (err.properties.xtag) {
                    console.log(`  Tag afectado: {{${err.properties.xtag}}}`);
                }
            });
        }
    }
} catch (e) {
    console.log("Error leyendo el archivo:", e.message);
}

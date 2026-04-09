import os

class ContextManager:
    def __init__(self, agent_md_path):
        self.agent_md_path = agent_md_path
        self.context_data = self._load_context()
        self.categories = {
            "observaciones": "Actúa como un experto en control técnico y desviaciones. Enfócate en riesgos, normativa NSR-10 y calidad de obra.",
            "solicitudes": "Actúa con un tono jurídico-técnico firme. Cita el Manual del FFIE y las cláusulas de incumplimiento o apremio.",
            "aprobaciones": "Enfocado en el cumplimiento de requisitos mínimos. Evalúa según el anexo técnico y las especificaciones FFIE.",
            "informacion": "Tono informativo y estructurado. Sigue los formatos oficiales de reporte del proyecto.",
            "consultas": "Actúa como un buscador experto en el contrato. Devuelve datos precisos como números de contrato, fechas y nombres.",
            "otros": "Asistente general de interventoría con acceso al contexto del contrato."
        }

    def _load_context(self):
        try:
            with open(self.agent_md_path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            return f"Error cargando contexto: {str(e)}"

    def get_system_prompt(self, category):
        base_role = self.context_data
        category_instruction = self.categories.get(category.lower(), self.categories["otros"])
        
        prompt = f"""
{base_role}

# INSTRUCCIÓN ESPECÍFICA PARA ESTA TAREA:
{category_instruction}

IMPORTANTE: Responde siempre en español. Mantén el tono profesional definido en el rol.
Si es una consulta, busca el dato exacto en el texto superior.
"""
        return prompt

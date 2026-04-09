import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  AlertTriangle, 
  FileText, 
  CheckCircle2, 
  Info, 
  Search, 
  MessageSquare, 
  Send,
  History,
  LayoutDashboard,
  HardHat
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// En producción (Vercel) usamos rutas relativas obligatoriamente.
const API_BASE_URL = ''; 


const CATEGORIES = [
  { id: 'observaciones', label: 'Observaciones', icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'solicitudes', label: 'Solicitudes', icon: FileText, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'aprobaciones', label: 'Aprobaciones', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'informacion', label: 'Información', icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'consultas', label: 'Consultas', icon: Search, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { id: 'otros', label: 'Otros', icon: MessageSquare, color: 'text-slate-400', bg: 'bg-slate-400/10' },
];

function App() {
  const [activeTab, setActiveTab] = useState('observaciones');
  const [recipient, setRecipient] = useState('OBRA'); // 'OBRA' o 'FFIE'
  const [consecutive, setConsecutive] = useState('156');
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat]);

  const fetchHistory = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/api/history`);
      setHistory(resp.data);

    } catch (e) {
      console.error("Error cargando historial");
    }
  };

  const handleSend = async () => {
    if (!message.trim() || loading) return;
    
    const userMsg = { role: 'user', content: message, category: activeTab };
    setChat(prev => [...prev, userMsg]);
    setMessage('');
    setLoading(true);

    try {
      const resp = await axios.post(`${API_BASE_URL}/api/chat`, {
        message,
        category: activeTab,
        recipient: recipient,
        consecutive: consecutive
      });

      
      const aiMsg = { 
        role: 'ai', 
        content: resp.data.text, 
        category: activeTab,
        provider: resp.data.provider,
        audit: resp.data.audit
      };
      setChat(prev => [...prev, aiMsg]);
      fetchHistory();
    } catch (e) {
      console.error("Full error object:", e);
      const errorMsg = e.response?.data?.error || e.message || "Error de conexión con el servidor.";
      setChat(prev => [...prev, { 
        role: 'error', 
        content: `⚠️ Error del Sistema: ${errorMsg}\n\nSugerencia: Verifique que el servidor (terminal) esté corriendo y que tenga una API Key válida con cuota disponible.` 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDocx = async (text, category) => {
    try {
      const response = await axios({
        url: `${API_BASE_URL}/api/generate-docx`,
        method: 'POST',
        responseType: 'blob',
        data: { text, category, recipient: recipient }
      });

      
      const fileName = response.headers['content-disposition']?.split('filename=')[1] || 'comunicado.docx';
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      console.error("Error descargando el documento", e);
      alert("No se pudo generar el documento Word.");
    }
  };

  return (
    <div className="flex h-screen w-screen bg-[#0B0E14]">
      {/* Sidebar Navigation */}
      <div className="w-20 lg:w-64 border-r border-white/5 flex flex-col items-center lg:items-start py-6 px-4 space-y-8 glass">
        <div className="flex items-center space-x-3 px-2">
          <HardHat className="text-safety-orange w-8 h-8" />
          <div className="hidden lg:block">
            <span className="block font-bold text-lg tracking-tight leading-none">ANTI-COPILOTO</span>
            <span className="block text-[10px] text-safety-orange font-mono font-bold">v1.2.0 (GALAXY)</span>
          </div>
        </div>
        
        <nav className="flex-1 w-full space-y-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveTab(cat.id)}
              className={`w-full flex items-center p-3 rounded-xl transition-all duration-200 group ${
                activeTab === cat.id ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'
              }`}
            >
              <cat.icon className={`w-6 h-6 ${activeTab === cat.id ? cat.color : 'group-hover:' + cat.color}`} />
              <span className="hidden lg:block ml-3 font-medium text-sm">{cat.label}</span>
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-white/5 w-full">
           <button className="flex items-center space-x-3 text-slate-500 hover:text-white px-2">
              <History className="w-5 h-5" />
              <span className="hidden lg:block text-sm">Historial</span>
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 glass z-10">
          <div className="flex items-center space-x-2">
             <LayoutDashboard className="w-5 h-5 text-safety-orange" />
             <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                Dashboard / {CATEGORIES.find(c => c.id === activeTab)?.label}
             </h2>
          </div>
          <div className="flex items-center space-x-4">
             <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-bold tracking-widest uppercase">CONEXIÓN OK | GREEN LANTERN</span>
             </div>
          </div>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide"
        >
          <AnimatePresence>
            {chat.length === 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full text-center space-y-4"
              >
                <div className={`p-6 rounded-full ${CATEGORIES.find(c => c.id === activeTab)?.bg}`}>
                   {React.createElement(CATEGORIES.find(c => c.id === activeTab)?.icon, { className: `w-12 h-12 ${CATEGORIES.find(c => c.id === activeTab)?.color}` })}
                </div>
                <div>
                  <h3 className="text-xl font-bold">Generar comunicado para {CATEGORIES.find(c => c.id === activeTab)?.label}</h3>
                  <p className="text-slate-500 text-sm max-w-md mx-auto">
                    El sistema aplicará el criterio técnico civil y el contexto contractual del proyecto IE Sagrada Familia automáticamente.
                  </p>
                </div>
              </motion.div>
            )}
            {chat.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-2xl p-4 rounded-2xl relative ${
                  msg.role === 'user' 
                    ? 'bg-safety-orange text-white rounded-tr-none' 
                    : msg.role === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-white/5 border border-white/10 text-slate-200 rounded-tl-none'
                }`}>
                   <p className="text-sm leading-relaxed whitespace-pre-wrap mb-2">
                    {msg.content
                      .replace(/\[BORRADOR\]/gi, '')
                      .replace(/\[FINALIZADO\]/gi, '')
                      .replace(/\[INICIO_OFICIO\]/gi, '')
                      .replace(/\[FIN_OFICIO\]/gi, '')
                      .trim()}
                  </p>
                  
                  {msg.content.includes('[BORRADOR]') && (
                    <div className="absolute top-2 right-4">
                      <span className="text-[9px] font-bold bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20">BORRADOR PENDIENTE</span>
                    </div>
                  )}

                  {msg.content.includes('[FINALIZADO]') && (
                    <div className="absolute top-2 right-4">
                      <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full border border-emerald-500/20">VERSIÓN APROBADA</span>
                    </div>
                  )}
                  
                  {msg.role === 'ai' && msg.audit && (
                    <div className={`mt-3 pt-3 border-t border-white/5 flex items-start space-x-2 ${msg.audit.status === 'APROBADO' ? 'text-emerald-500/80' : 'text-amber-500/80'}`}>
                      {msg.audit.status === 'APROBADO' ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400" />}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider">DOCTOR MANHATTAN (SUPREMO)</span>
                          <span className="text-[10px] font-mono bg-white/5 px-1.5 rounded">Genio: {msg.audit.score}/10</span>
                        </div>
                        <p className="text-[11px] italic mt-1">{msg.audit.comment}</p>
                      </div>
                    </div>
                  )}
                  
                  {msg.role === 'ai' && (msg.content.toUpperCase().includes('BORRADOR') || msg.content.toUpperCase().includes('FINALIZADO')) && (
                    <div className="mt-4 flex justify-end">
                      <button 
                        onClick={() => handleDownloadDocx(msg.content, msg.category)}
                        className={`flex items-center space-x-2 text-[10px] transition-all px-3 py-1.5 rounded-lg border group ${
                          msg.content.toUpperCase().includes('FINALIZADO') 
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-lg shadow-emerald-900/20' 
                            : 'bg-white/10 hover:bg-white/20 text-slate-300 border-white/10'
                        }`}
                      >
                        <FileText className={`w-3.5 h-3.5 ${msg.content.toUpperCase().includes('FINALIZADO') ? 'text-white' : 'group-hover:text-safety-orange'}`} />
                        <span className="font-bold">
                          {msg.content.toUpperCase().includes('FINALIZADO') ? 'DESCARGAR OFICIO FINAL' : 'EXPORTAR BORRADOR'}
                        </span>
                      </button>
                    </div>
                  )}
                  
                  {msg.role === 'ai' && msg.provider && (
                    <div className="absolute -bottom-5 left-0 text-[10px] text-slate-600 font-mono">
                      Powered by {msg.provider}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Input Area */}
        <div className="p-8 space-y-4">
           {/* Recipient Selector */}
           <div className="flex space-x-2 mb-2">
              <button 
                onClick={() => setRecipient('OBRA')}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${recipient === 'OBRA' ? 'bg-safety-orange text-white' : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'}`}
              >
                DESTINATARIO: OBRA
              </button>
              <button 
                onClick={() => setRecipient('FFIE')}
                className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${recipient === 'FFIE' ? 'bg-[#1D4ED8] text-white' : 'bg-white/5 text-slate-500 border border-white/5 hover:bg-white/10'}`}
              >
                DESTINATARIO: FFIE
              </button>
              
              <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">SF-</span>
                <input 
                  type="text" 
                  value={consecutive}
                  onChange={(e) => setConsecutive(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-[10px] font-bold text-safety-orange w-12 p-0 text-center"
                  placeholder="218"
                />
              </div>
           </div>

           <div className="relative glass rounded-2xl border border-white/10 shadow-2xl p-1">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                placeholder={`Describa la ${activeTab}...`}
                className="w-full bg-transparent border-none focus:ring-0 text-slate-300 p-4 min-h-[50px] max-h-[200px] resize-none pr-16"
              />
              <button 
                onClick={handleSend}
                disabled={loading}
                className="absolute right-4 bottom-4 p-2 bg-safety-orange hover:bg-orange-600 rounded-lg transition-colors shadow-lg"
              >
                <Send className="w-5 h-5 text-white" />
              </button>
           </div>
           <p className="text-[10px] text-center text-slate-600 mt-4 uppercase tracking-[0.2em]">
             Agente IA Especializado | I.E. Sagrada Familia | Apía, Risaralda
           </p>
        </div>
      </main>
    </div>
  );
}

export default App;

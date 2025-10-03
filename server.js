// server.js - Versión Final y Corregida (3 de Octubre)

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const PIXEL_ID = process.env.PIXEL_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function isQualified(payload) {
  console.log("Recibido para calificar:", payload); 

  // --- CAMBIO FINAL: Nombres de campo corregidos para que coincidan EXACTAMENTE con los datos de GHL ---
  const diagnostico_data = payload['1 ¿Has sido diagnosticada con cáncer de mama en etapa 3 o 4 y estás buscando un camino clínico real que te ayude a reducir los efectos de la enfermedad en los próximos 45 días?'] || '';
  const compromiso_data = payload['2. ¿Estás dispuesta a comprometerte con un proceso integral que combine ciencia, nutrición celular y transformación emocional, y que requiere tu participación activa durante al menos 45 días?'] || '';
  const inversion_data = payload['3. En este momento de tu vida, ¿qué nivel de inversión te sería posible destinar a un programa de sanación integral y personalizado, con acompañamiento profesional y tecnología clínica avanzada? '] || ''; // Nota: el espacio al final es intencional
  const costosMedicamentos_data = payload['4 . Productos y medicamentos'] || ''; // Nota: el espacio antes del punto es intencional
  
  // --- CAMBIO FINAL: Lógica añadida para manejar respuestas que son texto o listas ---
  const diagnostico = Array.isArray(diagnostico_data) ? diagnostico_data[0] : diagnostico_data;
  const compromiso = Array.isArray(compromiso_data) ? compromiso_data[0] : compromiso_data;
  const inversion = Array.isArray(inversion_data) ? inversion_data[0] : inversion_data;
  const costosMedicamentos = Array.isArray(costosMedicamentos_data) ? costosMedicamentos_data[0] : costosMedicamentos_data;

  let score = 0;

  if (diagnostico === 'Sí, y quiero resultados reales') {
    score += 2;
  }

  if (compromiso === 'Sí, estoy lista y comprometida') {
    score += 3;
  }

  // --- CAMBIO FINAL: Textos de respuestas corregidos para coincidir con los datos reales ('+ de 500$ al mes') ---
  if (inversion === '+ de 500$ al mes') {
    score += 4;
  }
  if (costosMedicamentos === '+ de 500$ al mes') {
    score += 4;
  }
  
  const UMBRAL_CALIFICACION = 7; 
  
  console.log(`Puntaje final: ${score} (Umbral: ${UMBRAL_CALIFICACION})`);

  return score >= UMBRAL_CALIFICACION;
}

function sha256(value) {
    return value ? crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex') : null;
}

app.post('/meta/conversion', async (req, res) => {
  try {
    const data = req.body;
    const qualified = isQualified(data);

    if (!qualified) {
      console.log('Lead no calificado. No se envía a Meta.');
      return res.json({ status: 'success', message: 'Lead did not qualify.' });
    }
    
    console.log('Lead CALIFICADO. Enviando evento a Meta CAPI...');

    const event_time = Math.floor(Date.now() / 1000);
    const user_agent = data.user_agent || req.headers['user-agent'] || (data.attributionSource && data.attributionSource.userAgent);
    const fbp = (data.attributionSource && data.attributionSource.fbp) || null;
    const fbc = (data.fbc) || null; // GHL a veces lo envía en el nivel superior

    const payload = {
      data: [{
        event_name: 'LeadQualified',
        event_time,
        event_id: `gohighlevel_${Date.now()}`,
        action_source: 'website',
        user_data: {
          em: [sha256(data.email)],
          ph: data.phone ? [sha256(data.phone)] : undefined,
          fn: data.first_name ? [sha256(data.first_name)] : undefined,
          ln: data.last_name ? [sha256(data.last_name)] : undefined,
          client_user_agent: user_agent,
          fbc: fbc,
          fbp: fbp,
        },
        custom_data: { value: 1, currency: 'USD' }
      }]
    };

    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const metaResponse = await response.json();
    console.log('Respuesta de Meta API:', metaResponse);
    return res.json({ status: 'success', meta_response: metaResponse });

  } catch (err) {
    console.error('Error procesando el webhook:', err);
    return res.status(500).json({ status: 'error', message: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando webhooks de GHL en el puerto ${PORT}`));

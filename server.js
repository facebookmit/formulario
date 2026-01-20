// server.js - Versión Final (Corrección Ortográfica "mensuales")

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

const PIXEL_ID = process.env.PIXEL_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function isQualified(payload) {
  console.log("Recibido para calificar:", payload); 

  // --- DEFINICIÓN DE LAS PREGUNTAS (KEYS) ---
  // IMPORTANTE: Estos textos deben coincidir CARÁCTER POR CARÁCTER con el "Field Label" en GoHighLevel.
  
  const KEY_DIAGNOSTICO = '1 ¿Has sido diagnosticada con cáncer de mama o tienes a un ser querido que quieres ayudar, y estás buscando un camino clínico real que te ayude a reducir los efectos de la enfermedad en los próximos 45 días? *';
  
  // CORREGIDO: Ahora dice "mensuales" correctamente
  const KEY_COSTOS = '3. Costos médicos mensuales *'; 
  
  const KEY_PRODUCTOS = '4 . Productos y medicamentos *'; // Nota: Mantenemos el espacio antes del punto si así sigue en el formulario

  // Extraer datos del payload
  const diagnostico_raw = payload[KEY_DIAGNOSTICO] || '';
  const costos_raw = payload[KEY_COSTOS] || '';
  const productos_raw = payload[KEY_PRODUCTOS] || '';
  
  // Normalizar (si viene como array, tomamos el primer elemento, si no, el string)
  const respuestaDiagnostico = Array.isArray(diagnostico_raw) ? diagnostico_raw[0] : diagnostico_raw;
  const respuestaCostos = Array.isArray(costos_raw) ? costos_raw[0] : costos_raw;
  const respuestaProductos = Array.isArray(productos_raw) ? productos_raw[0] : productos_raw;

  console.log(`Respuestas extraídas: 
    - Dx: ${respuestaDiagnostico} 
    - Costos: ${respuestaCostos} 
    - Productos: ${respuestaProductos}`);

  // --- LÓGICA DE CALIFICACIÓN (OR) ---
  // Si cumple AL MENOS UNA de las condiciones, retorna TRUE.

  // 1. Condición: Pregunta 1 es "Sí, y quiero resultados reales"
  if (respuestaDiagnostico === 'Sí, y quiero resultados reales') {
    console.log('Lead Calificado por: Respuesta Diagnóstico');
    return true;
  }

  // 2. Condición: Pregunta 3 es "Más de 500$ al mes"
  if (respuestaCostos === 'Más de 500$ al mes' || respuestaCostos === '+ de 500$ al mes') {
    console.log('Lead Calificado por: Costos Médicos Altos');
    return true;
  }

  // 3. Condición: Pregunta 4 es "Más de 500$ al mes"
  if (respuestaProductos === 'Más de 500$ al mes' || respuestaProductos === '+ de 500$ al mes') {
    console.log('Lead Calificado por: Gastos en Productos Altos');
    return true;
  }

  // Si no cumple ninguna
  console.log('Lead NO cumple con ninguna condición de segmentación.');
  return false;
}

function sha256(value) {
    return value ? crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex') : null;
}

app.post('/meta/conversion', async (req, res) => {
  try {
    const data = req.body;
    
    // Verificar calificación con la nueva lógica
    const qualified = isQualified(data);

    if (!qualified) {
      console.log('Lead no calificado. No se envía a Meta.');
      return res.json({ status: 'success', message: 'Lead did not qualify.' });
    }
    
    console.log('Lead CALIFICADO. Enviando evento a Meta CAPI...');

    const event_time = Math.floor(Date.now() / 1000);
    const user_agent = data.user_agent || req.headers['user-agent'] || (data.attributionSource && data.attributionSource.userAgent);
    const fbp = (data.attributionSource && data.attributionSource.fbp) || null;
    const fbc = (data.fbc) || null; 

    const payload = {
      data: [{
        event_name: 'LeadQualified',
        event_time,
        event_id: `ghl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
        custom_data: { 
            value: 10, 
            currency: 'USD',
            segmento: 'calificado_high_ticket'
        }
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

// server.js - Versión Final para GoHighLevel con tus campos específicos

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

const app = express();
app.use(express.json());

// Estas variables se configurarán en Render (Environment Variables)
const PIXEL_ID = process.env.PIXEL_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function isQualified(payload) {
  console.log("Recibido para calificar:", payload);

  // --- Nombres de campo extraídos de tus variables de GHL ---
  const diagnostico = payload['1_has_sido_diagnosticada_con_cncer_de_mama_en_etapa_3_o_4_y_ests_buscando_un_camino_clnico_real_que_te_ayude_a_reducir_los_efectos_de_la_enfermedad_en_los_prximos_45_das'] || '';
  const compromiso = payload['2_ests_dispuesta_a_comprometerte_con_un_proceso_integral_que_combine_ciencia_nutricin_celular_y_transformacin_emocional_y_que_requiere_tu_participacin_activa_durante_al_menos_45_das'] || '';
  const inversion = payload['3_en_este_momento_de_tu_vida_qu_nivel_de_inversin_te_sera_posible_destinar_a_un_programa_de_sanacin_integral_y_personalizado_con_acompaamiento_profesional_y_tecnologa_clnica_avanzada'] || '';
  const costosMedicamentos = payload['4_productos_y_medicamentos'] || '';
  const expectativaResultados = payload['5_en_cuanto_tiempo_esperas_resultados_medibles_de_mejoras'] || '';
  // -----------------------------------------------------------

  // FILTRO #1: Diagnóstico Correcto (Eliminación inmediata)
  if (diagnostico !== 'Sí, y quiero resultados reales') {
    console.log("Descalificado: Diagnóstico no coincide.");
    return false;
  }

  let score = 0;

  // FILTRO #2: Asignación de Puntos
  if (compromiso === 'Sí, estoy lista y comprometida') {
    score += 3;
  }

  // Capacidad de Inversión. NOTA: Ajusta el texto si tus respuestas son diferentes.
  // Asumimos que las respuestas son como las de las capturas (+ de 500$ al mes).
  if (inversion === '+ de 500$ al mes') { // <-- AJUSTA SI ES NECESARIO
    score += 2;
  }
  if (costosMedicamentos === '+ de 500$ al mes') {
    score += 2;
  }

  // Urgencia y Expectativas
  if (expectativaResultados === 'Menos de 45 días') {
    score += 2;
  } else if (expectativaResultados === 'De 45 a 90 días') {
    score += 1;
  }

  // DECISIÓN FINAL
  const UMBRAL_CALIFICACION = 5;
  console.log(`Puntaje final: ${score} (Umbral: ${UMBRAL_CALIFICACION})`);
  return score >= UMBRAL_CALIFICACION;
}

function sha256(value) {
    return value ? crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex') : null;
}

// Endpoint que recibe el Webhook de GoHighLevel
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
    const user_agent = data.user_agent || req.headers['user-agent'];
    const fbp = data.fbp || null;
    const fbc = data.fbc || null;

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

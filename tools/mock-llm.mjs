// Mock OpenAI-compatible LLM for tests and demos (no network, no real key needed).
//   POST /v1/chat/completions  -> canned strict-JSON cards (vocab or biology, depending on the prompt)
//   GET  /__last               -> summary of the last request (model, #images, prompt excerpt) – never the key
// Env: MOCK_LLM_PORT (8099), MOCK_LLM_KEY (expected Bearer key, default sk-mock-local-test-key)
import http from 'node:http';
const PORT = +(process.env.MOCK_LLM_PORT || 8099);
const KEY = process.env.MOCK_LLM_KEY || 'sk-mock-local-test-key';
let last = null, count = 0;

const VOCAB = {
  language: 'en', subject: 'Languages', title: 'Unit 3 – At school',
  cards: [
    { type: 'pair', front: 'the teacher', back: 'die Lehrerin / der Lehrer', example: 'Our teacher is very friendly.' },
    { type: 'pair', front: 'the pupil', back: 'der Schüler', example: '' },
    { type: 'pair', front: 'to explain', back: 'erklären', example: 'Can you explain this word?' },
    { type: 'pair', front: 'difficult', back: 'schwierig', example: '' },
    { type: 'pair', front: 'the timetable', back: 'der Stundenplan', example: '' },
    { type: 'pair', front: 'to be late', back: 'zu spät kommen', example: '' },
    { type: 'pair', front: 'the break', back: 'die Pause', example: '' },
    { type: 'pair', front: 'the homework', back: 'die Hausaufgaben (Pl.)', example: '' },
    { type: 'pair', front: 'the playground', back: 'der Schulhof', unclear: true }
  ],
  unreadable: ['last line is cut off at the bottom edge']
};
const BIO = {
  language: 'de', subject: 'Biology', title: 'Die Zelle',
  cards: [
    { type: 'qa', front: 'Was ist die kleinste Einheit des Lebens?', back: 'die Zelle' },
    { type: 'pair', front: 'Mitochondrien', back: 'Kraftwerke der Zelle, erzeugen Energie (ATP)' },
    { type: 'pair', front: 'Zellkern', back: 'enthält die Erbinformation (DNA)' },
    { type: 'cloze', front: 'Bei der [[Photosynthese]] wird Lichtenergie in chemische Energie umgewandelt.', back: 'Photosynthese' },
    { type: 'mc', front: 'Welche Organelle gibt es nur in Pflanzenzellen?', back: 'Chloroplasten', distractors: ['Mitochondrien', 'Ribosomen', 'Zellkern'] },
    { type: 'qa', front: 'Was umgibt jede Zelle?', back: 'die Zellmembran' },
    { type: 'cloze', front: 'Die [[Zellwand]] gibt der Pflanzenzelle Stabilität.', back: 'Zellwand' },
    { type: 'mc', front: 'Wo findet die Proteinbiosynthese statt?', back: 'an den Ribosomen', distractors: ['im Zellkern', 'in der Vakuole', 'im Golgi-Apparat'] },
    { type: 'qa', front: 'Wofür ist die Vakuole zuständig?', back: 'speichert Wasser und Stoffe', unclear: true }
  ],
  unreadable: []
};

http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && req.url === '/__last') return send(200, { count, last });
  if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) return send(404, { error: 'not found' });
  if (req.headers.authorization !== 'Bearer ' + KEY) return send(401, { error: { message: 'invalid api key' } });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 60e6) req.destroy(); });
  req.on('end', () => {
    let j; try { j = JSON.parse(body); } catch { return send(400, { error: 'bad json' }); }
    const user = (j.messages || []).find(m => m.role === 'user');
    const parts = Array.isArray(user?.content) ? user.content : [{ type: 'text', text: String(user?.content || '') }];
    const text = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
    const images = parts.filter(p => p.type === 'image_url');
    count++;
    last = { model: j.model, images: images.length, imageBytes: images.map(p => Math.round((p.image_url.url.length - 30) * 0.75)), jsonMode: !!j.response_format, prompt: text.slice(0, 400), system: (j.messages[0]?.content || '').slice(0, 80) };
    if (/Reply with OK/.test(text)) return send(200, { choices: [{ message: { role: 'assistant', content: 'OK' } }] });
    if (/MOCK_FAIL/.test(text)) return send(500, { error: { message: 'mock failure' } });
    const payload = /Vocabulary:/.test(text) ? VOCAB : BIO;
    setTimeout(() => send(200, { id: 'mock-' + count, object: 'chat.completion', model: j.model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: 'stop' }] }), 400);
  });
}).listen(PORT, () => console.log(`mock LLM on :${PORT}`));

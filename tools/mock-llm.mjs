// Mock OpenAI-compatible LLM for tests and demos (no network, no real key needed).
//   POST /v1/chat/completions  -> canned strict-JSON cards (vocab or biology, depending on the prompt)
//   GET  /__last               -> summary of the last request (model, #images, prompt excerpt) – never the key
// Env: MOCK_LLM_PORT (8099), MOCK_LLM_KEY (expected Bearer key, default sk-mock-local-test-key)
import http from 'node:http';
const PORT = +(process.env.MOCK_LLM_PORT || 8099);
const KEY = process.env.MOCK_LLM_KEY || 'sk-mock-local-test-key';
let last = null, count = 0;
const calls = [];

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
const BIO_GOALS = {
  language: 'de', subject: 'biology', title: 'Die Zelle – Lernziele Klasse 10', gradeLevel: 'Gymnasium Klasse 10', examFormat: '',
  goals: [
    { id: 'g-zelle', text: 'Den Aufbau einer tierischen und einer pflanzlichen Zelle beschreiben und die Organellen benennen.', topic: 'Zellaufbau', kind: 'facts' },
    { id: 'g-mito', text: 'Erklären, warum Mitochondrien die Kraftwerke der Zelle sind und was ATP damit zu tun hat.', topic: 'Mitochondrien', kind: 'concepts' },
    { id: 'g-foto', text: 'Die Licht- und Dunkelreaktion der Fotosynthese in den richtigen Schritten nachvollziehen.', topic: 'Fotosynthese', kind: 'procedures' },
    { id: 'g-fall', text: 'An einem unbekannten Beispiel entscheiden, welches Organell für eine Störung verantwortlich ist.', topic: 'Anwendung', kind: 'transfer' },
    { id: 'g-endo', text: 'Die Stationen der Endosymbiontentheorie in der richtigen zeitlichen Reihenfolge wiedergeben.', topic: 'Endosymbiose', kind: 'sequence' }
  ],
  questions: [], unreadable: []
};
const HIST_GOALS = {
  language: 'de', subject: 'history', title: 'Weimarer Republik – Lernziele', gradeLevel: 'Gymnasium Klasse 10', examFormat: '',
  goals: [
    { id: 'g-daten', text: 'Die Jahre 1918, 1923 und 1933 den passenden Ereignissen zuordnen.', topic: 'Jahreszahlen', kind: 'facts' },
    { id: 'g-verf', text: 'Erklären, warum die Weimarer Verfassung als Kompromiss galt.', topic: 'Verfassung', kind: 'concepts' }
  ],
  questions: [], unreadable: []
};
function tasksFor(id, kind, goal) {
  const recall = (front, back, phase = 'learn') => ({ goalId: id, activity: 'recall', type: 'qa', phase, front, back, distractors: [] });
  if (kind === 'procedures' || /Fotosynthese/.test(goal)) return [
    { goalId: id, activity: 'worked', type: 'qa', phase: 'learn', front: 'Beispiel: Eine Palisadenzelle stellt bei Licht Glucose her. Welche beiden Teilreaktionen laufen ab?', back: '1. Lichtreaktion an den Thylakoiden: Wasser wird gespalten, ATP und NADPH entstehen. 2. Calvin-Zyklus im Stroma: CO₂ wird mit ATP und NADPH zu Glucose fixiert.', distractors: [] },
    { goalId: id, activity: 'problem', type: 'qa', phase: 'learn', front: 'Ohne Nachsehen: Ordne Lichtreaktion und Calvin-Zyklus und nenne je ein Produkt.', back: 'Lichtreaktion zuerst (ATP, NADPH, O₂), danach Calvin-Zyklus (Glucose).', distractors: [] },
    recall('Prüfung: Wo findet der Calvin-Zyklus statt?', 'Im Stroma der Chloroplasten.', 'mock')
  ];
  if (kind === 'concepts' || /Mitochondrien/.test(goal)) return [
    { goalId: id, activity: 'explain', type: 'qa', phase: 'learn', front: 'Erkläre mit eigenen Worten, warum Mitochondrien Kraftwerke heißen.', back: 'Sie bauen Nährstoffe ab und gewinnen dabei ATP, den Energieträger der Zelle.', distractors: [] },
    { goalId: id, activity: 'explain', type: 'qa', phase: 'learn', front: 'Was würde einer Zelle fehlen, wenn die Mitochondrien ausfallen?', back: 'Es entstünde kaum ATP. Energieabhängige Vorgänge wie Transport und Bewegung blieben stehen.', distractors: [] },
    recall('Kurz: Wofür steht ATP?', 'Adenosintriphosphat, der kurzfristige Energieträger der Zelle.', 'mock')
  ];
  if (kind === 'sequence' || /Endosymbiont/.test(goal)) return [
    { goalId: id, activity: 'sequence', type: 'qa', phase: 'learn', front: 'Bringe die Endosymbiontentheorie in die richtige Reihenfolge.', back: '1. Eine größere Zelle nimmt ein atmendes Bakterium auf. 2. Das Bakterium wird nicht verdaut. 3. Es wird zum Mitochondrium. 4. Später entsteht so auch der Chloroplast.', distractors: [] },
    recall('Was entstand nach der Endosymbiontentheorie aus einem aufgenommenen Bakterium?', 'Das Mitochondrium (und später der Chloroplast).'),
    recall('Prüfung: Nenne die erste Station der Endosymbiontentheorie.', 'Aufnahme eines Bakteriums durch eine größere Zelle.', 'mock')
  ];
  if (kind === 'transfer') return [
    { goalId: id, activity: 'transfer', type: 'mc', phase: 'learn', front: 'Eine Zelle kann kein ATP mehr bilden, die Fotosynthese läuft aber. Welches Organell ist gestört?', back: 'Mitochondrien', distractors: ['Chloroplasten', 'Zellwand', 'Vakuole'] },
    recall('Neuer Fall: Die Blattzelle ist grün, bildet aber keine Stärke. Welches Organell prüfst du zuerst?', 'Die Chloroplasten.'),
    recall('Prüfung: Zelle ohne Zellwand, aber mit Chlorophyll – Pflanze oder Tier?', 'Eher eine Pflanzenzelle, der die Wand fehlt, oder eine Algenzelle. Chlorophyll spricht gegen eine typische Tierzelle.', 'mock')
  ];
  return [
    recall('Welche Organellen nennst du für eine pflanzliche Zelle zusätzlich zur Tierzelle?', 'Chloroplasten, Zellwand und meist eine große Vakuole.'),
    { goalId: id, activity: 'recall', type: 'mc', phase: 'learn', front: 'Was umgibt jede Zelle?', back: 'die Zellmembran', distractors: ['die Zellwand', 'der Zellkern', 'die Vakuole'] },
    recall('Prüfung: Nenne drei Organellen, die in der Pflanzenzelle vorkommen.', 'Zellkern, Mitochondrien, Chloroplasten.', 'mock')
  ];
}
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
  if (req.method === 'GET' && req.url === '/__last') return send(200, { count, last, calls });
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
    const sys = String(j.messages?.[0]?.content || '');
    last = { model: j.model, images: images.length, imageBytes: images.map(p => Math.round((p.image_url.url.length - 30) * 0.75)), jsonMode: !!j.response_format, prompt: text.slice(0, 400), system: sys.slice(0, 80) };
    calls.push({ system: sys.slice(0, 32), prompt: text.slice(0, 180) });
    if (calls.length > 12) calls.shift();
    if (sys.includes('MODERATE_COMPANION')) {
      const ok = !/MOCK_BLOCK|https?:\/\//i.test(text);
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ ok }) } }] });
    }
    if (sys.includes('MERKI_LINE')) {
      const who = (sys.match(/COMPANION: (\S+)/) || [])[1];
      if (who && who !== 'Merki') {
        return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ line: `Hallo, ich bin ${who}. Eine kleine Runde reicht.`, pose: 'happy' }) } }] });
      }
      const teen = /Age band: teen/.test(text);
      const young = /Age band: young/.test(text);
      const plan = (text.match(/Plan: ([^.\n]+)/) || [])[1] || '';
      let line = teen ? 'Kurz und klar. Heute reicht eine Runde.' : young ? 'Hallo! Heute wird bunt und leicht.' : 'Eine Runde, dann hast du Luft.';
      if (/Trigger: home/.test(text) && plan && plan !== 'none') line = teen ? `${plan}. Eine Runde, dann frei.` : `${plan} wartet. Eine kleine Runde reicht.`;
      else if (/Trigger: grade/.test(text)) line = teen ? 'Note sitzt. Sauber eingetragen.' : 'Die Note ist da. Ich bin stolz auf dich.';
      else if (/Trigger: plan_created/.test(text)) line = teen ? 'Plan steht. Wir gehen das ruhig an.' : 'Dein Plan ist fertig. Wir üben bis zur Prüfung.';
      else if (/Trigger: friend/.test(text)) line = teen ? 'Jemand aus dem Plan war heute dabei. Läuft.' : 'Jemand aus dem Plan hat heute geübt. Ihr seid ein Team.';
      let pose = 'happy';
      if (/Trigger: nudge|Trigger: behind/.test(text)) pose = 'nudging';
      else if (/Trigger: grade|Trigger: plan_created/.test(text)) pose = 'proud';
      else if (/Trigger: session_done|Trigger: friend/.test(text)) pose = 'cheering';
      else if (/Trigger: exam_soon|Trigger: session_start/.test(text)) pose = 'thinking';
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ line, pose }) } }] });
    }
    if (/Reply with OK/.test(text)) return send(200, { choices: [{ message: { role: 'assistant', content: 'OK' } }] });
    if (sys.includes('SAME_SHEET')) {
      const same = !/MOCK_DIFFERENT/.test(text);
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ same }) } }] });
    }
    if (sys.includes('GOALS_SHEET')) {
      const history = /history|Geschichte/i.test(text);
      const payload = history ? HIST_GOALS : BIO_GOALS;
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify(payload) } }] });
    }
    if (sys.includes('STUDY_PLAN')) {
      const tasks = [];
      const re = /GOAL\s+(\S+)\s+(facts|concepts|procedures|transfer|essay|sequence)\s+(retrieval|worked|elaboration|essay|timeline|mixed)\s+(.+)/g;
      let m;
      while ((m = re.exec(text))) tasks.push(...tasksFor(m[1], m[2], m[4].trim()));
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ tasks }) } }] });
    }
    if (/MOCK_FAIL/.test(text)) return send(500, { error: { message: 'mock failure' } });
    // Test double for the school-material gate. NOT_SCHOOL in the text (or in image bytes, for a direct upload) refuses. Anything else is allowed, immediately, so card extraction stays the slow call.
    if (sys.includes('SCHOOL_MATERIAL_CHECK')) {
      const blobs = images.map(p => { const url = String(p.image_url?.url || ''); const i = url.indexOf(','); if (i < 0) return ''; try { return Buffer.from(url.slice(i + 1), 'base64').toString('latin1'); } catch { return ''; } }).join('\n');
      const school = !/NOT_SCHOOL/.test(text) && !/NOT_SCHOOL/.test(blobs);
      return send(200, { choices: [{ message: { role: 'assistant', content: JSON.stringify({ school }) } }] });
    }
    const deNotes = /unreadable.*German|UI language for the student\)\.|Write every "unreadable" note in German/i.test(text);
    let payload = /Vocabulary:/.test(text) ? { ...VOCAB } : { ...BIO };
    if (deNotes && payload.unreadable?.length) {
      payload = {
        ...payload,
        unreadable: payload.unreadable.map(u =>
          u === 'last line is cut off at the bottom edge' ? 'Die letzte Zeile ist am unteren Rand abgeschnitten'
            : u === 'Religion grade is covered by a stamp' ? 'Religionsnote ist von einem Stempel verdeckt' : u)
      };
    }
    setTimeout(() => send(200, { id: 'mock-' + count, object: 'chat.completion', model: j.model, choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: 'stop' }] }), 400);
  });
}).listen(PORT, '0.0.0.0', () => console.log(`mock LLM on :${PORT}`));

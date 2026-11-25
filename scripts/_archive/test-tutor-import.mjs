import * as m from '../server/routes/tutor.js';
import * as ai from '../server/routes/ai.js';
import * as srv from '../server/server.js';
console.log('tutor route module exports:', Object.keys(m).join(', '));
console.log('ai route module exports:', Object.keys(ai).join(', '));
console.log('server module exports:', Object.keys(srv).join(', '));
// also test import of tutor service
import * as tutorSvc from '../server/services/tutor.js';
console.log('tutor service exports:', Object.keys(tutorSvc).join(', '));

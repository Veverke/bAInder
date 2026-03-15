/**
 * extractors/index.js — barrel that registers all Phase A–E extractors.
 *
 * Import this module once (from chat-save-handler.js) so the extractors are
 * registered into the entity-extractor registry at background start. The
 * import is a pure side-effect — no named exports needed.
 */

import { registerExtractor }    from '../entity-extractor.js';
import { extractPrompts }       from './prompts.js';
import { extractCitations }     from './citations.js';
import { extractTables }        from './tables.js';
import { extractCodeSnippets }  from './code-snippets.js';
import { extractDiagrams }      from './diagrams.js';
import { extractToolCalls }     from './tool-calls.js';
import { extractAttachments }   from './attachments.js';
import { extractImages }        from './images.js';
import { extractAudio }         from './audio.js';
import { extractArtifacts }     from './artifacts.js';

registerExtractor('prompt',     extractPrompts);
registerExtractor('citation',   extractCitations);
registerExtractor('table',      extractTables);
registerExtractor('code',       extractCodeSnippets);
registerExtractor('diagram',    extractDiagrams);
registerExtractor('toolCall',   extractToolCalls);
registerExtractor('attachment', extractAttachments);
registerExtractor('image',      extractImages);
registerExtractor('audio',      extractAudio);
registerExtractor('artifact',   extractArtifacts);
console.debug('[bAInder] Phase A–E extractors registered: prompt, citation, table, code, diagram, toolCall, attachment, image, audio, artifact');

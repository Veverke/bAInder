/**
 * extractors/index.js — barrel that registers all Phase-A extractors.
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

registerExtractor('prompt',   extractPrompts);
registerExtractor('citation', extractCitations);
registerExtractor('table',    extractTables);
registerExtractor('code',     extractCodeSnippets);
registerExtractor('diagram',  extractDiagrams);
console.debug('[bAInder] Phase A+B extractors registered: prompt, citation, table, code, diagram');

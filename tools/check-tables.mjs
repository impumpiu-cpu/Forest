// Checks every table of «Настройки → Таблицы» against its schema (src/data/schema/): numbers within their
// bounds, ids that exist, words a column knows, unique keys. Part of `npm test`.
import {TABLES, checkAll} from '../src/data/schema/index.js';

const errs = checkAll();
if (errs.length) { console.log(`Таблицы не сходятся со схемами (${errs.length}):\n  ` + errs.join('\n  ')); process.exit(1); }
const rows = TABLES.reduce((n, t) => n + t.rows().length, 0), cols = TABLES.reduce((n, t) => n + t.columns.length, 0);
console.log(`ok   таблицы: ${TABLES.length} таблиц, ${rows} строк, ${cols} столбцов — значения в пределах, ссылки сходятся`);

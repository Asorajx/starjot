/* =========================
   Code Languages
   ========================= */

/* The language is stored as a class on <code>, for example class="language-python". */
export const LANGUAGES = [
  { id: 'plain', label: 'Plain text' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C / C++' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Shell' }
] as const;

export type LanguageId = typeof LANGUAGES[number]['id'];

function words(list: string) {
  return new RegExp(`\\b(?:${list.split(' ').join('|')})\\b`);
}

/* Shared token patterns. They avoid capturing groups so each rule stays one group below. */
const lineComment = /\/\/[^\n]*/;
const blockComment = /\/\*[\s\S]*?(?:\*\/|$)/;
const quoted = /"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?/;
const number = /\b0x[\da-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/;
const functionName = /\b[A-Za-z_$][\w$]*(?=\s*\()/;

const jsKeywords = 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await from as get set';

/* Each grammar is an ordered list of [token type, pattern]; earlier rules win. */
type Rule = [token: string, pattern: RegExp];

const RULES: Record<Exclude<LanguageId, 'plain'>, Rule[]> = {
  javascript: [
    ['comment', lineComment], ['comment', blockComment],
    ['string', /`(?:\\[\s\S]|[^`\\])*`?/], ['string', quoted],
    ['number', number],
    ['keyword', words(jsKeywords)],
    ['literal', words('true false null undefined NaN Infinity')],
    ['function', functionName]
  ],
  typescript: [
    ['comment', lineComment], ['comment', blockComment],
    ['string', /`(?:\\[\s\S]|[^`\\])*`?/], ['string', quoted],
    ['number', number],
    ['keyword', words(`${jsKeywords} interface type enum implements private public protected readonly declare namespace abstract keyof is`)],
    ['literal', words('true false null undefined NaN Infinity')],
    ['property', words('string number boolean any unknown never void object')],
    ['function', functionName]
  ],
  html: [
    ['comment', /<!--[\s\S]*?(?:-->|$)/],
    ['tag', /<\/?[A-Za-z][\w:-]*|\/?>/],
    ['attr', /\b[\w:-]+(?==)/],
    ['string', /(?<==)(?:"[^"]*"?|'[^']*'?)/],
    ['literal', /&[\w#]+;/]
  ],
  css: [
    ['comment', blockComment],
    ['string', quoted],
    ['keyword', /@[\w-]+/],
    ['literal', /#[\da-fA-F]{3,8}\b/],
    ['property', /[\w-]+(?=\s*:[^;{}]*(?:;|\}|$))/],
    ['function', /[\w-]+(?=\()/],
    ['number', /-?(?:\d*\.)?\d+(?:px|em|rem|vh|vw|ms|s|deg|fr|%)?/],
    ['tag', /[.#][\w-]+/]
  ],
  json: [
    ['property', /"(?:\\[\s\S]|[^"\\\n])*"(?=\s*:)/],
    ['string', /"(?:\\[\s\S]|[^"\\\n])*"?/],
    ['number', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/],
    ['literal', words('true false null')]
  ],
  python: [
    ['comment', /#[^\n]*/],
    ['string', /"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)/], ['string', quoted],
    ['number', number],
    ['keyword', words('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case')],
    ['literal', words('True False None self')],
    ['attr', /@[\w.]+/],
    ['function', functionName]
  ],
  java: [
    ['comment', lineComment], ['comment', blockComment],
    ['string', quoted],
    ['number', number],
    ['keyword', words('abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new package private protected public record return short static super switch this throw throws try var void volatile while')],
    ['literal', words('true false null')],
    ['attr', /@\w+/],
    ['function', functionName]
  ],
  csharp: [
    ['comment', lineComment], ['comment', blockComment],
    ['string', /@"(?:""|[^"])*"?|\$?"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?/],
    ['number', number],
    ['keyword', words('abstract as async await base bool break byte case catch char class const continue decimal default delegate do double else enum event explicit extern finally float for foreach get if implicit in int interface internal is lock long namespace new object operator out override params private protected public readonly record ref return sealed set short static string struct switch this throw try typeof uint ulong using var virtual void while')],
    ['literal', words('true false null')],
    ['function', functionName]
  ],
  cpp: [
    ['comment', lineComment], ['comment', blockComment],
    ['attr', /#\s*(?:include|define|undef|ifdef|ifndef|if|elif|else|endif|pragma)\b[^\n]*/],
    ['string', quoted],
    ['number', number],
    ['keyword', words('auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern float for friend if inline int long namespace new operator private protected public return short signed sizeof static struct switch template this throw try typedef typename union unsigned using virtual void volatile while')],
    ['literal', words('true false NULL nullptr')],
    ['function', functionName]
  ],
  sql: [
    ['comment', /--[^\n]*/], ['comment', blockComment],
    ['string', /'(?:''|[^'])*'?/],
    ['number', number],
    ['keyword', words('select from where and or not insert into values update set delete create table drop alter add join left right inner outer full cross on as group by order having limit offset distinct union all is in like between case when then else end primary key foreign references index view default exists returning with asc desc')],
    ['literal', words('null true false')],
    ['function', functionName]
  ],
  bash: [
    ['comment', /(?<!\S)#[^\n]*/],
    ['string', quoted],
    ['property', /\$\{?[\w@#?*!-]+\}?/],
    ['number', /\b\d+\b/],
    ['keyword', words('if then else elif fi for while until do done case esac in function return export local readonly exit source')],
    ['function', words('echo cd ls cat grep sed awk mkdir rm cp mv npm node git curl chmod sudo')]
  ]
};

/* Combine each grammar into one global pattern; SQL keywords are case-insensitive. */
export const GRAMMARS = Object.fromEntries(Object.entries(RULES).map(([id, rules]) => [id, {
  types: rules.map(rule => rule[0]),
  pattern: new RegExp(rules.map(rule => `(${rule[1].source})`).join('|'), id === 'sql' ? 'gi' : 'g')
}])) as Record<string, { types: string[]; pattern: RegExp } | undefined>;

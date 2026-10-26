import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireLegacy = createRequire(path.join(root, 'legacy/web/package.json'));
const ts = requireLegacy('typescript');
const slash = value => value.replaceAll('\\', '/');
const skip = new Set(['.git', 'node_modules', 'target', 'dist', 'build']);

function scan(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (skip.has(entry.name)) return [];
    if (entry.name === 'data' && /(?:^server|^legacy\/api)$/.test(slash(path.relative(root, dir)))) return [];
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return scan(file);
    if (!/\.(rs|tsx?|css|[mc]?js|html|toml|json|md|yml|ps1|sh)$/.test(entry.name)) return [];
    const text = fs.readFileSync(file, 'utf8');
    return [{ path: slash(path.relative(root, file)), text,
      lines: text.split('\n').length,
      sha256: crypto.createHash('sha256').update(text).digest('hex') }];
  });
}

function jsxTag(node) {
  if (!node) return null;
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  if (ts.isParenthesizedExpression(node)) return jsxTag(node.expression);
  return null;
}

// Evaluate only the path predicates used by the legacy dispatcher; never execute source.
function evaluate(node, route) {
  if (ts.isParenthesizedExpression(node)) return evaluate(node.expression, route);
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isRegularExpressionLiteral(node)) {
    const end=node.text.lastIndexOf('/');
    return new RegExp(node.text.slice(1,end),node.text.slice(end+1));
  }
  if (ts.isIdentifier(node)) {
    if (node.text === 'currentPath') return route;
    if (node.text === 'p') return route.startsWith('/admin') ? route.slice(6) || '/dashboard' : route;
    return undefined;
  }
  if (ts.isBinaryExpression(node)) {
    const a = evaluate(node.left, route), b = evaluate(node.right, route);
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.EqualsEqualsEqualsToken: return a === undefined || b === undefined ? undefined : a === b;
      case ts.SyntaxKind.BarBarToken: return a === true || b === true ? true : a === false && b === false ? false : undefined;
      case ts.SyntaxKind.AmpersandAmpersandToken: return a === false || b === false ? false : a === true && b === true ? true : undefined;
    }
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const value = evaluate(node.expression.expression, route);
    const arg = node.arguments[0] ? evaluate(node.arguments[0], route) : undefined;
    if(value instanceof RegExp && node.expression.name.text==='test')return typeof arg==='string'?value.test(arg):undefined;
    if (typeof value !== 'string') return undefined;
    switch (node.expression.name.text) {
      case 'startsWith': return typeof arg === 'string' ? value.startsWith(arg) : undefined;
      case 'includes': return typeof arg === 'string' ? value.includes(arg) : undefined;
      case 'endsWith': return typeof arg === 'string' ? value.endsWith(arg) : undefined;
      case 'toLowerCase': return value.toLowerCase();
    }
  }
  return undefined;
}

function imports(source, file) {
  const result = {};
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !node.importClause) continue;
    const target = node.moduleSpecifier.text;
    if (!target.startsWith('.')) continue;
    const base = path.resolve(root, path.dirname(file), target);
    const resolved = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map(s => base + s).find(fs.existsSync);
    const dest = resolved ? slash(path.relative(root, resolved)) : target;
    if (node.importClause.name) result[node.importClause.name.text] = dest;
    const bindings = node.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const n of bindings.elements) result[n.name.text] = dest;
  }
  return result;
}

export function inventory() {
  const files = scan(root);
  const sources = new Map(files.map(f => [f.path, f.text]));
  const routes = new Map();
  const directRoutes = new Map();
  const routeSources = ['legacy/web/src/App.tsx', 'legacy/web/src/data/menuData.tsx',
    'legacy/web/src/components/generic/GenericModulePage.tsx'];
  const sourceTrees = routeSources.map(file => ({ file,
    tree: ts.createSourceFile(file, sources.get(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) }));
  const add = (route, evidence) => {
    if (!routes.has(route)) routes.set(route, { route, evidence: [] });
    routes.get(route).evidence.push(evidence);
  };
  for (const { file, tree } of sourceTrees) {
    const lookup = imports(tree, file);
    const walk = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'path' && ts.isStringLiteral(node.initializer)) {
        add(node.initializer.text, { source: file, line: tree.getLineAndCharacterOfPosition(node.pos).line + 1, kind: 'menu' });
      }
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(tree) === 'Route') {
        const attr = node.attributes.properties.find(a => a.name?.getText(tree) === 'path');
        if (attr?.initializer && ts.isStringLiteral(attr.initializer)) add(attr.initializer.text,
          { source: file, line: tree.getLineAndCharacterOfPosition(node.pos).line + 1, kind: 'jsx-route' });
        const element = node.attributes.properties.find(a => a.name?.getText(tree) === 'element');
        const tags = [];
        const readTags = n => { const tag=jsxTag(n); if(tag&&!['Navigate','GenericModulePage','AuthGuardRoute'].includes(tag))tags.push(tag); ts.forEachChild(n,readTags); };
        if(element?.initializer)readTags(element.initializer);
        if(attr?.initializer&&ts.isStringLiteral(attr.initializer)&&tags.length)directRoutes.set(attr.initializer.text,{tag:tags[0],file:lookup[tags[0]]});
      }
      if (ts.isIfStatement(node)) {
        const predicate = node.expression.getText(tree);
        const expressions = [...predicate.matchAll(/(?:currentPath|\bp)\s*===\s*['"]([^'"]+)['"]/g),
          ...predicate.matchAll(/(?:currentPath|\bp)\.startsWith\(['"]([^'"]+)['"]\)/g)];
        for (const match of expressions) {
          const raw = match[1];
          if (!raw.startsWith('/')) continue;
          const p = match[0].startsWith('p') ? '/admin' + raw : raw;
          add(p, { source: file, line: tree.getLineAndCharacterOfPosition(node.pos).line + 1,
            kind: match[0].includes('startsWith') ? 'prefix-dispatch' : 'exact-dispatch' });
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(tree);
  }
  const generic = sourceTrees[2], lookup = imports(generic.tree, generic.file);
  const conditions = [];
  const collect = node => {
    if (ts.isIfStatement(node)) {
      let tag = null;
      const findReturn = n => {
        if (ts.isIfStatement(n)) return;
        if (ts.isReturnStatement(n)) tag ||= jsxTag(n.expression);
        else ts.forEachChild(n, findReturn);
      };
      findReturn(node.thenStatement);
      if (tag) conditions.push({ predicate: node.expression, tag });
    }
    ts.forEachChild(node, collect);
  };
  collect(generic.tree);
  const rustModels = sources.get('ui/src/models.rs');
  const rustItems = [...rustModels.matchAll(/(?:item|Self::new)\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"[^"]*"\s*,\s*NavGroup::(\w+)/g)]
    .map(m => ({ id: m[1], title: m[2], route: m[3], group: m[4] }));
  const typeFiles = new Map(files.filter(f => f.path.startsWith('ui/src/views/') && f.path.endsWith('.rs'))
    .flatMap(f => [...f.text.matchAll(/pub struct (\w+)/g)].map(m => [m[1], f.path])));
  const fields = new Map([...sources.get('ui/src/app.rs').matchAll(/pub (\w+): (\w+)/g)]
    .map(m => [m[1], typeFiles.get(m[2])]).filter(([,v]) => v));
  const uiDispatcher = sources.get('ui/src/app.rs').split('match self.current_nav.group {')[1]?.split('if was_security_screen')[0] || '';
  const renderMatches = [...uiDispatcher.matchAll(/(?:NavGroup::(\w+))([\s\S]*?)=>\s*([\s\S]*?)(?=\n\s*NavGroup::|\n\s*\},\n\s*\},)/g)];
  const mapping = [...routes.values()].sort((a,b) => a.route.localeCompare(b.route)).map(row => {
    const match = conditions.find(c => evaluate(c.predicate, row.route) === true);
    row.dispatchNeedsReview=conditions.slice(0,match?conditions.indexOf(match):conditions.length).some(c=>evaluate(c.predicate,row.route)===undefined);
    const direct=directRoutes.get(row.route);
    row.legacyComponent = direct?.tag || match?.tag || null;
    row.legacyFile = direct?.file || (match ? lookup[match.tag] || null : null);
    const item = rustItems.find(i => i.route === row.route);
    row.appRoute = item?.route || null;
    row.appGroup = item?.group || null;
    row.appFile = null;
    if (item) {
      const arm = renderMatches.find(m => m[1] === item.group && (!m[2].includes('if') || [...m[2].matchAll(/"([^"\n]+)"/g)].some(p => p[1] === row.route || m[2].includes('starts_with') && row.route.startsWith(p[1]))));
      const field = arm?.[3].match(/self\.(\w+)/)?.[1];
      row.appFile = fields.get(field) || null;
    }
    row.status = item ? 'PENDING_VISUAL_VERIFICATION' : 'NO_EXACT_NAV_ITEM_REVIEW_DISPATCH';
    if(row.route==='/login'){row.appRoute='/login';row.appFile='ui/src/views/login.rs';row.status='PENDING_VISUAL_VERIFICATION';}
    if(row.route==='/activate-account'){row.appRoute='/activate-account';row.appFile='ui/src/views/activation.rs';row.status='PENDING_VISUAL_VERIFICATION';}
    row.mappingNeedsReview = row.dispatchNeedsReview || !row.legacyFile || !row.appFile;
    return row;
  });
  const css = files.filter(f => f.path.startsWith('legacy/') && f.path.endsWith('.css'));
  return {
    generatedAt: new Date().toISOString(), note: 'Source inventory and candidate mapping, not a parity/completion claim. Prefix and dynamic routes require runtime fixtures; unresolved dispatch is explicit.',
    files: files.map(({ text, ...f }) => f), routes: mapping, appNavigation: rustItems,
    components: files.filter(f => /legacy\/web\/src\/(components|custom-ui)\/.+\.(tsx?|css)$/.test(f.path)).map(f => f.path),
    css: css.map(f => ({ source: f.path,
      variables: [...f.text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => ({ name:m[1], value:m[2].trim() })),
      media: [...new Set([...f.text.matchAll(/@media\s*([^\{]+)/g)].map(m => m[1].trim()))] })),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = inventory();
  const dir = path.join(root, 'build/visual-parity/reports'); fs.mkdirSync(dir, {recursive:true});
  fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify(output, null, 2));
  const escape = value => String(value ?? 'Chưa xác minh').replaceAll('|', '\\|');
  const rows = output.routes.map((r,i) => `| ${i+1} | ${escape(r.route)} | ${escape(r.legacyFile)} | ${escape(r.appRoute)} | ${escape(r.appFile)} | ${r.status} |`);
  fs.writeFileSync(path.join(dir, 'routes.md'), '# Route inventory — pending visual verification\n\nGenerated from source. Unresolved wildcard/conditional mappings require review.\n\n| # | Legacy route/prefix | Legacy source | App route | App source candidate | Status |\n|---|---|---|---|---|---|\n'+rows.join('\n')+'\n');
  console.log(JSON.stringify({sourceFiles:output.files.length,legacyRouteCandidates:output.routes.length,
    appNavItems:output.appNavigation.length,sharedLegacyFiles:output.components.length,report:slash(path.relative(root,dir))}));
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { dependency, comparePNGs, compareGeometry } from './compare.mjs';
import { inventory, root } from './inventory.mjs';
import { redactDiagnostics } from './redact.mjs';

const args = new Map(process.argv.slice(2).map(v=>{const [key,...rest]=v.replace(/^--/,'').split('=');return[key,rest.join('=')||true];}));
const refOrigin=process.env.PARITY_REFERENCE_ORIGIN || 'http://127.0.0.1:3411';
const apiOrigin=process.env.PARITY_REFERENCE_API || 'http://127.0.0.1:3413';
const appOrigin=process.env.PARITY_APP_ORIGIN || 'http://127.0.0.1:3412';
const phase=String(args.get('phase') || 'current');
const captureRole=process.env.PARITY_CAPTURE_ROLE || 'ADMIN';
if(!['ADMIN','USER'].includes(captureRole))throw new Error('PARITY_CAPTURE_ROLE must be ADMIN or USER');
const authenticatedPrefix=captureRole==='USER'?'/employee':'/admin/';
const fixedTime=args.get('fixed-time')?String(args.get('fixed-time')):null;
if(fixedTime&&!Number.isFinite(Date.parse(fixedTime)))throw new Error('Invalid fixed test time');
if (!/^[\w-]+$/.test(phase)) throw new Error('Invalid phase name');
for (const origin of [refOrigin,apiOrigin,appOrigin]) {
  if (!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname)) throw new Error('This fixture harness only accepts local loopback origins');
}
const out=path.join(root,'build/visual-parity',phase);
if(await fs.stat(path.join(out,'reports/summary.json')).catch(()=>null))throw new Error('Phase already has a report; choose a new phase to preserve evidence');
for(const dir of ['references','actual','differences','overlays','reports']) await fs.mkdir(path.join(out,dir),{recursive:true});
const source=inventory();
const build=await fs.readFile(path.join(root,'build/visual-parity/web/visual-build.json'),'utf8').then(JSON.parse).catch(()=>null);
if(build){
  const crypto=await import('node:crypto');
  const changed=[];
  for(const file of build.sources){
    const bytes=await fs.readFile(path.join(root,file.path));
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)changed.push(file);
  }
  if(changed.length)throw new Error('Visual bundle sources are stale: '+changed.map(f=>f.path).join(', '));
}
await fs.writeFile(path.join(out,'reports/source-manifest.json'),JSON.stringify(source,null,2));
const pw=dependency('playwright');
const fontFixture={};
const fontProvenance=[];
if(args.has('native-fonts')){
  if(process.platform!=='win32')throw new Error('--native-fonts requires the installed Windows fonts; no substitutes are downloaded.');
  const crypto=await import('node:crypto');
  for(const file of ['segoeui.ttf','seguisb.ttf','segoeuib.ttf','arial.ttf']){
    const bytes=await fs.readFile(path.join(process.env.WINDIR||'C:/Windows','Fonts',file));
    fontFixture[file]=bytes.toString('base64');
    fontProvenance.push({file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
}
let executablePath=process.env.PARITY_BROWSER;
if(!executablePath && process.platform==='win32') {
  for(const p of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe']) {
    if(await fs.stat(p).catch(()=>null)){executablePath=p;break;}
  }
}
const browser=await pw.chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
const viewportSpec=String(args.get('viewports') || '1440x900,768x1024,390x844');
const viewports=viewportSpec.split(',').map(v=>{const [width,height]=v.split('x').map(Number);if(!width||!height)throw new Error('Invalid viewport');return{width,height};});
const requested=String(args.get('routes') || '').split(',').filter(Boolean);
const routeSet=requested.length ? requested : ['/login',...new Set(source.routes.filter(r=>r.appRoute&&r.legacyFile&&!/[:*]$/.test(r.route)&&!r.route.includes(':')).map(r=>r.route))];
const results=[];
const requestAuthorization=new WeakMap();
const proxyErrors=[];
const environment={browser:browser.version(),executablePath,deviceScaleFactor:1,locale:'vi-VN',timezoneId:'Asia/Ho_Chi_Minh',colorScheme:'light',fixedTime,phase,captureRole,employeeProfileFixture:process.env.PARITY_EMPLOYEE_PROFILE_FIXTURE||null,viewports,requestedRoutes:routeSet,build,fontFixture:fontProvenance,fontNote:fontProvenance.length?'Locally installed OS fonts supplied only to the opt-in WASM harness. Not redistributed. Still not a native-window capture.':'Default WASM font fallback; native Windows uses installed Segoe UI/Arial.',buildProvenance:build?'SOURCE_AND_BUNDLE_HASHES':'UNVERIFIED_LEGACY_CAPTURE_NO_BUILD_MANIFEST'};
environment.cashMutationFixture=process.env.PARITY_CASH_FIXTURE==='true'?'One real receipt per disposable API; cancel is tested through the actual UI':null;
await fs.writeFile(path.join(out,'reports/environment.json'),JSON.stringify(environment,null,2));

async function domSnapshot(page) {
  return page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height]};
    const selectors={header:'.kiyovn-main-container > header',sidebar:'.kiyovn-sidebar',content:'.kiyovn-main-content',
      'header.menu':'.kiyovn-header-left button','header.user':'.kiyovn-user-menu-trigger',
      'header.notifications':'button[title="Thông báo hệ thống"]','sidebar.brand':'.kiyovn-sidebar > div:first-child',
      'dashboard.banner':'.kiyovn-dashboard-banner'};
    const input=document.querySelector('input[autocomplete="username"]');
    if(input){selectors['login.card']='body #root > div > div';}
    const rects={};for(const [name,selector]of Object.entries(selectors)){const e=document.querySelector(selector);if(e&&e.getBoundingClientRect().height)rects[name]=rect(e)}
    if(location.pathname==='/admin/files'){
      for(const [name,selector]of Object.entries({'files.toolbar':'.win11-cmd-bar','files.address':'.win11-address-bar','files.table':'table'})){const e=document.querySelector(selector);if(e)rects[name]=rect(e);}
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content th')].entries())rects['files.table.header.'+i]=rect(e);
      const footer=document.querySelector('.win11-footer');if(footer)rects['files.footer']=rect(footer);
    }
    if(location.pathname==='/admin/settings/security'){
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content > div > div:first-child > div')].entries())rects['security.card.'+i]=rect(e);
    }
    if(location.pathname.startsWith('/admin/finance/cash/')){
      const trigger=document.querySelector('.kiyovn-datepicker-input');if(trigger)rects['date.cash.date.trigger']=rect(trigger);
      const popup=document.querySelector('.kiyovn-datepicker-popup');if(popup)rects['date.cash.date.popup']=rect(popup);
    }
    if(location.pathname==='/admin/finance/cash/flow'){
      const root=document.querySelector('.kiyovn-main-content > div');
      if(root?.children[0])rects['cash.flow.header']=rect(root.children[0]);
      for(const [i,e]of [...(root?.children[1]?.children||[])].entries())rects['cash.flow.metrics.'+i]=rect(e);
      const table=root?.querySelector('.ant-table');if(table)rects['cash.flow.table']=rect(table);
      for(const [i,e]of [...(root?.querySelectorAll('th')||[])].entries())rects['cash.flow.table.header.'+i]=rect(e);
    }
    for(const [i,e]of [...document.querySelectorAll('.kiyovn-dashboard-kpi-grid > div')].entries())rects['dashboard.kpi.'+i]=rect(e);
    if(location.pathname==='/admin/hr/employees') {
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content > div > div:first-child > div')].entries())rects['employees.metrics.'+i]=rect(e);
      const toolbar=document.querySelector('.kiyovn-main-content > div > div:nth-child(2)');if(toolbar)rects['employees.toolbar']=rect(toolbar);
      const table=document.querySelector('.kiyovn-main-content .ant-table');if(table)rects['employees.table']=rect(table);
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content table th')].entries())rects['employees.table.header.'+i]=rect(e);
    }
    const revisionPrefix={'/admin/assets':'assets','/admin/assets/list':'assets','/admin/tasks':'tasks','/admin/hr/contracts':'contracts','/admin/documents/contracts':'contracts','/admin/attendance':'attendance','/admin/attendance/overview':'attendance','/admin/attendance/monitoring':'attendance','/admin/crm':'crm','/admin/crm/customers':'crm','/admin/crm/suppliers':'crm','/admin/crm/partners':'crm'}[location.pathname];
    if(revisionPrefix){
      const root=document.querySelector('.kiyovn-main-content > div');
      const metrics=root?.children[revisionPrefix==='crm'?1:0];
      for(const [i,e]of [...(metrics?.children||[])].entries())rects[revisionPrefix+'.metrics.'+i]=rect(e);
      if(revisionPrefix==='crm'&&root?.children[0])rects['crm.header']=rect(root.children[0]);
      const search=root?.querySelector('.ant-input-affix-wrapper');
      const toolbar=search?.parentElement?.parentElement||root?.children[revisionPrefix==='crm'?2:1];if(toolbar)rects[revisionPrefix+'.toolbar']=rect(toolbar);
      const table=root?.querySelector('.ant-table');if(table)rects[revisionPrefix+'.table']=rect(table);
      for(const [i,e]of [...(root?.querySelectorAll('th')||[])].entries())rects[revisionPrefix+'.table.header.'+i]=rect(e);
    }
    const modulePrefix={'/admin/users':'users','/admin/workflows/requests':'workflow.requests','/admin/business/org-units':'org','/admin/tickets':'tickets','/admin/finance/cash/expense':'finance.cash','/admin/finance/cash/income':'finance.cash','/admin/finance/cash/transactions':'finance.cash'}[location.pathname];
    if(modulePrefix){
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content > div > div:first-child > div')].entries())rects[modulePrefix+'.metrics.'+i]=rect(e);
      const toolbar=document.querySelector('.kiyovn-main-content > div > div:nth-child(2)');if(toolbar)rects[modulePrefix+'.toolbar']=rect(toolbar);
      const table=document.querySelector('.kiyovn-main-content .ant-table');if(table)rects[modulePrefix+'.table']=rect(table);
      for(const [i,e]of [...document.querySelectorAll('.kiyovn-main-content table th')].entries())rects[modulePrefix+'.table.header.'+i]=rect(e);
    }
    if(['/admin/notifications/my','/admin/notifications/system','/employee/notifications'].includes(location.pathname)){
      const container=document.querySelector('.kiyovn-main-content > div');
      if(container?.children[0])rects['notifications.header']=rect(container.children[0]);
      if(container?.children[1]&&container.children[1].textContent.includes('Không có thông báo nào'))rects['notifications.empty']=rect(container.children[1]);
      const search=container?.querySelector('.ant-input-affix-wrapper');if(search)rects['notifications.search']=rect(search);
    }
    const dialogPrefix={'/admin/assets':'assets.edit','/admin/assets/list':'assets.edit','/admin/tasks':'tasks.create','/admin/crm':'crm.create','/admin/crm/customers':'crm.create','/admin/crm/suppliers':'crm.create','/admin/crm/partners':'crm.create','/admin/hr/employees':'employees.edit','/admin/users':'users.create','/admin/workflows/requests':'workflow.requests.create','/admin/business/org-units':'org.edit','/admin/tickets':'tickets.create','/admin/tickets/incidents':'incidents.create','/admin/documents/list':'documents.create','/admin/documents/archives':'documents.create','/admin/documents/notes':'documents.create','/admin/assets/system':'asset.system.create','/admin/finance/cash/expense':'finance.cash.create','/admin/finance/cash/income':'finance.cash.create','/admin/finance/cash/transactions':'finance.cash.create'}[location.pathname];
    const dialog=document.querySelector('.ant-modal');
    if(dialog&&dialogPrefix){rects[dialogPrefix+'.dialog']=rect(dialog);const close=dialog.querySelector('.ant-modal-close');if(close)rects[dialogPrefix+'.close']=rect(close);}
    if(input){const wrappers=[...document.querySelectorAll('form > div > div')];if(wrappers[0])rects['login.email']=rect(wrappers[0]);if(wrappers[1])rects['login.password']=rect(wrappers[1]);
      const submit=document.querySelector('button[type="submit"]');if(submit)rects['login.submit']=rect(submit);
      const google=[...document.querySelectorAll('button')].find(e=>e.textContent.includes('Google'));if(google)rects['login.google']=rect(google);}
    const elements=[...document.querySelectorAll('header,aside,main,.kiyovn-menu-item,.ant-card,button,input,select,textarea,table,th,td,h1,h2,h3,h4,.ant-modal,.ant-dropdown')]
      .filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>{const c=getComputedStyle(e);return{tag:e.tagName,classes:e.className,text:e.textContent?.slice(0,160),rect:rect(e),style:Object.fromEntries(['display','position','padding','margin','gap','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','border','borderRadius','boxShadow','overflow','zIndex','transform'].map(k=>[k,c[k]]))}});
    return {url:location.pathname,viewport:[innerWidth,innerHeight],devicePixelRatio,rects,elements,fontsStatus:document.fonts.status};
  });
}
async function appSnapshot(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null'));}
async function loginApp(page) {
  const email=process.env.PARITY_EMAIL, password=process.env.PARITY_PASSWORD;
  if(!email||!password)throw new Error('Set PARITY_EMAIL and PARITY_PASSWORD for authenticated route capture');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['login.email']);
  const s=await appSnapshot(page);
  for(const [id,value]of [['login.email',email],['login.password',password]]){
    const r=s.rects[id]; await page.mouse.click(r[0]+Math.min(70,r[2]/2),r[1]+r[3]/2);
    await page.waitForTimeout(160);await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(value,{delay:20});await page.waitForTimeout(160);
  }
  const r=s.rects['login.submit'];await page.mouse.click(r[0]+r[2]/2,r[1]+r[3]/2);
  await page.waitForFunction(path=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.route===path,captureRole==='USER'?'/employee/home':'/admin/dashboard',{timeout:30000});
}
async function command(page,value){
  await page.evaluate(v=>localStorage.setItem('kiyo.visual.command',JSON.stringify(v)),value);
  if(value.path)await page.waitForFunction(p=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.route===p,value.path,{timeout:15000});
  else await page.waitForTimeout(200);
}
async function recordPair(ref,app,route,viewport,state='default',errors=[],preservePointer=false) {
  await Promise.all([ref.evaluate(()=>document.fonts.ready),app.evaluate(()=>document.fonts.ready)]);
  if(!preservePointer)await Promise.all([ref.mouse.move(viewport.width-2,viewport.height-2),app.mouse.move(viewport.width-2,viewport.height-2)]);
  // Legacy removes its route-loading bar after 500ms; capture settled UI, not that transition.
  await Promise.all([ref.waitForTimeout(650),app.waitForTimeout(650)]);
  const id=(route.replace(/^\//,'').replace(/[^a-zA-Z0-9-]+/g,'-')||'root')+`-${viewport.width}x${viewport.height}-${state}`;
  const referenceFile=path.join(out,'references',id+'.png'), actualFile=path.join(out,'actual',id+'.png');
  await ref.screenshot({path:referenceFile});await app.screenshot({path:actualFile});
  const reference=await domSnapshot(ref), actual=await appSnapshot(app);
  const pixels=await comparePNGs(referenceFile,actualFile,path.join(out,'differences',id+'.png'),path.join(out,'overlays',id+'.png'));
  const geometry=compareGeometry(reference.rects,actual?.rects);
  const appRouteMatched=actual?.route===route,referenceRouteMatched=reference.url===route;
  const routeMatched=appRouteMatched&&referenceRouteMatched;
  // Drain after settling/capture so late network and console errors belong to this case.
  const capturedErrors=errors.splice(0);
  const result={id,route,state,viewport,referenceRoute:reference.url,actualRoute:actual?.route,routeMatched,appRouteMatched,referenceRouteMatched,
    status:pixels.exact&&routeMatched&&!capturedErrors.length?'PASS':'FAIL',pixels,geometry,errors:capturedErrors,
    note:'Full viewport is compared without masks. Different API datasets remain visible and fail equality; content parity must be assessed separately.',reference,actual};
  await fs.writeFile(path.join(out,'reports',id+'.json'),JSON.stringify(result,null,2));
  results.push(result);console.log(JSON.stringify({id,status:result.status,differentPixels:pixels.differentPixels,geometryMax:geometry.maximumElementPositionDeviation}));
}

async function clickAppElement(page,name){
  const snapshot=await appSnapshot(page),r=snapshot?.rects?.[name];
  if(!r)throw new Error('Missing diagnostic rectangle '+name);
  await page.mouse.click(r[0]+r[2]/2,r[1]+r[3]/2);
  await page.waitForTimeout(180);
}

async function captureRouteStates(ref,app,route,viewport,errors){
  if(route==='/admin/dashboard'&&viewport.width<=992){
    await ref.locator('.kiyovn-mobile-bottom-nav button').filter({hasText:'Danh mục'}).click();
    await app.mouse.click(viewport.width*0.9,viewport.height-28);
    await ref.locator('.kiyovn-sidebar').waitFor({state:'visible'});
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['nav.hr'],{},{timeout:5000});
    await recordPair(ref,app,route,viewport,'bottom-menu-open',errors,true);
    await Promise.all([ref.mouse.click(viewport.width-2,viewport.height/2),app.mouse.click(viewport.width-2,viewport.height/2)]);
    await app.waitForFunction(()=>!JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['nav.hr'],{},{timeout:5000});
  }
  if(route==='/admin/settings/security'){
    await ref.locator('input[placeholder="Nhập mật khẩu cũ..."]').focus();await clickAppElement(app,'form.security.current');
    await recordPair(ref,app,route,viewport,'password-focused',errors,true);
    await Promise.all([ref.mouse.click(viewport.width-2,2),app.mouse.click(viewport.width-2,2)]);
  }
  if(route==='/admin/files'){
    await ref.locator('.win11-cmd-btn').filter({hasText:/^\s*Mới\s*$/}).click();await clickAppElement(app,'files.new');
    await ref.getByText('Tệp tin trống',{exact:true}).waitFor();
    await recordPair(ref,app,route,viewport,'new-menu',errors,true);
    await Promise.all([ref.mouse.click(viewport.width-2,2),app.mouse.click(viewport.width-2,2)]);
    if(viewport.width>992){
      await ref.locator('.win11-cmd-btn').filter({hasText:/Hiển thị/}).click();await clickAppElement(app,'files.display');
      await recordPair(ref,app,route,viewport,'display-menu',errors,true);
      await Promise.all([ref.mouse.click(viewport.width-2,2),app.mouse.click(viewport.width-2,2)]);
    }
    const blank=await ref.locator('.win11-main').boundingBox(), actual=(await appSnapshot(app)).rects['files.context'];
    const point={x:blank.x+Math.min(blank.width/2,200),y:blank.y+Math.min(blank.height-40,180)};
    if(point.x<actual[0]||point.x>actual[0]+actual[2]||point.y<actual[1]||point.y>actual[1]+actual[3])throw new Error('No shared blank position for context-menu comparison');
    await ref.mouse.click(point.x,point.y,{button:'right'});
    await app.mouse.click(point.x,point.y,{button:'right'});
    await recordPair(ref,app,route,viewport,'context-menu',errors,true);
    await Promise.all([ref.mouse.click(viewport.width-2,2),app.mouse.click(viewport.width-2,2)]);
  }
  if(route==='/admin/dashboard'&&viewport.width>992){
    await ref.locator('.kiyovn-menu-item.level-1').filter({hasText:/^Nhân sự$/}).hover();
    const snapshot=await appSnapshot(app),r=snapshot.rects['nav.hr'];
    await app.mouse.move(r[0]+r[2]/2,r[1]+r[3]/2);
    await ref.locator('.kiyovn-flyout-portal').first().waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['flyout.0']);
    await recordPair(ref,app,route,viewport,'flyout-hr',errors,true);
    await ref.locator('.kiyovn-flyout-portal').getByText('Lịch sử nhân viên',{exact:true}).hover();
    const nested=(await appSnapshot(app)).rects['nav.hr-history'];
    if(!nested)throw new Error('History flyout item not found');
    await app.mouse.move(nested[0]+nested[2]/2,nested[1]+nested[3]/2);
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['flyout.1']);
    await recordPair(ref,app,route,viewport,'flyout-hr-history',errors,true);
    await Promise.all([ref.mouse.click(viewport.width-3,viewport.height-3),app.mouse.click(viewport.width-3,viewport.height-3)]);
    await ref.locator('button[title="Thông báo hệ thống"]').click();await clickAppElement(app,'header.notifications');
    await recordPair(ref,app,route,viewport,'notifications-open',errors,true);
    await Promise.all([ref.mouse.click(viewport.width/2,viewport.height-3),app.mouse.click(viewport.width/2,viewport.height-3)]);
    await ref.locator('.kiyovn-user-menu-trigger').click();await clickAppElement(app,'header.user');
    await recordPair(ref,app,route,viewport,'account-open',errors,true);
    await Promise.all([ref.goto(refOrigin+route),command(app,{path:route,dark:false,collapsed:false})]);
    // The existing app account window is closed by its trigger; no logout action.
    await clickAppElement(app,'header.user');
  }
  const create={'/admin/assets/list':{label:/Thêm tài sản mới/,button:'assets.add',dialog:'assets.edit'},'/admin/crm':{label:/Thêm mới/,button:'crm.add',dialog:'crm.create'},'/admin/tasks':{label:/Thêm nhiệm vụ/,button:'tasks.add',dialog:'tasks.create'},'/admin/hr/employees':{label:/Thêm nhân viên/,button:'employees.add',dialog:'employees.edit'},'/admin/users':{label:/Thêm tài khoản/,button:'users.create',dialog:'users.create'},'/admin/workflows/requests':{label:/Tạo yêu cầu trình ký/,button:'workflow.requests.create',dialog:'workflow.requests.create'},'/admin/business/org-units':{label:/Thêm đơn vị mới/,button:'org.create',dialog:'org.edit'},'/admin/tickets':{label:/Tạo Ticket mới/,button:'tickets.create',dialog:'tickets.create'},'/admin/tickets/incidents':{label:/Báo cáo sự cố khẩn cấp/,button:'incidents.create',dialog:'incidents.create'},'/admin/documents/list':{label:/Ban hành văn bản/,button:'documents.add',dialog:'documents.create'},'/admin/documents/archives':{label:/Vào sổ văn thư/,button:'documents.add',dialog:'documents.create'},'/admin/documents/notes':{label:/Tạo chỉ đạo mới/,button:'documents.add',dialog:'documents.create'},'/admin/assets/system':{label:/Thêm thiết lập mới/,button:'asset.system.add',dialog:'asset.system.create'}}[route];
  if(route.startsWith('/admin/finance/cash/')&&['expense','income','transactions'].includes(route.split('/').at(-1))){
    await ref.getByRole('button',{name:/Lập phiếu thu \/ chi/}).click();await clickAppElement(app,'finance.cash.create');
    await ref.locator('.ant-modal').waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.create.dialog']);
    await recordPair(ref,app,route,viewport,'create-dialog',errors,true);
    await ref.locator('.kiyovn-datepicker-input').click();await clickAppElement(app,'date.cash.date.trigger');
    await ref.locator('.kiyovn-datepicker-popup').waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['date.cash.date.popup']);
    await recordPair(ref,app,route,viewport,'date-picker',errors,true);
    await ref.locator('.kiyovn-datepicker-popup > div:first-child > div:nth-child(2) > span').first().click();await clickAppElement(app,'date.cash.date.month');
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['date.cash.date.popup']?.[3]===230);
    await recordPair(ref,app,route,viewport,'date-picker-month',errors,true);
    await ref.locator('.kiyovn-datepicker-popup > div:first-child > div:nth-child(2) > span').first().click();
    const popup=(await appSnapshot(app)).rects['date.cash.date.popup'];await app.mouse.click(popup[0]+popup[2]/2,popup[1]+25);
    await recordPair(ref,app,route,viewport,'date-picker-year',errors,true);
    await ref.locator('.ant-modal-close').click();await clickAppElement(app,'finance.cash.create.close');
    await ref.locator('.ant-modal').waitFor({state:'hidden'});
    await app.waitForFunction(()=>!JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.create.dialog']);
  }
  if(create){
    await ref.getByRole('button',{name:create.label}).click();await clickAppElement(app,create.button);
    await ref.locator('.ant-modal').waitFor();
    await app.waitForFunction(key=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.[key],create.dialog+'.dialog');
    await recordPair(ref,app,route,viewport,'create-dialog',errors,true);
    // Only explicit close controls are used; no form/data is submitted.
    await ref.locator('.ant-modal-close').click();await clickAppElement(app,create.dialog+'.close');
    await ref.locator('.ant-modal').waitFor({state:'hidden'});
    await app.waitForFunction(key=>!JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.[key],create.dialog+'.dialog');
  }
  if(environment.cashMutationFixture&&route==='/admin/finance/cash/transactions'&&viewport.width>992){
    const read=async(page,origin)=>{
      const authorization=requestAuthorization.get(page);
      if(!authorization)throw new Error('No authorization from the real UI session');
      const response=await page.request.get(origin+'/api/v1/finance/cash-transactions',{headers:{Authorization:authorization}});
      if(!response.ok())throw new Error(`Cash readback failed: ${response.status()}`);
      const {data}=await response.json();
      if(data?.length!==1)throw new Error('Cash UI mutation requires exactly one disposable fixture voucher');
      return data[0].status;
    };
    const assertStatus=async(status)=>{
      const statuses=await Promise.all([read(ref,apiOrigin),read(app,appOrigin)]);
      if(statuses.some(value=>value!==status))throw new Error(`Cash UI readback expected ${status}, received ${statuses.join(' / ')}`);
      return statuses;
    };
    const evidence={before:await assertStatus('Đã hoàn thành')};
    await ref.getByRole('button',{name:/Phiếu$/}).first().click();await clickAppElement(app,'finance.cash.row.0.detail');
    await ref.locator('.ant-drawer-content-wrapper').waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.detail.drawer']);
    await recordPair(ref,app,route,viewport,'voucher-detail',errors);
    await ref.getByRole('button',{name:/Hủy Phiếu$/}).click();await clickAppElement(app,'finance.cash.detail.cancel');
    await ref.locator('.ant-modal').waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.cancel.dialog']);
    evidence.opened=await assertStatus('Đã hoàn thành');
    await recordPair(ref,app,route,viewport,'cancel-confirmation',errors);
    await ref.locator('.ant-modal').getByRole('button',{name:'Hủy',exact:true}).click();await clickAppElement(app,'finance.cash.cancel.dismiss');
    await ref.locator('.ant-modal').waitFor({state:'hidden'});
    await app.waitForFunction(()=>!JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.cancel.dialog']);
    evidence.dismissed=await assertStatus('Đã hoàn thành');
    await recordPair(ref,app,route,viewport,'cancel-dismissed',errors);
    await ref.getByRole('button',{name:/Hủy Phiếu$/}).click();await clickAppElement(app,'finance.cash.detail.cancel');
    await ref.locator('.ant-modal').waitFor();
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.rects?.['finance.cash.cancel.dialog']);
    const changed=[ref.waitForResponse(response=>response.url().includes('/finance/cash-transactions/')&&response.request().method()==='PATCH'),app.waitForResponse(response=>response.url().includes('/finance/cash-transactions/')&&response.request().method()==='PATCH')];
    await ref.locator('.ant-modal').getByRole('button',{name:'Xác nhận hủy',exact:true}).click();await clickAppElement(app,'finance.cash.cancel.confirm');
    const responses=await Promise.all(changed);
    if(responses.some(response=>!response.ok()))throw new Error('Cash UI cancellation was not acknowledged by both APIs');
    evidence.confirmed=await assertStatus('Đã hủy');
    await recordPair(ref,app,route,viewport,'cancel-acknowledged',errors);
    await fs.writeFile(path.join(out,'reports/cash-mutation-evidence.json'),JSON.stringify({viewport,...evidence},null,2));
  }
}

try {
  for(const viewport of viewports){
    const options={viewport,deviceScaleFactor:1,locale:environment.locale,timezoneId:environment.timezoneId,colorScheme:'light'};
    const refContext=await browser.newContext(options), appContext=await browser.newContext(options);
    let closing=false;
    const pendingForwards=new Set();
    // Forward to a separate real legacy API. No request is fulfilled with fabricated data.
    await refContext.route('http://localhost:3003/api/v1/**',route=>{
      const forward=(async()=>{
        try {
          const response=await route.fetch({url:route.request().url().replace('http://localhost:3003',apiOrigin)});await route.fulfill({response});
        } catch(error) {
          proxyErrors.push({viewport,closing,path:new URL(route.request().url()).pathname,message:redactDiagnostics(String(error).split('\n')[0])});
          await route.abort('failed').catch(()=>{});
        }
      })();
      pendingForwards.add(forward);
      forward.finally(()=>pendingForwards.delete(forward));
      return forward;
    });
    await appContext.addInitScript(()=>localStorage.setItem('kiyo.visual.enabled','true'));
    if(fontProvenance.length)await appContext.addInitScript(fonts=>{
      // Split stores to stay below the browser's per-store quota.
      for(const [file,encoded]of Object.entries(fonts))(file==='arial.ttf'?sessionStorage:localStorage).setItem('kiyo.visual.font.'+file,encoded);
    },fontFixture);
    const ref=await refContext.newPage(), app=await appContext.newPage(), errors=[];
    if(fixedTime)await Promise.all([ref.clock.setFixedTime(new Date(fixedTime)),app.clock.setFixedTime(new Date(fixedTime))]);
    for(const [label,page]of [['reference',ref],['actual',app]]){
      page.on('request',request=>{const authorization=request.headers().authorization;if(authorization?.startsWith('Bearer '))requestAuthorization.set(page,authorization);});
      page.on('pageerror',error=>errors.push({side:label,type:'runtime',message:error.message}));
      page.on('console',message=>{if(message.type()==='error')errors.push({side:label,type:'console',message:message.text()})});
      page.on('response',response=>{if(response.status()>=400)errors.push({side:label,type:'http',status:response.status(),path:new URL(response.url()).pathname})});
    }
    await Promise.all([ref.goto(refOrigin+'/login'),app.goto(appOrigin)]);
    if(build){
      const loaded=await app.locator('script[type="module"]').allTextContents();
      const js=build.assets.find(a=>a.name.endsWith('.js'));
      if(!js||!loaded.some(s=>s.includes(js.name)))throw new Error('Served browser bundle differs from the recorded visual build');
    }
    await app.waitForFunction(()=>JSON.parse(localStorage.getItem('kiyo.visual.snapshot')||'null')?.route==='/login',{},{timeout:60000});
    if(fontProvenance.length&&(await appSnapshot(app))?.font!=='Segoe UI')throw new Error('Installed Windows font fixture was not loaded by the visual-test build.');
    if(routeSet.includes('/login'))await recordPair(ref,app,'/login',viewport,'default',errors);
    if(args.has('states')&&routeSet.includes('/login')){
      await ref.locator('input[autocomplete="username"]').focus();await clickAppElement(app,'login.email');
      await recordPair(ref,app,'/login',viewport,'email-focused',errors,true);
      await Promise.all([ref.mouse.click(2,2),app.mouse.click(2,2)]);
    }
    if(routeSet.includes('/activate-account'))results.push({route:'/activate-account',viewport,status:'NOT_TESTED',reason:'Activation is a public one-shot flow; not an authenticated navigation entry'});
    const authRoutes=routeSet.filter(r=>r.startsWith(authenticatedPrefix));
    if(authRoutes.length){
      const response=await refContext.request.post(apiOrigin+'/api/v1/auth/login',{data:{email:process.env.PARITY_EMAIL,password:process.env.PARITY_PASSWORD}});
      if(!response.ok())throw new Error(`Reference auth failed: ${response.status()}`);
      const session=await response.json();
      if(session.user?.role!==captureRole)throw new Error(`Reference session role must be ${captureRole}, received ${session.user?.role}`);
      await ref.evaluate(s=>{localStorage.setItem('minepanel_token',s.access_token||s.token);localStorage.setItem('minepanel_user',JSON.stringify(s.user));},session);
      await loginApp(app);
      for(const route of authRoutes){
        try{
          errors.length=0;
          await Promise.all([ref.goto(refOrigin+route),command(app,{path:route,dark:false,collapsed:viewport.width<=992})]);
          await recordPair(ref,app,route,viewport,'default',errors);
          if(args.has('states'))await captureRouteStates(ref,app,route,viewport,errors);
          if(route==='/admin/dashboard'){
            await ref.locator('.kiyovn-header-left button').click();await command(app,{collapsed:viewport.width>992});
            await recordPair(ref,app,route,viewport,viewport.width>992?'collapsed':'drawer-open',errors);
            if(viewport.width>992)await ref.locator('.kiyovn-header-left button').click();
            else await ref.mouse.click(viewport.width-2,viewport.height/2);
            await command(app,{collapsed:viewport.width<=992});
          }
        }catch(error){results.push({route,viewport,status:'ERROR',error:String(error),errors:errors.splice(0),lastAppSnapshot:await appSnapshot(app).catch(()=>null)});console.error(`${route}: ${error.message}`)}
      }
    }
    for(const route of routeSet.filter(r=>(r.startsWith('/employee')||r.startsWith('/admin/'))&&!r.startsWith(authenticatedPrefix)))results.push({route,viewport,status:'NOT_TESTED',reason:`Requires a separate ${captureRole==='ADMIN'?'USER':'ADMIN'} fixture; current session is ${captureRole}`});
    closing=true;
    await refContext.close();await appContext.close();
    await Promise.allSettled([...pendingForwards]);
  }
} finally {
  await browser.close();
  const compared=results.filter(r=>r.pixels),passed=compared.filter(r=>r.status==='PASS');
  const summary={environment,referenceSourceManifest:'source-manifest.json',totalScreenshots:compared.length*2,
    comparedPairs:compared.length,exactMatchedPairs:passed.length,failedPairs:compared.length-passed.length,
    totalComparedPixels:compared.reduce((n,r)=>n+r.pixels.totalPixels,0),differentPixels:compared.reduce((n,r)=>n+r.pixels.differentPixels,0),
    errors:results.filter(r=>r.status==='ERROR'),proxyErrors,notTested:results.filter(r=>r.status==='NOT_TESTED'),results:results.map(({reference,actual,...r})=>r)};
  await fs.writeFile(path.join(out,'reports/summary.json'),JSON.stringify(summary,null,2));
  const lines=['# Measured visual comparison','','No tolerance, masks, resized images or replaced baselines. PASS requires exact pixels, route and no recorded runtime/console errors.','',
    '| Route | Viewport | State | Different / total pixels | Exact pixel match | Geometry position max | Geometry size max | Result |',
    '|---|---|---|---|---|---|---|---|',...compared.map(r=>`| ${r.route} | ${r.viewport.width}×${r.viewport.height} | ${r.state} | ${r.pixels.differentPixels} / ${r.pixels.totalPixels} | ${r.pixels.exactMatchPercentage.toFixed(6)}% | ${r.geometry.maximumElementPositionDeviation} | ${r.geometry.maximumElementSizeDeviation} | ${r.status} |`)];
  await fs.writeFile(path.join(out,'reports/summary.md'),lines.join('\n')+'\n');
  console.log(JSON.stringify({out,comparedPairs:summary.comparedPairs,exactMatchedPairs:summary.exactMatchedPairs,failedPairs:summary.failedPairs}));
}

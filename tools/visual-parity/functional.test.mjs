import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { root } from './inventory.mjs';

function localRequest(url,method='GET',headers={},data){
  return new Promise((resolve,reject)=>{
    const req=http.request(url,{method,headers,timeout:3000},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString('utf8')}));
    });
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Loopback request timeout')));
    if(data!==undefined)req.write(JSON.stringify(data));
    req.end();
  });
}

// A fresh process/database only: never use the interactive app's endpoint or DB.
test('real API contracts behind the revised presentation', {timeout:120000}, async t=>{
  const port=3424;
  const probe=net.createServer();
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(port,'127.0.0.1',resolve);});
  await new Promise(resolve=>probe.close(resolve));
  const runtimeParent=path.join(root,'build/visual-parity/runtime');
  await fs.mkdir(runtimeParent,{recursive:true});
  const runtime=await fs.mkdtemp(path.join(runtimeParent,'revision3-functional-'));
  const email='revision3@kiyo.test', password=randomBytes(24).toString('base64url')+'aA!1';
  const child=spawn(process.env.PARITY_SERVER || path.join(root,'target/debug/kiyo-server.exe'),[],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,KIYO_API_HOST:'127.0.0.1',KIYO_API_PORT:String(port),KIYO_API_DB_PATH:path.join(runtime,'kiyo.sqlite'),KIYO_API_STORAGE_PATH:path.join(runtime,'files'),KIYO_JWT_SECRET:randomBytes(48).toString('hex'),KIYO_BOOTSTRAP_ADMIN_EMAIL:email,KIYO_BOOTSTRAP_ADMIN_PASSWORD:password,KIYOVN_MASTER_KEY:randomBytes(32).toString('hex')},
  });
  let startupLog='';
  const remember=chunk=>{startupLog=(startupLog+chunk.toString()).slice(-4000);};
  child.stderr.on('data',remember);
  child.stdout.on('data',remember);
  let failure;
  child.once('error',error=>{failure=error;});
  child.once('exit',code=>{failure??=new Error(`Isolated API exited (${code})`);});
  const base=`http://127.0.0.1:${port}/api/v1`;
  let token;
  const request=async(method,route,data,authenticated=true)=>{
    const response=await localRequest(base+route,method,{'Content-Type':'application/json',...(authenticated&&token?{Authorization:`Bearer ${token}`}:{})},data);
    const body=JSON.parse(response.text);
    return {status:response.status,body};
  };
  const ok=async(method,route,data,expected=200)=>{
    const result=await request(method,route,data);
    if(result.status!==expected)t.diagnostic(`${method} ${route}: ${JSON.stringify(result.body).slice(0,600)}`);
    assert.equal(result.status,expected,`${method} ${route}: expected ${expected}, received ${result.status}`);
    return result.body;
  };
  try{
    let ready=false,readiness='No response';
    for(let attempt=0;attempt<500;attempt++){
      if(failure)throw failure;
      try{const response=await localRequest(`http://127.0.0.1:${port}/api/health`);readiness=`HTTP ${response.status}: ${response.text.slice(0,160)}`;if(response.status===200){ready=true;break;}}catch(error){readiness=error.message;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!ready)t.diagnostic(readiness+'\n'+startupLog.replaceAll(password,'[redacted]'));
    assert.ok(ready,'Isolated API must become ready');
    const login=await request('POST','/auth/login',{email,password},false);
    assert.equal(login.status,200,'Fixture bootstrap login');
    token=login.body.access_token;
    assert.ok(token,'Fixture must receive a token');
    await t.test('anonymous requests cannot read tickets',async()=>{
      const result=await request('GET','/tickets',undefined,false);
      assert.equal(result.status,401);
    });
    await t.test('organization create, edit, list and delete',async()=>{
      const unit={key:'visual-org',code:'VIS-ORG',name:'Visual fixture unit',parentUnit:'',manager:'',headcountLimit:4,location:'Fixture lab',annualBudget:1200000,budgetSpent:0,status:'Đang hoạt động'};
      await ok('PUT','/collections/business_org_units',{records:[unit]});
      let response=await ok('GET','/collections/business_org_units');
      assert.equal(response.data.length,1);
      assert.equal(response.data[0].name,unit.name);
      unit.location='Updated fixture lab';
      await ok('PUT','/collections/business_org_units',{records:[unit]});
      response=await ok('GET','/collections/business_org_units');
      assert.equal(response.data[0].location,unit.location);
      await ok('DELETE','/collections/business_org_units/visual-org');
      response=await ok('GET','/collections/business_org_units');
      assert.equal(response.data.length,0);
    });
    await t.test('ticket creation, transition validation and completion',async()=>{
      const response=await request('POST','/tickets',{title:'Visual fixture ticket',requester:'Fixture requester',department:'Fixture lab',priority:'Cao'});
      assert.ok([200,201].includes(response.status),`Ticket create returned ${response.status}`);
      const ticket=response.body.ticket;
      assert.equal(ticket.status,'Mới tạo');
      const invalid=await request('PATCH','/tickets/'+ticket.key,{status:'invalid'});
      assert.ok([400,422].includes(invalid.status),`Invalid status must be rejected, received ${invalid.status}`);
      assert.equal((await ok('PATCH','/tickets/'+ticket.key,{status:'Đang xử lý'})).ticket.status,'Đang xử lý');
      assert.equal((await ok('PATCH','/tickets/'+ticket.key,{status:'Đã hoàn thành'})).ticket.status,'Đã hoàn thành');
      assert.equal((await ok('GET','/tickets')).data.length,1);
    });
    await t.test('asset revisions reject stale writes and preserve unknown source fields',async()=>{
      const initial=await ok('GET','/collections/asset_items');
      assert.match(initial.revision,/^[a-f0-9]{64}$/);
      const asset={key:'visual-asset',code:'VIS-001',barcode:'VIS-BAR',name:'Thiết bị kiểm thử giao diện',category:'Thiết bị IT',model:'Fixture model',purchaseDate:'2026-10-24',supplier:'Fixture supplier',originalPrice:12000000,depreciationMonths:36,accumulatedDepreciation:1000000,netBookValue:11000000,location:'Fixture lab',assignedTo:'Fixture operator',department:'Fixture lab',status:'Trong kho',warrantyExpiry:'2027-10-24',specs:'Fixture configuration',notes:'Disposable test record',sourceExtra:{keep:true}};
      await ok('PUT','/collections/asset_items',{records:[asset],expectedRevision:initial.revision});
      const current=await ok('GET','/collections/asset_items');
      assert.notEqual(current.revision,initial.revision);
      assert.deepEqual(current.data[0].sourceExtra,{keep:true});
      const stale=await request('PUT','/collections/asset_items',{records:[],expectedRevision:initial.revision});
      assert.equal(stale.status,409);
      await ok('PUT','/collections/asset_items',{records:[],expectedRevision:current.revision});
    });
    await t.test('CRM keeps zero amounts, server-owned codes and type filtering',async()=>{
      const input={type:'supplier',name:'Đối tác kiểm thử giao diện',taxCode:'VIS-TAX',industry:'Fixture lab',contactPerson:'Fixture contact',phone:'0900000000',email:'fixture@kiyo.test',address:'Fixture address',bankAccount:'Fixture bank',creditLimit:0,totalValue:0,debtBalance:0,tier:'Tiêu chuẩn',accountManager:'Fixture operator',status:'Đang hoạt động'};
      const response=await request('POST','/crm/contacts',input);
      assert.ok([200,201].includes(response.status),`CRM create returned ${response.status}`);
      assert.equal(response.body.contact.type,'supplier');
      assert.ok(response.body.contact.code);
      assert.equal(response.body.contact.creditLimit,0);
      const list=await ok('GET','/crm/contacts?type=supplier');
      assert.equal(list.data.length,1);
      assert.equal((await ok('GET','/crm/contacts?type=customer')).data.length,0);
      const invalid=await request('POST','/crm/contacts',{...input,debtBalance:-1});
      assert.ok([400,422].includes(invalid.status));
    });
    await t.test('meeting booking rejects overlap and cancellation releases the slot',async()=>{
      const created=await request('POST','/meeting-rooms/rooms',{name:'Phòng họp kiểm thử giao diện',capacity:8,location:'Fixture lab',equipment:['Fixture screen']});
      assert.equal(created.status,201);
      const booking={roomName:created.body.room.name,meetingTitle:'Cuộc họp kiểm thử',booker:'Fixture operator',date:'2026-10-24',timeSlot:'09:00 - 10:00',participantsCount:4};
      const response=await request('POST','/meeting-rooms/bookings',booking);
      assert.equal(response.status,201);
      assert.equal((await request('POST','/meeting-rooms/bookings',{...booking,timeSlot:'09:30 - 10:30'})).status,409);
      await ok('PATCH','/meeting-rooms/bookings/'+response.body.booking.key);
      assert.equal((await request('POST','/meeting-rooms/bookings',booking)).status,201);
    });
    await t.test('cash list, create and cancel using the existing contract',async()=>{
      await ok('GET','/finance/cash-transactions');
      const payload={type:'Thu',source:'bank',category:'Visual fixture receipt',amount:125000,date:'2026-10-23',recipientOrPayer:'Fixture partner',account:'Fixture bank',status:'Đã hoàn thành',note:'Disposable fixture'};
      const created=await request('POST','/finance/cash-transactions',payload);
      assert.ok([200,201].includes(created.status),`Cash create returned ${created.status}`);
      const item=created.body.transaction;
      assert.equal(item.amount,payload.amount);
      await ok('PATCH','/finance/cash-transactions/'+item.key,{status:'Đã hủy'});
    });
    await t.test('document catalogues and service catalogue use separate real collections',async()=>{
      for(const scope of ['enterprise_documents','doc_notes','doc_archives','contract_templates','enterprise_services']) {
        const record={key:'fixture-'+scope,id:'fixture-'+scope,title:'Kiểm thử danh mục',name:'Kiểm thử danh mục',unknownLegacyField:'preserved'};
        const created=await request('POST','/collections/'+scope,{record});
        assert.equal(created.status,201,scope);
        const listed=await ok('GET','/collections/'+scope);
        assert.equal(listed.data.length,1,scope);
        assert.equal(listed.data[0].unknownLegacyField,'preserved');
      }
    });
    await t.test('chat persists replies and reactions while keeping direct messages private',async()=>{
      const adminToken=token;
      const people=[];
      for(const suffix of ['recipient','outsider']) {
        const userEmail=`chat-${suffix}@kiyo.test`;
        await ok('POST','/users',{email:userEmail,password,name:`Chat ${suffix}`,role:'USER'},201);
        const login=await request('POST','/auth/login',{email:userEmail,password},false);
        assert.equal(login.status,200);
        assert.equal(login.body.user.role,'USER');
        people.push(login.body);
      }
      try {
        const dm=(await ok('POST','/chat/dms',{userIds:[people[0].user.id]})).data;
        assert.equal(dm.type,'DM');
        const route=`/chat/channels/${dm.id}/messages`;
        const parent=(await ok('POST',route,{content:'Nội dung kiểm thử thật'})).data;
        token=people[0].access_token;
        const reply=(await ok('POST',route,{content:'Trả lời kiểm thử',replyToId:parent.id})).data;
        assert.equal(reply.replyToId,parent.id);
        let reaction=(await ok('POST',`/chat/messages/${parent.id}/reactions`,{emoji:'👍'})).data;
        assert.equal(reaction.reactions.length,1);
        reaction=(await ok('POST',`/chat/messages/${parent.id}/reactions`,{emoji:'👍'})).data;
        assert.equal(reaction.reactions.length,0);
        await ok('POST',`/chat/channels/${dm.id}/read`,{});
        const messages=await ok('GET',route);
        assert.equal(messages.data.length,2);
        assert.equal((await request('POST',route,{content:'Không được giả lập tệp',attachments:[{name:'fake.txt'}]})).status,422);
        token=people[1].access_token;
        // Private channels intentionally return 404 so their existence is not disclosed.
        assert.equal((await request('GET',route)).status,404);
        assert.equal((await request('POST',route,{content:'Không được đọc/ghi DM của người khác'})).status,404);
        const channels=await ok('GET','/chat/channels');
        assert.ok(!channels.data.some(channel=>channel.id===dm.id));
      } finally { token=adminToken; }
    });
    await t.test('asset settings, work orders and menu metadata persist and reject USER writes',async()=>{
      const scopes=['asset_systems','asset_todos','dropdown_positions'];
      for(const scope of scopes) {
        const key='audit-'+scope;
        const record={key,name:'Thiết lập kiểm thử',taskTitle:'Nhiệm vụ kiểm thử',status:'Chờ xử lý',checklist:[{item:'Kiểm tra',done:false}],sourceExtra:{preserve:true}};
        const created=await ok('POST','/collections/'+scope,{record},201);
        assert.equal(created.record.key,key);
        const changed=await ok('PATCH',`/collections/${scope}/${key}`,{patch:{status:'Đã hoàn thành',checklist:[{item:'Kiểm tra',done:true}]}});
        assert.equal(changed.record.status,'Đã hoàn thành');
        assert.deepEqual(changed.record.sourceExtra,{preserve:true});
        const persisted=(await ok('GET','/collections/'+scope)).data.find(item=>item.key===key);
        assert.equal(persisted.checklist[0].done,true);
      }
      const adminToken=token;
      const login=await request('POST','/auth/login',{email:'chat-outsider@kiyo.test',password},false);
      assert.equal(login.status,200);
      token=login.body.access_token;
      try {
        for(const scope of scopes) {
          assert.equal((await request('POST','/collections/'+scope,{record:{key:'forbidden',name:'Must not be saved'}})).status,403);
          assert.equal((await request('PATCH',`/collections/${scope}/audit-${scope}`,{patch:{status:'forbidden'}})).status,403);
        }
      } finally {token=adminToken;}
    });
  }finally{
    child.kill();
    await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,5000).unref();});
    t.diagnostic('Disposable DB retained at '+runtime+'; interactive ports/databases were not changed.');
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';
import { ADMIN_CAPABILITIES } from '../src/services/adminAccessManagementService.js';
const id = '00000000-0000-4000-8000-000000000001';
const key = '00000000-0000-4000-8000-000000000002';
const item = {user_id:id,version:'3',active:true,principal:false,capabilities:['locais.ler'],nome:'Suporte'};
function fixture(options={}) {
 const calls=[];
 const service={available:options.available??true,contracts:options.contracts??{grant:true,suspend:true,revoke:true},
  async list(args){calls.push(['list',args]);return {items:[item],next_cursor:null};},
  async detail(userId){calls.push(['detail',userId]);return item;},
  async grant(input){calls.push(['grant',input]); if(options.failOnce && calls.filter(c=>c[0]==='grant').length===1) throw Error('Rede indisponível'); return {audit_id:'9'};},
  async suspend(input){calls.push(['suspend',input]);return {audit_id:'10'};},
  async revoke(input){calls.push(['revoke',input]);return {audit_id:'11'};},
 };
 const ui=renderScreen(new URL('../src/components/AdminAccessPanel.js',import.meta.url),'AdminAccessPanel',{service,newKey:()=>key},{
  'expo-crypto':{randomUUID:()=>key},'../services/adminService':{adminService:{administradores:service}},
  '../services/adminAccessManagementService.js':{ADMIN_CAPABILITIES},
 });
 const change=(label,value)=>{ui.nodes().find(n=>n.props.accessibilityLabel===label).props.onChangeText(value);ui.render();};
 const press=async label=>{const n=ui.button(label);assert.ok(n,label);assert.equal(n.props.disabled,false);await n.props.onPress();ui.render();};
 return {ui,calls,change,press};
}
test('administradores UI: contrato bloqueado não consulta nem mostra formulário de escrita',async()=>{
 const f=fixture({available:false});await f.ui.settle();assert.deepEqual(f.calls,[]);
 assert.match(f.ui.text(),/Gestão de acessos bloqueada/);assert.equal(f.ui.button('Conceder acesso'),undefined);
});
test('administradores UI: lista, detalhes e capacidades integram o serviço',async()=>{
 const f=fixture();await f.ui.settle();assert.match(f.ui.text(),/Suporte/);
 await f.press(`Ver administrador ${id}`);assert.match(f.ui.text(),/locais.ler/);
 assert.equal(f.calls[1][0],'detail');
});
test('administradores UI: Enter envia a busca e fecha o detalhe anterior',async()=>{
 const f=fixture();await f.ui.settle();await f.press(`Ver administrador ${id}`);
 f.change('Pesquisar administradores',' suporte ');
 const input=f.ui.nodes().find(n=>n.props.accessibilityLabel==='Pesquisar administradores');
 assert.equal(input.props.returnKeyType,'search');
 input.props.onSubmitEditing();f.ui.render();await f.ui.settle();
 assert.equal(f.calls.filter(call=>call[0]==='list').at(-1)[1].search,'suporte');
 assert.doesNotMatch(f.ui.text(),/Permissões administrativas/);
});
test('administradores UI: concessão versionada sem parâmetro de principal ou ator',async()=>{
 const f=fixture();await f.ui.settle();await f.press(`Ver administrador ${id}`);
 await f.press('Alterar capacidades ou reativar');f.change('Motivo da alteração de acesso','Suporte solicitado pelo usuário');
 await f.press('Confirmar alteração de acesso');
 const input=f.calls.find(c=>c[0]==='grant')[1];assert.equal(input.expectedVersion,'3');assert.equal(input.idempotencyKey,key);
 assert.equal(input.principal,undefined);assert.equal(input.actor,undefined);assert.match(f.ui.text(),/Operação confirmada/);
});
test('administradores UI: falha de rede preserva formulário e chave para retry explícito',async()=>{
 const f=fixture({failOnce:true});await f.ui.settle();await f.press('Conceder acesso');
 f.change('UUID do usuário existente',id);f.change('Motivo da alteração de acesso','Suporte solicitado pelo usuário');
 await f.press('Confirmar alteração de acesso');assert.match(f.ui.text(),/Rede indisponível/);
 await f.press('Confirmar alteração de acesso');
 const writes=f.calls.filter(c=>c[0]==='grant');assert.equal(writes.length,2);assert.deepEqual(writes[0][1],writes[1][1]);
});
test('administradores UI: suspensão e revogação exigem motivo em confirmação separada',async()=>{
 for(const [label,operation] of [['Suspender acesso','suspend'],['Revogar acesso','revoke']]){
  const f=fixture();await f.ui.settle();await f.press(`Ver administrador ${id}`);await f.press(label);
  assert.equal(f.calls.some(c=>c[0]===operation),false);f.change('Motivo da alteração de acesso','Atendimento com revisão de acesso');
  await f.press('Confirmar alteração de acesso');assert.equal(f.calls.find(c=>c[0]===operation)[1].expectedVersion,'3');
 }
});
test('administradores UI: contrato de leitura não libera botões de mutação',async()=>{
 const f=fixture({contracts:{}});await f.ui.settle();await f.press(`Ver administrador ${id}`);
 assert.equal(f.ui.button('Conceder acesso'),undefined);assert.equal(f.ui.button('Revogar acesso'),undefined);
});

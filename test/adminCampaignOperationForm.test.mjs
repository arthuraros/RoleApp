import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderScreen } from './helpers/render-screen.mjs';
import * as campaigns from '../src/utils/campaigns.js';
const key='00000000-0000-4000-8000-000000000001';
function fixture(operation, options={}) {
 const calls=[], successes=[],cancel=[];
 const service={contracts:options.blocked?{}:{[operation]:true}, async [operation](input){
  calls.push(input);if(options.failOnce && calls.length===1) throw Error('Rede indisponível');
  return {id_campanha:'12',version:'8',audit_id:'9'};
 }};
 const ui=renderScreen(new URL('../src/components/AdminCampaignOperationForm.js',import.meta.url),'AdminCampaignOperationForm',{
  operation,service,newKey:()=>key,campaign:operation==='create'?null:{id_campanha:'12',id_local:'30',id_usuario:key,
  version:'7',titulo:'Anterior',tipo:'destaque',duracao_dias:7},onSuccess:r=>successes.push(r),onCancel:()=>cancel.push(true),
 },{'expo-crypto':{randomUUID:()=>key},'../utils/campaigns.js':campaigns});
 const change=(label,value)=>{ui.nodes().find(n=>n.props.accessibilityLabel===label).props.onChangeText(value);ui.render();};
 const save=async()=>{await ui.button('Confirmar operação na campanha').props.onPress();ui.render();};
 return {ui,calls,successes,cancel,change,save};
}
test('campanhas UI: bloqueio de contrato impede envio inclusive handler direto',async()=>{
 const f=fixture('create',{blocked:true});assert.equal(f.ui.button('Confirmar operação na campanha').props.disabled,true);
 await f.save();assert.equal(f.calls.length,0);
});
test('campanhas UI: cadastro envia referências reais sem preço, status ou cobrança',async()=>{
 const f=fixture('create');f.change('ID do local','30');f.change('UUID do proprietário do local',key);
 f.change('Título da campanha','Campanha');f.change('Motivo da operação na campanha','Suporte autorizado pelo parceiro');
 await f.save();assert.equal(f.calls[0].localId,'30');assert.equal(f.calls[0].ownerId,key);
 assert.equal(f.calls[0].fields.valor_total,undefined);assert.equal(f.calls[0].fields.status,undefined);assert.equal(f.successes.length,1);
});
test('campanhas UI: edição usa ID e versão do detalhe sem trocar proprietário',async()=>{
 const f=fixture('update');f.change('Título da campanha','Revisada');await f.save();
 assert.equal(f.calls[0].id,'12');assert.equal(f.calls[0].expectedVersion,'7');assert.equal(f.calls[0].ownerId,undefined);
 assert.equal(f.calls[0].fields.titulo,'Revisada');
});
test('campanhas UI: transições explícitas não enviam patch nem vigência arbitrária',async()=>{
 for(const operation of ['approve','activate','pause','end']){
  const f=fixture(operation);f.change('Motivo da operação na campanha','Suporte autorizado pelo parceiro');await f.save();
  assert.equal(f.calls[0].fields,undefined);assert.equal(f.calls[0].expectedVersion,'7');
 }
});
test('campanhas UI: retry de rede conserva chave e dados',async()=>{
 const f=fixture('pause',{failOnce:true});await f.save();assert.match(f.ui.text(),/Rede indisponível/);
 await f.save();assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.successes.length,1);
});

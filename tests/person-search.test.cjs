const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {test} = require('node:test');
function api(fetch) {
  const Staff={config:{apiBase:'https://example.test',searchLimit:50,defaultConcurrency:2,defaultInterval:0,cacheTtl:{search:10000}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/api.js'),'utf8'),{Staff,window:{Staff},fetch,AbortController,setTimeout,clearTimeout,structuredClone});
  return Staff.api;
}
test('person suggestions return the relevant first page even when hundreds of fuzzy matches exist',async()=>{
 const requests=[];
 const client=api(async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});if(!url.endsWith('offset=0'))throw new Error('Suggestions must not fetch later fuzzy pages');return{status:200,json:async()=>({total:705,data:[{id:209,name:'松岡裕紀'},{id:37507,name:'松永康佑'}]})};});
 const people=await client.searchPersons(' 松永康佑 ');
 assert.deepEqual(Array.from(people,p=>p.id),[37507,209]);assert.equal(requests.length,1);assert.equal(requests[0].body.keyword,'松永康佑');
 await client.searchPersons('松永康佑');assert.equal(requests.length,1);
 await client.searchPersons('松永康佑','',true);assert.equal(requests.length,2);
});
test('person matching handles spacing and full-width characters while preserving career filters',async()=>{
 let body;
 const client=api(async(url,init)=>{body=JSON.parse(init.body);return{status:200,json:async()=>({total:2,data:[{id:1,name:'ＭＡＴＳＵＮＡＧＡ'},{id:37507,name:'松永 康佑'}]})};});
 const people=await client.searchPersons('松永　康佑','producer');
 assert.equal(people[0].id,37507);assert.equal(body.keyword,'松永 康佑');assert.deepEqual(body.filter,{career:['producer']});
});
test('a failed name search remains an error and an empty input never fetches',async()=>{
 let requests=0;
 const client=api(async()=>{requests++;return{status:400,json:async()=>({description:'搜索暂不可用'})};});
 assert.equal((await client.searchPersons('   ')).length,0);assert.equal(requests,0);
 await assert.rejects(client.searchPersons('松永康佑'),/搜索暂不可用/);assert.equal(requests,1);
});
test('subject searches keep their existing pagination when person suggestions stop after one page',async()=>{
 const requests=[];
 const client=api(async(url,init)=>{requests.push(url);assert.deepEqual(JSON.parse(init.body).filter,{type:[2]});return{status:200,json:async()=>url.endsWith('offset=0')?{total:3,data:[{id:1},{id:2}]}:{total:3,data:[{id:3}]}};});
 const result=await client.searchSubjects('动画',[2]);assert.deepEqual(Array.from(result,p=>p.id),[1,2,3]);assert.equal(requests.length,2);assert.ok(requests[1].endsWith('offset=2'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {brandLettering} from './creative-brand-lettering';
const guide='<BRAND_LETTERING>["Example Brand","Un slogan"]</BRAND_LETTERING>';
test('explicit lettering appears only on cover and closing without PNG',()=>{
 assert.deepEqual(brandLettering(guide,1,6),['Example Brand','Un slogan']);
 assert.deepEqual(brandLettering(guide,6,6),['Example Brand','Un slogan']);
 assert.deepEqual(brandLettering(guide,2,6),[]);
 assert.deepEqual(brandLettering(guide,1,6,true),[]);
});
test('never infer lettering from prose or accept invalid configuration',()=>{
 for(const guide of ['Brand name is Example','<BRAND_LETTERING>bad</BRAND_LETTERING>','<BRAND_LETTERING>["<override>"]</BRAND_LETTERING>']) assert.deepEqual(brandLettering(guide,1,1),[]);
});

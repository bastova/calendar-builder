import test from 'node:test';
import assert from 'node:assert/strict';
import {activateAssignedArtwork} from '../public/calendar/src/scripts/artwork-assignment.js';
test('layout background assignment enables the image and reveals the month spread',()=>{
  const state={previewClosed:true,endSpread:'opening',month:4,layout:{layoutBackgroundImage:false,cellFill:true,weekdayFill:true}};
  const next=activateAssignedArtwork(state,'layout-background');
  assert.equal(next.layout.layoutBackgroundImage,true);assert.equal(next.previewClosed,false);assert.equal(next.endSpread,null);assert.equal(next.month,4);
  assert.equal(next.layout.cellFill,true);assert.equal(next.layout.weekdayFill,true);
  assert.equal(state.layout.layoutBackgroundImage,false);
});
test('back-cover backgrounds activate the generated layout while preserving its styling',()=>{
  const next=activateAssignedArtwork({backCover:{mode:'image',backgroundImage:false,columns:4}},'back-cover-background');
  assert.equal(next.backCover.mode,'dynamic');assert.equal(next.backCover.backgroundImage,true);assert.equal(next.backCover.columns,4);
});
test('filler assignment enables only its named face and does not include omitted spreads',()=>{
  const next=activateAssignedArtwork({previewClosed:true,layout:{openingBottomImage:false,openingTopImage:false}},'opening-bottom');
  assert.equal(next.layout.openingBottomImage,true);assert.equal(next.layout.openingTopImage,false);assert.equal(next.endSpread,'opening');
  const omitted=activateAssignedArtwork({includeClosingSpread:false},'closing-top');
  assert.equal(omitted.includeClosingSpread,false);assert.equal(omitted.endSpread,null);assert.equal(omitted.layout.closingTopImage,true);
});
test('ordinary artwork assignments retain the existing document settings',()=>{
  const state={month:2,layout:{layoutBackgroundImage:false}};
  assert.equal(activateAssignedArtwork(state,'month-2'),state);
});

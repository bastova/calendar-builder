import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarPagePlan, calendarSelections, calendarSelectionIndex, printPages, saddlePage, validateSaddleImposition } from '../public/calendar/src/scripts/layout.js';

for (const bindingStyle of ['wire','saddle']) {
  for (const includeOpeningSpread of [false,true]) for (const includeClosingSpread of [false,true]) {
    const state={bindingStyle,includeOpeningSpread,includeClosingSpread};
    test(`${bindingStyle}: opening ${includeOpeningSpread}, closing ${includeClosingSpread} preserves all monthly pairs and physical sheets`, () => {
      const plan=calendarPagePlan(state), selections=calendarSelections(state);
      const unpadded=26+2*Number(includeOpeningSpread)+2*Number(includeClosingSpread);
      const expected=bindingStyle==='saddle'?Math.ceil(unpadded/4)*4:unpadded;
      assert.equal(plan.logicalPages,expected);
      assert.equal(plan.pdfPages,bindingStyle==='saddle'?expected/2:expected);
      assert.equal(plan.physicalSheets,bindingStyle==='saddle'?expected/4:expected/2);
      assert.equal(plan.interiorSheets+plan.coverSheets,plan.physicalSheets);
      assert.equal(plan.paddingPages,expected-unpadded);
      assert.equal(plan.pages.filter(page=>page.padding).length,plan.paddingPages);
      assert.equal(plan.pages.filter(page=>page.endSpread==='opening').length,includeOpeningSpread?2:0);
      assert.equal(plan.pages.filter(page=>page.endSpread==='closing').length,includeClosingSpread?2:0);
      assert.equal(plan.pages[0].key,'front-cover');
      assert.equal(plan.pages.at(-1).key,'back-cover');
      assert.equal(selections.includes('opening'),includeOpeningSpread);
      assert.equal(selections.includes('closing'),includeClosingSpread);
      for(let month=0;month<12;month++) {
        const index=plan.pages.findIndex(page=>page.key===`month-${month}`);
        assert.equal(index%2,1,'Photo must occupy an even reader page');
        assert.equal(plan.pages[index+1].kind,'grid');
        assert.equal(plan.pages[index+1].month,month);
        assert.equal(calendarSelectionIndex({...state,month}),selections.indexOf(month));
      }
      if(bindingStyle==='saddle') {
        assert.equal(validateSaddleImposition(2027,state),true);
        const imposed=plan.imposition.flatMap(sheet=>[...sheet.front,...sheet.reverse]).sort((a,b)=>a-b);
        assert.deepEqual(imposed,Array.from({length:expected},(_,index)=>index+1));
        for(let page=1;page<=expected;page++) assert.equal(saddlePage(page,2027,state).kind,plan.pages[page-1].kind);
        assert.deepEqual(plan.imposition[0].front,[expected,1]);
        assert.deepEqual(plan.imposition[0].reverse,[2,expected-1]);
      }
    });
  }
}

test('older calendars keep both spreads and the original page sequence', () => {
  assert.equal(printPages().length,30);
  const plan=calendarPagePlan({bindingStyle:'saddle'});
  assert.equal(plan.logicalPages,32);
  assert.equal(plan.pages[3].key,'month-0');
  assert.equal(plan.pages[26].month,11);
  assert.equal(plan.pages[29].endSpread,'closing');
  assert.equal(plan.pages[30].endSpread,'closing');
});

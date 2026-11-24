'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname,'..','training-tracker.js'),'utf8');
const start = Date.parse('2026-11-24T15:00:00+09:00');
const goal = 3600000, key = 'musik-training-tracker-v1';

function open(data, time, visible = true) {
    let now = time, vibrations = 0, serial = 0;
    class Clock extends Date {static now() {return now;}}
    const localStorage = {getItem:k=>data.get(k)??null, setItem:(k,v)=>data.set(k,v)};
    const elements = new Map();
    function element(id) {
        if (!elements.has(id)) Object.assign(elements.set(id,new EventTarget()).get(id),{
            textContent:'',hidden:true,replaceChildren(){},appendChild(){}
        });
        return elements.get(id);
    }
    const win = new EventTarget(), doc = Object.assign(new EventTarget(),{
        hidden:!visible, readyState:'complete', documentElement:{lang:'en'}, hasFocus:()=>!doc.hidden,
        getElementById:element, querySelector:()=>null, createElement:()=>new EventTarget()
    });
    let tick, alarm;
    const ctx = vm.createContext({document:doc,Date:Clock,Intl,localStorage,
        crypto:{randomUUID:()=>time+'-'+(++serial),getRandomValues:x=>x.fill(1)},
        navigator:{vibrate(){vibrations++;}},TrainingCore:{storageError(){assert.fail('storage failed');}},
        addEventListener:win.addEventListener.bind(win),setInterval:(fn,ms)=>{if(ms===3000)tick=fn;},
        setTimeout:(fn,ms)=>{alarm={fn,ms};return 1;},clearTimeout:()=>{alarm=null;}});
    ctx.window=ctx; vm.runInContext(code,ctx);
    return {clock:ctx.TrainingTracker, element, set:t=>{now=t;}, tick:()=>tick(), buzz:()=>vibrations, alarm:()=>alarm,
        show:()=>{doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));},
        hide:()=>{doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));}};
}
function train(app, from, duration) {
    for(let offset=0;offset<duration;offset+=47000){
        app.set(from+offset);app.clock.activity('ap-answer');app.tick();
    }
    app.set(from+duration);app.tick();
}
const data = new Map();
let a = open(data,start);
a.clock.activity('demo');a.set(start+10000);a.tick();
assert.equal(a.clock.summary().ms,0,'sitting on the page and Demo do not start the clock');
train(a,start+10000,1500000);a.hide();
assert.equal(a.clock.summary().ms,1500000);
a.set(start+3*3600000);a.tick();
assert.equal(a.clock.summary().ms,1500000,'background time excluded');
const second = start+3*3600000;
a=open(data,second);
train(a,second,goal-1500000-1);
assert.equal(a.clock.summary().ms,goal-1);
assert(a.element('dailyGoalNotice').hidden,'no premature reminder from rounded minutes');
assert.equal(a.alarm().ms,1,'wake up at the threshold between periodic ticks');
a.set(second+goal-1500000);a.alarm().fn();
assert.equal(a.clock.summary().ms,goal);
assert(!a.element('dailyGoalNotice').hidden);assert.equal(a.buzz(),1);
a.clock.setLanguage('zh-TW');assert.match(a.element('dailyGoalText').textContent,/60 分鐘/);
a.element('dailyGoalDismiss').dispatchEvent(new Event('click'));
a.clock.pause();a.tick();assert(a.element('dailyGoalNotice').hidden);
const reopened=open(data,second+goal-1500000);
assert(reopened.element('dailyGoalNotice').hidden);assert.equal(reopened.buzz(),0);
const tomorrow = Date.parse('2026-11-25T00:00:00+09:00');
reopened.set(tomorrow);reopened.tick();
assert.equal(reopened.clock.summary().ms,0);
train(reopened,tomorrow,goal);
assert.equal(reopened.buzz(),1);assert(!reopened.element('dailyGoalNotice').hidden);

// Two overlapping saved intervals total 60 minutes, not 70. A hidden tab must not consume the reminder.
const shared = new Map([[key,JSON.stringify({pending:[
    {id:'violin',start:start-goal,end:start-1200000},{id:'piano',start:start-1800000,end:start}
]})]]);
const background=open(shared,start,false);
assert.equal(background.clock.summary().ms,goal);assert(background.element('dailyGoalNotice').hidden);
background.show();assert(!background.element('dailyGoalNotice').hidden);
assert.equal(open(shared,start).buzz(),0,'another tab or instrument does not announce again');
const midnight = open(new Map(),tomorrow-30000);
midnight.clock.activity('question');midnight.set(tomorrow+30000);midnight.tick();
assert.equal(midnight.clock.summary().ms,30000,'split a session at Tokyo midnight');
midnight.set(tomorrow+7200000);midnight.tick();
assert.equal(midnight.clock.summary().ms,45000,'stop counting a foreground page after its inactivity timeout');
console.log('PASS daily goal at exactly 60:00, multiple sessions, notice during practice, dismissal, tab/reload, overlapping time, idle/background and Tokyo midnight');

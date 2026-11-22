/* Relative Pitch Course v2: framework-free question engine, records and six-language labels.
 * Deliberately independent from the legacy Two notes question generator.
 * The suggested level order and review thresholds are design choices, not validated clinical gates.
 */
(function(root) {
  'use strict';
  const LEVELS = [
    {name:'Direction', distances:[0,1,2], directionOnly:true},
    {name:'1–2 semitones', distances:[1,2]},
    {name:'1–3 semitones', distances:Array.from({length:3},(_,i)=>i+1)},
    {name:'1–4 semitones', distances:Array.from({length:4},(_,i)=>i+1)},
    {name:'1–5 semitones', distances:Array.from({length:5},(_,i)=>i+1)},
    {name:'1–6 semitones', distances:Array.from({length:6},(_,i)=>i+1)},
    {name:'1–7 semitones', distances:Array.from({length:7},(_,i)=>i+1)},
    {name:'1–8 semitones', distances:Array.from({length:8},(_,i)=>i+1)},
    {name:'1–9 semitones', distances:Array.from({length:9},(_,i)=>i+1)},
    {name:'1–10 semitones', distances:Array.from({length:10},(_,i)=>i+1)},
    {name:'1–11 semitones', distances:Array.from({length:11},(_,i)=>i+1)},
    {name:'1–12 semitones', distances:Array.from({length:12},(_,i)=>i+1)},
    {name:'0–12 semitones (mixed)', distances:Array.from({length:13},(_,i)=>i)},
    {name:'12–13 semitones', distances:Array.from({length:2},(_,i)=>i+12)},
    {name:'12–14 semitones', distances:Array.from({length:3},(_,i)=>i+12)},
    {name:'12–15 semitones', distances:Array.from({length:4},(_,i)=>i+12)},
    {name:'12–16 semitones', distances:Array.from({length:5},(_,i)=>i+12)},
    {name:'12–17 semitones', distances:Array.from({length:6},(_,i)=>i+12)},
    {name:'12–18 semitones', distances:Array.from({length:7},(_,i)=>i+12)},
    {name:'12–19 semitones', distances:Array.from({length:8},(_,i)=>i+12)},
    {name:'12–20 semitones', distances:Array.from({length:9},(_,i)=>i+12)},
    {name:'12–21 semitones', distances:Array.from({length:10},(_,i)=>i+12)},
    {name:'12–22 semitones', distances:Array.from({length:11},(_,i)=>i+12)},
    {name:'12–23 semitones', distances:Array.from({length:12},(_,i)=>i+12)},
    {name:'12–24 semitones', distances:Array.from({length:13},(_,i)=>i+12)},
  ];
  const ALL_LEVEL = LEVELS.length;
  LEVELS.push({name:'All intervals', distances:Array.from({length:25}, (_, i) => i)});
  const allLabels = {en:'All intervals', 'zh-TW':'全部音程', ja:'すべての音程', de:'Alle Intervalle', it:'Tutti gli intervalli', el:'Όλα τα διαστήματα'};
  const SHORT = ['P1','m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','P8',
    'm9','M9','m10','M10','P11','TT+8','P12','m13','M13','m14','M14','P15'];
  const LOCALES = {
    en: {course:'Relative pitch course', level:'Level', activity:'Exercise', direction:'Direction', examples:'Learn by listening', practice:'Guided practice', review:'Weak intervals', test:'Independent check', locate:'Instrument location', melody:'Short melody', both:'Both', higher:'Ascending', lower:'Descending', showExamples:'Show / hide examples', sample:'Listen', up:'Up', down:'Down', same:'Same', reference:'Reference', replay:'Replay pair', replayCorrect:'Play correct', replaySelected:'Play my answer', next:'Next', ready:'Press Play to begin', listen:'Listen, then choose the interval', choosePosition:'Find the target on the instrument', melodyPrompt:'Which interval was the last step?', results:'Round complete', correct:'Correct', wrong:'Correct answer', independent:'First-listen', questions:'questions', due:'Focus: ', noData:'Not enough records yet', resume:'Play to begin a new round', challenge:'The note range cannot support this direction and these intervals. Choose Ascending or Descending.', note:'Intervals are measured in semitones; 6 = tritone (augmented fourth/diminished fifth).', compare:'Replay comparisons', stage:'Learning and assessment scores are stored separately.', export:'Export RP CSV', stats:'Recent results', directionTip:'Select direction only; choose Up, Down or Same.', melodyTip:'Listen to three notes; identify the last step.', locationTip:'Reference remains visible; select the second pitch.'},
    'zh-TW': {course:'相對音程課程',level:'關卡',activity:'訓練項目',direction:'方向',examples:'示範聆聽',practice:'引導練習',review:'弱項複習',test:'獨立測驗',locate:'樂器定位',melody:'短旋律',both:'雙向',higher:'上行',lower:'下行',showExamples:'展開／收起示範',sample:'聆聽',up:'上行',down:'下行',same:'同音',reference:'參考音',replay:'重聽雙音',replayCorrect:'聽正確音程',replaySelected:'聽我的答案',next:'下一題',ready:'按 Play 開始',listen:'聽完選擇音程',choosePosition:'在樂器上選出目標音',melodyPrompt:'最後一步是什麼音程？',results:'本組結束',correct:'正確',wrong:'正確答案',independent:'首聽',questions:'題',due:'重點：',noData:'尚未累積足夠紀錄',resume:'按 Play 開始新的一組',challenge:'目前音域無法容納此方向與音程；請選上行或下行。',note:'以半音距離計分；6 半音是三全音。',compare:'對比重聽',stage:'練習與測驗分別統計。',export:'匯出音程 CSV',stats:'近期結果',directionTip:'只判斷上行、下行或同音。',melodyTip:'聽三個音，回答最後一步。',locationTip:'參考音保持顯示，選出第二個音。'},
    ja: {course:'相対音程コース',level:'レベル',activity:'練習',direction:'方向',examples:'お手本',practice:'練習',review:'弱点復習',test:'独立テスト',locate:'楽器上で選択',melody:'短い旋律',both:'両方向',higher:'上行',lower:'下行',showExamples:'お手本を開く／閉じる',sample:'聴く',up:'上',down:'下',same:'同音',reference:'基準音',replay:'2音を再生',replayCorrect:'正解を聴く',replaySelected:'選択を聴く',next:'次へ',ready:'Playで開始',listen:'音程を選択してください',choosePosition:'楽器上で目標音を選んでください',melodyPrompt:'最後の2音の音程は？',results:'終了',correct:'正解',wrong:'正解は',independent:'初回聴取',questions:'問',due:'重点：',noData:'記録不足',resume:'Playで次のセット',challenge:'音域が足りません。上行または下行にしてください。',note:'半音数で採点します。6半音はトライトーンです。',compare:'聴き比べ',stage:'練習とテストは別集計です。',export:'CSVを書き出す',stats:'最近の成績',directionTip:'上行・下行・同音を選択。',melodyTip:'3音を聴き、最後の2音を回答。',locationTip:'基準音を表示したまま、2音目を選択。'},
    de: {course:'Intervallkurs',level:'Stufe',activity:'Übung',direction:'Richtung',examples:'Hörbeispiele',practice:'Üben',review:'Schwächen üben',test:'Unabhängiger Test',locate:'Instrument finden',melody:'Kurze Melodie',both:'Beide',higher:'Aufwärts',lower:'Abwärts',showExamples:'Beispiele zeigen / verbergen',sample:'Anhören',up:'Auf',down:'Ab',same:'Gleich',reference:'Referenz',replay:'Beide Töne',replayCorrect:'Richtig anhören',replaySelected:'Antwort anhören',next:'Weiter',ready:'Mit Play starten',listen:'Intervall auswählen',choosePosition:'Zielton am Instrument wählen',melodyPrompt:'Welches Intervall ist der letzte Schritt?',results:'Runde beendet',correct:'Richtig',wrong:'Richtig ist',independent:'Erstes Hören',questions:'Fragen',due:'Fokus: ',noData:'Noch zu wenige Daten',resume:'Play für neue Runde',challenge:'Der Tonumfang ist zu klein. Aufwärts oder Abwärts auswählen.',note:'Bewertung nach Halbtonabstand; 6 = Tritonus.',compare:'Vergleich anhören',stage:'Übung und Test getrennt.',export:'RP CSV exportieren',stats:'Letzte Ergebnisse',directionTip:'Nur Richtung wählen.',melodyTip:'Drei Töne hören; letzten Schritt bestimmen.',locationTip:'Referenz bleibt sichtbar; Zielton wählen.'},
    it: {course:'Corso intervalli',level:'Livello',activity:'Esercizio',direction:'Direzione',examples:'Esempi da ascoltare',practice:'Pratica guidata',review:'Ripasso errori',test:'Verifica indipendente',locate:'Trova sullo strumento',melody:'Breve melodia',both:'Entrambe',higher:'Ascendente',lower:'Discendente',showExamples:'Mostra / nascondi esempi',sample:'Ascolta',up:'Su',down:'Giù',same:'Uguale',reference:'Nota base',replay:'Riascolta',replayCorrect:'Ascolta corretta',replaySelected:'Ascolta scelta',next:'Avanti',ready:'Premi Play',listen:'Scegli intervallo',choosePosition:'Trova seconda nota sullo strumento',melodyPrompt:'Qual è l’ultimo intervallo?',results:'Serie completata',correct:'Corretto',wrong:'Risposta corretta',independent:'Primo ascolto',questions:'domande',due:'Ripassa: ',noData:'Dati insufficienti',resume:'Play per una nuova serie',challenge:'Estensione insufficiente. Scegli salita o discesa.',note:'Valutazione in semitoni; 6 = tritono.',compare:'Confronta',stage:'Pratica e verifica separate.',export:'Esporta CSV',stats:'Risultati recenti',directionTip:'Scegli su, giù o uguale.',melodyTip:'Ascolta tre note e identifica l’ultimo salto.',locationTip:'Nota base visibile; scegli la seconda nota.'},
    el: {course:'Μάθημα διαστημάτων',level:'Επίπεδο',activity:'Άσκηση',direction:'Κατεύθυνση',examples:'Παραδείγματα',practice:'Εξάσκηση',review:'Επανάληψη',test:'Ανεξάρτητο τεστ',locate:'Στο όργανο',melody:'Μικρή μελωδία',both:'Και τα δύο',higher:'Ανοδικά',lower:'Καθοδικά',showExamples:'Εμφάνιση / απόκρυψη',sample:'Άκουσε',up:'Πάνω',down:'Κάτω',same:'Ίδιο',reference:'Αναφορά',replay:'Επανάληψη',replayCorrect:'Σωστό διάστημα',replaySelected:'Η απάντησή μου',next:'Επόμενο',ready:'Πάτησε Play',listen:'Επέλεξε διάστημα',choosePosition:'Βρες τη νότα στο όργανο',melodyPrompt:'Ποιο ήταν το τελευταίο διάστημα;',results:'Τέλος γύρου',correct:'Σωστό',wrong:'Σωστή απάντηση',independent:'Πρώτη ακρόαση',questions:'ερωτήσεις',due:'Έμφαση: ',noData:'Λίγες καταγραφές',resume:'Play για νέο γύρο',challenge:'Μη διαθέσιμο εύρος. Επέλεξε ανοδικά ή καθοδικά.',note:'Βαθμολόγηση σε ημιτόνια· 6 = τρίτονο.',compare:'Σύγκριση',stage:'Άσκηση και τεστ ξεχωριστά.',export:'Εξαγωγή CSV',stats:'Πρόσφατα αποτελέσματα',directionTip:'Επέλεξε πάνω, κάτω ή ίδιο.',melodyTip:'Άκουσε τρεις νότες, βρες το τελευταίο διάστημα.',locationTip:'Νότα αναφοράς ορατή· επίλεξε στόχο.'}
  };
  const TXT = {en:['Unison','Minor 2nd','Major 2nd','Minor 3rd','Major 3rd','Perfect 4th','Tritone','Perfect 5th','Minor 6th','Major 6th','Minor 7th','Major 7th','Octave'],
    'zh-TW':['同度','小二度','大二度','小三度','大三度','純四度','三全音','純五度','小六度','大六度','小七度','大七度','八度'],
    ja:['同度','短2度','長2度','短3度','長3度','完全4度','三全音','完全5度','短6度','長6度','短7度','長7度','オクターブ'],
    de:['Prime','Kleine Sekunde','Große Sekunde','Kleine Terz','Große Terz','Quarte','Tritonus','Quinte','Kleine Sexte','Große Sexte','Kleine Septime','Große Septime','Oktave'],
    it:['Unisono','Seconda minore','Seconda maggiore','Terza minore','Terza maggiore','Quarta giusta','Tritono','Quinta giusta','Sesta minore','Sesta maggiore','Settima minore','Settima maggiore','Ottava'],
    el:['Ταυτοφωνία','Μικρή 2η','Μεγάλη 2η','Μικρή 3η','Μεγάλη 3η','Καθαρή 4η','Τρίτονο','Καθαρή 5η','Μικρή 6η','Μεγάλη 6η','Μικρή 7η','Μεγάλη 7η','Οκτάβα']};
  const PROTOCOL = 6; // Full-range practice and consecutive-question exclusion.
  const rand = n => Math.floor(Math.random()*n);
  const T = (lang,key) => root.TrainingCopy?.text(lang,key)||(LOCALES[lang]||LOCALES.en)[key]||LOCALES.en[key]||key;
  const name = (distance,lang) => distance<=12 ? ((TXT[lang]||TXT.en)[distance]||SHORT[distance]) : SHORT[distance];
  const label = (distance,lang) => `${SHORT[distance]} · ${distance}`;
  function referencePool(low,high,distances,direction) {
    if (!distances.length || distances.some(x=>!Number.isInteger(x)||x<0||x>24)) return [];
    const max = Math.max(...distances);
    const minRef = low+(direction==='lower'||direction==='both'?max:0);
    const maxRef = high-(direction==='higher'||direction==='both'?max:0);
    return Array.from({length:Math.max(0,maxRef-minRef+1)},(_,i)=>minRef+i);
  }
  const memoryKey=q=>`${q.direction}:${q.distance}`;
  // Weak-interval review. Weights follow the recent miss rate of each
  // direction+distance and add the intervals it was recently mistaken for, so a
  // round contrasts the pairs that are actually confused by ear.
  function reviewWeights(memory,distances,directions) {
    const items=new Map();
    for(const dir of directions)for(const distance of distances){
      const d=distance===0?'same':dir;items.set(`${d}:${distance}`,{dir:d,distance,key:`${d}:${distance}`});
    }
    const miss=item=>{const m=TrainingCore.recentMiss(memory[item.key]);return m===null?.3:m;};
    const bonus={};
    for(const item of items.values())for(const [other,count] of Object.entries(memory[item.key]?.conf||{})){
      const partner=`${Number(other)===0?'same':item.dir}:${other}`;
      if(items.has(partner))bonus[partner]=(bonus[partner]||0)+2*Math.min(1,count/3)*miss(item);
    }
    return [...items.values()].map(item=>({...item,known:!!memory[item.key],miss:miss(item),
      weight:.3+6*miss(item)+(bonus[item.key]||0)}));
  }
  function focusList(memory,level,direction='both') {
    const cfg=LEVELS[level];if(!cfg||cfg.directionOnly)return [];
    const directions=direction==='both'?['higher','lower']:[direction];
    return reviewWeights(memory,cfg.distances,directions).filter(x=>x.known&&x.miss>=.2)
      .sort((a,b)=>b.weight-a.weight).slice(0,3);
  }
  function availableDistances(low, high, distances, pitchClasses=null) {
    return distances.filter(d => {
      if (!Number.isInteger(d) || d<0 || d>high-low) return false;
      if (!pitchClasses || pitchClasses.length===12) return true;
      for (let ref=low; ref+d<=high; ref++)
        if (pitchClasses.includes(ref%12) && pitchClasses.includes((ref+d)%12)) return true;
      return false;
    });
  }
  function drawPair({low, high, distances, pitchClasses=null, direction='both', previous=null, directionOnly=false,
                     sharedReferences=false, weight=()=>1, repair=null}) {
    const allowed = availableDistances(low, high, distances, pitchClasses);
    if (!allowed.length || !['higher','lower','both'].includes(direction)) return null;
    const directions = directionOnly || direction === 'both' ? ['higher','lower'] : [direction];
    const max = Math.max(...allowed);
    const filter = pitchClasses && pitchClasses.length<12 ? new Set(pitchClasses) : null;
    const groups = [];
    for (const distance of allowed) {
      for (const dir of distance === 0 ? ['same'] : directions) {
        const signed = dir === 'lower' ? -distance : distance;
        const reach = sharedReferences && !filter ? max : distance;
        let first = low + (dir === 'lower' ? reach : 0);
        let last = high - (dir === 'higher' ? reach : 0);
        if (directionOnly && !filter && high-low >= 2*max) {first = low+max; last = high-max;}
        const refs = [];
        for (let ref=first; ref<=last; ref++) {
          const target=ref+signed;
          if (target===previous?.target) continue;
          if (!filter || (filter.has(ref%12) && filter.has(target%12))) refs.push(ref);
        }
        if (!refs.length) continue;
        // A unison has one direction. Give it the same marginal weight as the other answers.
        const copies = distance !== 0 ? 1 : directionOnly ? allowed.length-1 || 1 : directions.length;
        groups.push({dir, distance, signed, refs, weight:copies*weight(dir,distance)});
      }
    }
    if (!groups.length) return null;
    let candidates = groups;
    if (Number.isInteger(previous?.reference)) {
      const lastSigned = previous.target-previous.reference;
      const different = groups.filter(g => directionOnly ? Math.sign(g.signed) !== Math.sign(lastSigned) : g.distance !== Math.abs(lastSigned));
      if (different.length) candidates = different;
    }
    const due = repair && candidates.find(g => repair === `${g.dir}:${g.distance}`);
    const chosen = due || TrainingCore.choose(candidates, candidates.map(g => g.weight));
    const reference = TrainingCore.choose(chosen.refs);
    return {reference, target:reference+chosen.signed, distance:chosen.distance, signed:chosen.signed,
      direction:chosen.dir, repair:Boolean(due)};
  }
  function question({level=ALL_LEVEL, activity='practice', direction='both', low=55, high=88, pitchClasses=null, memory={}, repair=null, previous=null}) {
    const cfg=LEVELS[level];
    if (!cfg) return null;
    const dirs=direction==='both'?['higher','lower']:[direction];
    const reviews=activity==='review' ? new Map(reviewWeights(memory,cfg.distances,dirs).map(item=>[item.key,item.weight])) : null;
    function weight(dir,distance) {
      const key=`${dir}:${distance}`;
      if (reviews) return reviews.get(key) || 1;
      return ['practice','produce'].includes(activity) ? TrainingCore.weight(memory[key]) : 1;
    }
    const q=drawPair({low, high, distances:cfg.distances, pitchClasses, direction, previous, directionOnly:cfg.directionOnly,
      sharedReferences:level!==ALL_LEVEL, weight, repair:activity==='test'?null:repair});
    if (!q) return null;
    q.prelude=null;
    if (activity==='melody') {
      const tones=[];
      for (let m=low;m<=high;m++) if(m!==q.reference && (!pitchClasses || pitchClasses.includes(m%12))) tones.push(m);
      const nearby=tones.filter(m=>Math.abs(m-q.reference)<=2);
      q.prelude=TrainingCore.choose(nearby.length?nearby:tones) ?? null;
    }
    return q;
  }
  function createRound({level=ALL_LEVEL,activity='practice',direction='both',low=55,high=88,pitchClasses=null,total=12,memory={},previous=null}) {
    if (!Number.isInteger(total)||total<1||total>200) return {error:'invalid'};
    const questions=[];
    for (let i=0; i<total; i++) {
      const q=question({level,activity,direction,low,high,pitchClasses,memory,previous});
      if(!q) return {error:previous?'no-alternative':'no-reference-pool'};
      questions.push(q); previous=q;
    }
    return {level,activity,direction,questions,records:[],repairs:[],createdAt:Date.now(),finished:false,total,low,high,pitchClasses,protocol:PROTOCOL};
  }
  const storageKey=id=>`rp-course-v2-${id}`;
  function load(id) {
    try {const v=JSON.parse(localStorage.getItem(storageKey(id))||'null');
      if(v&&Array.isArray(v.records)){
        const level=Number.isInteger(v.level) && LEVELS[v.level] && (v.levelChosen || v.level!==1) ? v.level : ALL_LEVEL;
        return {...v,level,sessions:v.sessions||[],memory:v.memory||{}};
      }
    }catch(_){}return {level:ALL_LEVEL,records:[],sessions:[],memory:{}};
  }
  // Keep all original localStorage rows as an unchanged legacy archive. New
  // trial/session rows go to IndexedDB; preferences and memory remain small.
  const archives=new Map(),writes=new Map();
  async function hydrate(id,state) {
    const [trials,sessions]=await Promise.all([
      APPitchScience.allRows(id,'trials','rp'),APPitchScience.allRows(id,'sessions','rp')]);
    const merge=(a,b)=>[...new Map(a.concat(b).map((r,i)=>[r.id||`legacy-${i}`,r])).values()];
    state.records=merge(state.records,trials);state.sessions=merge(state.sessions,sessions);
    return state;
  }
  function save(id,state) {
    if(!archives.has(id)){const old=load(id);archives.set(id,{records:old.records,sessions:old.sessions});}
    return TrainingCore.write(storageKey(id),{...state,...archives.get(id)});
  }
  function append(id,store,row) {
    const pending=(writes.get(id)||Promise.resolve()).then(()=>APPitchScience.putRows(id,store,[row],'rp'));
    writes.set(id,pending);return pending;
  }
  function whenSaved(id) {return writes.get(id) || Promise.resolve();}
  async function history(id) {
    await whenSaved(id);return hydrate(id,load(id));
  }
  function levelName(index,lang) {
    if (index===ALL_LEVEL) return allLabels[lang] || allLabels.en;
    const cfg=LEVELS[index];
    return cfg.directionOnly?T(lang,'rpDirections'):`${Math.min(...cfg.distances)}–${Math.max(...cfg.distances)} ${T(lang,'rpSemitones')}`;
  }
  function csv(records) {const keys=['protocol','sessionId','timbre','repair','day','site','level','activity','direction','reference','target','distance','signed','selected','selectedMidi','correct','replayed','hints','rtMs','time','id','checkedBy','producedMidi','cents'];return ['\ufeff'+keys.join(','),...(records||[]).map(r=>keys.map(k=>`"${String(r[k]??'').replace(/"/g,'""')}"`).join(','))].join('\r\n');}
  root.RelativePitchCourse=Object.freeze({LEVELS,ALL_LEVEL,SHORT,PROTOCOL,availableDistances,drawPair,T,name,label,referencePool,reviewWeights,focusList,createRound,question,memoryKey,levelName,load,save,hydrate,append,whenSaved,history,csv});
})(typeof window!=='undefined'?window:globalThis);

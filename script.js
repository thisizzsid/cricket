(function(){
'use strict';
var KEY='cricket-score-manager-v1';
var TA=['Aarav','Vihaan','Arjun','Rohan','Kabir','Ishaan','Reyansh','Dev','Aditya','Krish','Yash'];
var TB=['Siddharth','Rahul','Karan','Manav','Nikhil','Pranav','Harsh','Tanmay','Varun','Ayush','Jay'];
var M=null, HIST=[], flashT=null;
var UI={view:'score',modal:null,mode:'run',clean:false,fs:false,flash:null,err:'',
  setup:{tournament:'Local Cricket Tournament',match:'Match 1',ta:'Team A',tb:'Team B',pa:TA.join('\n'),pb:TB.join('\n'),overs:5,first:0}};
var PUBLIC_PARAMS=new URLSearchParams(location.search);
var PUBLIC_MATCH=PUBLIC_PARAMS.get('match');

/* ---------- helpers ---------- */
var esc=function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var ov=function(b){return Math.floor(b/6)+'.'+(b%6);};
var num=function(n){return isFinite(n)?n:0;};
var f1=function(n){return num(n).toFixed(1);};
var f2=function(n){return num(n).toFixed(2);};
var rr=function(r,b){return b>0?r*6/b:0;};
var plural=function(n,w){return n+' '+w+(n===1?'':'s');};
var inn=function(){return M.inn[M.cur];};
var code=function(n){return String(n).replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase()||'TM';};
function load(){try{var s=localStorage.getItem(KEY);if(s)M=JSON.parse(s);}catch(e){}}
function save(){
  try{localStorage.setItem(KEY,JSON.stringify(M));}catch(e){}
  if(M&&M.matchId){
    fetch('/api/matches/'+encodeURIComponent(M.matchId),{
      method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(M)
    }).catch(function(){});
  }
}

/* ---------- model ---------- */
function newInn(bat,bowl){
  return {bat:bat,bowl:bowl,runs:0,wkts:0,balls:0,ex:{wd:0,nb:0,b:0,lb:0},batters:{},order:[],bowlers:{},bowlOrder:[],
    striker:null,non:null,bowler:null,lastBowler:null,over:[],curOver:0,bov:0,overRuns:[],part:{r:0,b:0},fow:[],log:[],
    started:false,done:false,needBatter:false,needBowler:false,pend:null};
}
function eb(I,i){if(!I.batters[i]){I.batters[i]={r:0,b:0,f:0,s:0,out:null};I.order.push(i);}return I.batters[i];}
function ew(I,i){if(!I.bowlers[i]){I.bowlers[i]={b:0,r:0,w:0,m:0,wd:0,nb:0};I.bowlOrder.push(i);}return I.bowlers[i];}
function canScore(){if(!M||M.status!=='live')return false;var I=inn();return !!(I&&I.started&&!I.done&&!I.needBatter&&!I.needBowler);}
function swapEnds(I){var t=I.striker;I.striker=I.non;I.non=t;}
function activeModal(){
  if(!M)return null;
  if(UI.modal)return UI.modal;
  var I=inn();
  if(M.status==='live'&&I&&!I.started)return 'openers';
  if(I&&I.needBatter)return 'batter';
  if(I&&I.needBowler)return 'bowler';
  return null;
}
function calcResult(){
  var a=M.inn[0],b=M.inn[1],A=M.teams[a.bat],B=M.teams[b.bat];
  if(b.runs>a.runs){var wl=B.players.length-1-b.wkts,bl=M.overs*6-b.balls;return B.name+' won by '+plural(wl,'wicket')+' ('+plural(bl,'ball')+' left)';}
  if(b.runs===a.runs)return 'Match tied';
  return A.name+' won by '+plural(a.runs-b.runs,'run');
}
function finishInnings(){
  var I=inn();I.done=true;I.needBatter=false;I.needBowler=false;I.pend=null;
  if(M.cur===0){M.status='break';}else{M.status='done';M.result=calcResult();}
}

/* ---------- scoring engine ---------- */
function score(kind,r,wk){
  if(!canScore())return;
  HIST.push(JSON.stringify(M));if(HIST.length>400)HIST.shift();
  var I=inn(),bt=M.teams[I.bat],bw=M.teams[I.bowl];
  var sIdx=I.striker,bIdx=I.bowler,sb=I.batters[sIdx],bo=I.bowlers[bIdx];
  var sName=bt.players[sIdx],bName=bw.players[bIdx];
  var legal=true,faced=true,total=0,batRuns=0,bowlRuns=0,swap=false,label='',cls='',text='';
  if(kind==='run'){
    total=batRuns=bowlRuns=r;swap=r%2===1;label=r===0?'•':String(r);
    cls=r===4?'four':r===6?'six':r===0?'dot':'';
    text=r===0?'no run':r===4?'FOUR':r===6?'SIX':plural(r,'run');
  }else if(kind==='wd'){
    legal=false;faced=false;total=bowlRuns=1+r;I.ex.wd+=total;bo.wd+=total;swap=r%2===1;
    label='Wd'+(r?'+'+r:'');cls='ext';text='wide'+(r?' and '+plural(r,'run'):'');
  }else if(kind==='nb'){
    legal=false;total=1+r;batRuns=r;bowlRuns=1+r;I.ex.nb+=1;bo.nb+=1;swap=r%2===1;
    label='Nb'+(r?'+'+r:'');cls='ext';text='no ball'+(r?' and '+plural(r,'run')+' off the bat':'');
  }else if(kind==='bye'){
    total=r;I.ex.b+=r;swap=r%2===1;label='B'+r;cls='ext';text=plural(r,'bye');
  }else if(kind==='lb'){
    total=r;I.ex.lb+=r;swap=r%2===1;label='Lb'+r;cls='ext';text=plural(r,'leg bye');
  }else if(kind==='wkt'){
    total=batRuns=bowlRuns=wk.runs;swap=wk.type==='runout'&&wk.runs%2===1;
    label='W'+(wk.runs?'+'+wk.runs:'');cls='wkt';
  }
  I.runs+=total;I.curOver+=total;I.part.r+=total;
  if(legal){I.balls++;I.part.b++;bo.b++;}
  if(faced)sb.b++;
  sb.r+=batRuns;if(batRuns===4)sb.f++;if(batRuns===6)sb.s++;
  bo.r+=bowlRuns;I.bov+=bowlRuns;
  I.over.push({l:label,c:cls});

  var wicket=false,outName='',outHow='';
  if(kind==='wkt'){
    wicket=true;
    var outIdx=wk.who==='n'&&wk.type==='runout'?I.non:I.striker;
    var ob=I.batters[outIdx];outName=bt.players[outIdx];
    var fld=wk.fielder>=0?bw.players[wk.fielder]:'';
    var how;
    if(wk.type==='bowled')how='b '+bName;
    else if(wk.type==='lbw')how='lbw b '+bName;
    else if(wk.type==='caught')how=(wk.fielder===bIdx)?'c & b '+bName:(fld?'c '+fld+' b '+bName:'ct b '+bName);
    else if(wk.type==='stumped')how=fld?'st '+fld+' b '+bName:'st b '+bName;
    else if(wk.type==='hitwicket')how='hit wicket b '+bName;
    else how='run out'+(fld?' ('+fld+')':'');
    ob.out=how;outHow=how;
    if(wk.type!=='runout')bo.w++;
    I.wkts++;
    I.fow.push({s:I.runs+'/'+I.wkts,n:outName,o:ov(I.balls)});
    I.part={r:0,b:0};
    I.pend={out:outIdx===I.striker?'s':'n',swap:false};
    text='OUT! '+outName+' '+how;
  }
  var overEnd=legal&&I.balls%6===0,overRunsNow=I.curOver;
  if(overEnd){
    if(I.bov===0)bo.m++;
    I.overRuns.push(I.curOver);I.curOver=0;I.bov=0;I.lastBowler=bIdx;
  }
  I.log.unshift({o:ov(I.balls),t:bName+' to '+sName+', '+text});
  if(I.log.length>40)I.log.pop();

  var maxW=bt.players.length-1,done=false;
  if(I.wkts>=maxW||I.balls>=M.overs*6)done=true;
  if(M.cur===1&&I.runs>M.inn[0].runs)done=true;
  if(done){finishInnings();}
  else if(wicket){
    I.needBatter=true;I.pend.swap=(swap!==overEnd);
    if(overEnd)I.needBowler=true;
  }else{
    var sw=swap;if(overEnd)sw=!sw;
    if(sw)swapEnds(I);
    if(overEnd)I.needBowler=true;
  }
  var f=null;
  if(wicket)f={cls:'wkt',text:'WICKET',sub:outName+' '+outHow};
  else if(batRuns===6)f={cls:'six',text:'SIX',sub:sName+' goes big'};
  else if(batRuns===4)f={cls:'four',text:'FOUR',sub:sName+' finds the rope'};
  else if(kind==='wd')f={cls:'ext',text:'WIDE',sub:plural(total,'run')};
  else if(kind==='nb')f={cls:'ext',text:'NO BALL',sub:'Free hit next'};
  else if(overEnd&&!done)f={cls:'ovr',text:'END OF OVER',sub:plural(overRunsNow,'run')+' from the over'};
  if(f){f.id=Date.now();setFlash(f);}
  UI.mode='run';save();render();
}
function setFlash(f){
  UI.flash=f;clearTimeout(flashT);
  flashT=setTimeout(function(){UI.flash=null;if(UI.view==='bcast'&&!activeModal())render();},2650);
}
function pickBatter(i){
  var I=inn();eb(I,i);
  if(I.pend.out==='s')I.striker=i;else I.non=i;
  if(I.pend.swap)swapEnds(I);
  I.pend=null;I.needBatter=false;save();render();
}
function pickBowler(i){
  var I=inn();ew(I,i);I.bowler=i;I.needBowler=false;I.over=[];save();render();
}
function undo(){
  if(!HIST.length)return;
  M=JSON.parse(HIST.pop());UI.modal=null;UI.flash=null;UI.mode='run';save();render();
}

/* ---------- setup ---------- */
function startMatch(){
  var g=function(id){return document.getElementById(id).value;};
  var names=function(team){return Array.prototype.map.call(document.querySelectorAll('.p-input[data-team="'+team+'"]'),function(el){return el.value.trim();}).filter(Boolean);};
  syncSetupPlayers();
  UI.setup={tournament:g('tournament'),match:g('match'),ta:g('ta'),tb:g('tb'),pa:UI.setup.pa,pb:UI.setup.pb,overs:g('overs'),first:+g('first')};
  var pa=names('a'),pb=names('b');
  if(pa.length<2||pb.length<2){UI.err='Each team needs at least 2 players.';render();return;}
  if(pa.length>15||pb.length>15){UI.err='Each team can have up to 15 players.';render();return;}
  var overs=Math.max(1,Math.min(50,parseInt(g('overs'),10)||5));
  var first=+g('first')===1?1:0;
  M={tournament:g('tournament').trim()||'Cricket Tournament',matchName:g('match').trim()||'Match',teams:[{name:g('ta').trim()||'Team A',players:pa},{name:g('tb').trim()||'Team B',players:pb}],overs:overs,first:first,cur:0,status:'live',result:'',inn:[newInn(first,1-first),null]};
  M.matchId=(Date.now().toString(36)+Math.random().toString(36).slice(2,8));
  fetch('/api/matches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(M)})
    .then(function(r){return r.json();})
    .then(function(saved){M.saved=saved;})
    .catch(function(){});
  HIST=[];UI.err='';UI.view='score';UI.modal=null;UI.mode='run';save();render();
}
function setupHTML(){
  var S=UI.setup;
  var playerHTML=function(team,text){
    var names=text.split('\n').map(function(s){return s.trim();});
    if(text.trim()===''||names.length<2)names=['',''];
    return '<div class="player-list">'+names.map(function(name,i){
      return '<div class="player-row"><span class="player-number">'+(i+1)+'</span>'+
        '<input class="p-input" data-team="'+team+'" type="text" value="'+esc(name)+'" placeholder="Player '+(i+1)+' name" maxlength="30" aria-label="Player '+(i+1)+' name">'+
        '<button class="remove-player" type="button" data-act="remove-player" data-team="'+team+'" data-i="'+i+'"'+(names.length<=2?' disabled':'')+' aria-label="Remove player '+(i+1)+'">&times;</button></div>';
    }).join('')+'</div>'+
    '<button class="btn ghost add-player" type="button" data-act="add-player" data-team="'+team+'"'+(names.length>=15?' disabled':'')+'>+ Add player</button>'+
    '<span class="help">2 to 15 players. The top name is player 1.</span>';
  };
  return '<div class="setup"><h1>Cricket Score Manager</h1>'+
  '<p class="lead">Enter both squads, pick the match length and start scoring. Balls left, over changes, strike rotation, run rates and the innings result are worked out for you, and the Broadcast tab gives you a TV-style scoreboard.</p>'+
  '<form id="setup" novalidate><div class="match-details"><div class="field"><label for="tournament">Tournament name</label><input type="text" id="tournament" value="'+esc(S.tournament)+'" maxlength="60"></div>'+
  '<div class="field"><label for="match">Match name</label><input type="text" id="match" value="'+esc(S.match)+'" maxlength="60"></div></div><div class="teams2">'+
  [['ta','a','Team 1',S.ta,S.pa],['tb','b','Team 2',S.tb,S.pb]].map(function(t){
    return '<section class="card"><div class="field"><label for="'+t[0]+'">'+t[2]+' name</label><input type="text" id="'+t[0]+'" value="'+esc(t[3])+'" maxlength="30"></div>'+
    '<div class="field"><span><label>Players</label></span>'+playerHTML(t[1],t[4])+'</div></section>';
  }).join('')+'</div>'+
  '<div class="setup-foot"><div class="field"><label for="overs">Overs per innings</label><input type="number" id="overs" min="1" max="50" value="'+esc(S.overs)+'"></div>'+
  '<div class="field"><label for="first">Batting first</label><select id="first"><option value="0"'+(S.first===0?' selected':'')+'>Team 1 bats first</option><option value="1"'+(S.first===1?' selected':'')+'>Team 2 bats first</option></select></div>'+
  '<button class="btn primary" type="button" data-act="start">Start match</button></div>'+
  '<p class="err" role="alert">'+esc(UI.err)+'</p></form></div>';
}

function syncSetupPlayers(){
  var teamNames=function(team){
    return Array.prototype.map.call(document.querySelectorAll('.p-input[data-team="'+team+'"]'),function(el){return el.value.trim();}).join('\n');
  };
  var ta=document.getElementById('ta'),tb=document.getElementById('tb');
  var tournament=document.getElementById('tournament'),match=document.getElementById('match');
  if(ta)UI.setup.ta=ta.value;
  if(tb)UI.setup.tb=tb.value;
  if(tournament)UI.setup.tournament=tournament.value;
  if(match)UI.setup.match=match.value;
  UI.setup.pa=teamNames('a');
  UI.setup.pb=teamNames('b');
}

/* ---------- render ---------- */
function render(){
  var app=document.getElementById('app');
  document.body.classList.toggle('clean',!!(UI.clean&&M&&UI.view==='bcast'));
  if(PUBLIC_MATCH){
    if(!M){app.innerHTML='<main class="public-loading"><span class="spinner"></span><h1>Loading live match</h1><p>Connecting to the scorer...</p></main>';return;}
    app.innerHTML=publicHTML();return;
  }
  if(!M){app.innerHTML=setupHTML();return;}
  app.innerHTML=headerHTML()+(UI.view==='card'?cardView():UI.view==='bcast'?bcastView():scoreView())+modalHTML();
  var m=app.querySelector('.modal');
  if(m){var first=m.querySelector('select,input,button');if(first&&!m.contains(document.activeElement))first.focus();}
}
function headerHTML(){
  var t=function(v,l){return '<button class="tab" role="tab" aria-selected="'+(UI.view===v)+'" data-act="view" data-v="'+v+'">'+l+'</button>';};
  return '<header class="top"><div><h1>Cricket Score Manager</h1><div class="sub">'+esc(M.teams[0].name)+' v '+esc(M.teams[1].name)+' · '+plural(M.overs,'over')+' a side</div></div>'+
  '<div class="top-r"><nav class="tabs" role="tablist" aria-label="Views">'+t('score','Score')+t('card','Scorecard')+t('bcast','Broadcast')+'</nav><button class="btn ghost" data-act="share">Audience QR</button><button class="btn ghost" data-act="new">New match</button></div></header>';
}

/* score view */
function scoreView(){
  return '<div class="grid"><div class="a-board">'+boardHTML()+'</div><div class="a-pad">'+padHTML()+'</div><div class="a-stats">'+creaseHTML()+'</div><div class="a-chart">'+chartHTML()+'</div><div class="a-log">'+logHTML()+'</div></div>';
}
function boardHTML(){
  var I=inn(),T=M.teams[I.bat],left=Math.max(0,M.overs*6-I.balls),crr=rr(I.runs,I.balls);
  var exT=I.ex.wd+I.ex.nb+I.ex.b+I.ex.lb;
  var live=M.status==='live';
  var chase='',chips=[];
  chips.push(['Run rate',f2(crr)]);
  if(M.cur===1){
    var tgt=M.inn[0].runs+1,need=tgt-I.runs;
    if(M.status==='done')chase='<div class="chase"><b>'+esc(M.result)+'</b></div>';
    else if(need>0)chase='<div class="chase">Target <b>'+tgt+'</b> · Need <b>'+need+'</b> from <b>'+plural(left,'ball')+'</b></div>';
    chips.push(['Required rate',left>0&&need>0?f2(need*6/left):'--']);
    chips.push(['1st innings RR',f2(rr(M.inn[0].runs,M.inn[0].balls))]);
  }else{
    chips.push(['Projected',I.balls>0?String(Math.round(crr*M.overs)):'--']);
    if(M.status==='break')chase='<div class="chase"><b>Innings break.</b> '+esc(M.teams[M.inn[0].bowl].name)+' need '+(I.runs+1)+' to win.</div>';
  }
  chips.push(['Partnership',I.part.r+' ('+I.part.b+')']);
  chips.push(['Extras',exT+' (w '+I.ex.wd+', nb '+I.ex.nb+', b '+I.ex.b+', lb '+I.ex.lb+')']);
  var pill=(live&&left===1)?'<span class="pill last">Last ball</span>':'<span class="pill">'+(M.cur===0?'1st innings':'2nd innings')+'</span>';
  return '<section class="card board" aria-label="Scoreboard"><div class="board-top"><span class="team">'+esc(T.name)+'</span>'+pill+'</div>'+
  '<div class="big" aria-label="'+I.runs+' for '+I.wkts+'"><span class="runs">'+I.runs+'</span><span class="sl">/</span><span class="wk">'+I.wkts+'</span></div>'+
  '<div class="oversline"><span>'+ov(I.balls)+' <small>of '+M.overs+' overs</small></span><span class="ballsleft"><b>'+left+'</b> '+(left===1?'ball':'balls')+' left</span></div>'+
  chase+'<div class="chips">'+chips.map(function(c){return '<div class="chip"><span>'+c[0]+'</span><b>'+c[1]+'</b></div>';}).join('')+'</div></section>';
}
var MODES=[['run','Runs'],['wd','Wide'],['nb','No ball'],['bye','Bye'],['lb','Leg bye']];
var RUNSET={run:[0,1,2,3,4,6],wd:[0,1,2,3,4],nb:[0,1,2,3,4,6],bye:[1,2,3,4],lb:[1,2,3,4]};
function runLabel(m,r){
  if(m==='run')return String(r);
  if(m==='wd')return r?'Wd+'+r:'Wide';
  if(m==='nb')return r?'Nb+'+r:'No ball';
  return r+(m==='bye'?' bye':' lb');
}
function overBalls(I){
  if(!I.over.length)return '<span class="empty">Waiting for the first ball.</span>';
  return I.over.map(function(b){return '<span class="ball '+b.c+'">'+esc(b.l)+'</span>';}).join('');
}
function padHTML(){
  if(M.status==='break')return breakCard();
  if(M.status==='done')return doneCard();
  var I=inn(),can=canScore(),mode=UI.mode;
  var overNo=Math.floor(I.balls/6)+1;
  return '<section class="card" aria-label="Scoring pad"><div class="sect-h"><h3>Over '+Math.min(overNo,M.overs)+'</h3><span class="muted">'+(I.bowler!=null?esc(M.teams[I.bowl].players[I.bowler]):'')+' bowling</span></div>'+
  '<div class="over-row" aria-live="polite">'+overBalls(I)+'</div>'+
  '<div class="modes" role="group" aria-label="Delivery type">'+MODES.map(function(m){return '<button class="mode" data-act="mode" data-m="'+m[0]+'" aria-pressed="'+(mode===m[0])+'">'+m[1]+'</button>';}).join('')+'</div>'+
  '<div class="runs-grid">'+RUNSET[mode].map(function(r){return '<button class="rb r'+r+'" data-act="run" data-r="'+r+'"'+(can?'':' disabled')+'>'+runLabel(mode,r)+'</button>';}).join('')+'</div>'+
  '<div class="pad-actions"><button class="btn wk" data-act="wkt-open"'+(can?'':' disabled')+'>Wicket</button><button class="btn" data-act="undo"'+(HIST.length?'':' disabled')+'>Undo</button><button class="btn" data-act="swap"'+(can?'':' disabled')+'>Swap ends</button></div>'+
  '<p class="hint">Keys: <kbd>0</kbd>-<kbd>6</kbd> runs, <kbd>W</kbd> wide, <kbd>N</kbd> no ball, <kbd>B</kbd> bye, <kbd>L</kbd> leg bye, <kbd>X</kbd> wicket, <kbd>U</kbd> undo, <kbd>S</kbd> swap ends. Press <kbd>W</kbd> or <kbd>N</kbd> twice for a plain wide or no ball.</p></section>';
}
function breakCard(){
  var a=M.inn[0],tgt=a.runs+1,balls=M.overs*6;
  return '<section class="card banner"><h2>End of innings 1</h2><p>'+esc(M.teams[a.bat].name)+' made <b>'+a.runs+'/'+a.wkts+'</b> in '+ov(a.balls)+' overs.</p>'+
  '<p>'+esc(M.teams[a.bowl].name)+' need <b>'+tgt+'</b> from '+plural(balls,'ball')+' (required rate '+f2(tgt*6/balls)+').</p>'+
  '<div class="row"><button class="btn primary" data-act="next-inn">Start 2nd innings</button><button class="btn" data-act="undo"'+(HIST.length?'':' disabled')+'>Undo last ball</button></div></section>';
}
function doneCard(){
  return '<section class="card banner"><h3>Result</h3><h2>'+esc(M.result)+'</h2>'+
  '<div class="row"><button class="btn primary" data-act="view" data-v="card">Open scorecard</button><button class="btn" data-act="undo"'+(HIST.length?'':' disabled')+'>Undo last ball</button><button class="btn" data-act="new">New match</button></div></section>';
}
function creaseHTML(){
  var I=inn(),bt=M.teams[I.bat],bw=M.teams[I.bowl];
  if(!I.started)return '<section class="card"><p class="empty">Choose the openers and the opening bowler to begin.</p></section>';
  var rows=[I.striker,I.non].map(function(i,k){
    var b=I.batters[i];
    return '<tr class="'+(k===0?'on':'')+'"><td>'+(k===0?'<span class="dot-on" title="On strike"></span>':'')+esc(bt.players[i])+'</td><td>'+b.r+'</td><td>'+b.b+'</td><td>'+b.f+'</td><td>'+b.s+'</td><td>'+f1(b.b?b.r*100/b.b:0)+'</td></tr>';
  }).join('');
  var yet=bt.players.length-I.order.length;
  var bo=I.bowlers[I.bowler];
  return '<section class="card stack"><div><div class="sect-h"><h3>At the crease</h3><span class="muted">'+yet+' yet to bat</span></div><div class="tw"><table class="tbl"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
  '<div><div class="sect-h"><h3>Bowling</h3></div><div class="tw"><table class="tbl"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody><tr><td>'+esc(bw.players[I.bowler])+'</td><td>'+ov(bo.b)+'</td><td>'+bo.m+'</td><td>'+bo.r+'</td><td>'+bo.w+'</td><td>'+f2(rr(bo.r,bo.b))+'</td></tr></tbody></table></div></div></section>';
}
function chartHTML(){
  var I=inn(),crr=rr(I.runs,I.balls);
  var bars=I.overRuns.map(function(v){return {v:v,p:false};});
  if(I.balls%6!==0||I.curOver>0)bars.push({v:I.curOver,p:true});
  if(!bars.length)return '<section class="card"><div class="sect-h"><h3>Runs per over</h3></div><p class="empty">The chart fills in as overs are bowled.</p></section>';
  var max=Math.max.apply(null,[12,Math.ceil(crr)+1].concat(bars.map(function(b){return b.v;})));
  return '<section class="card"><div class="sect-h"><h3>Runs per over</h3><span class="muted">Average '+f2(crr)+' an over</span></div><div class="chart-scroll"><div class="bars">'+
  bars.map(function(b,i){return '<div class="bcol'+(b.p?' p':'')+'" title="Over '+(i+1)+': '+b.v+' runs"><b>'+b.v+'</b><i style="height:'+(b.v/max*88)+'%"></i></div>';}).join('')+
  '<div class="avg" style="bottom:'+(crr/max*88)+'%"><span>avg '+f1(crr)+'</span></div></div><div class="xl">'+bars.map(function(b,i){return '<span>'+(i+1)+'</span>';}).join('')+'</div></div></section>';
}
function logHTML(){
  var I=inn();
  if(!I.log.length)return '<section class="card"><div class="sect-h"><h3>Ball by ball</h3></div><p class="empty">No deliveries yet.</p></section>';
  return '<section class="card"><div class="sect-h"><h3>Ball by ball</h3></div><ul class="log">'+I.log.slice(0,8).map(function(l){return '<li><b>'+l.o+'</b><span>'+esc(l.t)+'</span></li>';}).join('')+'</ul></section>';
}

function publicHTML(){
  var I=inn(),bt=M.teams[I.bat],bw=M.teams[I.bowl];
  var left=Math.max(0,M.overs*6-I.balls),crr=rr(I.runs,I.balls);
  var chase='';
  if(M.cur===1){
    var target=M.inn[0].runs+1,need=Math.max(0,target-I.runs);
    chase='<div class="public-chase"><span>Target '+target+'</span><strong>'+need+' needed</strong><span>'+plural(left,'ball')+' left</span></div>';
  }
  var batRows='';
  if(I.started){
    batRows=[I.striker,I.non].filter(function(i){return i!=null;}).map(function(i,k){
      var b=I.batters&&I.batters[i]?I.batters[i]:{r:0,b:0};
      return '<div class="public-batter '+(k===0?'on-strike':'')+'"><span>'+esc(bt.players[i])+'</span><strong>'+b.r+' <small>('+b.b+')</small></strong></div>';
    }).join('');
  }
  var recent=(I.log||[]).slice(0,6).map(function(l){
    return '<li><b>'+esc(l.o)+'</b><span>'+esc(l.t)+'</span></li>';
  }).join('');
  var status=M.status==='done'?M.result:(M.status==='break'?'Innings break':'Live');
  return '<main class="public-app"><header class="public-head"><div><span class="live-label"><i></i> '+esc(status)+'</span><p>'+esc(M.tournament||'Cricket Tournament')+'</p><h1>'+esc(M.matchName||'Live Match')+'</h1></header>'+
  '<section class="public-score"><div class="public-team">'+esc(bt.name)+'<span>'+I.runs+'/'+I.wkts+'</span></div><div class="public-meta"><span>'+ov(I.balls)+' / '+M.overs+' overs</span><span>'+f2(crr)+' CRR</span><span>'+left+' balls</span></div>'+chase+'</section>'+
  '<section class="public-card"><h2>At the crease</h2>'+batRows+'</section>'+
  '<section class="public-card"><h2>Recent deliveries</h2><ul class="public-log">'+(recent||'<li class="empty">Waiting for the first ball</li>')+'</ul></section>'+
  '<p class="public-updated">Updates automatically while the match is live</p></main>';
}

/* scorecard view */
function cardView(){
  var h='';
  if(M.status==='done')h+='<section class="card banner" style="margin-bottom:16px"><h3>Result</h3><h2>'+esc(M.result)+'</h2></section>';
  h+='<div class="stack">';
  for(var k=0;k<2;k++){if(M.inn[k])h+=inningsCard(M.inn[k],k);}
  return h+'</div>';
}
function inningsCard(I,k){
  var bt=M.teams[I.bat],bw=M.teams[I.bowl];
  var live=!I.done&&M.cur===k&&M.status==='live';
  var rows=I.order.map(function(i){
    var b=I.batters[i],atCrease=live&&(i===I.striker||i===I.non);
    var how=b.out?b.out:(atCrease?'batting':'not out');
    return '<tr><td>'+esc(bt.players[i])+'<span class="how">'+esc(how)+'</span></td><td>'+b.r+'</td><td>'+b.b+'</td><td>'+b.f+'</td><td>'+b.s+'</td><td>'+f1(b.b?b.r*100/b.b:0)+'</td></tr>';
  }).join('');
  var dnb=bt.players.filter(function(n,i){return I.order.indexOf(i)<0;});
  var exT=I.ex.wd+I.ex.nb+I.ex.b+I.ex.lb;
  var brows=I.bowlOrder.map(function(i){
    var b=I.bowlers[i];
    return '<tr><td>'+esc(bw.players[i])+'</td><td>'+ov(b.b)+'</td><td>'+b.m+'</td><td>'+b.r+'</td><td>'+b.w+'</td><td>'+f2(rr(b.r,b.b))+'</td><td>'+b.wd+'/'+b.nb+'</td></tr>';
  }).join('');
  return '<section class="card stack"><div class="board-top"><h2>'+esc(bt.name)+' innings</h2><span class="team">'+I.runs+'/'+I.wkts+' <span class="muted" style="font-size:16px">('+ov(I.balls)+' ov, RR '+f2(rr(I.runs,I.balls))+')</span></span></div>'+
  '<div class="tw"><table class="tbl"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6">Not started</td></tr>')+'</tbody></table></div>'+
  '<p>Extras <b>'+exT+'</b> <span class="muted">(w '+I.ex.wd+', nb '+I.ex.nb+', b '+I.ex.b+', lb '+I.ex.lb+')</span></p>'+
  (dnb.length&&I.started?'<p><span class="muted">Did not bat:</span> '+dnb.map(esc).join(', ')+'</p>':'')+
  (I.fow.length?'<p><span class="muted">Fall of wickets:</span> '+I.fow.map(function(f){return f.s+' ('+esc(f.n)+', '+f.o+')';}).join(' · ')+'</p>':'')+
  (brows?'<div class="tw"><table class="tbl"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Wd/Nb</th></tr></thead><tbody>'+brows+'</tbody></table></div>':'')+'</section>';
}

/* broadcast view */
function bcastView(){
  return '<div class="stage-wrap">'+stageHTML()+'<button class="exit-clean" data-act="clean">Exit full screen (Esc)</button>'+
  '<div class="stage-tools"><button class="btn primary" data-act="clean">Full screen</button><span class="muted">Use the pad below or your keyboard to score while this screen is shown. Full screen hides everything except the scoreboard.</span></div></div>'+
  '<div class="opbar">'+padHTML()+'</div>';
}
function stageHTML(){
  var I=inn(),bt=M.teams[I.bat],bw=M.teams[I.bowl];
  var left=Math.max(0,M.overs*6-I.balls),crr=rr(I.runs,I.balls),live=M.status==='live';
  var right='CRR '+f2(crr),ticker='';
  if(M.cur===1){
    var tgt=M.inn[0].runs+1,need=tgt-I.runs;
    right='Target '+tgt+' · CRR '+f2(crr)+(need>0&&left>0?' · RRR '+f2(need*6/left):'');
    if(M.status==='done')ticker=M.result;
    else ticker=need>0?esc(bt.name)+' need '+need+' from '+plural(left,'ball'):'';
  }else{
    ticker=M.status==='break'?'Innings break · '+esc(bw.name)+' need '+(I.runs+1)+' to win':'Projected '+(I.balls>0?Math.round(crr*M.overs):'--')+' · Partnership '+I.part.r+' ('+I.part.b+')';
  }
  var bats='';
  if(I.started){
    bats=[I.striker,I.non].map(function(i,k){
      var b=I.batters[i];
      return '<div><span>'+(k===0?'<i class="st-dot"></i>':'')+esc(bt.players[i])+'</span><em>'+b.r+'<small>('+b.b+')</small></em></div>';
    }).join('');
  }
  var bowl='';
  if(I.started&&I.bowler!=null){
    var bo=I.bowlers[I.bowler];
    bowl='<div><span>'+esc(bw.players[I.bowler])+'</span><em>'+bo.w+'-'+bo.r+' <small style="font-size:.7em;color:#9fb3a5">('+ov(bo.b)+')</small></em></div><div class="sbs">'+I.over.map(function(b){return '<span class="sb '+b.c+'">'+esc(b.l)+'</span>';}).join('')+'</div>';
  }
  var fl='';
  if(UI.flash){
    var el=Math.max(0,Date.now()-UI.flash.id);
    fl='<div class="s-flash" aria-live="assertive"><b class="'+UI.flash.cls+'" style="animation-delay:-'+el+'ms">'+esc(UI.flash.text)+'</b><small style="animation-delay:-'+el+'ms">'+esc(UI.flash.sub)+'</small></div>';
  }
  var last=live&&left===1;
  return '<div class="stage" role="img" aria-label="Live scoreboard: '+esc(bt.name)+' '+I.runs+' for '+I.wkts+'">'+
  '<div class="s-top"><div class="s-mid"><span class="s-live"><i></i>'+(M.status==='done'?'Full time':M.status==='break'?'Break':'Live')+'</span><span class="s-pill">'+esc(M.teams[0].name)+' v '+esc(M.teams[1].name)+' · '+M.overs+' overs</span></div><span class="s-pill">'+right+'</span></div>'+fl+
  '<div class="bar"><div class="b-score"><span class="tm">'+code(bt.name)+'</span><span class="sc">'+I.runs+'-'+I.wkts+'</span><span class="ov">'+ov(I.balls)+' OV</span></div>'+
  '<div class="b-bats">'+bats+'</div><div class="b-bowl">'+bowl+'</div>'+
  '<div class="b-left'+(last?' last':'')+'"><small>'+(last?'Last ball':'Balls left')+'</small><b>'+left+'</b></div></div>'+
  '<div class="ticker">'+ticker+'</div></div>';
}

/* modals */
function opts(arr,sel){return arr.map(function(n,i){return '<option value="'+i+'"'+(i===sel?' selected':'')+'>'+esc(n)+'</option>';}).join('');}
function modalHTML(){
  var m=activeModal();if(!m)return '';
  var I=inn(),inner='',label='';
  if(m==='openers'){
    var bt=M.teams[I.bat],bw=M.teams[I.bowl];label='Start of innings';
    inner='<h2>'+(M.cur===0?'First':'Second')+' innings</h2><p class="muted">'+esc(bt.name)+' bat, '+esc(bw.name)+' bowl.'+(M.cur===1?' Target '+(M.inn[0].runs+1)+'.':'')+'</p>'+
    '<div class="field"><label for="o-s">Striker</label><select id="o-s">'+opts(bt.players,0)+'</select></div>'+
    '<div class="field"><label for="o-n">Non-striker</label><select id="o-n">'+opts(bt.players,1)+'</select></div>'+
    '<div class="field"><label for="o-b">Opening bowler</label><select id="o-b">'+opts(bw.players,0)+'</select></div>'+
    '<p class="err" id="o-err" role="alert"></p><button class="btn primary" data-act="openers-ok">Start innings</button>';
  }else if(m==='batter'){
    var bt2=M.teams[I.bat];label='Next batter';
    var rem=bt2.players.map(function(n,i){return i;}).filter(function(i){return I.order.indexOf(i)<0;});
    inner='<h2>Next batter</h2><p class="muted">'+esc(I.log[0]?I.log[0].t:'Wicket')+'</p><div class="pick">'+
    rem.map(function(i){return '<button class="btn" data-act="pick-bat" data-i="'+i+'">'+esc(bt2.players[i])+'</button>';}).join('')+'</div>'+
    '<button class="btn ghost" data-act="undo">Undo last ball</button>';
  }else if(m==='bowler'){
    var bw2=M.teams[I.bowl];label='Next bowler';
    var el=bw2.players.map(function(n,i){return i;}).filter(function(i){return i!==I.lastBowler;});
    inner='<h2>Over complete</h2><p class="muted">Pick the bowler for over '+(Math.floor(I.balls/6)+1)+'. '+esc(bw2.players[I.lastBowler])+' cannot bowl back to back.</p><div class="pick">'+
    el.map(function(i){var b=I.bowlers[i];return '<button class="btn" data-act="pick-bowl" data-i="'+i+'">'+esc(bw2.players[i])+'<small>'+(b?ov(b.b)+'-'+b.m+'-'+b.r+'-'+b.w:'Yet to bowl')+'</small></button>';}).join('')+'</div>'+
    '<button class="btn ghost" data-act="undo">Undo last ball</button>';
  }else if(m==='wicket'){
    var btw=M.teams[I.bat],bww=M.teams[I.bowl];label='Wicket';
    inner='<h2>Wicket</h2>'+
    '<div class="field"><label for="w-type">How out</label><select id="w-type"><option value="bowled">Bowled</option><option value="caught">Caught</option><option value="lbw">LBW</option><option value="runout">Run out</option><option value="stumped">Stumped</option><option value="hitwicket">Hit wicket</option></select></div>'+
    '<div class="field" id="w-fld" hidden><label for="w-f">Fielder</label><select id="w-f"><option value="-1">Not recorded</option>'+bww.players.map(function(n,i){return '<option value="'+i+'">'+esc(n)+'</option>';}).join('')+'</select></div>'+
    '<div id="w-ro" hidden><div class="field"><label for="w-who">Who is out</label><select id="w-who"><option value="s">'+esc(btw.players[I.striker])+' (striker)</option><option value="n">'+esc(btw.players[I.non])+' (non-striker)</option></select></div>'+
    '<div class="field"><label for="w-r">Runs completed before the run out</label><select id="w-r"><option>0</option><option>1</option><option>2</option><option>3</option></select></div></div>'+
    '<div class="row"><button class="btn danger" data-act="wkt-ok">Confirm wicket</button><button class="btn ghost" data-act="close">Cancel</button></div>';
  }else if(m==='confirm'){
    label='Start a new match';
    inner='<h2>Start a new match?</h2><p>This clears the current match and all its scores.</p><div class="row"><button class="btn danger" data-act="new-ok">Clear and start over</button><button class="btn ghost" data-act="close">Keep scoring</button></div>';
  }else if(m==='share'){
    label='Audience match link';
    var shareUrl=location.origin+'/?match='+encodeURIComponent(M.matchId||'');
    inner='<div class="share-head"><button class="back-btn" type="button" data-act="close" aria-label="Back to match"><span aria-hidden="true">&larr;</span> Back</button><span class="qr-label">Audience access</span></div>'+
    '<h2>Share live match</h2><p class="muted">'+esc(M.tournament||'Cricket Tournament')+' · '+esc(M.matchName||'Match')+'</p>'+
    '<div class="qr-wrap"><img class="qr" src="/api/matches/'+encodeURIComponent(M.matchId||'')+'/qr?url='+encodeURIComponent(shareUrl)+'" alt="QR code for live match"><a class="share-link" href="'+esc(shareUrl)+'" target="_blank" rel="noopener">Open audience scorecard</a></div>'+
    '<div class="field"><label for="share-url">Audience URL</label><input id="share-url" type="text" readonly value="'+esc(shareUrl)+'"></div>'+
    '<div class="share-actions"><button class="btn primary" data-act="copy-link">Copy match link</button><button class="btn ghost" type="button" data-act="close">Back to match</button></div>';
  }
  return '<div class="mback"><div class="modal" role="dialog" aria-modal="true" aria-label="'+label+'">'+inner+'</div></div>';
}

/* ---------- events ---------- */
function act(a,t){
  var I=M?inn():null;
  if(a==='start')return startMatch();
  if(a==='add-player'||a==='remove-player'){
    if(!M){
      syncSetupPlayers();
      var team=t.dataset.team;
      var text=team==='a'?UI.setup.pa:UI.setup.pb;
      var names=text.split('\n').map(function(s){return s.trim();});
      if(text.trim()==='')names=['',''];
      if(a==='add-player'&&names.length<15)names.push('');
      if(a==='remove-player'&&names.length>2)names.splice(+t.dataset.i,1);
      if(team==='a')UI.setup.pa=names.join('\n');
      else UI.setup.pb=names.join('\n');
      UI.err='';
      render();
    }
    return;
  }
  if(!M)return;
  if(a==='view'){UI.view=t.dataset.v;if(UI.view!=='bcast')leaveClean();render();}
  else if(a==='mode'){UI.mode=t.dataset.m;render();}
  else if(a==='run'){var m=UI.mode;score(m,+t.dataset.r);}
  else if(a==='wkt-open'){if(canScore()){UI.modal='wicket';render();}}
  else if(a==='wkt-ok'){
    var type=document.getElementById('w-type').value;
    var wk={type:type,who:document.getElementById('w-who').value,fielder:+document.getElementById('w-f').value,runs:type==='runout'?+document.getElementById('w-r').value:0};
    if(type==='bowled'||type==='lbw'||type==='hitwicket')wk.fielder=-1;
    UI.modal=null;score('wkt',0,wk);
  }
  else if(a==='close'){UI.modal=null;render();}
  else if(a==='undo')undo();
  else if(a==='swap'){if(canScore()){HIST.push(JSON.stringify(M));swapEnds(I);save();render();}}
  else if(a==='new'){UI.modal='confirm';render();}
  else if(a==='share'){UI.modal='share';render();}
  else if(a==='copy-link'){
    var input=document.getElementById('share-url');
    if(input&&navigator.clipboard)navigator.clipboard.writeText(input.value).catch(function(){});
  }
  else if(a==='new-ok'){
    try{localStorage.removeItem(KEY);}catch(e){}
    leaveClean();M=null;HIST=[];UI.modal=null;UI.view='score';UI.mode='run';UI.err='';render();
  }
  else if(a==='openers-ok'){
    var s=+document.getElementById('o-s').value,n=+document.getElementById('o-n').value,b=+document.getElementById('o-b').value;
    if(s===n){document.getElementById('o-err').textContent='Pick two different batters.';return;}
    eb(I,s);eb(I,n);ew(I,b);I.striker=s;I.non=n;I.bowler=b;I.started=true;I.over=[];save();render();
  }
  else if(a==='pick-bat')pickBatter(+t.dataset.i);
  else if(a==='pick-bowl')pickBowler(+t.dataset.i);
  else if(a==='next-inn'){
    var a1=M.inn[0];M.cur=1;M.status='live';M.inn[1]=newInn(a1.bowl,a1.bat);UI.mode='run';save();render();
  }
  else if(a==='clean')toggleClean();
}
function toggleClean(){
  if(UI.clean){leaveClean();render();return;}
  UI.clean=true;UI.view='bcast';
  try{var p=document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();if(p&&p.catch)p.catch(function(){});}catch(e){}
  render();
}
function leaveClean(){
  UI.clean=false;
  try{if(document.fullscreenElement){var p=document.exitFullscreen();if(p&&p.catch)p.catch(function(){});}}catch(e){}
}
document.addEventListener('click',function(e){
  var t=e.target.closest('[data-act]');if(!t||t.disabled)return;
  act(t.dataset.act,t);
});
document.addEventListener('change',function(e){
  if(e.target.id!=='w-type')return;
  var v=e.target.value,f=document.getElementById('w-fld'),ro=document.getElementById('w-ro');
  if(f)f.hidden=!(v==='caught'||v==='stumped'||v==='runout');
  if(ro)ro.hidden=v!=='runout';
});
document.addEventListener('submit',function(e){e.preventDefault();if(!M)startMatch();});
document.addEventListener('fullscreenchange',function(){
  if(document.fullscreenElement){UI.fs=true;}
  else if(UI.fs){UI.fs=false;if(UI.clean){UI.clean=false;render();}}
});
document.addEventListener('keydown',function(e){
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  var tag=(e.target&&e.target.tagName||'').toLowerCase(),k=e.key.toLowerCase();
  if(k==='escape'){
    if(UI.modal==='wicket'||UI.modal==='confirm'||UI.modal==='share'){UI.modal=null;render();}
    else if(UI.clean){leaveClean();render();}
    else if(M&&UI.mode!=='run'){UI.mode='run';render();}
    return;
  }
  if(!M||tag==='input'||tag==='textarea'||tag==='select')return;
  if(activeModal())return;
  if(k==='u'){e.preventDefault();undo();return;}
  if(k==='f'&&UI.view==='bcast'){e.preventDefault();toggleClean();return;}
  if(!canScore())return;
  var mode=UI.mode;
  if(/^[0-6]$/.test(k)){
    var r=+k;
    if(RUNSET[mode].indexOf(r)>=0){e.preventDefault();score(mode,r);}
    return;
  }
  if(k==='w'||k==='n'){
    e.preventDefault();var kk=k==='w'?'wd':'nb';
    if(mode===kk)score(kk,0);else{UI.mode=kk;render();}
  }else if(k==='b'||k==='l'){
    e.preventDefault();var k2=k==='b'?'bye':'lb';
    UI.mode=mode===k2?'run':k2;render();
  }else if(k==='x'){e.preventDefault();UI.modal='wicket';render();}
  else if(k==='s'){e.preventDefault();HIST.push(JSON.stringify(M));swapEnds(inn());save();render();}
});

if(PUBLIC_MATCH){
  fetch('/api/matches/'+encodeURIComponent(PUBLIC_MATCH))
    .then(function(r){if(!r.ok)throw new Error('Match not found');return r.json();})
    .then(function(match){M=match;render();var events=new EventSource('/api/matches/'+encodeURIComponent(PUBLIC_MATCH)+'/events');events.onmessage=function(e){if(e.data&&e.data!=='null'){M=JSON.parse(e.data);render();};};})
    .catch(function(){document.getElementById('app').innerHTML='<main class="public-loading"><h1>Match not found</h1><p>Ask the scorer to share a new audience link.</p></main>';});
}else{
  load();render();
}
})();

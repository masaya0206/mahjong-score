import {getHistory} from "./storage.js";
const history = getHistory();
const $=s=>document.querySelector(s);
const today = new Date().toISOString().slice(0,10);
const fmt=n=>Number(n).toLocaleString("ja-JP");
const esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const todays = history.filter(g=>(g.finishedAt||g.startedAt||"").slice(0,10)===today);
const agg = new Map();
todays.forEach(g=>{
  [...g.players].sort((a,b)=>b.score-a.score).forEach((p,rank)=>{
    const a=agg.get(p.id)||{name:p.name,games:0,total:0,ranks:[0,0,0,0]};
    a.games++; a.total += p.score-g.startingPoints; a.ranks[rank]++; agg.set(p.id,a);
  });
});
const summary=$("#todaySummary");
if(!todays.length) summary.innerHTML=`<p class="helper">今日終了した半荘はまだありません。</p>`;
[...agg.values()].sort((a,b)=>b.total-a.total).forEach(a=>{
  const d=document.createElement("div"); d.className="summary-item";
  d.innerHTML=`<strong>${esc(a.name)}</strong><strong class="${a.total>=0?"positive":"negative"}">${a.total>=0?"+":""}${fmt(a.total)}</strong><span class="sub helper">${a.games}半荘・1着 ${a.ranks[0]}回 / 2着 ${a.ranks[1]}回 / 3着 ${a.ranks[2]}回 / 4着 ${a.ranks[3]}回</span>`;
  summary.appendChild(d);
});
const list=$("#gameHistory");
if(!history.length) list.innerHTML=`<p class="helper">対局履歴はまだありません。</p>`;
history.forEach(g=>{
  const d=document.createElement("article"); d.className="history-item";
  const date=new Date(g.finishedAt||g.startedAt).toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"});
  const ranked=[...g.players].sort((a,b)=>b.score-a.score);
  d.innerHTML=`<strong>${date}</strong><div class="history-scores">${ranked.map((p,i)=>`<div class="history-score">${i+1}位<br>${esc(p.name)}<strong>${fmt(p.score)}</strong></div>`).join("")}</div>`;
  list.appendChild(d);
});

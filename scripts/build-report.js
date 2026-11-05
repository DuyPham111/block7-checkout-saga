'use strict';
// npm run report: presentation/slides.html (18 slide thuyết trình) + report/extra-slides.html (slide giải thích lựa chọn)
// + report/notes.json (ghi chú) → REPORT.html: MỘT file, ảnh nhúng sẵn, mở offline.
// Hai chế độ: Trình chiếu (← →, N hiện ghi chú) và Đọc tài liệu (mọi slide kèm giải thích, có mục lục, in ra PDF được).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SECTION = /<section class="slide[\s\S]*?<\/section>/g;

const deck = read('presentation/slides.html');
const style = deck.match(/<style>([\s\S]*?)<\/style>/)[1];
const original = deck.match(SECTION);
const extra = read('report/extra-slides.html').match(SECTION);
const notes = JSON.parse(read('report/notes.json'));
if (original.length !== 18) throw new Error(`build-report: mong đợi 18 slide gốc, thấy ${original.length}`);

// Ghép ghi chú vào slide gốc (slide bổ sung đã có <aside class="notes"> sẵn)
const withNotes = original.map((s, i) => {
  const n = notes[String(i + 1)];
  if (!n) throw new Error(`build-report: thiếu ghi chú cho slide ${i + 1}`);
  return s.replace(/<\/section>$/, `  <aside class="notes">${esc(n)}</aside>\n</section>`);
});
// Thứ tự: slide thuyết trình 1–17 → phần bổ sung (lựa chọn) → slide kết luận
const slides = [...withNotes.slice(0, 17), ...extra, withNotes[17]];

// Tách ghi chú ra ngoài slide và bọc mỗi slide trong .page
const pages = slides.map((s, i) => {
  const m = s.match(/<aside class="notes">([\s\S]*?)<\/aside>/);
  const note = m ? m[1].trim() : '';
  const body = s.replace(/\s*<aside class="notes">[\s\S]*?<\/aside>/, '');
  const title = (body.match(/data-title="([^"]*)"/) || [])[1] || `Slide ${i + 1}`;
  return { title, html: `<div class="page" id="p${i + 1}" data-title="${title}">\n${body}\n<div class="note"><b>Giải thích · ${i + 1}. ${title}</b><p>${note}</p></div>\n</div>` };
});

// Nhúng ảnh thành data URI để REPORT.html chạy độc lập
let html = pages.map((p) => p.html).join('\n');
html = html.replace(/src="img\/([^"]+)"/g, (m, f) => {
  const file = path.join(ROOT, 'presentation', 'img', f);
  const b64 = fs.readFileSync(file).toString('base64');
  return `src="data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,${b64}"`;
});

const firstExtra = 18; // số thứ tự (1-based) của slide bổ sung đầu tiên
const toc = pages
  .map((p, i) => `${i + 1 === firstExtra ? '<li class="sep">Phần bổ sung: các lựa chọn của nhóm</li>' : ''}<li><a href="#p${i + 1}" data-go="${i + 1}">${i + 1}. ${esc(p.title)}</a></li>`)
  .join('');

const out = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>REPORT — Block 7 Checkout Saga · Nhóm 07</title>
<style>
${style}
/* ===== REPORT: khung trình chiếu + chế độ đọc tài liệu ===== */
.page{display:contents}
.slide.choice .card li,.slide.choice .card p{font-size:17px;line-height:1.5}
.slide.choice .card h3{font-size:20px;margin-bottom:8px}
.slide.choice .card ul{padding-left:20px}
.slide.choice .card li{margin:5px 0}
.page .note{display:none}
#bar{position:fixed;right:12px;top:10px;z-index:6;display:flex;gap:6px}
#bar button{background:#1f2a44;color:#dbe4f5;border:1px solid #33415f;border-radius:7px;padding:5px 11px;font:13px "Segoe UI",sans-serif;cursor:pointer;opacity:.55}
#bar button:hover{opacity:1}
#overlay{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);width:min(1100px,92vw);background:#fffbe6;color:#3b3200;border:1px solid #e9d27a;border-radius:10px;padding:12px 16px;font:15px/1.55 "Segoe UI",sans-serif;z-index:7;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none}
#overlay.on{display:block}
#toc{display:none}
html.doc,body.doc{overflow:auto;height:auto;background:#e8ecf3}
body.doc #viewport{position:static;display:block;padding:70px 0 40px}
body.doc #deck{transform:none!important;width:auto;height:auto}
body.doc .page{display:block;width:calc(1280px * var(--z));margin:0 auto 34px}
body.doc .slide{display:flex!important;position:relative;inset:auto;width:1280px;height:720px;zoom:var(--z);box-shadow:0 4px 18px rgba(15,23,41,.18)}
body.doc .page .note{display:block;background:#fff;border:1px solid #d7deea;border-left:4px solid #2458d6;border-radius:0 0 10px 10px;padding:12px 16px;font:15px/1.6 "Segoe UI",sans-serif;color:#26304a;margin-top:-4px}
body.doc .page .note p{margin:6px 0 0}
body.doc #toc{display:block;width:calc(1280px * var(--z));margin:0 auto 30px;background:#fff;border:1px solid #d7deea;border-radius:12px;padding:18px 24px;font:15px/1.6 "Segoe UI",sans-serif}
body.doc #toc h1{font-size:24px;margin:0 0 4px}
body.doc #toc ol{columns:2;margin:10px 0 0;padding-left:0;list-style:none}
body.doc #toc li.sep{font-weight:700;color:#2458d6;margin-top:6px}
body.doc #toc a{color:#26304a;text-decoration:none}
body.doc #toc a:hover{color:#2458d6;text-decoration:underline}
body.doc #nav,body.doc #progress,body.doc #overlay{display:none!important}
@media print{
  #bar,#nav,#progress,#overlay{display:none!important}
  body.doc{background:#fff} body.doc #viewport{padding:0}
  body.doc .page{width:1280px;--z:1;page-break-after:always;margin:0}
  body.doc #toc{width:1280px;page-break-after:always}
}
</style>
</head>
<body>
<div id="progress"></div>
<div id="bar"><button id="mode" title="Đổi chế độ (D)">📖 Đọc tài liệu</button><button id="shownote" title="Ghi chú slide hiện tại (N)">💬 Ghi chú</button></div>
<div id="overlay"></div>
<div id="viewport"><div id="deck">
<nav id="toc"><h1>REPORT — Block 7: Checkout Saga</h1><div>Nhóm 07 · 23127045 · 23127102 · 23127159 · 23127183 · 23127393 · Chế độ đọc tài liệu: mỗi slide kèm giải thích. Báo cáo chi tiết: REPORT.md.</div><ol>${toc}</ol></nav>
${html}
</div></div>
<div id="nav"><button id="prev">←</button><span id="count"></span><button id="next">→</button><button id="full" title="Toàn màn hình (F)">⛶</button></div>
<script>
(function(){
  const pages=[...document.querySelectorAll('.page')];
  const slides=pages.map(p=>p.querySelector('.slide'));
  const deck=document.getElementById('deck');
  slides.forEach((s,i)=>{
    if(s.classList.contains('cover'))return;
    const f=document.createElement('div');f.className='foot';
    f.innerHTML='<span>REPORT · Checkout Saga · Block 7 · Nhóm 07</span><span>'+s.dataset.title+' · '+(i+1)+'/'+slides.length+'</span>';
    s.appendChild(f);
  });
  let cur=0, doc=false;
  const overlay=document.getElementById('overlay');
  function show(i){
    cur=Math.max(0,Math.min(slides.length-1,i));
    slides.forEach((s,k)=>s.classList.toggle('on',k===cur));
    document.getElementById('count').textContent=(cur+1)+' / '+slides.length;
    document.getElementById('progress').style.width=((cur+1)/slides.length*100)+'%';
    overlay.innerHTML=pages[cur].querySelector('.note').innerHTML;
    if(!doc&&location.hash!=='#'+(cur+1))history.replaceState(null,'','#'+(cur+1));
  }
  function fit(){
    const s=Math.min(innerWidth/1300,innerHeight/740);
    deck.style.transform=doc?'':'scale('+s+')';
    document.documentElement.style.setProperty('--z',Math.min(1,(innerWidth-48)/1280).toFixed(4));
  }
  function setDoc(on){
    doc=on;document.body.classList.toggle('doc',on);document.documentElement.classList.toggle('doc',on);
    document.getElementById('mode').textContent=on?'🖥 Trình chiếu':'📖 Đọc tài liệu';
    fit();
    if(on){pages[cur].scrollIntoView();}else{scrollTo(0,0);show(cur);}
  }
  addEventListener('resize',fit);
  addEventListener('hashchange',()=>{const n=parseInt(location.hash.slice(1));if(n&&!doc)show(n-1)});
  document.getElementById('toc').addEventListener('click',e=>{const a=e.target.closest('a[data-go]');if(!a)return;e.preventDefault();cur=+a.dataset.go-1;pages[cur].scrollIntoView({behavior:'smooth'});});
  document.addEventListener('keydown',e=>{
    if(e.key==='d'||e.key==='D')return setDoc(!doc);
    if(doc)return;
    if(['ArrowRight','PageDown',' ','Enter'].includes(e.key)){e.preventDefault();show(cur+1)}
    if(['ArrowLeft','PageUp','Backspace'].includes(e.key)){e.preventDefault();show(cur-1)}
    if(e.key==='Home')show(0);
    if(e.key==='End')show(slides.length-1);
    if(e.key==='n'||e.key==='N')overlay.classList.toggle('on');
    if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}
  });
  document.getElementById('mode').onclick=()=>setDoc(!doc);
  document.getElementById('shownote').onclick=()=>{if(doc)return;overlay.classList.toggle('on')};
  document.getElementById('prev').onclick=()=>show(cur-1);
  document.getElementById('next').onclick=()=>show(cur+1);
  document.getElementById('full').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
  const q=new URLSearchParams(location.search);
  fit();show((parseInt(location.hash.slice(1))||1)-1);
  if(q.get('mode')==='doc')setDoc(true);
})();
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'REPORT.html'), out);
console.log(`REPORT.html: ${slides.length} slide (${original.length} thuyết trình + ${extra.length} bổ sung), ${(out.length / 1024).toFixed(0)} KB`);

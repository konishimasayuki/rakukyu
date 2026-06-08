import { calcPayroll, calcBonusAmount, fmt } from "./calcPayroll";

function printPayslip(emp, p, settings, att) {
  const w = window.open("","_blank");
  att = att||{};
  const isPT = p.payType==="時間給制"||emp.employmentType==="パート"||emp.employmentType==="アルバイト";
  const attCells = [
    ["出勤",   att.workDays!=null?att.workDays+"日":"—",false],
    ["欠勤",   att.absentDays!=null?att.absentDays+"日":"—",false],
    ["有給",   att.paidLeaveDays!=null?att.paidLeaveDays+"日":"—",false],
    ["所定時間",att.scheduledHours!=null?att.scheduledHours+"h":"—",false],
    ["実働時間",att.actualHours!=null?att.actualHours+"h":"—",false],
    ["普通残業",att.overtime!=null?att.overtime+"h":"—", att.overtime>0],
    ["深夜残業",att.lateNight!=null?att.lateNight+"h":"—", att.lateNight>0],
    ["休日残業",att.holiday!=null?att.holiday+"h":"—", att.holiday>0],
  ].map(([l,v,ot])=>`<div class="att-cell"><div class="att-label">${l}</div><div class="att-val${ot?" ot":""}">${v}</div></div>`).join("");
  const incRows = p.incentiveItems.filter(i=>i.amount>0).map(i=>
    `<div class="row"><span class="row-label">${i.name}${i.taxable?"":" ★非課税"}</span><span class="row-val">¥${i.amount.toLocaleString()}</span></div>`
  ).join("");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>給与明細書</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:11px;color:#111;padding:20px}
.page{max-width:210mm;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:14px}
.co-name{font-size:14px;font-weight:bold}.co-info{font-size:10px;color:#555;line-height:1.8}
.emp-bar{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:8px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px;font-size:11px}
.section-title{font-size:10px;font-weight:bold;color:#6c63ff;letter-spacing:.15em;border-bottom:2px solid #6c63ff;padding-bottom:4px;margin-bottom:8px;margin-top:12px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ddd;font-size:11px}
.row:last-child{border-bottom:none}
.row-label{color:#555;flex:1}.row-val{font-weight:bold;text-align:right;white-space:nowrap}
.total-row{display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #1a1a2e;font-weight:bold;margin-top:4px}
.net-box{background:#1a1a2e;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:4px;margin-top:14px}
.net-label{font-size:12px;color:#aaa}.net-val{font-size:24px;font-weight:900;color:#00c9a7}
.att-bar{background:#f8f9ff;border:1px solid #e0e4f0;border-radius:4px;padding:8px 0;margin-bottom:12px;display:flex;flex-wrap:wrap}
.att-cell{display:flex;flex-direction:column;align-items:center;padding:4px 12px;border-right:1px solid #e0e4f0;min-width:70px}
.att-cell:last-child{border-right:none}.att-label{font-size:9px;color:#999;margin-bottom:2px}
.att-val{font-size:12px;font-weight:bold}.att-val.ot{color:#fc5c65}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
th{background:#1a1a2e;color:white;padding:5px 6px;text-align:left;white-space:nowrap}
td{border:1px solid #ccc;padding:4px 6px;white-space:nowrap}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.summary{background:#fffbe6;border:1px solid #f7b731;border-radius:4px;padding:12px 16px;margin-top:12px}
.refund-box{padding:10px 16px;border-radius:4px;text-align:center}
.refund-box.refund{background:#e8faf5;border:2px solid #00c9a7}
.refund-box.extra{background:#fff0f0;border:2px solid #fc5c65}
.refund-amount{font-size:22px;font-weight:900}
.seal-area{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.seal{width:50px;height:50px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center}
@media print{button{display:none!important}}
</style></head><body><div class="page">
  <div class="header">
    <div><div class="co-name">${settings.companyName||""}</div>
    <div class="co-info">${settings.companyAddress||""}&nbsp;&nbsp;TEL: ${settings.companyTel||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:18px;font-weight:bold;letter-spacing:.2em">給 与 明 細 書</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${p.month.replace("-","年")}月分</div>
    </div>
  </div>
  <div class="emp-bar">
    <div><b>${emp.name}</b>&nbsp;様</div>
    <div>コード：${emp.code||"—"}</div>
    <div>部署：${emp.department}</div>
    <div>雇用形態：${emp.employmentType}（${emp.payType||"月給制"}）</div>
    ${emp.address?`<div>住所：${emp.address}</div>`:""}
  </div>
  <div class="section-title">勤 怠 情 報</div>
  <div class="att-bar">${attCells}</div>
  <div class="two-col">
    <div>
      <div class="section-title">支 給</div>
      <div class="row"><span class="row-label">${isPT?"賃金（時給×実働）":"基本給"}</span><span class="row-val">¥${p.baseSalary.toLocaleString()}</span></div>
      ${p.overtimePay>0?`<div class="row"><span class="row-label">時間外手当</span><span class="row-val">¥${p.overtimePay.toLocaleString()}</span></div>`:""}
      ${p.transportAllowance>0?`<div class="row"><span class="row-label">通勤手当</span><span class="row-val">¥${p.transportAllowance.toLocaleString()}</span></div>`:""}
      ${p.housingAllowance>0?`<div class="row"><span class="row-label">住宅手当</span><span class="row-val">¥${p.housingAllowance.toLocaleString()}</span></div>`:""}
      ${p.otherAllowance>0?`<div class="row"><span class="row-label">その他手当</span><span class="row-val">¥${p.otherAllowance.toLocaleString()}</span></div>`:""}
      ${incRows}
      <div class="total-row"><span>総支給額</span><span style="color:#00796b">¥${p.grossSalary.toLocaleString()}</span></div>
    </div>
    <div>
      <div class="section-title">控 除</div>
      ${p.health>0?`<div class="row"><span class="row-label">健康保険料</span><span class="row-val">¥${p.health.toLocaleString()}</span></div>`:""}
      ${p.nursing>0?`<div class="row"><span class="row-label">介護保険料</span><span class="row-val">¥${p.nursing.toLocaleString()}</span></div>`:""}
      ${p.pension>0?`<div class="row"><span class="row-label">厚生年金保険料</span><span class="row-val">¥${p.pension.toLocaleString()}</span></div>`:""}
      ${p.employment>0?`<div class="row"><span class="row-label">雇用保険料</span><span class="row-val">¥${p.employment.toLocaleString()}</span></div>`:""}
      ${p.incomeTax>0?`<div class="row"><span class="row-label">所得税</span><span class="row-val">¥${p.incomeTax.toLocaleString()}</span></div>`:""}
      ${p.residentTax>0?`<div class="row"><span class="row-label">住民税</span><span class="row-val">¥${p.residentTax.toLocaleString()}</span></div>`:""}
      <div class="total-row"><span>控除合計</span><span style="color:#c62828">¥${p.totalDeduction.toLocaleString()}</span></div>
    </div>
  </div>
  <div class="net-box">
    <span class="net-label">差引支給額（手取り）</span>
    <span class="net-val">¥${p.netSalary.toLocaleString()}</span>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </div></body></html>`);
  w.document.close();
}
// ============================================================
// 賃金台帳PDF共通CSS
// ============================================================
const LEDGER_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:10px;color:#111;padding:16px}
table{width:100%;border-collapse:collapse;margin-bottom:10px}
th{background:#1a1a2e;color:white;padding:5px 4px;text-align:left;white-space:nowrap;font-size:8px}
td{border:1px solid #ccc;padding:3px 5px;white-space:nowrap;font-size:9px}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.bonus-row{background:#fff8e1}.bonus-total{background:#fff3cd;font-weight:bold;border-top:2px solid #f7b731}
.salary-total{background:#e8f0ff;font-weight:bold;border-top:2px solid #6c63ff}
.grand-total{background:#1a1a2e;color:white;font-weight:bold;border-top:2px solid #333}
.grand-total td{color:white}
@media print{button{display:none!important}}`;

function ledgerHeader(settings, title, subtitle) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div>
    <div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:15px;font-weight:bold;letter-spacing:.2em">${title}</div>
      <div style="font-size:11px;color:#666">${subtitle}</div>
    </div>
  </div>`;
}

function printLedger(employees, month, settings, incentiveMasters, mi, attendanceData) {
  const rows = employees.map(e=>({ e, p:calcPayroll(e,month,settings,incentiveMasters,mi,attendanceData[e.id]) }));
  const tot = rows.reduce((a,{p})=>({
    g:a.g+p.grossSalary,d:a.d+p.totalDeduction,n:a.n+p.netSalary,i:a.i+p.incentiveTotal,
    h:a.h+p.health,nu:a.nu+p.nursing,pe:a.pe+p.pension,em:a.em+p.employment,
    it:a.it+p.incomeTax,rt:a.rt+p.residentTax
  }),{g:0,d:0,n:0,i:0,h:0,nu:0,pe:0,em:0,it:0,rt:0});
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>月別賃金台帳</title><style>${LEDGER_CSS}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div>
    <div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:15px;font-weight:bold;letter-spacing:.2em">月 別 賃 金 台 帳</div>
      <div style="font-size:11px;color:#666">${month.replace("-","年")}月分&nbsp;&nbsp;対象者: ${rows.length}名</div>
    </div>
  </div>
  <table>
  <tr>
    <th>コード</th><th>氏名</th><th>部署</th><th>雇用形態</th><th>支給形態</th>
    <th class="r">基本給</th><th class="r">残業代</th><th class="r">インセン</th><th class="r">各手当</th>
    <th class="r">総支給</th><th class="r">健保</th><th class="r">介護</th><th class="r">厚年</th>
    <th class="r">雇保</th><th class="r">所得税</th><th class="r">住民税</th><th class="r">控除計</th><th class="r">手取り</th>
  </tr>
  ${rows.map(({e,p})=>`<tr>
    <td style="font-size:8px;color:#888">${e.code||"—"}</td><td>${e.name}</td><td>${e.department}</td>
    <td>${e.employmentType}</td><td>${e.payType||"月給制"}</td>
    <td class="r">${p.baseSalary.toLocaleString()}</td>
    <td class="r">${p.overtimePay>0?p.overtimePay.toLocaleString():"—"}</td>
    <td class="r bold">${p.incentiveTotal>0?p.incentiveTotal.toLocaleString():"—"}</td>
    <td class="r">${(p.transportAllowance+p.housingAllowance+p.otherAllowance)>0?(p.transportAllowance+p.housingAllowance+p.otherAllowance).toLocaleString():"—"}</td>
    <td class="r bold green">${p.grossSalary.toLocaleString()}</td>
    <td class="r">${p.health>0?p.health.toLocaleString():"—"}</td>
    <td class="r">${p.nursing>0?p.nursing.toLocaleString():"—"}</td>
    <td class="r">${p.pension>0?p.pension.toLocaleString():"—"}</td>
    <td class="r">${p.employment>0?p.employment.toLocaleString():"—"}</td>
    <td class="r">${p.incomeTax>0?p.incomeTax.toLocaleString():"—"}</td>
    <td class="r">${p.residentTax>0?p.residentTax.toLocaleString():"—"}</td>
    <td class="r red">${p.totalDeduction.toLocaleString()}</td>
    <td class="r bold">${p.netSalary.toLocaleString()}</td>
  </tr>`).join("")}
  <tr style="background:#f0f4ff;font-weight:bold;font-size:9px">
    <td colspan="5">合計（${rows.length}名）</td>
    <td></td><td></td>
    <td class="r">${tot.i.toLocaleString()}</td><td></td>
    <td class="r green">${tot.g.toLocaleString()}</td>
    <td class="r">${tot.h.toLocaleString()}</td><td class="r">${tot.nu.toLocaleString()}</td>
    <td class="r">${tot.pe.toLocaleString()}</td><td class="r">${tot.em.toLocaleString()}</td>
    <td class="r">${tot.it.toLocaleString()}</td><td class="r">${tot.rt.toLocaleString()}</td>
    <td class="r red">${tot.d.toLocaleString()}</td><td class="r">${tot.n.toLocaleString()}</td>
  </tr>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;印刷日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </body></html>`);
  w.document.close();
}

// ============================================================
// 賃金台帳PDF：年次全員
// ============================================================
function printLedgerYearly(employees, year, settings, getMI, getAtt, getBonus) {
  const MONTHS_12 = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const fmtN = n=>(n||0).toLocaleString();
  const rows = employees.map(e=>{
    let sal=0,bon=0,h=0,nu=0,pe=0,em=0,it=0,rt=0,sd=0,bd=0;
    MONTHS_12.forEach(m=>{
      const p=calcPayroll(e,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[e.id]);
      sal+=p.grossSalary; h+=p.health; nu+=p.nursing; pe+=p.pension;
      em+=p.employment; it+=p.incomeTax; rt+=p.residentTax; sd+=p.totalDeduction;
      const bAmt=getBonus(m)?.data?.[e.id]?.bonus||0;
      if(bAmt>0){const b=calcBonusAmount(e,bAmt);bon+=b.bonusAmount;h+=b.health;nu+=b.nursing;pe+=b.pension;em+=b.employment;it+=b.incomeTax;bd+=b.totalDeduction;}
    });
    return {e,sal,bon,total:sal+bon,h,nu,pe,em,it,rt,deduct:sd+bd,net:sal+bon-sd-bd};
  });
  const tot=rows.reduce((a,r)=>({sal:a.sal+r.sal,bon:a.bon+r.bon,total:a.total+r.total,h:a.h+r.h,nu:a.nu+r.nu,pe:a.pe+r.pe,em:a.em+r.em,it:a.it+r.it,rt:a.rt+r.rt,deduct:a.deduct+r.deduct,net:a.net+r.net}),{sal:0,bon:0,total:0,h:0,nu:0,pe:0,em:0,it:0,rt:0,deduct:0,net:0});
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>賃金台帳（年次）${year}</title><style>${LEDGER_CSS}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
<div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div><div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
<div style="text-align:right"><div style="font-size:15px;font-weight:bold;letter-spacing:.2em">賃 金 台 帳（年 次）</div>
<div style="font-size:11px;color:#666">${year}年（1〜12月）　対象者: ${rows.length}名</div></div></div>
<table>
<tr><th>コード</th><th>氏名</th><th>部署</th><th>雇用形態</th>
<th class="r">給与支給計</th><th class="r">賞与支給計</th><th class="r">年間総支給</th>
<th class="r">健保計</th><th class="r">介護計</th><th class="r">厚年計</th><th class="r">雇保計</th>
<th class="r">所得税計</th><th class="r">住民税計</th><th class="r">控除合計</th><th class="r">年間手取り</th></tr>
${rows.map(r=>`<tr>
<td style="font-size:8px;color:#888">${r.e.code||"—"}</td><td>${r.e.name}</td><td>${r.e.department}</td><td>${r.e.employmentType}</td>
<td class="r">${fmtN(r.sal)}</td>
<td class="r ${r.bon>0?"bold":""}" style="${r.bon>0?"color:#856404":""}">${r.bon>0?fmtN(r.bon):"—"}</td>
<td class="r bold green">${fmtN(r.total)}</td>
<td class="r">${r.h>0?fmtN(r.h):"—"}</td><td class="r">${r.nu>0?fmtN(r.nu):"—"}</td>
<td class="r">${r.pe>0?fmtN(r.pe):"—"}</td><td class="r">${r.em>0?fmtN(r.em):"—"}</td>
<td class="r">${r.it>0?fmtN(r.it):"—"}</td><td class="r">${r.rt>0?fmtN(r.rt):"—"}</td>
<td class="r red">${fmtN(r.deduct)}</td><td class="r bold">${fmtN(r.net)}</td></tr>`).join("")}
<tr class="grand-total">
<td colspan="4">合計（${rows.length}名）</td>
<td class="r">${fmtN(tot.sal)}</td><td class="r">${fmtN(tot.bon)}</td><td class="r">${fmtN(tot.total)}</td>
<td class="r">${fmtN(tot.h)}</td><td class="r">${fmtN(tot.nu)}</td><td class="r">${fmtN(tot.pe)}</td><td class="r">${fmtN(tot.em)}</td>
<td class="r">${fmtN(tot.it)}</td><td class="r">${fmtN(tot.rt)}</td>
<td class="r">${fmtN(tot.deduct)}</td><td class="r">${fmtN(tot.net)}</td></tr>
</table>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
<div style="font-size:9px;color:#aaa">楽給.com　発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
<button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer">印刷/PDF保存</button>
</div></body></html>`);
  w.document.close();
}

// ============================================================
// 賃金台帳PDF：個人年次（給与月別＋賞与明細）
// ============================================================
function printLedgerEmpYearly(emp, year, settings, getMI, getAtt, getBonus) {
  const MONTHS_12 = Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const fmtN = n=>(n||0).toLocaleString();
  const monthData = MONTHS_12.map(m=>{
    const p=calcPayroll(emp,m,settings,settings.incentiveMasters,getMI(m),getAtt(m)[emp.id]);
    const bAmt=getBonus(m)?.data?.[emp.id]?.bonus||0;
    const b=bAmt>0?calcBonusAmount(emp,bAmt):null;
    const payDate=getBonus(m)?.payDate||"";
    return {m,p,b,bAmt,payDate};
  });
  const sg=monthData.reduce((a,{p})=>({gross:a.gross+p.grossSalary,h:a.h+p.health,nu:a.nu+p.nursing,pe:a.pe+p.pension,em:a.em+p.employment,it:a.it+p.incomeTax,rt:a.rt+p.residentTax,d:a.d+p.totalDeduction,net:a.net+p.netSalary}),{gross:0,h:0,nu:0,pe:0,em:0,it:0,rt:0,d:0,net:0});
  const bonusMonths=monthData.filter(r=>r.bAmt>0);
  const bg=bonusMonths.reduce((a,{b})=>b?({gross:a.gross+b.bonusAmount,h:a.h+b.health,nu:a.nu+b.nursing,pe:a.pe+b.pension,em:a.em+b.employment,it:a.it+b.incomeTax,d:a.d+b.totalDeduction,net:a.net+b.netBonus}):a,{gross:0,h:0,nu:0,pe:0,em:0,it:0,d:0,net:0});
  const total={gross:sg.gross+bg.gross,h:sg.h+bg.h,nu:sg.nu+bg.nu,pe:sg.pe+bg.pe,em:sg.em+bg.em,it:sg.it+bg.it,rt:sg.rt,d:sg.d+bg.d,net:sg.net+bg.net};
  const w=window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>賃金台帳（個人）${emp.name} ${year}</title><style>${LEDGER_CSS}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
<div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div><div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
<div style="text-align:right"><div style="font-size:15px;font-weight:bold;letter-spacing:.2em">賃 金 台 帳（個 人 年 次）</div>
<div style="font-size:11px;color:#666">${year}年（1〜12月）　${emp.name}（${emp.code||"—"}）</div></div></div>
<div style="background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:6px 12px;margin-bottom:10px;font-size:10px;display:flex;gap:20px;flex-wrap:wrap">
<span>部署：${emp.department}</span><span>雇用形態：${emp.employmentType}（${emp.payType||"月給制"}）</span>
<span>入社日：${emp.joinDate}</span>${emp.retireDate?`<span style="color:#c62828">退職日：${emp.retireDate}</span>`:""}
</div>
<table>
<tr><th>月</th><th class="r">基本給</th><th class="r">残業代</th><th class="r">インセン</th><th class="r">各手当</th>
<th class="r">総支給</th><th class="r">健保</th><th class="r">介護</th><th class="r">厚年</th>
<th class="r">雇保</th><th class="r">所得税</th><th class="r">住民税</th><th class="r">控除計</th><th class="r">手取り</th></tr>
${monthData.map(({m,p})=>`<tr>
<td style="font-weight:bold">${m.replace("-","年")}月</td>
<td class="r">${fmtN(p.baseSalary)}</td><td class="r">${p.overtimePay>0?fmtN(p.overtimePay):"—"}</td>
<td class="r">${p.incentiveTotal>0?fmtN(p.incentiveTotal):"—"}</td>
<td class="r">${(p.transportAllowance+p.housingAllowance+p.otherAllowance)>0?fmtN(p.transportAllowance+p.housingAllowance+p.otherAllowance):"—"}</td>
<td class="r bold green">${fmtN(p.grossSalary)}</td>
<td class="r">${p.health>0?fmtN(p.health):"—"}</td><td class="r">${p.nursing>0?fmtN(p.nursing):"—"}</td>
<td class="r">${p.pension>0?fmtN(p.pension):"—"}</td><td class="r">${p.employment>0?fmtN(p.employment):"—"}</td>
<td class="r">${p.incomeTax>0?fmtN(p.incomeTax):"—"}</td><td class="r">${p.residentTax>0?fmtN(p.residentTax):"—"}</td>
<td class="r red">${fmtN(p.totalDeduction)}</td><td class="r bold">${fmtN(p.netSalary)}</td></tr>`).join("")}
<tr class="salary-total">
<td>給与合計</td><td class="r">${fmtN(sg.gross)}</td><td></td><td></td><td></td>
<td class="r green">${fmtN(sg.gross)}</td>
<td class="r">${fmtN(sg.h)}</td><td class="r">${fmtN(sg.nu)}</td><td class="r">${fmtN(sg.pe)}</td>
<td class="r">${fmtN(sg.em)}</td><td class="r">${fmtN(sg.it)}</td><td class="r">${fmtN(sg.rt)}</td>
<td class="r red">${fmtN(sg.d)}</td><td class="r bold">${fmtN(sg.net)}</td></tr>
${bonusMonths.map(({m,b,bAmt,payDate})=>`<tr class="bonus-row">
<td style="color:#856404;font-weight:bold">${m.replace("-","年")}月<br><span style="font-size:8px">賞与${payDate?` (${payDate})`:""}</span></td>
<td class="r bold" colspan="4" style="color:#856404">支給額　¥${fmtN(bAmt)}</td>
<td class="r bold" style="color:#856404">${fmtN(bAmt)}</td>
<td class="r">${b.health>0?fmtN(b.health):"—"}</td><td class="r">${b.nursing>0?fmtN(b.nursing):"—"}</td>
<td class="r">${b.pension>0?fmtN(b.pension):"—"}</td><td class="r">${b.employment>0?fmtN(b.employment):"—"}</td>
<td class="r">${b.incomeTax>0?fmtN(b.incomeTax):"—"}</td><td class="r">—</td>
<td class="r red">${fmtN(b.totalDeduction)}</td><td class="r bold">${fmtN(b.netBonus)}</td></tr>`).join("")}
${bg.gross>0?`<tr class="bonus-total">
<td>賞与合計</td><td colspan="4" style="font-size:9px;color:#888">${bonusMonths.length}回分</td>
<td class="r" style="color:#856404">${fmtN(bg.gross)}</td>
<td class="r">${fmtN(bg.h)}</td><td class="r">${fmtN(bg.nu)}</td><td class="r">${fmtN(bg.pe)}</td>
<td class="r">${fmtN(bg.em)}</td><td class="r">${fmtN(bg.it)}</td><td class="r">—</td>
<td class="r red">${fmtN(bg.d)}</td><td class="r bold">${fmtN(bg.net)}</td></tr>`:""}
<tr class="grand-total">
<td>年間合計</td><td colspan="4"></td><td class="r">${fmtN(total.gross)}</td>
<td class="r">${fmtN(total.h)}</td><td class="r">${fmtN(total.nu)}</td><td class="r">${fmtN(total.pe)}</td>
<td class="r">${fmtN(total.em)}</td><td class="r">${fmtN(total.it)}</td><td class="r">${fmtN(total.rt)}</td>
<td class="r">${fmtN(total.d)}</td><td class="r">${fmtN(total.net)}</td></tr>
</table>
<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
<div style="font-size:9px;color:#aaa">楽給.com　発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
<button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer">印刷/PDF保存</button>
</div></body></html>`);
  w.document.close();
}

// ============================================================
// INITIAL DATA
// ============================================================

const GENSEN_TEMPLATE_B64 = "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";

async function printGensenhyou(emp, result, year, company) {
  // SheetJSをCDNから動的ロード
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const XLSX = window.XLSX;

  // Base64→ArrayBuffer→Workbook
  const bin  = atob(GENSEN_TEMPLATE_B64);
  const buf  = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const wb   = XLSX.read(buf, { type:'array', cellStyles:true, cellFormulas:true });
  const ws   = wb.Sheets[wb.SheetNames[0]];

  const fmtY = (n) => n ? Number(n).toLocaleString('ja-JP') : '';

  function put(addr, val, hAlign='right') {
    if (!addr || addr==='不要' || val==='' || val===null || val===undefined) return;
    if (!ws[addr]) ws[addr] = {};
    ws[addr].v = val;
    ws[addr].t = typeof val === 'number' ? 'n' : 's';
    ws[addr].s = {
      font: { name: 'MS Gothic', sz: 9 },
      alignment: { horizontal: hAlign, vertical: 'center' }
    };
  }

  function both(right, left, val, hAlign='right') {
    put(right, val, hAlign);
    put(left,  val, hAlign);
  }

  const r = result;
  const fuyo = r.dependents || emp.dependents || 0;

  // ── 右側（受給者交付用）＋ 左側（税務署提出用）両方 ──
  both('BE1',  'K1',   String(year),                    'center');
  both('BB2',  'H2',   emp.address  || '',               'left'  );
  both('CE6',  'AK6',  emp.nameKana || '',               'left'  );
  both('BZ7',  'AF7',  emp.name     || '',               'left'  );
  both('AW9',  'C9',   '給与・賞与',                     'left'  );
  both('BH9',  'N9',   fmtY(r.totalGross    || 0));
  both('BO9',  'U9',   fmtY(r.kyuyoShotoku  || 0));
  both('BZ9',  'AF9',  fmtY(r.totalKojo     || 0));
  both('CH9',  'AN9',  fmtY(r.finalTax      || 0));
  both('BG18', 'M18',  fmtY(r.shakaihoken   || 0));
  if (r.seimeiKojo  > 0) both('BP18','V18',  fmtY(r.seimeiKojo));
  if (r.jishin      > 0) both('BX18','AD18', fmtY(r.jishin));
  if (r.jutakuKojo  > 0) both('CF18','AL18', fmtY(r.jutakuKojo));
  if (r.haiguKojo   > 0) both('BD15','J15',  fmtY(r.haiguKojo));
  if (fuyo > 0)          both('BV15','AB15', String(fuyo), 'center');
  if (r.kisoKojo    > 0) both('CA34','AG34', fmtY(r.kisoKojo));

  // 受給者番号・生年月日
  if (emp.code) both('CB2','AH2', emp.code, 'left');

  // 支払者（右・左）
  put('BE56', company.companyAddress || '', 'left');
  put('K56',  company.companyAddress || '', 'left');
  put('BE58', company.companyName    || '', 'left');
  put('K58',  company.companyName    || '', 'left');
  put('CH59', company.companyTel     || '', 'left');
  put('AN59', company.companyTel     || '', 'left');

  // 印刷範囲・ページ設定
  if (!wb.Workbook) wb.Workbook = {};
  if (!wb.Workbook.Sheets) wb.Workbook.Sheets = [{}];
  wb.Workbook.Sheets[0] = {
    ...wb.Workbook.Sheets[0],
    PageSetup: {
      paperSize: 28,      // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
    }
  };

  // ダウンロード
  const filename = `源泉徴収票_${emp.name}_${year}年分.xlsx`;
  XLSX.writeFile(wb, filename);
}


// ============================================================
// 源泉徴収簿 PDF（全員一覧）
// ============================================================
function printGensenchousho(employees, allResults, year, company) {
  const w = window.open("","_blank");
  const rows = allResults.filter(({r})=>r);
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>源泉徴収簿</title>
<style>
body{font-family:'MS Gothic',monospace;margin:16px;font-size:9px}
h2{text-align:center;font-size:14px;margin-bottom:4px}
.co{text-align:center;font-size:10px;color:#555;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
th{background:#1a1a2e;color:#fff;padding:4px 5px;font-size:8px;white-space:nowrap}
td{border:1px solid #ccc;padding:3px 5px;white-space:nowrap;font-size:9px}
.r{text-align:right}.refund{color:#00c9a7;font-weight:bold}.extra{color:#fc5c65;font-weight:bold}
.total{background:#f0f4ff;font-weight:bold}
@media print{button{display:none}}
</style></head><body>
<h2>源 泉 徴 収 簿</h2>
<div class="co">${year}年分　${company.companyName||""}</div>
<table>
<tr>
  <th>コード</th><th>氏名</th><th>部署</th>
  <th>支払金額</th><th>給与所得</th><th>所得控除計</th>
  <th>社保控除</th><th>生保控除</th><th>扶養控除</th><th>基礎控除</th>
  <th>課税所得</th><th>年税額</th><th>徴収済税額</th>
  <th>還付/追徴</th>
</tr>
${rows.map(({emp,r})=>`<tr>
  <td>${emp.code||"—"}</td><td>${emp.name}</td><td>${emp.department}</td>
  <td class="r">${(r.totalGross||0).toLocaleString()}</td>
  <td class="r">${(r.kyuyoShotoku||0).toLocaleString()}</td>
  <td class="r">${(r.totalKojo||0).toLocaleString()}</td>
  <td class="r">${(r.shakaihoken||0).toLocaleString()}</td>
  <td class="r">${(r.seimeiKojo||0).toLocaleString()}</td>
  <td class="r">${(r.fuyo||0).toLocaleString()}</td>
  <td class="r">${(r.kisoKojo||0).toLocaleString()}</td>
  <td class="r">${(r.kazeiShotoku||0).toLocaleString()}</td>
  <td class="r">${(r.finalTax||0).toLocaleString()}</td>
  <td class="r">${(r.totalWithheld||0).toLocaleString()}</td>
  <td class="r ${r.diff>=0?"refund":"extra"}">${r.diff>=0?"還付":"追徴"} ¥${Math.abs(r.diff||0).toLocaleString()}</td>
</tr>`).join("")}
<tr class="total">
  <td colspan="3">合計（${rows.length}名）</td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.totalGross||0),0).toLocaleString()}</td>
  <td colspan="7"></td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.finalTax||0),0).toLocaleString()}</td>
  <td class="r">${rows.reduce((s,{r})=>s+(r.totalWithheld||0),0).toLocaleString()}</td>
  <td></td>
</tr>
</table>
<button onclick="window.print()" style="margin-top:10px">印刷/PDF保存</button>
</body></html>`);
  w.document.close();
}


// ============================================================
// 退職所得の源泉徴収票 PDF
// ============================================================
function calcRetirementTax(retireIncome, yearsOfService) {
  let kojo = yearsOfService<=20 ? 400000*yearsOfService : 8000000+700000*(yearsOfService-20);
  kojo = Math.max(kojo, 800000);
  const taxableIncome = Math.max(0, Math.floor((retireIncome - kojo) / 2));
  let tax = 0;
  if (taxableIncome<=1950000)  tax=Math.floor(taxableIncome*0.05);
  else if (taxableIncome<=3300000) tax=Math.floor(taxableIncome*0.10-97500);
  else if (taxableIncome<=6950000) tax=Math.floor(taxableIncome*0.20-427500);
  else if (taxableIncome<=9000000) tax=Math.floor(taxableIncome*0.23-636000);
  else if (taxableIncome<=18000000) tax=Math.floor(taxableIncome*0.33-1536000);
  else tax=Math.floor(taxableIncome*0.40-2796000);
  return { kojo, taxableIncome, tax, finalTax:Math.floor(tax*1.021) };
}
function printRetirementHyou(emp, retireIncome, company) {
  const joinDate = new Date(emp.joinDate||"2000-01-01");
  const retireDate = new Date(emp.retireDate||new Date().toISOString().slice(0,10));
  const yearsOfService = Math.max(1, Math.ceil((retireDate-joinDate)/(1000*60*60*24*365)));
  const r = calcRetirementTax(retireIncome, yearsOfService);
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>退職所得源泉徴収票</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'MS Gothic','Hiragino Kaku Gothic ProN',monospace;font-size:11px;color:#111;padding:20px}
.page{max-width:210mm;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:10px;margin-bottom:14px}
.co-name{font-size:14px;font-weight:bold}.co-info{font-size:10px;color:#555;line-height:1.8}
.emp-bar{background:#f5f5f5;border:1px solid #ddd;border-radius:4px;padding:8px 14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:16px;font-size:11px}
.section-title{font-size:10px;font-weight:bold;color:#6c63ff;letter-spacing:.15em;border-bottom:2px solid #6c63ff;padding-bottom:4px;margin-bottom:8px;margin-top:12px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #ddd;font-size:11px}
.row:last-child{border-bottom:none}
.row-label{color:#555;flex:1}.row-val{font-weight:bold;text-align:right;white-space:nowrap}
.total-row{display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #1a1a2e;font-weight:bold;margin-top:4px}
.net-box{background:#1a1a2e;color:white;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;border-radius:4px;margin-top:14px}
.net-label{font-size:12px;color:#aaa}.net-val{font-size:24px;font-weight:900;color:#00c9a7}
.att-bar{background:#f8f9ff;border:1px solid #e0e4f0;border-radius:4px;padding:8px 0;margin-bottom:12px;display:flex;flex-wrap:wrap}
.att-cell{display:flex;flex-direction:column;align-items:center;padding:4px 12px;border-right:1px solid #e0e4f0;min-width:70px}
.att-cell:last-child{border-right:none}.att-label{font-size:9px;color:#999;margin-bottom:2px}
.att-val{font-size:12px;font-weight:bold}.att-val.ot{color:#fc5c65}
table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10px}
th{background:#1a1a2e;color:white;padding:5px 6px;text-align:left;white-space:nowrap}
td{border:1px solid #ccc;padding:4px 6px;white-space:nowrap}
.r{text-align:right}.bold{font-weight:bold}.green{color:#00796b}.red{color:#c62828}
.summary{background:#fffbe6;border:1px solid #f7b731;border-radius:4px;padding:12px 16px;margin-top:12px}
.refund-box{padding:10px 16px;border-radius:4px;text-align:center}
.refund-box.refund{background:#e8faf5;border:2px solid #00c9a7}
.refund-box.extra{background:#fff0f0;border:2px solid #fc5c65}
.refund-amount{font-size:22px;font-weight:900}
.seal-area{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
.seal{width:50px;height:50px;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;text-align:center}
@media print{button{display:none!important}}
</style></head><body><div class="page">
  <div class="header">
    <div><div class="co-name">${company.companyName||""}</div>
    <div class="co-info">${company.companyAddress||""}<br>TEL: ${company.companyTel||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:bold;letter-spacing:.2em">退職所得の源泉徴収票</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${retireDate.getFullYear()}年分</div>
    </div>
  </div>
  <div class="emp-bar">
    <div><b>${emp.name}</b>&nbsp;様</div>
    <div>コード：${emp.code||"—"}</div>
    <div>住所：${emp.address||"（未登録）"}</div>
    <div>退職日：${emp.retireDate||"—"}</div>
    <div>勤続年数：${yearsOfService}年</div>
  </div>
  <div class="two-col">
    <div>
      <div class="section-title">退 職 所 得 計 算</div>
      <div class="row"><span class="row-label">退職手当等の支払金額</span><span class="row-val">¥${retireIncome.toLocaleString()}</span></div>
      <div class="row"><span class="row-label">退職所得控除額（勤続${yearsOfService}年）</span><span class="row-val">¥${r.kojo.toLocaleString()}</span></div>
      <div class="row" style="font-weight:bold"><span class="row-label">退職所得金額（×1/2）</span><span class="row-val">¥${r.taxableIncome.toLocaleString()}</span></div>
    </div>
    <div>
      <div class="section-title">税 額</div>
      <div class="row"><span class="row-label">所得税額</span><span class="row-val">¥${r.tax.toLocaleString()}</span></div>
      <div class="row"><span class="row-label">復興特別所得税額</span><span class="row-val">¥${(r.finalTax-r.tax).toLocaleString()}</span></div>
      <div class="row" style="font-weight:bold"><span class="row-label">源泉徴収税額合計</span><span class="row-val">¥${r.finalTax.toLocaleString()}</span></div>
    </div>
  </div>
  <div class="net-box">
    <div>
      <div style="font-size:11px;color:#aaa;margin-bottom:2px">退職手当等の支払金額</div>
      <div style="font-size:18px;font-weight:bold">¥${retireIncome.toLocaleString()}</div>
    </div>
    <div style="font-size:20px;color:#666">→</div>
    <div style="text-align:right">
      <div style="font-size:11px;color:#aaa;margin-bottom:2px">差引支給額（手取り）</div>
      <div style="font-size:24px;font-weight:900;color:#00c9a7">¥${(retireIncome-r.finalTax).toLocaleString()}</div>
    </div>
  </div>
  <div class="seal-area">
    <div class="seal">受給者<br>印</div><div class="seal">確認印</div><div class="seal">担当者<br>印</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </div></body></html>`);
  w.document.close();
}
// ============================================================

export {
  printPayslip,
  printLedger,
  printLedgerYearly,
  printLedgerEmpYearly,
  printGensenhyou,
  printGensenchousho,
  calcRetirementTax,
  printRetirementHyou,
};

import { calcPayroll, calcBonusAmount, fmt } from "./calcPayroll";

export function printPayslip(emp, p, settings, att) {
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
export const LEDGER_CSS = `
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

export function ledgerHeader(settings, title, subtitle) {
  return `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a1a2e;padding-bottom:8px;margin-bottom:12px">
    <div><div style="font-size:14px;font-weight:bold">${settings.companyName||""}</div>
    <div style="font-size:10px;color:#666">${settings.companyAddress||""}</div></div>
    <div style="text-align:right">
      <div style="font-size:15px;font-weight:bold;letter-spacing:.2em">${title}</div>
      <div style="font-size:11px;color:#666">${subtitle}</div>
    </div>
  </div>`;
}

export function printLedger(employees, month, settings, incentiveMasters, mi, attendanceData) {
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
export function printLedgerYearly(employees, year, settings, getMI, getAtt, getBonus) {
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
export function printLedgerEmpYearly(emp, year, settings, getMI, getAtt, getBonus) {
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

export function printGensenhyou(emp, result, year, company) {
  const w = window.open("","_blank");
  const hasBonusGross = (result.bonusGross||0) > 0;
  w.document.write(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>源泉徴収票 ${year}</title><style>
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
      <div style="font-size:16px;font-weight:bold;letter-spacing:.25em">給与所得の源泉徴収票</div>
      <div style="font-size:12px;color:#666;margin-top:4px">${year}年分</div>
    </div>
  </div>
  <div class="emp-bar">
    <div><b>${emp.name}</b>&nbsp;様</div>
    <div>コード：${emp.code||"—"}</div>
    <div>住所：${emp.address||"（未登録）"}</div>
    <div>扶養親族数：${emp.dependents||0}人</div>
  </div>
  <div class="two-col">
    <div>
      <div class="section-title">収 入 ・ 所 得 金 額</div>
      <div class="row"><span class="row-label">給与支払金額</span><span class="row-val">¥${(result.salaryGross||result.totalGross||0).toLocaleString()}</span></div>
      ${hasBonusGross?`<div class="row"><span class="row-label">賞与支払金額</span><span class="row-val" style="color:#d4a017">¥${(result.bonusGross||0).toLocaleString()}</span></div>`:""}
      <div class="row" style="font-weight:bold;border-top:1px solid #333;padding-top:4px">
        <span class="row-label">支払金額合計</span><span class="row-val">¥${(result.totalGross||0).toLocaleString()}</span>
      </div>
      <div class="row"><span class="row-label">給与所得控除後の金額</span><span class="row-val">¥${(result.kyuyoShotoku||0).toLocaleString()}</span></div>
      <div class="row"><span class="row-label">所得控除の額の合計</span><span class="row-val">¥${(result.totalKojo||0).toLocaleString()}</span></div>
      <div class="row"><span class="row-label">課税所得金額</span><span class="row-val">¥${(result.kazeiShotoku||0).toLocaleString()}</span></div>
      <div class="row"><span class="row-label">算出年税額</span><span class="row-val">¥${(result.nenZei||0).toLocaleString()}</span></div>
      ${(result.jutakuKojo||0)>0?`<div class="row"><span class="row-label">住宅借入金等特別控除</span><span class="row-val" style="color:#00796b">△¥${result.jutakuKojo.toLocaleString()}</span></div>`:""}
      <div class="row" style="font-weight:bold"><span class="row-label">確定年税額（復興税込）</span><span class="row-val">¥${(result.finalTax||0).toLocaleString()}</span></div>
    </div>
    <div>
      <div class="section-title">所 得 控 除 内 訳</div>
      <div class="row"><span class="row-label">社会保険料控除</span><span class="row-val">¥${(result.shakaihoken||0).toLocaleString()}</span></div>
      ${(result.seimeiKojo||0)>0?`<div class="row"><span class="row-label">生命保険料控除</span><span class="row-val">¥${result.seimeiKojo.toLocaleString()}</span></div>`:""}
      ${(result.jishin||0)>0?`<div class="row"><span class="row-label">地震保険料控除</span><span class="row-val">¥${result.jishin.toLocaleString()}</span></div>`:""}
      ${(result.haiguKojo||0)>0?`<div class="row"><span class="row-label">配偶者（特別）控除</span><span class="row-val">¥${result.haiguKojo.toLocaleString()}</span></div>`:""}
      ${(result.fuyo||0)>0?`<div class="row"><span class="row-label">扶養控除</span><span class="row-val">¥${result.fuyo.toLocaleString()}</span></div>`:""}
      ${(result.shogaiKojo||0)>0?`<div class="row"><span class="row-label">障害者控除</span><span class="row-val">¥${result.shogaiKojo.toLocaleString()}</span></div>`:""}
      ${((result.kabufuKojo||0)+(result.hitorioyanKojo||0))>0?`<div class="row"><span class="row-label">寡婦・ひとり親控除</span><span class="row-val">¥${((result.kabufuKojo||0)+(result.hitorioyanKojo||0)).toLocaleString()}</span></div>`:""}
      ${(result.shoukibo||0)>0?`<div class="row"><span class="row-label">小規模企業共済等</span><span class="row-val">¥${result.shoukibo.toLocaleString()}</span></div>`:""}
      <div class="row"><span class="row-label">基礎控除</span><span class="row-val">¥${(result.kisoKojo||0).toLocaleString()}</span></div>
      <div class="row" style="font-weight:bold;border-top:1px solid #333;padding-top:4px">
        <span class="row-label">所得控除合計</span><span class="row-val">¥${(result.totalKojo||0).toLocaleString()}</span>
      </div>
    </div>
  </div>
  <div class="summary">
    <div style="display:flex;justify-content:space-around;align-items:center;flex-wrap:wrap;gap:12px">
      <div style="text-align:center">
        <div style="font-size:10px;color:#888;margin-bottom:2px">徴収済み源泉税額合計</div>
        <div style="font-size:18px;font-weight:bold">¥${(result.totalWithheld||0).toLocaleString()}</div>
      </div>
      <div style="font-size:20px;color:#ccc">→</div>
      <div style="text-align:center">
        <div style="font-size:10px;color:#888;margin-bottom:2px">確定年税額</div>
        <div style="font-size:18px;font-weight:bold">¥${(result.finalTax||0).toLocaleString()}</div>
      </div>
      <div style="font-size:20px;color:#ccc">=</div>
      <div class="refund-box ${(result.diff||0)>=0?"refund":"extra"}">
        <div style="font-size:10px;margin-bottom:4px">${(result.diff||0)>=0?"還 付 金 額":"追 加 徴 収 額"}</div>
        <div class="refund-amount" style="color:${(result.diff||0)>=0?"#00796b":"#c62828"}">¥${Math.abs(result.diff||0).toLocaleString()}</div>
      </div>
    </div>
  </div>
  <div class="seal-area">
    <div class="seal">受給者<br>印</div>
    <div class="seal">確認印</div>
    <div class="seal">担当者<br>印</div>
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
    <div style="font-size:9px;color:#aaa">楽給.com&nbsp;&nbsp;発行日: ${new Date().toLocaleDateString("ja-JP")}</div>
    <button onclick="window.print()" style="padding:8px 24px;background:#1a1a2e;color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px">印刷 / PDF保存</button>
  </div>
  </div></body></html>`);
  w.document.close();
}
// ============================================================
// 源泉徴収簿 PDF（全員一覧）
// ============================================================
export function printGensenchousho(employees, allResults, year, company) {
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
export function printRetirementHyou(emp, retireIncome, company) {
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
